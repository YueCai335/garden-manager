"""Paid checks of AI Garden Note against the real model: C1 and C2 (ADR-0059).

Every paid request draws from a Garden Note ledger (backend/evaluation/
care_note/ledger.json) capped at 22 requests: 2 for the C1 compatibility
checks and 20 for the C2 evaluation. It reuses the allocation agent's ledger
(app/agent/live.py) with its own limits, so the same rules hold:

- A request is written down before it is sent; a failed or interrupted
  request still counts, and nothing is retried.
- A provider error, missing usage, or usage beyond the request's bytes plus
  the format allowance halts the ledger before anything else is saved.
- The first request fixes the batch: model, cases, demo garden, prompt and
  schema, draft rules, and limits. A later change refuses further paid runs.
- C2 needs both C1 checks to have passed, and each case runs at most once.

Each request follows the public path (app/care_note_public.py) without the
online quota: the exact parameters are measured, sent once, checked for usage,
parsed, and turned into a draft on the fixed demo garden with all-gardens
refused. Only scripts/care_note_live.py calls this with a real client.
"""

import hashlib
import json
import time
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from pydantic import ValidationError

from .agent.live import BatchHalted, Ledger, LedgerRefused, digest, now, write_record
from .ai import (
    CARE_NOTE_MAX_OUTPUT_TOKENS,
    CareNoteProviderError,
    OpenAICareNoteExtractor,
    care_note_instructions,
    care_note_output_text,
    care_note_request_bytes,
    care_note_text_format,
    parse_care_note_response,
)
from .care_note_public import (
    APPROVED_MODEL,
    FORMAT_TOKEN_ALLOWANCE,
    MAX_REQUEST_BYTES,
    demo_care_note_garden,
    usage_problem,
)
from .demo_garden import load_demo_garden_data
from .schemas import CARE_NOTE_MAX_LENGTH, CareEventInput, CareNoteDraftRequest
from .service import draft_from_extraction


EVALUATION_DIR = Path(__file__).resolve().parents[1] / "evaluation" / "care_note"
TOTAL_UNIT_LIMIT = 22
STAGE_LIMITS = {"compatibility": 2, "evaluation": 20}
COMPATIBILITY_CHECKS = ("strict-schema", "near-maximum")
GROUP_SIZES = {"ordinary": 8, "missing": 3, "not_completed": 5, "boundary": 4}

APP_DIR = Path(__file__).resolve().parent
# Every file whose code builds the request, turns the response into a draft, or
# scores it. Whole files, so helpers and word lists cannot change unnoticed; an
# unrelated edit in them also refuses the batch, which is acceptable for 22 requests.
SOURCE_FILES = tuple(
    APP_DIR / name
    for name in ("ai.py", "schemas.py", "service.py", "care_note_public.py", "care_note_live.py", "demo_garden.py", "demo_garden.json")
)
# Only the ledger and the run records may change between commits during a batch.
EXEMPT_CHANGES = ("ledger.json", "ledger.json.lock", "ledger.json.tmp", "runs/")
EVALUATION_REPO_PATH = "backend/evaluation/care_note/"


class CareNoteLedger(Ledger):
    """The agent's ledger with Garden Note's allowance and two stages."""

    default_unit_limit = TOTAL_UNIT_LIMIT
    total_unit_limit = TOTAL_UNIT_LIMIT
    approved_model = APPROVED_MODEL

    def compatibility_passed(self) -> bool:
        passed = {entry["label"] for entry in self.data["entries"] if entry["kind"] == "compatibility" and entry["status"] == "passed"}
        return passed == set(COMPATIBILITY_CHECKS)

    def reserve(self, kind: str, label: str) -> dict:
        self.check_ready()
        if kind not in STAGE_LIMITS:
            raise LedgerRefused(f"Unknown stage {kind}.")
        entries = [entry for entry in self.data["entries"] if entry["kind"] == kind]
        if any(entry["label"] == label for entry in entries):
            raise LedgerRefused(f"{kind} {label} already ran; a repeat needs a new, approved batch.")
        if len(entries) >= STAGE_LIMITS[kind]:
            raise LedgerRefused(f"All {STAGE_LIMITS[kind]} {kind} requests are used.")
        if kind == "evaluation" and not self.compatibility_passed():
            raise LedgerRefused("Both C1 compatibility checks must pass before the C2 evaluation.")
        return super().reserve(kind, label)


# --- Batch ---


def load_cases(path: Path = EVALUATION_DIR / "cases.json") -> dict:
    cases = json.loads(path.read_text(encoding="utf-8"))
    validate_cases(cases)
    return cases


def batch_fingerprint(cases_doc: dict, model_name: str) -> dict:
    """Everything a paid result depends on."""
    return {
        "model": model_name,
        "cases": digest(cases_doc),
        "demo_garden": digest(load_demo_garden_data()),
        "request_template": digest(
            {"instructions": care_note_instructions(), "text": care_note_text_format(), "max_output_tokens": CARE_NOTE_MAX_OUTPUT_TOKENS}
        ),
        "source": source_digest(SOURCE_FILES),
        "limits": {
            "max_request_bytes": MAX_REQUEST_BYTES,
            "format_token_allowance": FORMAT_TOKEN_ALLOWANCE,
            "max_output_tokens": CARE_NOTE_MAX_OUTPUT_TOKENS,
        },
    }


def source_digest(paths) -> str:
    hasher = hashlib.sha256()
    for path in paths:
        hasher.update(Path(path).name.encode("utf-8") + b"\0" + Path(path).read_bytes() + b"\0")
    return hasher.hexdigest()[:16]


def blocking_changes(porcelain: str) -> list[str]:
    """Uncommitted paths that would make a record's commit hash incomplete.

    Takes `git status --porcelain --untracked-files=all`; only the ledger and
    the run records are exempt, so the cases file must be committed.
    """
    blocking = []
    for line in porcelain.splitlines():
        path = line[3:].split(" -> ")[-1].strip('"')
        relative = path[len(EVALUATION_REPO_PATH):] if path.startswith(EVALUATION_REPO_PATH) else None
        if relative is not None and (relative in EXEMPT_CHANGES or relative.startswith("runs/")):
            continue
        blocking.append(line)
    return blocking


def validate_cases(cases_doc: dict) -> None:
    """Fail before any paid run if the frozen cases do not match ADR-0059's plan."""
    cases = cases_doc["cases"]
    ids = [case["id"] for case in cases]
    if len(set(ids)) != len(ids):
        raise ValueError("Case ids must be unique.")
    groups = {group: sum(case["group"] == group for case in cases) for group in GROUP_SIZES}
    if groups != GROUP_SIZES or len(cases) != sum(GROUP_SIZES.values()):
        raise ValueError(f"Cases must be split {GROUP_SIZES}; found {groups}.")
    garden = demo_care_note_garden()
    area_ids = {area.id for area in garden.areas}
    planting_ids = {planting.id for planting in garden.plantings}
    date.fromisoformat(cases_doc["today"])
    for case in cases:
        CareNoteDraftRequest.model_validate({"note": case["note"], "today": cases_doc["today"]})
        expect = case["expect"]
        if expect["kind"] == "completed" and not expect.get("fields"):
            raise ValueError(f"Case {case['id']} expects a draft but names no field.")
        fields = expect.get("fields", {})
        if "growingAreaId" in fields and fields["growingAreaId"] not in area_ids:
            raise ValueError(f"Case {case['id']} names an area outside the demo garden.")
        if "plantingRecordId" in fields and fields["plantingRecordId"] not in planting_ids:
            raise ValueError(f"Case {case['id']} names a plant group outside the demo garden.")
        if case.get("hardGate") and expect["kind"] not in {"negated", "planned", "multiple"}:
            raise ValueError(f"Case {case['id']} is hard-gated but expects {expect['kind']}.")
    if not any(len(case["note"]) == CARE_NOTE_MAX_LENGTH for case in cases):
        raise ValueError(f"One case must use the full {CARE_NOTE_MAX_LENGTH}-character note.")
    if sum(bool(case.get("knownLocalFailure")) for case in cases) != 3:
        raise ValueError("The three notes the local model misread (ADR-0058) must be in the cases.")


# A control character becomes a six-character escape in the request input and
# gains a seventh byte when the request itself is serialized: the most request
# bytes any code point adds (a scan of every code point confirms it in the tests).
# U+0001 is not stripped as whitespace, unlike some other control characters.
MAX_BYTES_CHARACTER = "\x01"


def near_maximum_note() -> str:
    """The note that makes the largest request the API accepts: 500 of the costliest code point."""
    return MAX_BYTES_CHARACTER * CARE_NOTE_MAX_LENGTH


def request_bytes_added(character: str) -> int:
    """Request bytes one character of the note adds, through the same two serializations."""
    inner = json.dumps(character, ensure_ascii=False)[1:-1]
    return len(json.dumps(inner, ensure_ascii=False, separators=(",", ":"))[1:-1].encode("utf-8"))


# --- Scoring ---


def field_matches(expected, actual) -> bool:
    if isinstance(expected, dict) and "anyOf" in expected:
        return any(field_matches(option, actual) for option in expected["anyOf"])
    if isinstance(expected, (int, float)) and not isinstance(expected, bool):
        return isinstance(actual, (int, float)) and float(actual) == float(expected)
    if isinstance(expected, str):
        return isinstance(actual, str) and actual.strip().casefold() == expected.strip().casefold()
    return actual == expected


def savable_draft_validation(draft: dict) -> str:
    """'valid' or 'invalid' for a draft with type, date, and target; 'not_savable' otherwise."""
    if not (draft.get("type") and draft.get("date") and draft.get("targetScope")):
        return "not_savable"
    event = {
        "id": "evaluation",
        "type": draft["type"],
        "date": str(draft["date"]),
        "note": draft["note"],
        "targetScope": draft["targetScope"],
        **{key: draft[key] for key in ("growingAreaId", "growingAreaName", "plantingRecordId", "plantingRecordName") if draft.get(key)},
        **{key: draft[key] for key in ("fertilizerProduct", "fertilizerAmount", "fertilizerUnit") if draft.get(key) is not None},
    }
    try:
        CareEventInput.model_validate(event)
    except ValidationError:
        return "invalid"
    return "valid"


# Fields whose wrong value is a fabrication under ADR-0059: a date, a
# fertilizer detail, or a target the note does not support.
FABRICATION_FIELDS = (
    "date", "targetScope", "growingAreaId", "plantingRecordId", "fertilizerProduct", "fertilizerAmount", "fertilizerUnit",
)


def score_case(case: dict, draft: dict | None) -> dict:
    """Compare one draft with the case's frozen expectation. No draft never passes.

    A missing value is a mismatch the gardener fills in; a filled value that
    contradicts the note is fabricated, like a value the note never gave.
    """
    expect = case["expect"]
    if draft is None:
        return {
            "passed": False, "kind_ok": False, "mismatches": [], "invented": [], "wrong_values": [],
            "hard_gate_failure": False, "validation": "no_draft",
        }
    kind_ok = draft.get("kind") == expect["kind"]
    fields = expect.get("fields", {})
    mismatches = [key for key, value in fields.items() if not field_matches(value, draft.get(key))]
    invented = [key for key in expect.get("mustBeNull", []) if draft.get(key) is not None]
    wrong_values = [key for key in mismatches if key in FABRICATION_FIELDS and draft.get(key) is not None]
    if expect["kind"] == "completed" and not kind_ok:
        mismatches = list(fields)
    return {
        "passed": kind_ok and not mismatches and not invented,
        "kind_ok": kind_ok,
        "mismatches": mismatches,
        "invented": invented,
        "wrong_values": wrong_values,
        "hard_gate_failure": bool(case.get("hardGate")) and draft.get("kind") == "completed",
        "validation": savable_draft_validation(draft),
    }


def summarize(case_records: list[dict]) -> dict:
    """The ADR-0059 gates over every evaluation record."""
    scores = [record["score"] for record in case_records]
    ordinary = [record for record in case_records if record["case"]["group"] == "ordinary"]
    summary = {
        "cases": len(case_records),
        "passed": sum(score["passed"] for score in scores),
        "ordinary_passed": sum(record["score"]["passed"] for record in ordinary),
        "hard_gate_failures": [record["case"]["id"] for record in case_records if record["score"]["hard_gate_failure"]],
        "invented": [record["case"]["id"] for record in case_records if record["score"]["invented"]],
        "wrong_values": [record["case"]["id"] for record in case_records if record["score"].get("wrong_values")],
        "invalid_savable_drafts": [record["case"]["id"] for record in case_records if record["score"]["validation"] == "invalid"],
        "usage_unknown": [record["case"]["id"] for record in case_records if record.get("input_tokens") is None],
    }
    summary["gates_met"] = (
        summary["cases"] == STAGE_LIMITS["evaluation"]
        and not summary["hard_gate_failures"]
        and not summary["invented"]
        and not summary["wrong_values"]
        and not summary["invalid_savable_drafts"]
        and not summary["usage_unknown"]
        and summary["passed"] >= 18
        and summary["ordinary_passed"] >= 7
    )
    return summary


# --- Paid requests ---


@dataclass
class UnitOutcome:
    passed: bool
    record: dict


def run_unit(
    ledger: CareNoteLedger,
    extractor: OpenAICareNoteExtractor,
    *,
    kind: str,
    label: str,
    note: str,
    today: date,
    runs_dir: Path,
    code_version: str,
    case: dict | None = None,
) -> UnitOutcome:
    """One paid request, recorded in full. Halts the ledger on any usage doubt."""
    garden = demo_care_note_garden()
    params = extractor.request_params(note, garden.model_context(), today)
    request_bytes = care_note_request_bytes(params)
    if request_bytes > MAX_REQUEST_BYTES:
        raise LedgerRefused(f"{label}: {request_bytes} bytes exceeds the {MAX_REQUEST_BYTES}-byte limit; nothing was sent.")
    entry = ledger.reserve(kind, label)
    record: dict = {
        "kind": kind,
        "label": label,
        "unit": entry["unit"],
        "model": params["model"],
        "code_version": code_version,
        "recorded_at": now(),
        "today": today.isoformat(),
        "bytes": request_bytes,
        "params": params,
        "case": case,
    }
    started = time.monotonic()
    halted = None
    response = None
    try:
        response = extractor.send(params)
    except CareNoteProviderError as error:
        # Usage is unknown, so the request may still have been billed.
        halted = f"{label} failed at the provider without usage: {error}"
    record["duration_ms"] = round((time.monotonic() - started) * 1000)

    if response is not None:
        usage = getattr(response, "usage", None)
        record.update(
            status=getattr(response, "status", None),
            input_tokens=getattr(usage, "input_tokens", None),
            output_tokens=getattr(usage, "output_tokens", None),
        )
        problem = usage_problem(response, request_bytes)
        if problem is not None:
            halted = f"{label}: {problem} (input {record['input_tokens']}, output {record['output_tokens']}, {request_bytes} bytes)"
    else:
        record.update(status=None, input_tokens=None, output_tokens=None)

    if halted:
        # Saved first: even if writing the record fails, no later paid request may run.
        ledger.halt(halted)
    record["halted"] = halted

    draft = None
    if response is not None and not halted:
        try:
            record["output_text"] = care_note_output_text(response)
            extraction = parse_care_note_response(response)
            draft = draft_from_extraction(garden, note, extraction, today, allow_all_gardens=False)
        except (ValueError, CareNoteProviderError) as error:
            record["output_error"] = str(error)
    record["draft"] = json.loads(json.dumps(draft, default=str)) if draft is not None else None

    if kind == "evaluation":
        record["score"] = score_case(case, record["draft"])
        passed = record["score"]["passed"]
    else:
        passed = draft is not None and not halted
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


def run_compatibility(ledger: CareNoteLedger, extractor, *, today: date, runs_dir: Path, code_version: str) -> list[UnitOutcome]:
    """C1: a plain note under strict schema, then the largest request the API accepts."""
    notes = {"strict-schema": "今天给 Sample raised bed 浇了水。", "near-maximum": near_maximum_note()}
    outcomes = []
    for label in COMPATIBILITY_CHECKS:
        outcomes.append(
            run_unit(ledger, extractor, kind="compatibility", label=label, note=notes[label], today=today, runs_dir=runs_dir, code_version=code_version)
        )
    return outcomes


def run_evaluation(ledger: CareNoteLedger, extractor, cases_doc: dict, *, runs_dir: Path, code_version: str) -> list[UnitOutcome]:
    """C2: each frozen case once."""
    today = date.fromisoformat(cases_doc["today"])
    return [
        run_unit(
            ledger, extractor, kind="evaluation", label=case["id"], note=case["note"], today=today,
            runs_dir=runs_dir, code_version=code_version, case=case,
        )
        for case in cases_doc["cases"]
    ]


def evaluation_records(runs_dir: Path) -> list[dict]:
    return [
        json.loads(path.read_text(encoding="utf-8"))
        for path in sorted(runs_dir.glob("*-evaluation-*.json"))
    ]


def request_sizes(cases_doc: dict) -> dict[str, int]:
    """Bytes of every planned request, measured offline with the approved model's parameters."""
    extractor = OpenAICareNoteExtractor("offline", APPROVED_MODEL, client=object())
    garden = demo_care_note_garden()
    today = date.fromisoformat(cases_doc["today"])
    notes = {
        "compatibility/strict-schema": "今天给 Sample raised bed 浇了水。",
        "compatibility/near-maximum": near_maximum_note(),
        **{f"evaluation/{case['id']}": case["note"] for case in cases_doc["cases"]},
    }
    return {label: care_note_request_bytes(extractor.request_params(note, garden.model_context(), today)) for label, note in notes.items()}
