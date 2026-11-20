"""Paid evaluation of the batch Garden Note contract (ADR-0085 N8).

One note becomes up to 12 reviewed records across gardens and five care types
(app/care_note_batch.py). The earlier paid checks (app/care_note_live.py,
ADR-0059) scored the single-draft contract and no longer apply. This batch,
backend/evaluation/care_note/batch-5/, has its own cases, ledger, and run
records and keeps the same rules. Batch 3 halted at its first request (an
expired key); batch 4 ran and missed its gates; batch 5 adds holdout cases:

- A request is written down before it is sent; a failed or interrupted
  request still counts, and nothing is retried.
- A provider error, missing usage, or usage beyond the request's bytes plus
  the format allowance halts the ledger before anything else is saved.
- The first request fixes the batch: model, cases, prompt and schema, the
  source that builds and scores drafts, and limits. A later change refuses
  further paid runs.
- One compatibility request (the largest note the API accepts) passes before
  the evaluation, and each case runs at most once.

Each request is the one the app sends (OpenAICareNoteBatchExtractor), built on
the frozen garden directory in cases.json. The response goes through the same
server rules as the app (drafts_from_batch) and is scored against the case's
written-in-advance expectation. Only scripts/care_note_batch_live.py calls this
with a real client; tests use fakes.
"""

import hashlib
import json
import time
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from fastapi import HTTPException
from pydantic import ValidationError

from .agent.live import BatchHalted, Ledger, LedgerRefused, digest, now, write_record
from .ai import DEFAULT_CARE_NOTE_OPENAI_MODEL, CareNoteProviderError, care_note_output_text, care_note_request_bytes
from .care_note_batch import (
    BATCH_INSTRUCTIONS,
    DETAIL_KEYS,
    MAX_DRAFTS,
    MAX_FRAGMENTS,
    MAX_OUTPUT_TOKENS,
    MAX_REQUEST_BYTES,
    TIMEOUT_SECONDS,
    BatchExtraction,
    CareNoteBatchDraftResponse,
    OpenAICareNoteBatchExtractor,
    batch_output_schema,
    drafts_from_batch,
    parse_batch,
)
from .care_note_public import FORMAT_TOKEN_ALLOWANCE
from .schemas import CARE_NOTE_MAX_LENGTH, CareEventInput, CareNoteDraftRequest
from .service import CareNoteArea, CareNoteGarden, CareNotePlanting

APPROVED_MODEL = DEFAULT_CARE_NOTE_OPENAI_MODEL
EVALUATION_DIR = Path(__file__).resolve().parents[1] / "evaluation" / "care_note"
BATCH = "batch-5"
COMPATIBILITY_CHECKS = ("near-maximum",)
GROUP_SIZES = {"ordinary": 15, "missing": 7, "planned": 3, "not_completed": 8, "boundary": 5}
HOLDOUT_CASES = 12
EVALUATION_CASES = sum(GROUP_SIZES.values())
STAGES = {"compatibility": len(COMPATIBILITY_CHECKS), "evaluation": EVALUATION_CASES}
# This batch's own allowance. ADR-0059's 42 local requests were for the
# single-draft contract and are used up; they are not drawn on here.
UNIT_LIMIT = sum(STAGES.values())
# Gates, fixed before the first request (see the batch README); the same shares as batch 4 (23 of 26, 9 of 10).
MIN_PASSED = 34
MIN_ORDINARY_PASSED = 14

APP_DIR = Path(__file__).resolve().parent
# Every file whose code builds the request, turns the response into drafts, or scores them.
SOURCE_FILES = tuple(APP_DIR / name for name in ("ai.py", "schemas.py", "service.py", "care_note_batch.py", "care_note_batch_live.py"))
CORE_FIELDS = ("gardenId", "type", "date", "targetScope", "growingAreaId", "plantingRecordId")
TASK_FIELDS = ("gardenId", "type", "dueDate", "targetScope", "growingAreaId", "plantingRecordId")
# Free text copied from the note. The server keeps such a value only when the
# note contains it, so a different quote is a mismatch for review, not a fabrication.
QUOTED_FIELDS = ("fertilizerProduct", "fertilizerUnit", "plantName", "pruneDetail", "pestProblem", "pestTreatment")


def batch_dir(evaluation_dir: Path = EVALUATION_DIR) -> Path:
    return evaluation_dir / BATCH


class BatchNoteLedger(Ledger):
    """The agent's ledger with this batch's allowance and stages."""

    default_unit_limit = UNIT_LIMIT
    total_unit_limit = UNIT_LIMIT
    approved_model = APPROVED_MODEL

    def __init__(self, path: Path, data: dict, fingerprint: dict | None = None):
        super().__init__(path, data, fingerprint)
        self.archived_used = 0

    def reserve(self, kind: str, label: str) -> dict:
        self.check_ready()
        if kind not in STAGES:
            raise LedgerRefused(f"{BATCH} has no {kind} stage.")
        entries = [entry for entry in self.data["entries"] if entry["kind"] == kind]
        if any(entry["label"] == label for entry in entries):
            raise LedgerRefused(f"{kind} {label} already ran; a repeat needs a new, approved batch.")
        if len(entries) >= STAGES[kind]:
            raise LedgerRefused(f"All {STAGES[kind]} {kind} requests of {BATCH} are used.")
        if kind == "evaluation" and not self.compatibility_passed():
            raise LedgerRefused("The compatibility request must pass before the evaluation.")
        return super().reserve(kind, label)

    def compatibility_passed(self) -> bool:
        passed = {entry["label"] for entry in self.data["entries"] if entry["kind"] == "compatibility" and entry["status"] == "passed"}
        return passed == set(COMPATIBILITY_CHECKS)


# --- Cases ---


def load_cases(path: Path | None = None) -> dict:
    cases = json.loads((path or batch_dir() / "cases.json").read_text(encoding="utf-8"))
    validate_cases(cases)
    return cases


def case_gardens(cases_doc: dict) -> dict[str, CareNoteGarden]:
    """The frozen garden directory: the three showcase gardens of the public demo (ADR-0077)."""
    return {
        garden["id"]: CareNoteGarden(
            garden["name"],
            tuple(CareNoteArea(area["id"], area["name"]) for area in garden["areas"]),
            tuple(CareNotePlanting(plant["id"], plant["name"], plant["growingAreaId"]) for plant in garden["plants"]),
        )
        for garden in cases_doc["gardens"]
    }


def model_context(cases_doc: dict) -> list[dict]:
    return [garden.model_context() for garden in case_gardens(cases_doc).values()]


def validate_cases(cases_doc: dict) -> None:
    """Fail before any paid run if the frozen cases are malformed or name things outside the gardens."""
    cases = cases_doc["cases"]
    ids = [case["id"] for case in cases]
    if len(set(ids)) != len(ids):
        raise ValueError("Case ids must be unique.")
    groups = {group: sum(case["group"] == group for case in cases) for group in GROUP_SIZES}
    if groups != GROUP_SIZES or len(cases) != EVALUATION_CASES:
        raise ValueError(f"Cases must be split {GROUP_SIZES}; found {groups}.")
    today = date.fromisoformat(cases_doc["today"])
    gardens = case_gardens(cases_doc)
    areas = {area.id for garden in gardens.values() for area in garden.areas}
    plants = {plant.id for garden in gardens.values() for plant in garden.plantings}
    known = {"gardenId": set(gardens), "growingAreaId": areas, "plantingRecordId": plants}
    for case in cases:
        CareNoteDraftRequest.model_validate({"note": case["note"], "today": today})
        expect = case["expect"]
        if expect["outcome"] not in {"drafts", "split"}:
            raise ValueError(f"Case {case['id']} expects an unknown outcome.")
        if expect["outcome"] == "drafts" and not (expect["drafts"] or expect["notices"]):
            raise ValueError(f"Case {case['id']} expects nothing.")
        if len(expect["drafts"]) > MAX_DRAFTS:
            raise ValueError(f"Case {case['id']} expects more than {MAX_DRAFTS} drafts.")
        values = [*expect["drafts"], *(notice.get("task") or {} for notice in expect["notices"])]
        for item in values:
            for key, ids_ in known.items():
                for option in options(item.get(key)):
                    if option is not None and option not in ids_:
                        raise ValueError(f"Case {case['id']} names {key} {option} outside the gardens.")
        if case["hardGate"] and expect["outcome"] != "drafts":
            raise ValueError(f"Case {case['id']} is hard-gated but expects {expect['outcome']}.")
        BatchExtraction.model_validate(case["ideal"])
    if sum(bool(case.get("holdout")) for case in cases) != HOLDOUT_CASES:
        raise ValueError(f"Cases must mark {HOLDOUT_CASES} holdout notes.")
    if not any(case["expect"]["outcome"] == "split" for case in cases):
        raise ValueError("One case must exceed the draft limit.")
    if not any(len(case["expect"]["drafts"]) == MAX_DRAFTS for case in cases):
        raise ValueError(f"One case must hold exactly {MAX_DRAFTS} jobs.")


def options(expected) -> list:
    return expected["anyOf"] if isinstance(expected, dict) and "anyOf" in expected else [expected]


# --- Fingerprint ---


def source_digest(paths) -> str:
    hasher = hashlib.sha256()
    for path in paths:
        hasher.update(Path(path).name.encode("utf-8") + b"\0" + Path(path).read_bytes() + b"\0")
    return hasher.hexdigest()[:16]


def batch_fingerprint(cases_doc: dict, model_name: str) -> dict:
    """Everything a paid result depends on."""
    return {
        "model": model_name,
        "cases": digest(cases_doc),
        "request_template": digest({"instructions": BATCH_INSTRUCTIONS, "schema": batch_output_schema(), "max_output_tokens": MAX_OUTPUT_TOKENS}),
        "source": source_digest(SOURCE_FILES),
        "limits": {
            "max_request_bytes": MAX_REQUEST_BYTES,
            "format_token_allowance": FORMAT_TOKEN_ALLOWANCE,
            "max_output_tokens": MAX_OUTPUT_TOKENS,
            "max_drafts": MAX_DRAFTS,
            "max_fragments": MAX_FRAGMENTS,
            "timeout_seconds": TIMEOUT_SECONDS,
        },
    }


# A control character becomes a six-character escape in the request input and
# a seventh byte when the request is serialized: the costliest code point.
MAX_BYTES_CHARACTER = "\x01"


def near_maximum_note() -> str:
    return MAX_BYTES_CHARACTER * CARE_NOTE_MAX_LENGTH


def request_sizes(cases_doc: dict) -> dict[str, int]:
    """Bytes of every planned request, measured offline with the approved model's parameters."""
    extractor = OpenAICareNoteBatchExtractor("offline", APPROVED_MODEL, client=object())
    context = model_context(cases_doc)
    today = date.fromisoformat(cases_doc["today"])
    notes = {"compatibility/near-maximum": near_maximum_note(), **{f"evaluation/{case['id']}": case["note"] for case in cases_doc["cases"]}}
    return {label: care_note_request_bytes(extractor.request_params(note, context, today)) for label, note in notes.items()}


# Published gpt-4o-mini prices, as in app/care_note_public.py.
INPUT_PRICE_PER_TOKEN = 0.15 / 1_000_000
OUTPUT_PRICE_PER_TOKEN = 0.60 / 1_000_000


def cost_bound(cases_doc: dict) -> dict:
    """The most the batch can cost: every input at its byte bound plus the allowance, every output at the cap."""
    sizes = request_sizes(cases_doc)
    input_tokens = sum(size + FORMAT_TOKEN_ALLOWANCE for size in sizes.values())
    output_tokens = len(sizes) * MAX_OUTPUT_TOKENS
    return {
        "requests": len(sizes),
        "max_input_tokens": input_tokens,
        "max_output_tokens": output_tokens,
        "max_cost_usd": round(input_tokens * INPUT_PRICE_PER_TOKEN + output_tokens * OUTPUT_PRICE_PER_TOKEN, 4),
    }


def usage_problem(response, request_bytes: int) -> str | None:
    usage = getattr(response, "usage", None)
    input_tokens = getattr(usage, "input_tokens", None)
    output_tokens = getattr(usage, "output_tokens", None)
    if not isinstance(input_tokens, int) or not isinstance(output_tokens, int) or input_tokens < 0 or output_tokens < 0:
        return "missing_or_invalid_usage"
    if input_tokens > request_bytes + FORMAT_TOKEN_ALLOWANCE:
        return "input_above_allowance"
    if output_tokens > MAX_OUTPUT_TOKENS:
        return "output_above_cap"
    return None


# --- Scoring ---


def value_equal(expected, actual) -> bool:
    if isinstance(expected, (int, float)) and not isinstance(expected, bool):
        return isinstance(actual, (int, float)) and not isinstance(actual, bool) and float(actual) == float(expected)
    if isinstance(expected, str):
        return isinstance(actual, str) and actual.strip().casefold() == expected.strip().casefold()
    return actual == expected


def compare(expected: dict, actual: dict, keys) -> dict:
    """Per key: missing (left empty), wrong (filled but contradicting), or quoted (a different quote of the note)."""
    result = {"missing": [], "wrong": [], "quoted": []}
    for key in keys:
        allowed = options(expected.get(key))
        value = actual.get(key)
        if any(value_equal(option, value) for option in allowed):
            continue
        if value is None:
            result["missing"].append(key)
        elif key in QUOTED_FIELDS:
            result["quoted"].append(key)
        else:
            result["wrong"].append(key)
    return result


def pair_up(expected: list[dict], actual: list[dict], keys) -> tuple[list[tuple[int, int, dict]], list[int], list[int]]:
    """Match each expected item to the closest actual one: wrong values cost most, then missing, then quoted."""
    costs = []
    for i, item in enumerate(expected):
        for j, other in enumerate(actual):
            diff = compare(item, other, keys)
            costs.append((len(diff["wrong"]) * 100 + len(diff["missing"]) * 10 + len(diff["quoted"]), i, j, diff))
    pairs, used_expected, used_actual = [], set(), set()
    for _cost, i, j, diff in sorted(costs, key=lambda item: item[:3]):
        if i in used_expected or j in used_actual:
            continue
        pairs.append((i, j, diff))
        used_expected.add(i)
        used_actual.add(j)
    return (
        sorted(pairs),
        [i for i in range(len(expected)) if i not in used_expected],
        [j for j in range(len(actual)) if j not in used_actual],
    )


def draft_validation(draft: dict, gardens: dict[str, CareNoteGarden]) -> str:
    """'valid' or 'invalid' for a draft with type, date, and target; 'not_savable' until the gardener fills them.

    The browser adds the target's name snapshot when it saves; the same names come from the frozen gardens here.
    """
    if not (draft.get("type") and draft.get("date") and draft.get("targetScope")):
        return "not_savable"
    garden = gardens.get(draft.get("gardenId") or "")
    names = {}
    if garden and draft.get("growingAreaId"):
        names["growingAreaName"] = next((area.name for area in garden.areas if area.id == draft["growingAreaId"]), None)
    if garden and draft.get("plantingRecordId"):
        names["plantingRecordName"] = next((plant.common_name for plant in garden.plantings if plant.id == draft["plantingRecordId"]), None)
    event = {
        "id": "evaluation",
        "type": draft["type"],
        "date": draft["date"],
        "note": draft["sourceText"],
        "targetScope": draft["targetScope"],
        **{key: draft[key] for key in ("growingAreaId", "plantingRecordId") if draft.get(key)},
        **{key: value for key, value in names.items() if value},
        **{key: draft[key] for key in DETAIL_KEYS if draft.get(key) is not None},
    }
    try:
        CareEventInput.model_validate(event)
    except ValidationError:
        return "invalid"
    return "valid"


def score_case(case: dict, result: dict, gardens: dict[str, CareNoteGarden]) -> dict:
    """Compare one response with the case's frozen expectation. Nothing passes without a response.

    A missing value is left for the gardener; a filled value that contradicts
    the note is wrong. An extra draft in a hard-gated case is a record of work
    that did not happen.
    """
    expect = case["expect"]
    outcome = result["outcome"]
    drafts, notices = result.get("drafts", []), result.get("notices", [])
    pairs, missing_drafts, extra_drafts = pair_up(expect["drafts"], drafts, (*CORE_FIELDS, *DETAIL_KEYS))
    draft_fields = {key: [field for _i, _j, diff in pairs for field in diff[key]] for key in ("missing", "wrong", "quoted")}

    remaining = list(range(len(notices)))
    missing_notices, task_fields = [], {"missing": [], "wrong": [], "quoted": []}
    for item in expect["notices"]:
        candidates = [j for j in remaining if notices[j]["reason"] == item["reason"]]
        if not candidates:
            missing_notices.append(item["reason"])
            continue
        if "task" in item:
            diffs = [(j, compare(item["task"], notices[j].get("task") or {}, (*TASK_FIELDS, *DETAIL_KEYS))) for j in candidates]
            j, diff = min(diffs, key=lambda pair: (len(pair[1]["wrong"]), len(pair[1]["missing"]), len(pair[1]["quoted"])))
            for key in task_fields:
                task_fields[key] += diff[key]
        else:
            j = candidates[0]
        remaining.remove(j)

    outcome_ok = outcome == expect["outcome"]
    extra = [drafts[j] for j in extra_drafts]
    wrong = draft_fields["wrong"] + task_fields["wrong"]
    validation = [draft_validation(draft, gardens) for draft in drafts]
    return {
        "passed": outcome_ok and not missing_drafts and not extra and not missing_notices and not any(draft_fields.values()) and not any(task_fields.values()),
        "outcome": outcome,
        "outcome_ok": outcome_ok,
        "expected_drafts": len(expect["drafts"]),
        "actual_drafts": len(drafts),
        "missing_drafts": len(missing_drafts),
        "extra_drafts": len(extra),
        "missing_fields": draft_fields["missing"],
        "wrong_values": wrong,
        "quoted_differently": draft_fields["quoted"] + task_fields["quoted"],
        "missing_notices": missing_notices,
        "task_missing_fields": task_fields["missing"],
        "extra_notices": [notices[j]["reason"] for j in remaining],
        "hard_gate_failure": bool(case["hardGate"]) and bool(extra),
        "invalid_drafts": validation.count("invalid"),
    }


def summarize(case_records: list[dict]) -> dict:
    """The batch's gates over every evaluation record."""
    scores = {record["case"]["id"]: record["score"] for record in case_records}
    ordinary = [record for record in case_records if record["case"]["group"] == "ordinary"]
    summary = {
        "cases": len(case_records),
        "passed": sum(score["passed"] for score in scores.values()),
        "ordinary_passed": sum(record["score"]["passed"] for record in ordinary),
        "expected_drafts": sum(score["expected_drafts"] for score in scores.values()),
        "found_drafts": sum(score["expected_drafts"] - score["missing_drafts"] for score in scores.values()),
        "extra_drafts": sum(score["extra_drafts"] for score in scores.values()),
        "missing_fields": sum(len(score["missing_fields"]) for score in scores.values()),
        "hard_gate_failures": [key for key, score in scores.items() if score["hard_gate_failure"]],
        "wrong_values": [key for key, score in scores.items() if score["wrong_values"]],
        "invalid_drafts": [key for key, score in scores.items() if score["invalid_drafts"]],
        "unusable": [key for key, score in scores.items() if score["outcome"] in {"unusable", "no_response"}],
        "usage_unknown": [record["case"]["id"] for record in case_records if record.get("input_tokens") is None],
        "holdout_cases": sum(bool(record["case"].get("holdout")) for record in case_records),
        "holdout_passed": sum(bool(record["case"].get("holdout")) and record["score"]["passed"] for record in case_records),
    }
    summary["gates_met"] = (
        summary["cases"] == EVALUATION_CASES
        and not summary["hard_gate_failures"]
        and not summary["wrong_values"]
        and not summary["invalid_drafts"]
        and not summary["usage_unknown"]
        and summary["passed"] >= MIN_PASSED
        and summary["ordinary_passed"] >= MIN_ORDINARY_PASSED
    )
    return summary


def server_result(gardens: dict[str, CareNoteGarden], note: str, text: str, today: date) -> dict:
    """What the app's server makes of one model answer: drafts and notices, the split refusal, or unusable."""
    try:
        extraction = parse_batch(text)
        response = drafts_from_batch(gardens, note, extraction, today)
    except HTTPException as error:
        if error.status_code == 422:
            return {"outcome": "split"}
        return {"outcome": "unusable", "error": str(error.detail)}
    except (CareNoteProviderError, ValueError) as error:
        return {"outcome": "unusable", "error": str(error)}
    body = CareNoteBatchDraftResponse.model_validate(response).model_dump(mode="json", by_alias=True)
    return {"outcome": "drafts", **body}


# --- Paid requests ---


def provider_error(error: Exception) -> dict:
    """The SDK error's class, HTTP status, and error code. Never its message, which can quote part of the key."""
    cause = error.__cause__
    code = getattr(cause, "code", None)
    return {
        "type": type(cause).__name__ if cause is not None else None,
        "status_code": getattr(cause, "status_code", None),
        "code": code if isinstance(code, str) else None,
    }


@dataclass
class UnitOutcome:
    passed: bool
    record: dict


def run_unit(
    ledger: BatchNoteLedger,
    extractor: OpenAICareNoteBatchExtractor,
    cases_doc: dict,
    *,
    kind: str,
    label: str,
    note: str,
    runs_dir: Path,
    code_version: str,
    case: dict | None = None,
) -> UnitOutcome:
    """One paid request, recorded in full. Halts the ledger on any usage doubt."""
    today = date.fromisoformat(cases_doc["today"])
    params = extractor.request_params(note, model_context(cases_doc), today)
    request_bytes = care_note_request_bytes(params)
    if request_bytes > MAX_REQUEST_BYTES:
        raise LedgerRefused(f"{label}: {request_bytes} bytes exceeds the {MAX_REQUEST_BYTES}-byte limit; nothing was sent.")
    entry = ledger.reserve(kind, label)
    record: dict = {
        "kind": kind, "label": label, "unit": entry["unit"], "model": params["model"], "code_version": code_version,
        "recorded_at": now(), "today": today.isoformat(), "bytes": request_bytes, "params": params,
        "case": {key: value for key, value in case.items() if key != "ideal"} if case else None,
    }
    started = time.monotonic()
    halted = None
    response = None
    try:
        response = extractor.sender.send(params)
    except CareNoteProviderError as error:
        # Usage is unknown, so the request may still have been billed.
        record["provider_error"] = provider_error(error)
        halted = f"{label} failed at the provider without usage: {error} {json.dumps(record['provider_error'])}"
    record["duration_ms"] = round((time.monotonic() - started) * 1000)
    usage = getattr(response, "usage", None)
    record.update(
        status=getattr(response, "status", None),
        input_tokens=getattr(usage, "input_tokens", None),
        output_tokens=getattr(usage, "output_tokens", None),
    )
    if response is not None:
        problem = usage_problem(response, request_bytes)
        if problem is not None:
            halted = f"{label}: {problem} (input {record['input_tokens']}, output {record['output_tokens']}, {request_bytes} bytes)"
    if halted:
        # Saved first: even if writing the record fails, no later paid request may run.
        ledger.halt(halted)
    record["halted"] = halted
    if isinstance(record["input_tokens"], int) and isinstance(record["output_tokens"], int):
        record["cost_usd"] = round(record["input_tokens"] * INPUT_PRICE_PER_TOKEN + record["output_tokens"] * OUTPUT_PRICE_PER_TOKEN, 6)

    result = {"outcome": "no_response"}
    if response is not None and not halted:
        try:
            record["output_text"] = care_note_output_text(response)
            result = server_result(case_gardens(cases_doc), note, record["output_text"], today)
        except ValueError as error:
            result = {"outcome": "unusable", "error": str(error)}
    record["result"] = result

    if kind == "evaluation":
        record["score"] = score_case(case, result, case_gardens(cases_doc))
        passed = record["score"]["passed"]
    else:
        passed = result["outcome"] != "no_response" and "output_text" in record and not halted
    record["passed"] = passed
    write_record(runs_dir, f"{entry['unit']:02d}-{kind}-{label}", record)
    ledger.finish(
        entry,
        "passed" if passed else ("halted" if halted else "failed"),
        bytes=request_bytes,
        input_tokens=record["input_tokens"],
        output_tokens=record["output_tokens"],
        duration_ms=record["duration_ms"],
        code_version=code_version,
    )
    if halted:
        raise BatchHalted(halted)
    return UnitOutcome(passed, record)


def run_compatibility(ledger, extractor, cases_doc: dict, *, runs_dir: Path, code_version: str) -> list[UnitOutcome]:
    """The strict schema on the largest request the API accepts: 500 of the costliest character."""
    return [
        run_unit(ledger, extractor, cases_doc, kind="compatibility", label="near-maximum", note=near_maximum_note(), runs_dir=runs_dir, code_version=code_version)
    ]


def run_evaluation(ledger, extractor, cases_doc: dict, *, runs_dir: Path, code_version: str) -> list[UnitOutcome]:
    """Each frozen case once, in order; a case that already ran is skipped, never repeated."""
    done = {entry["label"] for entry in ledger.data["entries"] if entry["kind"] == "evaluation"}
    return [
        run_unit(ledger, extractor, cases_doc, kind="evaluation", label=case["id"], note=case["note"], runs_dir=runs_dir, code_version=code_version, case=case)
        for case in cases_doc["cases"]
        if case["id"] not in done
    ]


def evaluation_records(runs_dir: Path) -> list[dict]:
    return [json.loads(path.read_text(encoding="utf-8")) for path in sorted(runs_dir.glob("*-evaluation-*.json"))]


def spend(ledger_data: dict) -> dict:
    """Tokens and estimated dollars of every recorded request; unknown usage is never counted as zero."""
    entries = ledger_data["entries"]
    unknown = [entry["unit"] for entry in entries if not isinstance(entry.get("input_tokens"), int) or not isinstance(entry.get("output_tokens"), int)]
    known = [entry for entry in entries if entry["unit"] not in unknown]
    input_tokens = sum(entry["input_tokens"] for entry in known)
    output_tokens = sum(entry["output_tokens"] for entry in known)
    return {
        "requests": len(entries),
        "unknown_usage_units": unknown,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "estimated_cost_usd": round(input_tokens * INPUT_PRICE_PER_TOKEN + output_tokens * OUTPUT_PRICE_PER_TOKEN, 6),
    }


# --- Replay: current rules on saved answers, no requests ---


def replay_evaluation(batch: str, *, code_version: str, evaluation_dir: Path = EVALUATION_DIR) -> dict:
    """Score the saved answers of a batch again with today's server rules.

    Nothing is sent and the saved records stay as they are: this measures what
    the current rules make of answers the model already gave, which is not a
    new evaluation of the model, and the same answers cannot test a prompt change.
    """
    directory = evaluation_dir / batch
    cases_doc = json.loads((directory / "cases.json").read_text(encoding="utf-8"))
    gardens = case_gardens(cases_doc)
    records = evaluation_records(directory / "runs")
    items, replayed = [], []
    for record in records:
        case = record["case"]
        if "output_text" in record:
            result = server_result(gardens, case["note"], record["output_text"], date.fromisoformat(record["today"]))
        else:
            result = {"outcome": "no_response"}
        score = score_case(case, result, gardens)
        replayed.append({"case": case, "score": score, "input_tokens": record.get("input_tokens")})
        items.append({"id": case["id"], "recorded_passed": record["score"]["passed"], "replayed_passed": score["passed"], "replayed_score": score})
    return {
        "description": "Current server rules applied to saved model answers. No request was sent; the recorded results stay as they are.",
        "batch": batch,
        "recorded_at": now(),
        "code_version": code_version,
        "source": source_digest(SOURCE_FILES),
        "recorded_summary": summarize(records),
        "replayed_summary": summarize(replayed),
        "cases": items,
    }
