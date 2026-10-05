"""AI Garden Note's paid-check tooling, run against fakes only (ADR-0059).

No test reads a real key or reaches OpenAI: library tests use fake clients,
and the CLI test points the real SDK at a local fake server.
"""

import copy
import json
import os
import subprocess
import sys
import threading
from datetime import date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from types import SimpleNamespace

import pytest

from app import care_note_live
from app.agent.live import BatchHalted, LedgerRefused
from app.ai import CareNoteProviderError, OpenAICareNoteExtractor
from app.ai import care_note_request_bytes
from app.care_note_live import (
    APPROVED_MODEL,
    CareNoteLedger,
    batch_fingerprint,
    blocking_changes,
    load_cases,
    near_maximum_note,
    run_compatibility,
    run_evaluation,
    request_bytes_added,
    run_unit,
    score_case,
    source_digest,
    summarize,
    validate_cases,
)
from app.care_note_public import demo_care_note_garden
from app.schemas import CareNoteDraftRequest

CASES = load_cases()
TODAY = date.fromisoformat(CASES["today"])
FINGERPRINT = batch_fingerprint(CASES, APPROVED_MODEL)
BACKEND_DIR = Path(__file__).resolve().parents[1]


def response_for(draft: dict, *, input_tokens=900, output_tokens=60, status="completed", content=None):
    content = content or [SimpleNamespace(type="output_text", text=json.dumps(draft, ensure_ascii=False))]
    return SimpleNamespace(
        status=status,
        output=[SimpleNamespace(type="message", content=content)],
        usage=SimpleNamespace(input_tokens=input_tokens, output_tokens=output_tokens),
    )


def extraction(**fields) -> dict:
    return {
        "kind": "completed", "type": "watering", "date": TODAY.isoformat(), "targetScope": "planting-area",
        "targetName": "Sample raised bed", "fertilizerProduct": None, "fertilizerAmount": None, "fertilizerUnit": None,
        **fields,
    }


class ScriptedResponses:
    """Hands out queued responses; each call is one paid request."""

    def __init__(self, *items):
        self.queue = list(items)
        self.requests: list[dict] = []

    def create(self, **params):
        self.requests.append(params)
        item = self.queue.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


def extractor_with(*items):
    responses = ScriptedResponses(*items)
    return OpenAICareNoteExtractor("test-key", APPROVED_MODEL, client=SimpleNamespace(responses=responses)), responses


def run_one(ledger, extractor, tmp_path, *, kind="compatibility", label="strict-schema", note="今天给 Sample raised bed 浇了水。", case=None):
    return run_unit(ledger, extractor, kind=kind, label=label, note=note, today=TODAY, runs_dir=tmp_path / "runs", code_version="test", case=case)


def pass_compatibility(ledger, tmp_path):
    extractor, _ = extractor_with(response_for(extraction()), response_for(extraction()))
    run_compatibility(ledger, extractor, today=TODAY, runs_dir=tmp_path / "runs", code_version="test")


# --- Frozen cases ---


def test_the_frozen_cases_follow_the_planned_split():
    groups = {case["id"]: case["group"] for case in CASES["cases"]}
    assert sorted(groups.values()).count("ordinary") == 8
    assert {case["id"] for case in CASES["cases"] if case.get("knownLocalFailure")} == {"zh-planned", "zh-multiple", "en-multiple"}
    assert {case["id"] for case in CASES["cases"] if case.get("hardGate")} == {"zh-planned", "zh-multiple", "en-multiple", "en-negated"}


@pytest.mark.parametrize(
    "break_cases",
    [
        lambda doc: doc["cases"].pop(),
        lambda doc: doc["cases"][0].update(group="boundary"),
        lambda doc: doc["cases"][0]["expect"]["fields"].update(growingAreaId="no-such-bed"),
        lambda doc: doc["cases"][0].update(note="浇" * 501),
        lambda doc: doc["cases"][0].update(id=doc["cases"][1]["id"]),
        lambda doc: [case.pop("knownLocalFailure", None) for case in doc["cases"]],
    ],
    ids=["19-cases", "wrong-split", "unknown-area", "note-too-long", "duplicate-id", "missing-known-failures"],
)
def test_malformed_cases_are_refused_before_any_spending(break_cases):
    broken = copy.deepcopy(CASES)
    break_cases(broken)
    with pytest.raises(Exception):
        validate_cases(broken)


def planned_request_bytes(note: str) -> int:
    extractor = OpenAICareNoteExtractor("offline", APPROVED_MODEL, client=object())
    return care_note_request_bytes(extractor.request_params(note, demo_care_note_garden().model_context(), TODAY))


def test_no_code_point_adds_more_request_bytes_than_the_near_maximum_character():
    costliest = max(
        request_bytes_added(chr(code_point)) for code_point in range(0x110000) if not 0xD800 <= code_point <= 0xDFFF
    )
    assert request_bytes_added(care_note_live.MAX_BYTES_CHARACTER) == costliest == 7


def test_the_near_maximum_note_makes_the_largest_request_the_api_accepts():
    note = near_maximum_note()
    CareNoteDraftRequest.model_validate({"note": note, "today": TODAY.isoformat()})  # the API takes it unchanged
    assert len(note) == 500
    largest = planned_request_bytes(note)
    for other in ("🌱" * 500, '"' * 500, "\\" * 500, "浇" * 500, "\n" * 500, CASES["cases"][18]["note"]):
        assert planned_request_bytes(other) <= largest
    assert largest == 5_597


def test_changing_cases_prompt_or_any_source_file_changes_the_batch(monkeypatch, tmp_path):
    edited = copy.deepcopy(CASES)
    edited["cases"][0]["note"] += " "
    assert batch_fingerprint(edited, APPROVED_MODEL)["cases"] != FINGERPRINT["cases"]

    monkeypatch.setattr(care_note_live, "care_note_instructions", lambda: "a different prompt")
    assert batch_fingerprint(CASES, APPROVED_MODEL)["request_template"] != FINGERPRINT["request_template"]
    monkeypatch.undo()

    # Emptying the negation and future word list in a copy of ai.py changes the source digest.
    copies = []
    for path in care_note_live.SOURCE_FILES:
        target = tmp_path / path.name
        target.write_bytes(path.read_bytes())
        copies.append(target)
    assert source_digest(copies) == FINGERPRINT["source"]
    ai_copy = tmp_path / "ai.py"
    text = ai_copy.read_text(encoding="utf-8")
    start = text.index("CHINESE_NOT_COMPLETED_MARKERS = (")
    ai_copy.write_text(text[:start] + "CHINESE_NOT_COMPLETED_MARKERS = ()" + text[text.index("\n", start):], encoding="utf-8")
    assert source_digest(copies) != FINGERPRINT["source"]


@pytest.mark.parametrize(
    ("line", "blocks"),
    [
        ("?? backend/evaluation/care_note/ledger.json", False),
        ("?? backend/evaluation/care_note/ledger.json.lock", False),
        ("?? backend/evaluation/care_note/runs/01-compatibility-strict-schema.json", False),
        (" M backend/evaluation/care_note/cases.json", True),
        ("?? backend/evaluation/care_note/cases.json", True),
        (" M backend/app/ai.py", True),
        ("?? docs/notes.md", True),
    ],
)
def test_only_the_ledger_and_run_records_may_be_uncommitted_during_a_paid_run(line, blocks):
    assert bool(blocking_changes(line)) is blocks


# --- Ledger ---


def test_a_request_is_counted_before_it_is_sent_and_a_provider_error_halts_the_ledger(tmp_path):
    path = tmp_path / "ledger.json"
    extractor, responses = extractor_with(CareNoteProviderError("timeout"))

    with CareNoteLedger.locked(path, FINGERPRINT) as ledger:
        with pytest.raises(BatchHalted):
            run_one(ledger, extractor, tmp_path)

    reopened = CareNoteLedger.read(path)
    assert reopened.used == 1
    assert reopened.data["entries"][0]["status"] == "halted"
    assert "without usage" in reopened.data["halted"]["reason"]
    assert len(responses.requests) == 1
    with CareNoteLedger.locked(path, FINGERPRINT) as ledger:
        with pytest.raises(LedgerRefused, match="halted"):
            ledger.reserve("compatibility", "near-maximum")


@pytest.mark.parametrize(
    "usage",
    [{"input_tokens": 50_000}, {"output_tokens": 801}, {"input_tokens": None}],
    ids=["input-above-allowance", "output-above-cap", "missing-usage"],
)
def test_usage_outside_the_cost_assumptions_halts_every_later_request(tmp_path, usage):
    path = tmp_path / "ledger.json"
    extractor, _ = extractor_with(response_for(extraction(), **usage))

    with CareNoteLedger.locked(path, FINGERPRINT) as ledger:
        with pytest.raises(BatchHalted):
            run_one(ledger, extractor, tmp_path)
    with CareNoteLedger.locked(path, FINGERPRINT) as ledger:
        with pytest.raises(LedgerRefused, match="halted"):
            ledger.reserve("compatibility", "near-maximum")
    assert CareNoteLedger.read(path).used == 1


def test_an_unusable_answer_with_valid_usage_still_counts_and_is_not_retried(tmp_path):
    path = tmp_path / "ledger.json"
    extractor, responses = extractor_with(response_for({}, content=[SimpleNamespace(type="refusal", refusal="no")]))

    with CareNoteLedger.locked(path, FINGERPRINT) as ledger:
        outcome = run_one(ledger, extractor, tmp_path)

    assert outcome.passed is False
    assert CareNoteLedger.read(path).data["entries"][0]["status"] == "failed"
    assert CareNoteLedger.read(path).data["halted"] is None
    assert len(responses.requests) == 1


def test_reopening_the_ledger_never_resets_used_requests_and_checks_never_repeat(tmp_path):
    path = tmp_path / "ledger.json"
    with CareNoteLedger.locked(path, FINGERPRINT) as ledger:
        pass_compatibility(ledger, tmp_path)

    with CareNoteLedger.locked(path, FINGERPRINT) as ledger:
        assert ledger.used == 2
        with pytest.raises(LedgerRefused, match="already ran"):
            ledger.reserve("compatibility", "strict-schema")


def test_the_evaluation_waits_for_both_compatibility_checks(tmp_path):
    path = tmp_path / "ledger.json"
    extractor, _ = extractor_with(response_for({}, content=[SimpleNamespace(type="refusal", refusal="no")]), response_for(extraction()))
    with CareNoteLedger.locked(path, FINGERPRINT) as ledger:
        run_one(ledger, extractor, tmp_path, label="strict-schema")
        run_one(ledger, extractor, tmp_path, label="near-maximum", note=near_maximum_note())
        with pytest.raises(LedgerRefused, match="Both C1 compatibility checks must pass"):
            ledger.reserve("evaluation", CASES["cases"][0]["id"])


def test_the_ledger_allows_22_requests_in_total_and_each_case_once(tmp_path):
    path = tmp_path / "ledger.json"
    with CareNoteLedger.locked(path, FINGERPRINT) as ledger:
        pass_compatibility(ledger, tmp_path)
        extractor, responses = extractor_with(*[response_for(extraction()) for _ in range(20)])
        outcomes = run_evaluation(ledger, extractor, CASES, runs_dir=tmp_path / "runs", code_version="test")

        assert len(outcomes) == 20 and len(responses.requests) == 20
        assert ledger.used == 22
        with pytest.raises(LedgerRefused):
            ledger.reserve("evaluation", CASES["cases"][0]["id"])
        with pytest.raises(LedgerRefused):
            ledger.reserve("evaluation", "an-extra-case")


def test_a_different_batch_or_model_is_refused(tmp_path):
    path = tmp_path / "ledger.json"
    with CareNoteLedger.locked(path, FINGERPRINT) as ledger:
        pass_compatibility(ledger, tmp_path)
    edited = copy.deepcopy(CASES)
    edited["cases"][0]["note"] += " "
    with CareNoteLedger.locked(path, batch_fingerprint(edited, APPROVED_MODEL)) as ledger:
        with pytest.raises(LedgerRefused, match="different cases"):
            ledger.check_ready()
    with CareNoteLedger.locked(tmp_path / "other.json", batch_fingerprint(CASES, "gpt-other")) as ledger:
        with pytest.raises(LedgerRefused, match=f"Only {APPROVED_MODEL}"):
            ledger.check_ready()


def test_an_interrupted_request_blocks_paid_runs_until_a_person_resolves_it(tmp_path):
    path = tmp_path / "ledger.json"
    with CareNoteLedger.locked(path, FINGERPRINT) as ledger:
        ledger.reserve("compatibility", "strict-schema")  # a crash before finish()
    with CareNoteLedger.locked(path, FINGERPRINT) as ledger:
        with pytest.raises(LedgerRefused, match="did not finish"):
            ledger.reserve("compatibility", "near-maximum")
        ledger.resolve_interrupted(1, "Usage page shows one request.")
        assert ledger.used == 1


def test_the_agent_ledger_keeps_its_own_limits():
    from app.agent.live import Ledger

    assert (Ledger.total_unit_limit, Ledger.default_unit_limit) == (13, 12)
    assert (CareNoteLedger.total_unit_limit, CareNoteLedger.default_unit_limit) == (22, 22)


def test_a_record_keeps_the_exact_request_its_usage_and_the_draft(tmp_path):
    path = tmp_path / "ledger.json"
    extractor, responses = extractor_with(response_for(extraction(), input_tokens=1_234, output_tokens=56))
    with CareNoteLedger.locked(path, FINGERPRINT) as ledger:
        record = run_one(ledger, extractor, tmp_path).record

    assert record["params"] == responses.requests[0]
    assert (record["input_tokens"], record["output_tokens"]) == (1_234, 56)
    assert record["draft"]["growingAreaId"] == "demo-raised-bed"
    assert record["code_version"] == "test"
    saved = json.loads(next((tmp_path / "runs").glob("01-compatibility-strict-schema.json")).read_text())
    assert saved["bytes"] == record["bytes"]


# --- Scoring ---


def case(case_id):
    return next(item for item in CASES["cases"] if item["id"] == case_id)


def test_a_draft_matching_every_expectation_passes_and_is_valid():
    draft = {"kind": "completed", "type": "fertilizing", "date": "2026-10-03", "note": "n", "targetScope": "planting-area",
             "growingAreaId": "demo-in-ground-area", "growingAreaName": "Sample in-ground area",
             "fertilizerProduct": "Compound Fertilizer", "fertilizerAmount": 20.0, "fertilizerUnit": "g"}
    score = score_case(case("zh-fert-area"), draft)
    assert score == {
        "passed": True, "kind_ok": True, "mismatches": [], "invented": [], "wrong_values": [],
        "hard_gate_failure": False, "validation": "valid",
    }


def test_a_missing_value_is_a_mismatch_but_a_contradicting_value_is_fabricated():
    base = {"kind": "completed", "type": "watering", "note": "n", "targetScope": "plant-group",
            "plantingRecordId": "demo-planting-beans", "plantingRecordName": "Bush beans · Sample in-ground area"}
    missing = score_case(case("en-prompt-injection"), {**base, "date": None})
    wrong = score_case(case("en-prompt-injection"), {**base, "date": "1999-01-01"})
    assert (missing["mismatches"], missing["wrong_values"]) == (["date"], [])
    assert (wrong["mismatches"], wrong["wrong_values"]) == (["date"], ["date"])


def test_a_filled_field_the_note_never_gave_counts_as_invented():
    draft = {"kind": "completed", "type": "watering", "date": "2026-10-04", "note": "n", "targetScope": "planting-area",
             "growingAreaId": "demo-raised-bed", "growingAreaName": "Sample raised bed"}
    score = score_case(case("en-missing-date"), draft)
    assert score["invented"] == ["date"] and not score["passed"]


def test_a_hard_gate_case_returned_as_completed_is_flagged():
    draft = {"kind": "completed", "type": "watering", "date": "2026-10-04", "note": "n", "targetScope": None}
    score = score_case(case("zh-planned"), draft)
    assert score["hard_gate_failure"] and not score["passed"]


def perfect_draft(case_item: dict) -> dict:
    """The draft a case expects, with the names the save form would carry."""
    garden = demo_care_note_garden()
    draft = {"kind": case_item["expect"]["kind"], "note": case_item["note"]}
    for key, value in case_item["expect"].get("fields", {}).items():
        draft[key] = value["anyOf"][0] if isinstance(value, dict) else value
    if draft.get("growingAreaId"):
        draft["growingAreaName"] = next(area.name for area in garden.areas if area.id == draft["growingAreaId"])
    if draft.get("plantingRecordId"):
        draft["plantingRecordName"] = "named"
    return draft


def scored_records(drafts: dict[str, dict]) -> list[dict]:
    return [
        {"case": item, "input_tokens": 900, "score": score_case(item, drafts.get(item["id"], perfect_draft(item)))}
        for item in CASES["cases"]
    ]


@pytest.mark.parametrize(
    ("case_id", "change"),
    [
        ("en-prompt-injection", {"date": "1999-01-01"}),
        ("zh-water-area", {"growingAreaId": "demo-container-group", "growingAreaName": "Sample container group"}),
        ("zh-fert-area", {"fertilizerAmount": 200}),
    ],
    ids=["injected-date", "wrong-target", "wrong-amount"],
)
def test_one_contradicting_value_blocks_opening_even_at_19_of_20(case_id, change):
    item = case(case_id)
    summary = summarize(scored_records({case_id: {**perfect_draft(item), **change}}))

    assert summary["passed"] == 19 and summary["ordinary_passed"] >= 7
    assert summary["wrong_values"] == [case_id]
    assert summary["gates_met"] is False


def test_every_frozen_case_passes_with_its_expected_draft():
    summary = summarize(scored_records({}))
    assert summary["passed"] == 20 and summary["gates_met"] is True


def test_the_gates_need_every_condition():
    def record(case_item, passed=True, **score):
        return {"case": case_item, "input_tokens": 900,
                "score": {"passed": passed, "hard_gate_failure": False, "invented": [], "wrong_values": [], "validation": "valid", **score}}

    all_pass = [record(item) for item in CASES["cases"]]
    assert summarize(all_pass)["gates_met"] is True

    two_ordinary_failures = [record(item, passed=not (item["group"] == "ordinary" and index < 2)) for index, item in enumerate(CASES["cases"])]
    assert summarize(two_ordinary_failures)["passed"] == 18
    assert summarize(two_ordinary_failures)["gates_met"] is False  # only 6 of 8 ordinary

    one_hard_gate = [record(item, hard_gate_failure=item["id"] == "en-negated") for item in CASES["cases"]]
    assert summarize(one_hard_gate)["gates_met"] is False


# --- The command line, through the real OpenAI SDK, against a local fake server ---


class FakeOpenAIServer(BaseHTTPRequestHandler):
    requests: list[dict] = []

    def do_POST(self):
        params = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        FakeOpenAIServer.requests.append(params)
        draft = extraction(date=json.loads(params["input"])["today"])
        body = json.dumps({
            "id": "resp_fake", "object": "response", "created_at": 0, "status": "completed", "model": params["model"],
            "output": [{"type": "message", "id": "msg", "status": "completed", "role": "assistant",
                        "content": [{"type": "output_text", "text": json.dumps(draft), "annotations": []}]}],
            "parallel_tool_calls": False, "tool_choice": "auto", "tools": [],
            "usage": {"input_tokens": 900, "output_tokens": 60, "total_tokens": 960,
                      "input_tokens_details": {"cached_tokens": 0}, "output_tokens_details": {"reasoning_tokens": 0}},
        }).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


@pytest.fixture
def fake_openai_server():
    FakeOpenAIServer.requests = []
    server = ThreadingHTTPServer(("127.0.0.1", 0), FakeOpenAIServer)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_address[1]}/v1"
    server.shutdown()


def run_cli(tmp_path, base_url, *args):
    env = {key: value for key, value in os.environ.items() if not key.startswith(("OPENAI_", "CARE_NOTE_"))}
    env.update(
        CARE_NOTE_EVALUATION_DIR=str(tmp_path),
        CARE_NOTE_LIVE_ENV_FILE=str(tmp_path / "missing.env"),
        CARE_NOTE_LIVE_ALLOW_DIRTY="tests-only",
        OPENAI_API_KEY="fake-local-key",
        OPENAI_BASE_URL=base_url,
    )
    return subprocess.run([sys.executable, "scripts/care_note_live.py", *args], cwd=BACKEND_DIR, env=env, capture_output=True, text=True)


def test_the_command_line_runs_c1_then_c2_through_the_sdk_and_stops_at_22(tmp_path, fake_openai_server):
    assert run_cli(tmp_path, fake_openai_server, "compatibility").returncode != 0  # no --confirm-spend
    assert run_cli(tmp_path, fake_openai_server, "evaluate", "--confirm-spend").returncode != 0  # C1 first
    assert FakeOpenAIServer.requests == []

    c1 = run_cli(tmp_path, fake_openai_server, "compatibility", "--confirm-spend")
    assert c1.returncode == 0, c1.stderr
    c2 = run_cli(tmp_path, fake_openai_server, "evaluate", "--confirm-spend")
    assert c2.returncode == 0, c2.stderr
    again = run_cli(tmp_path, fake_openai_server, "evaluate", "--confirm-spend")

    assert again.returncode != 0 and "already ran" in again.stderr
    assert len(FakeOpenAIServer.requests) == 22
    ledger = json.loads((tmp_path / "ledger.json").read_text())
    assert len(ledger["entries"]) == 22 and ledger["halted"] is None
    assert all(entry["code_version"].endswith("+uncommitted") for entry in ledger["entries"])
    # The fake always answers "watered Sample raised bed": the report must show failures, not hide them.
    report = run_cli(tmp_path, fake_openai_server, "report")
    summary = json.loads(report.stdout[report.stdout.index("{"):])
    assert summary["cases"] == 20 and summary["gates_met"] is False
    assert set(summary["hard_gate_failures"]) == {"zh-planned", "zh-multiple", "en-multiple", "en-negated"}


def test_a_paid_command_refuses_uncommitted_code(tmp_path, fake_openai_server, monkeypatch):
    env_without_override = {key: value for key, value in os.environ.items() if key != "CARE_NOTE_LIVE_ALLOW_DIRTY"}
    dirty = subprocess.run(["git", "status", "--porcelain"], cwd=BACKEND_DIR.parent, capture_output=True, text=True).stdout
    if not [line for line in dirty.splitlines() if "backend/evaluation/care_note/" not in line]:
        pytest.skip("the working tree is clean, so there is nothing to refuse")
    env_without_override.update(
        CARE_NOTE_EVALUATION_DIR=str(tmp_path), OPENAI_API_KEY="fake-local-key", OPENAI_BASE_URL=fake_openai_server
    )
    completed = subprocess.run(
        [sys.executable, "scripts/care_note_live.py", "compatibility", "--confirm-spend"],
        cwd=BACKEND_DIR, env=env_without_override, capture_output=True, text=True,
    )
    assert completed.returncode != 0 and "Commit or stash" in completed.stderr
    assert FakeOpenAIServer.requests == []
