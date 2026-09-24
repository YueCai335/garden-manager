"""Offline tests for the paid-run tooling (ADR-0056): baseline, cases, ledger,
recording, cost stress test, and example run. Every model here is a fake;
nothing calls OpenAI or reads a real key."""

import json
import os
import subprocess
import sys
from datetime import date
from pathlib import Path

import pytest

from app.agent.allocation import AllocationRequest, Assignment, build_scope
from app.agent.baseline import baseline_allocation
from app.agent import live
from app.agent.live import (
    APPROVED_MODEL,
    BATCH_UNIT_LIMIT,
    TOTAL_UNIT_LIMIT,
    EVALUATION_DIR,
    BatchHalted,
    Ledger,
    LedgerRefused,
    RecordingModel,
    batch_fingerprint,
    check_case,
    example_run_from_record,
    load_api_key,
    run_case,
    snapshot_from_spec,
    stress_requests,
    validate_cases,
    verify_cost,
)
from app.agent.loop import MAX_REQUEST_BYTES, AllocationRunResult, ModelProviderError, ModelTurn, ToolCall
from app.agent.openai_model import DEFAULT_MODEL
from app.agent.service import load_demo_garden

BACKEND_DIR = Path(__file__).resolve().parents[1]
CASES = json.loads((EVALUATION_DIR / "allocation_cases.json").read_text(encoding="utf-8"))
TODAY = date(2026, 9, 24)
FINGERPRINT = batch_fingerprint(CASES, APPROVED_MODEL)


@pytest.fixture
def ledger(tmp_path):
    with Ledger.locked(tmp_path / "ledger.json", FINGERPRINT) as opened:
        yield opened


class FakeModel:
    """Replays turns and reports usage like the real adapter would."""

    name = "fake-model"

    def __init__(self, *turns, input_tokens=500, output_tokens=40):
        self.turns = list(turns)
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens
        self.calls = 0

    def respond(self, request):
        self.calls += 1
        turn = self.turns.pop(0) if self.turns else ModelTurn(text="")
        if isinstance(turn, Exception):
            raise turn
        if turn.input_tokens is None and self.input_tokens is not None:
            turn = ModelTurn(
                tool_call=turn.tool_call,
                text=turn.text,
                truncated=turn.truncated,
                unusable=turn.unusable,
                input_tokens=self.input_tokens,
                output_tokens=self.output_tokens,
            )
        return turn


def call(name, arguments="{}", call_id="c1"):
    return ModelTurn(tool_call=ToolCall(call_id, name, arguments if isinstance(arguments, str) else json.dumps(arguments)))


def final(*pairs):
    return ModelTurn(
        text=json.dumps(
            {"assignments": [{"growing_area_id": area, "crop": crop} for crop, area in pairs], "explanation": "Done."}
        )
    )


def case(case_id):
    return next(item for item in CASES["cases"] if item["id"] == case_id)


# --- Baseline ---


def test_baseline_finds_the_fewest_warnings_with_a_fixed_tie_order():
    snapshot = load_demo_garden()
    scope, _ = build_scope(snapshot, AllocationRequest(crops=["tomato", "bean"]), TODAY)

    result = baseline_allocation(snapshot, scope)

    assert result.warnings == 0
    # First zero-warning assignment in crop order, trying areas in scope order.
    assert [(item.crop, item.growing_area_id) for item in result.assignments] == [
        ("tomato", "demo-in-ground-area"),
        ("bean", "demo-raised-bed"),
    ]
    assert baseline_allocation(snapshot, scope) == result


def test_baseline_reports_warnings_it_cannot_avoid():
    crowded = case("crowded-unavoidable")
    snapshot = snapshot_from_spec(crowded["garden"])
    scope, _ = build_scope(snapshot, AllocationRequest(crops=crowded["request"]["crops"]), TODAY)

    assert baseline_allocation(snapshot, scope).warnings == 2


# --- Cases and checks ---


def test_the_committed_cases_are_valid_and_each_has_a_pass_condition():
    validate_cases(CASES["cases"])

    assert len(CASES["cases"]) == 10
    assert CASES["smoke"]["garden"] == "demo"


@pytest.mark.parametrize(
    ("mutate", "message"),
    [
        (lambda cases: cases.append(dict(cases[0])), "unique"),
        (lambda cases: cases[0].update(checks=[]), "no pass condition"),
        (lambda cases: cases[0].update(checks=[{"type": "assigned", "crop": "carrot", "area": "demo-raised-bed"}]), "outside its scope"),
        (lambda cases: cases[0].update(request={"crops": ["potato"]}), "needs_input"),
    ],
)
def test_malformed_cases_are_rejected_before_any_paid_run(mutate, message):
    cases = json.loads(json.dumps(CASES["cases"]))
    mutate(cases)

    with pytest.raises(ValueError, match=message):
        validate_cases(cases)


def draft_result(*pairs, warnings=0):
    from app.agent.allocation import AssignmentCheck

    return AllocationRunResult(
        status="draft",
        allocation=[Assignment(growing_area_id=area, crop=crop) for crop, area in pairs],
        warnings=[
            AssignmentCheck(growing_area_id="x", crop="tomato", rotation_group="nightshade", warning=True, repeated_years=[2026], rotation_friendly_groups=[])
        ]
        * warnings,
    )


def test_checks_keep_preference_and_rotation_separate():
    checks = [
        {"type": "assigned", "crop": "lettuce", "area": "pots"},
        {"type": "not_assigned", "crop": "bean", "area": "ground"},
        {"type": "max_warnings", "value": 0},
        {"type": "warnings_at_most_baseline"},
    ]

    passed = check_case(checks, draft_result(("lettuce", "pots"), ("bean", "bed"), warnings=1), baseline_warnings=1)

    assert [item["passed"] for item in passed] == [True, True, False, True]


def test_no_check_passes_without_a_draft():
    failed = AllocationRunResult(status="generation_failed", failure_reason="step_limit")

    assert [item["passed"] for item in check_case([{"type": "max_warnings", "value": 5}], failed, 0)] == [False]


# --- Ledger ---


def test_the_ledger_counts_every_kind_against_one_limit_and_persists(tmp_path):
    path = tmp_path / "ledger.json"
    with Ledger.locked(path, FINGERPRINT) as ledger:
        for unit in range(BATCH_UNIT_LIMIT):
            entry = ledger.reserve("evaluate" if unit else "smoke", f"unit-{unit}")
            ledger.finish(entry, "passed")

    with Ledger.locked(path, FINGERPRINT) as reopened:
        assert reopened.used == BATCH_UNIT_LIMIT == 12
        with pytest.raises(LedgerRefused, match="All 12 paid units are used"):
            reopened.reserve("verify-cost", "one more")
    assert not list(tmp_path.glob("*.tmp"))


def test_archiving_a_batch_never_grants_fresh_units(tmp_path):
    archived = tmp_path / "batch-1"
    archived.mkdir()
    (archived / "ledger.json").write_text(
        json.dumps({"unit_limit": 12, "batch": None, "halted": None, "entries": [{"unit": n} for n in range(1, 6)]})
    )

    with Ledger.locked(tmp_path / "ledger.json", FINGERPRINT) as ledger:
        assert ledger.archived_used == 5
        for unit in range(TOTAL_UNIT_LIMIT - 5):
            ledger.finish(ledger.reserve("evaluate", f"unit-{unit}"), "passed")
        with pytest.raises(LedgerRefused, match="All 13 paid units across batches are used \\(5 in archived batches\\)"):
            ledger.reserve("evaluate", "one more")


def test_a_second_command_is_refused_while_the_first_holds_the_ledger(tmp_path):
    path = tmp_path / "ledger.json"
    with Ledger.locked(path, FINGERPRINT) as first:
        with pytest.raises(LedgerRefused, match="Another paid command is using the ledger"):
            with Ledger.locked(path, FINGERPRINT):
                pass
        first.finish(first.reserve("smoke", "first"), "passed")
        first.halt("usage missing")

    # The next command reads what the first one wrote, including the halt.
    with Ledger.locked(path, FINGERPRINT) as second:
        assert second.used == 1
        with pytest.raises(LedgerRefused, match="halted: usage missing"):
            second.reserve("evaluate", "demo-tomato-bean")
    assert Ledger.read(path).data["halted"]["reason"] == "usage missing"


def test_the_ledger_is_read_only_outside_a_lock(tmp_path):
    with pytest.raises(RuntimeError, match="read-only"):
        Ledger.read(tmp_path / "ledger.json").reserve("smoke", "x")


def test_a_unit_is_written_down_before_the_paid_request_and_counts_if_it_crashes(tmp_path):
    path = tmp_path / "ledger.json"

    class Crashes:
        name = "crash"

        def respond(self, request):
            # The reservation is already on disk when the request goes out.
            assert Ledger.read(path).data["entries"][0]["status"] == "started"
            raise RuntimeError("process died")

    with Ledger.locked(path, FINGERPRINT) as ledger:
        with pytest.raises(RuntimeError):
            run_case(ledger, Crashes(), CASES["smoke"], kind="smoke", runs_dir=tmp_path / "runs")

    assert Ledger.read(path).used == 1


def test_an_interrupted_unit_blocks_paid_runs_until_a_person_resolves_it(tmp_path):
    path = tmp_path / "ledger.json"
    with Ledger.locked(path, FINGERPRINT) as ledger:
        ledger.reserve("evaluate", "demo-tomato-bean")  # the process dies before finish()

    with Ledger.locked(path, FINGERPRINT) as restarted:
        with pytest.raises(LedgerRefused, match="Unit 1 did not finish"):
            restarted.check_ready()
        with pytest.raises(LedgerRefused, match="Describe what the usage check found"):
            restarted.resolve_interrupted(1, " ")
        restarted.resolve_interrupted(1, "Usage page shows 3 requests, 2,410 input tokens.")
        with pytest.raises(LedgerRefused, match="not an interrupted unit"):
            restarted.resolve_interrupted(1, "again")
        restarted.check_ready()
        assert restarted.used == 1
        assert restarted.data["entries"][0]["status"] == "interrupted"


def test_a_halt_is_saved_before_the_report_and_survives_a_failed_report_write(tmp_path, monkeypatch):
    path = tmp_path / "ledger.json"

    def disk_full(*args, **kwargs):
        raise OSError("disk full")

    monkeypatch.setattr(live, "write_record", disk_full)
    with Ledger.locked(path, FINGERPRINT) as ledger:
        with pytest.raises(OSError):
            run_case(ledger, FakeModel(call("get_planting_history"), input_tokens=None), case("demo-tomato-bean"), kind="evaluate", runs_dir=tmp_path)

    saved = Ledger.read(path).data
    assert "reported no usage" in saved["halted"]["reason"]
    assert saved["entries"][0]["status"] == "started"


def test_a_failed_report_write_leaves_the_unit_unresolved(tmp_path, monkeypatch):
    path = tmp_path / "ledger.json"
    monkeypatch.setattr(live, "write_record", lambda *args, **kwargs: (_ for _ in ()).throw(OSError("disk full")))
    with Ledger.locked(path, FINGERPRINT) as ledger:
        with pytest.raises(OSError):
            run_case(ledger, FakeModel(ModelTurn(text="no json")), case("demo-tomato-bean"), kind="evaluate", runs_dir=tmp_path)

    with Ledger.locked(path, FINGERPRINT) as restarted:
        with pytest.raises(LedgerRefused, match="Unit 1 did not finish"):
            restarted.check_ready()


@pytest.mark.parametrize(
    ("change", "field"),
    [
        (lambda cases: cases["cases"][0]["checks"].append({"type": "max_warnings", "value": 3}), "cases"),
        (lambda cases: cases["smoke"]["request"]["crops"].append("carrot"), "cases"),
    ],
)
def test_changing_the_cases_after_the_first_unit_refuses_the_batch(tmp_path, change, field):
    path = tmp_path / "ledger.json"
    with Ledger.locked(path, FINGERPRINT) as ledger:
        ledger.finish(ledger.reserve("smoke", "first"), "passed")

    edited = json.loads(json.dumps(CASES))
    change(edited)
    with Ledger.locked(path, batch_fingerprint(edited, APPROVED_MODEL)) as ledger:
        with pytest.raises(LedgerRefused, match=f"different {field}"):
            ledger.reserve("evaluate", "demo-tomato-bean")


def test_only_the_approved_model_can_use_the_batch(tmp_path):
    path = tmp_path / "ledger.json"
    with Ledger.locked(path, FINGERPRINT) as ledger:
        ledger.finish(ledger.reserve("verify-cost", "stress"), "passed")

    with Ledger.locked(path, batch_fingerprint(CASES, "gpt-other")) as ledger:
        with pytest.raises(LedgerRefused, match="different model"):
            ledger.check_ready()
    with Ledger.locked(tmp_path / "fresh.json", batch_fingerprint(CASES, "gpt-other")) as ledger:
        with pytest.raises(LedgerRefused, match=f"Only {APPROVED_MODEL} is approved"):
            ledger.reserve("smoke", "first")


def test_the_fingerprint_covers_the_request_template_and_limits(monkeypatch):
    monkeypatch.setattr(live, "INSTRUCTIONS", live.INSTRUCTIONS + " Be brief.")
    monkeypatch.setattr(live, "MAX_OUTPUT_TOKENS", 1_600)

    changed = batch_fingerprint(CASES, APPROVED_MODEL)

    assert changed["request_template"] != FINGERPRINT["request_template"]
    assert changed["limits"] != FINGERPRINT["limits"]
    assert changed["cases"] == FINGERPRINT["cases"]


# --- Recording and paid steps ---


def test_a_case_run_records_the_full_conversation_baseline_and_checks(tmp_path, ledger):
    model = FakeModel(
        call("get_planting_history"),
        call("check_allocation", {"assignments": [{"growing_area_id": "demo-container-group", "crop": "lettuce"}]}, "c2"),
        final(("lettuce", "demo-container-group"), ("tomato", "demo-in-ground-area")),
    )

    outcome = run_case(ledger, model, case("demo-lettuce-in-containers"), kind="evaluate", runs_dir=tmp_path / "runs")

    assert outcome.passed
    record = outcome.record
    assert record["status"] == "draft"
    assert record["agent_warnings"] == 0 and record["baseline"]["warnings"] == 0
    assert [item["passed"] for item in record["checks"]] == [True, True]
    assert record["usage"] == {"requests": 3, "unknown_usage_requests": 0, "input_tokens": 1500, "output_tokens": 120}
    # Every request keeps its full parameters: instructions, tools, output format, and input.
    params = record["requests"][-1]["params"]
    assert {"model", "instructions", "input", "tools", "text", "max_output_tokens", "parallel_tool_calls", "store"} <= set(params)
    assert record["requests"][0]["bytes"] == len(json.dumps(record["requests"][0]["params"], ensure_ascii=False, separators=(",", ":")).encode())
    # The last request holds every tool result in full, not just the trace summary.
    outputs = [item for item in params["input"] if item.get("type") == "function_call_output"]
    assert json.loads(outputs[0]["output"])["history"]["demo-raised-bed"] == {"2026": ["nightshade"]}
    assert json.loads(outputs[1]["output"])["checks"][0]["crop"] == "lettuce"
    saved = json.loads((tmp_path / "runs" / "01-evaluate-demo-lettuce-in-containers.json").read_text())
    assert saved == json.loads(json.dumps(record))
    assert ledger.data["entries"][0]["status"] == "passed"


def test_a_failed_case_still_uses_its_unit_and_is_kept_in_the_record(tmp_path, ledger):

    outcome = run_case(ledger, FakeModel(ModelTurn(text="no json")), case("demo-tomato-bean"), kind="evaluate", runs_dir=tmp_path / "runs")

    assert not outcome.passed
    assert outcome.record["status"] == "generation_failed"
    assert ledger.data["entries"][0]["status"] == "failed"
    assert ledger.data["halted"] is None


@pytest.mark.parametrize(
    ("model", "reason"),
    [
        (FakeModel(call("get_planting_history"), input_tokens=None), "reported no usage"),
        (FakeModel(call("get_planting_history"), input_tokens=1_000_000), "input tokens; the bound was"),
        (FakeModel(ModelProviderError("timeout")), "failed without usage"),
    ],
)
def test_a_usage_problem_halts_the_ledger(tmp_path, ledger, model, reason):

    outcome = run_case(ledger, model, case("demo-tomato-bean"), kind="evaluate", runs_dir=tmp_path / "runs")

    assert not outcome.passed
    assert reason in ledger.data["halted"]["reason"]
    assert model.calls == 1
    with pytest.raises(LedgerRefused):
        ledger.reserve("evaluate", "next")


def test_unknown_usage_is_null_not_zero():
    recorder = RecordingModel(FakeModel(ModelProviderError("timeout")))
    recorder.requests.append({"step": 1, "input_tokens": 400, "output_tokens": 20})
    with pytest.raises(ModelProviderError):
        recorder.respond(stress_requests(DEFAULT_MODEL)[0])

    assert recorder.usage() == {"requests": 2, "unknown_usage_requests": 1, "input_tokens": None, "output_tokens": None}


def test_the_baseline_faces_the_same_preference_checks_as_the_agent(tmp_path, ledger):
    model = FakeModel(call("get_planting_history"), final(("tomato", "demo-raised-bed"), ("bean", "demo-in-ground-area")))

    record = run_case(ledger, model, case("demo-tomato-stays-in-bed"), kind="evaluate", runs_dir=tmp_path / "runs").record

    # The agent follows the preference and accepts two warnings; the baseline avoids them but ignores the preference.
    assert [item["passed"] for item in record["checks"]] == [True]
    assert record["agent_warnings"] == 2
    assert record["baseline"]["warnings"] == 0
    assert [item["passed"] for item in record["baseline"]["checks"]] == [False]


def test_the_stress_conversation_has_five_requests_inside_the_byte_limit():
    requests = stress_requests(DEFAULT_MODEL)

    sizes = [request.byte_size() for request in requests]
    assert len(sizes) == 5
    assert sizes == sorted(sizes)
    assert max(sizes) <= MAX_REQUEST_BYTES
    assert all(request.to_params()["model"] == DEFAULT_MODEL for request in requests)


def test_verify_cost_sends_the_five_requests_and_passes_within_the_allowance(tmp_path, ledger):
    model = FakeModel(input_tokens=3_000)

    outcome = verify_cost(ledger, model, runs_dir=tmp_path / "runs")

    assert outcome.passed and model.calls == 5
    assert [item["allowance_ok"] for item in outcome.record["requests"]] == [True] * 5
    assert outcome.record["requests"][0]["params"]["model"] == "fake-model"
    assert ledger.used == 1 and ledger.passed("verify-cost")


def test_verify_cost_stops_at_the_first_request_over_the_allowance(tmp_path, ledger):

    class GrowsTooFast(FakeModel):
        def respond(self, request):
            self.input_tokens = request.byte_size() + (5_000 if self.calls == 1 else 0)
            return super().respond(request)

    model = GrowsTooFast()
    outcome = verify_cost(ledger, model, runs_dir=tmp_path / "runs")

    assert not outcome.passed
    assert model.calls == 2
    assert "Request 2" in ledger.data["halted"]["reason"]


# --- Example run ---


def test_the_example_run_keeps_input_full_tool_results_model_and_date(tmp_path, ledger):
    record = run_case(
        ledger,
        FakeModel(call("get_planting_history"), final(("tomato", "demo-in-ground-area"), ("bean", "demo-raised-bed"))),
        case("demo-tomato-bean"),
        kind="evaluate",
        runs_dir=tmp_path / "runs",
    ).record

    example = example_run_from_record(record)

    assert example["model"] == "fake-model" and example["recordedAt"] == record["recorded_at"]
    assert example["gardenId"] == "demo-garden"
    assert example["request"] == {"crops": ["tomato", "bean"]}
    assert example["result"]["status"] == "draft"
    assert example["toolResults"][0]["tool"] == "get_planting_history"
    assert example["toolResults"][0]["output"]["history"]["demo-in-ground-area"] == {"2026": ["legume"]}


def test_only_a_demo_garden_draft_can_become_the_example_run():
    with pytest.raises(ValueError):
        example_run_from_record({"status": "generation_failed", "case": {"garden": "demo"}})
    with pytest.raises(ValueError):
        example_run_from_record({"status": "draft", "case": {"garden": {"gardenId": "other"}}})


# --- Key handling and the command line ---


def test_the_key_comes_from_the_environment_or_the_env_file(tmp_path, monkeypatch):
    env_file = tmp_path / ".env"
    env_file.write_text('# local only\nOTHER=1\nOPENAI_API_KEY="sk-from-file"\n')

    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    assert load_api_key(env_file) == "sk-from-file"
    assert load_api_key(tmp_path / "missing.env") is None
    monkeypatch.setenv("OPENAI_API_KEY", "sk-from-env")
    assert load_api_key(env_file) == "sk-from-env"


def run_cli(tmp_path, *args, **env):
    """The CLI in offline mode: no key in the environment, a missing key file, and the
    real model entry point disabled, so even a failed guard cannot reach OpenAI."""
    child_env = {key: value for key, value in os.environ.items() if key not in {"OPENAI_API_KEY", "AGENT_OPENAI_MODEL"}}
    child_env.update(
        AGENT_EVALUATION_DIR=str(tmp_path),
        AGENT_LIVE_ENV_FILE=str(tmp_path / "no-such.env"),
        AGENT_LIVE_OFFLINE="1",
        **env,
    )
    return subprocess.run(
        [sys.executable, str(BACKEND_DIR / "scripts" / "agent_live.py"), *args],
        env=child_env,
        capture_output=True,
        text=True,
        timeout=60,
    )


@pytest.mark.parametrize("command", ["smoke", "verify-cost", "evaluate"])
def test_paid_commands_refuse_without_confirm_spend(tmp_path, command):
    completed = run_cli(tmp_path, command)

    assert completed.returncode != 0
    assert "--confirm-spend" in completed.stderr
    assert not (tmp_path / "ledger.json").exists()


def test_evaluation_refuses_until_the_cost_check_has_passed(tmp_path):
    completed = run_cli(tmp_path, "evaluate", "--confirm-spend")

    assert completed.returncode != 0
    assert "Run verify-cost successfully before the evaluation." in completed.stderr
    assert "Paid units used: 0/12 in this batch, 0/13 across batches" in completed.stdout


def test_a_ready_batch_stops_at_the_disabled_real_model(tmp_path):
    with Ledger.locked(tmp_path / "ledger.json", FINGERPRINT) as ledger:
        ledger.finish(ledger.reserve("verify-cost", "stress"), "passed")

    completed = run_cli(tmp_path, "evaluate", "--confirm-spend")

    assert "Offline mode: the real model is disabled." in completed.stderr
    assert Ledger.read(tmp_path / "ledger.json").used == 1


def test_the_cli_refuses_a_model_other_than_the_approved_one(tmp_path):
    completed = run_cli(tmp_path, "smoke", "--confirm-spend", AGENT_OPENAI_MODEL="gpt-other")

    assert f"approved for {APPROVED_MODEL} only" in completed.stderr


def test_the_cli_resolves_an_interrupted_unit_with_a_note(tmp_path):
    with Ledger.locked(tmp_path / "ledger.json", FINGERPRINT) as ledger:
        ledger.reserve("smoke", "smoke-demo-tomato-bean")

    refused = run_cli(tmp_path, "smoke", "--confirm-spend")
    resolved = run_cli(tmp_path, "resolve-interrupted", "--unit", "1", "--note", "no request reached OpenAI")

    assert "Unit 1 did not finish" in refused.stderr
    assert resolved.returncode == 0
    assert Ledger.read(tmp_path / "ledger.json").data["entries"][0]["resolution"] == "no request reached OpenAI"
