"""The batch Garden Note's paid-evaluation tooling (ADR-0085 N8), run against fakes only.

No test reads a real key or reaches OpenAI: every client is scripted.
"""

import copy
import json
from datetime import date
from types import SimpleNamespace

import openai
import pytest

from app import care_note_batch_live as live
from app.agent.live import BatchHalted, LedgerRefused
from app.ai import CareNoteProviderError, care_note_request_bytes
from app.care_note_batch import MAX_DRAFTS, MAX_REQUEST_BYTES, OpenAICareNoteBatchExtractor
from app.care_note_live import blocking_changes

CASES = live.load_cases()
GARDENS = live.case_gardens(CASES)
TODAY = date.fromisoformat(CASES["today"])
FINGERPRINT = live.batch_fingerprint(CASES, live.APPROVED_MODEL)


def response_for(body, *, input_tokens=3000, output_tokens=400, status="completed"):
    text = body if isinstance(body, str) else json.dumps(body, ensure_ascii=False)
    return SimpleNamespace(
        status=status,
        output=[SimpleNamespace(type="message", content=[SimpleNamespace(type="output_text", text=text)])],
        usage=SimpleNamespace(input_tokens=input_tokens, output_tokens=output_tokens),
    )


class ScriptedResponses:
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
    return OpenAICareNoteBatchExtractor("test-key", live.APPROVED_MODEL, client=SimpleNamespace(responses=responses)), responses


def case(case_id):
    return next(item for item in CASES["cases"] if item["id"] == case_id)


def ideal_result(item):
    return live.server_result(GARDENS, item["note"], json.dumps(item["ideal"], ensure_ascii=False), TODAY)


def unrelated(note):
    return {"overflow": False, "sharedDateText": None, "events": [{**case("b3-zh-unrelated")["ideal"]["events"][0], "sourceText": note}]}


def ledger_at(tmp_path):
    return live.BatchNoteLedger.locked(tmp_path / live.BATCH / "ledger.json", FINGERPRINT)


def compatibility_passes(ledger, tmp_path):
    extractor, _ = extractor_with(response_for(unrelated(live.near_maximum_note())))
    return live.run_compatibility(ledger, extractor, CASES, runs_dir=tmp_path / "runs", code_version="test")


# --- Cases ---


def test_the_frozen_cases_follow_the_planned_split_and_fit_the_api():
    assert {group: sum(item["group"] == group for item in CASES["cases"]) for group in live.GROUP_SIZES} == live.GROUP_SIZES
    assert [garden["name"] for garden in CASES["gardens"]] == ["Backyard", "Community Garden", "Front Yard"]
    sizes = live.request_sizes(CASES)
    assert max(sizes, key=sizes.get) == "compatibility/near-maximum"
    assert max(sizes.values()) <= MAX_REQUEST_BYTES


@pytest.mark.parametrize("case_id", [item["id"] for item in CASES["cases"]])
def test_every_case_passes_with_its_ideal_answer_under_the_server_rules(case_id):
    item = case(case_id)
    score = live.score_case(item, ideal_result(item), GARDENS)
    assert score["passed"], score
    assert score["invalid_drafts"] == 0


@pytest.mark.parametrize("break_cases", [
    lambda doc: doc["cases"].pop(),
    lambda doc: doc["cases"][1].update(id=doc["cases"][0]["id"]),
    lambda doc: doc["cases"][0]["expect"]["drafts"][0].update(gardenId="nowhere"),
    lambda doc: doc["cases"][0].update(note="x" * 501),
    lambda doc: next(item for item in doc["cases"] if item["expect"]["outcome"] == "split")["expect"].update(outcome="drafts"),
    lambda doc: doc["cases"][-1].update(holdout=False),
])
def test_malformed_cases_are_refused_before_any_spending(break_cases):
    doc = copy.deepcopy(CASES)
    break_cases(doc)
    with pytest.raises(ValueError):
        live.validate_cases(doc)


def test_the_cost_bound_covers_every_request_at_its_caps():
    bound = live.cost_bound(CASES)
    assert bound["requests"] == live.UNIT_LIMIT == 39
    assert bound["max_output_tokens"] == 39 * 8192
    assert bound["max_cost_usd"] < 0.25


def test_changing_cases_or_prompt_changes_the_batch(monkeypatch):
    doc = copy.deepcopy(CASES)
    doc["cases"][0]["note"] += "。"
    assert live.batch_fingerprint(doc, live.APPROVED_MODEL)["cases"] != FINGERPRINT["cases"]
    monkeypatch.setattr(live, "BATCH_INSTRUCTIONS", live.BATCH_INSTRUCTIONS + " ")
    assert live.batch_fingerprint(CASES, live.APPROVED_MODEL)["request_template"] != FINGERPRINT["request_template"]


@pytest.mark.parametrize("line, blocks", [
    (" M backend/evaluation/care_note/batch-5/ledger.json", False),
    ("?? backend/evaluation/care_note/batch-5/runs/02-evaluation-b3-zh-negated.json", False),
    (" M backend/evaluation/care_note/batch-5/cases.json", True),
    (" M backend/app/care_note_batch.py", True),
])
def test_only_the_ledger_and_run_records_may_be_uncommitted_during_a_paid_run(line, blocks):
    assert bool(blocking_changes(line)) is blocks


# --- Scoring ---


def test_a_missing_value_is_left_for_review_but_a_contradicting_value_is_wrong():
    item = case("b3-zh-two-dates")
    result = ideal_result(item)
    result["drafts"][0]["date"] = None
    score = live.score_case(item, result, GARDENS)
    assert not score["passed"] and score["missing_fields"] == ["date"] and score["wrong_values"] == []
    result["drafts"][0]["date"] = "2026-11-18"
    assert live.score_case(item, result, GARDENS)["wrong_values"] == ["date"]


def test_a_different_quote_of_the_note_is_not_a_fabrication():
    item = case("b3-zh-pest-plant")
    result = ideal_result(item)
    result["drafts"][0]["pestTreatment"] = "肥皂水喷了一遍"
    score = live.score_case(item, result, GARDENS)
    assert not score["passed"] and score["quoted_differently"] == ["pestTreatment"] and score["wrong_values"] == []


def test_a_record_drafted_from_planned_or_negated_text_is_a_hard_gate_failure():
    item = case("b3-zh-two-planned")
    result = ideal_result(item)
    result["drafts"].append({**ideal_result(case("b3-zh-water-two-gardens"))["drafts"][0], "sourceText": "后天给 Backyard 浇水"})
    score = live.score_case(item, result, GARDENS)
    assert score["extra_drafts"] == 1 and score["hard_gate_failure"]


def test_a_planned_task_is_scored_on_its_values():
    item = case("b3-en-done-and-planned")
    result = ideal_result(item)
    result["notices"][0]["task"]["dueDate"] = None
    assert live.score_case(item, result, GARDENS)["task_missing_fields"] == ["dueDate"]
    result["notices"][0]["task"]["gardenId"] = "demo-front-yard"
    assert live.score_case(item, result, GARDENS)["wrong_values"] == ["gardenId"]


def test_thirteen_jobs_pass_only_when_the_note_is_refused_whole():
    item = case("b3-zh-thirteen-jobs")
    assert ideal_result(item) == {"outcome": "split"}
    assert live.score_case(item, ideal_result(item), GARDENS)["passed"]
    assert not live.score_case(item, {"outcome": "drafts", "drafts": [], "notices": []}, GARDENS)["passed"]
    assert len(case("b3-en-twelve-jobs")["expect"]["drafts"]) == MAX_DRAFTS


def records(passed=38, ordinary=15, **score_changes):
    built = []
    for index, item in enumerate(CASES["cases"]):
        score = live.score_case(item, ideal_result(item), GARDENS)
        score.update(score_changes.get(item["id"], {}))
        built.append({"case": item, "score": score, "input_tokens": 3000})
    for record in built[passed:]:
        record["score"]["passed"] = False
    for record in [r for r in built if r["case"]["group"] == "ordinary"][ordinary:]:
        record["score"]["passed"] = False
    return built


def test_the_gates_need_every_condition():
    assert live.summarize(records())["gates_met"]
    assert live.summarize(records(passed=34))["gates_met"]
    assert not live.summarize(records(passed=33))["gates_met"]
    assert not live.summarize(records(ordinary=13))["gates_met"]
    assert not live.summarize(records(**{"b3-zh-negated": {"hard_gate_failure": True}}))["gates_met"]
    assert not live.summarize(records(**{"b3-zh-two-dates": {"wrong_values": ["date"]}}))["gates_met"]
    assert not live.summarize(records(**{"b3-zh-two-dates": {"invalid_drafts": 1}}))["gates_met"]
    unknown = records()
    unknown[0]["input_tokens"] = None
    assert not live.summarize(unknown)["gates_met"]
    assert not live.summarize(records()[:-1])["gates_met"]


# --- Ledger and requests ---


def test_the_evaluation_waits_for_the_compatibility_request(tmp_path):
    with ledger_at(tmp_path) as ledger:
        with pytest.raises(LedgerRefused, match="compatibility"):
            ledger.reserve("evaluation", CASES["cases"][0]["id"])


def test_a_record_keeps_the_exact_request_its_usage_its_cost_and_the_score(tmp_path):
    item = case("b3-zh-water-two-gardens")
    with ledger_at(tmp_path) as ledger:
        compatibility_passes(ledger, tmp_path)
        extractor, responses = extractor_with(response_for(item["ideal"]))
        outcome = live.run_unit(ledger, extractor, CASES, kind="evaluation", label=item["id"], note=item["note"],
                                runs_dir=tmp_path / "runs", code_version="test", case=item)
    record = outcome.record
    assert outcome.passed and record["params"] == responses.requests[0]
    assert record["params"] == extractor.request_params(item["note"], live.model_context(CASES), TODAY)
    assert record["bytes"] == care_note_request_bytes(record["params"])
    assert record["cost_usd"] == round(3000 * 0.15e-6 + 400 * 0.6e-6, 6)
    assert "ideal" not in record["case"]
    assert [draft["gardenId"] for draft in record["result"]["drafts"]] == ["demo-backyard", "demo-front-yard"]
    saved = json.loads((tmp_path / "runs" / "02-evaluation-b3-zh-water-two-gardens.json").read_text())
    assert saved["score"]["passed"]


@pytest.mark.parametrize("usage", [
    {"input_tokens": None, "output_tokens": 10},
    {"input_tokens": 10**6, "output_tokens": 10},
    {"input_tokens": 100, "output_tokens": 9000},
])
def test_usage_outside_the_cost_assumptions_halts_every_later_request(tmp_path, usage):
    with ledger_at(tmp_path) as ledger:
        extractor, _ = extractor_with(response_for(unrelated(live.near_maximum_note()), **usage))
        with pytest.raises(BatchHalted):
            live.run_compatibility(ledger, extractor, CASES, runs_dir=tmp_path / "runs", code_version="test")
        with pytest.raises(LedgerRefused, match="halted"):
            ledger.reserve("compatibility", "near-maximum")
    assert ledger.used == 1


def test_a_provider_error_is_counted_and_halts_the_ledger(tmp_path):
    error = openai.APIConnectionError(request=SimpleNamespace(method="POST", url="https://example.invalid"))
    with ledger_at(tmp_path) as ledger:
        extractor, responses = extractor_with(error)
        with pytest.raises(BatchHalted):
            live.run_compatibility(ledger, extractor, CASES, runs_dir=tmp_path / "runs", code_version="test")
    assert ledger.used == 1 and ledger.data["halted"] and len(responses.requests) == 1
    record = json.loads(next((tmp_path / "runs").glob("01-*.json")).read_text())
    assert record["provider_error"] == {"type": "APIConnectionError", "status_code": None, "code": None}


def test_a_provider_status_error_records_its_status_and_code_but_never_its_message(tmp_path):
    body = {"error": {"message": "Incorrect API key provided: sk-abc...wxyz", "code": "invalid_api_key"}}
    response = SimpleNamespace(status_code=401, headers={}, request=SimpleNamespace(method="POST", url="https://example.invalid"))
    error = openai.AuthenticationError("Incorrect API key provided: sk-abc...wxyz", response=response, body=body["error"])
    with ledger_at(tmp_path) as ledger:
        extractor, _ = extractor_with(error)
        with pytest.raises(BatchHalted, match="invalid_api_key"):
            live.run_compatibility(ledger, extractor, CASES, runs_dir=tmp_path / "runs", code_version="test")
    text = next((tmp_path / "runs").glob("01-*.json")).read_text()
    assert json.loads(text)["provider_error"] == {"type": "AuthenticationError", "status_code": 401, "code": "invalid_api_key"}
    assert "sk-" not in text and "sk-" not in json.dumps(ledger.data)


def test_an_unusable_answer_still_counts_and_is_not_retried(tmp_path):
    item = case("b3-zh-negated")
    with ledger_at(tmp_path) as ledger:
        compatibility_passes(ledger, tmp_path)
        extractor, responses = extractor_with(response_for("{not json"))
        outcome = live.run_unit(ledger, extractor, CASES, kind="evaluation", label=item["id"], note=item["note"],
                                runs_dir=tmp_path / "runs", code_version="test", case=item)
        assert not outcome.passed and outcome.record["result"]["outcome"] == "unusable"
        with pytest.raises(LedgerRefused, match="already ran"):
            ledger.reserve("evaluation", item["id"])
    assert len(responses.requests) == 1


def test_the_whole_batch_is_39_requests_and_a_rerun_never_repeats_a_case(tmp_path):
    with ledger_at(tmp_path) as ledger:
        compatibility_passes(ledger, tmp_path)
        extractor, responses = extractor_with(*[response_for(item["ideal"]) for item in CASES["cases"]])
        outcomes = live.run_evaluation(ledger, extractor, CASES, runs_dir=tmp_path / "runs", code_version="test")
        assert len(outcomes) == 38 and all(outcome.passed for outcome in outcomes)
        assert live.run_evaluation(ledger, extractor, CASES, runs_dir=tmp_path / "runs", code_version="test") == []
        with pytest.raises(LedgerRefused):
            ledger.reserve("evaluation", "extra")
    assert ledger.used == 39 and len(responses.requests) == 38
    summary = live.summarize(live.evaluation_records(tmp_path / "runs"))
    assert summary["gates_met"] and summary["passed"] == 38 and summary["holdout_passed"] == 12
    assert live.spend(ledger.data)["requests"] == 39


def test_a_different_model_or_batch_is_refused(tmp_path):
    path = tmp_path / live.BATCH / "ledger.json"
    with live.BatchNoteLedger.locked(path, FINGERPRINT) as ledger:
        compatibility_passes(ledger, tmp_path)
    changed = {**FINGERPRINT, "cases": "changed"}
    with live.BatchNoteLedger.locked(path, changed) as ledger:
        with pytest.raises(LedgerRefused, match="different cases"):
            ledger.reserve("evaluation", CASES["cases"][0]["id"])
    with live.BatchNoteLedger.locked(tmp_path / "other" / "ledger.json", {**FINGERPRINT, "model": "gpt-4o"}) as ledger:
        with pytest.raises(LedgerRefused, match="Only"):
            ledger.reserve("compatibility", "near-maximum")


def test_the_batch_openai_extractor_sends_the_harness_parameters():
    extractor, responses = extractor_with(response_for(case("b3-zh-negated")["ideal"]))
    extractor.extract("今天没给 Backyard 浇水，因为下雨了", live.model_context(CASES), TODAY)
    assert responses.requests[0] == extractor.request_params("今天没给 Backyard 浇水，因为下雨了", live.model_context(CASES), TODAY)
    assert extractor.sender.timeout == 90


def test_the_provider_error_type_is_the_apps():
    extractor, _ = extractor_with(openai.APIConnectionError(request=SimpleNamespace(method="POST", url="https://example.invalid")))
    with pytest.raises(CareNoteProviderError):
        extractor.sender.send({"model": live.APPROVED_MODEL})


def test_the_replay_scores_saved_answers_again_without_changing_them():
    runs = live.EVALUATION_DIR / "batch-4" / "runs"
    before = {path.name: path.read_text() for path in runs.glob("*.json")}
    replay = live.replay_evaluation("batch-4", code_version="test")
    assert replay["recorded_summary"]["passed"] == 11 and len(replay["cases"]) == 26
    assert replay["replayed_summary"]["wrong_values"] == [] and replay["replayed_summary"]["hard_gate_failures"] == []
    assert {path.name: path.read_text() for path in runs.glob("*.json")} == before


def test_batch_5_keeps_batch_4s_cases_and_adds_twelve_holdout_notes():
    old = json.loads((live.EVALUATION_DIR / "batch-4" / "cases.json").read_text())
    kept = [{key: value for key, value in item.items() if key != "holdout"} for item in CASES["cases"] if not item["holdout"]]
    assert kept == old["cases"] and CASES["gardens"] == old["gardens"] and CASES["today"] == old["today"]
    assert sum(item["holdout"] for item in CASES["cases"]) == 12
