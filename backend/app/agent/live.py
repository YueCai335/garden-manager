"""Paid runs against the real model: smoke test, cost check, evaluation (ADR-0056).

Every paid step draws from one shared ledger (backend/evaluation/ledger.json):

- A paid command holds an exclusive lock on the ledger from open to finish,
  so a second command is refused instead of sharing units.
- A unit is written down before its first request; a failed or interrupted
  step still counts, and nothing is retried automatically.
- An interrupted step (still "started") blocks paid runs until a person
  checks its usage and resolves it.
- A request over its token allowance, without reported usage, or failing at
  the provider halts the ledger; the halt is saved before anything else.
- The first reservation fixes the batch: approved model, cases, demo garden,
  request template, and limits. A later change refuses further paid runs.
- A changed request template needs a new batch: the old ledger is archived
  under evaluation/batch-N/, and every batch together stays within
  TOTAL_UNIT_LIMIT, so archiving never grants fresh units.

Only scripts/agent_live.py calls this with a real client; tests use fakes.
"""

import fcntl
import hashlib
import json
import os
from contextlib import contextmanager
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timezone
from importlib import resources
from pathlib import Path
from typing import Iterator

from .allocation import (
    CROPS,
    AllocationRequest,
    AreaSnapshot,
    GardenSnapshot,
    PlantingSnapshot,
    build_scope,
    check_assignments,
)
from .baseline import baseline_allocation
from .loop import (
    FINAL_OUTPUT_FORMAT,
    FORMAT_TOKEN_ALLOWANCE,
    INSTRUCTIONS,
    MAX_MODEL_REQUESTS,
    MAX_OUTPUT_TOKENS,
    MAX_REQUEST_BYTES,
    AllocationRunResult,
    ModelClient,
    ModelProviderError,
    ModelRequest,
    ModelTurn,
    ToolCall,
    run_allocation_agent,
    turn_outcome,
)
from .openai_model import DEFAULT_MODEL
from .service import camel_case_response, load_demo_garden
from .tools import tool_definitions


EVALUATION_DIR = Path(__file__).resolve().parents[2] / "evaluation"
BATCH_UNIT_LIMIT = 12  # smoke 1 + verify-cost 1 + evaluate 10; the example run reuses an evaluation
# All batches together, archived ones included. Batch 1 used one unit before a
# prompt fix; this batch has the remaining twelve.
TOTAL_UNIT_LIMIT = 13
# The only model this batch's cost verification covers.
APPROVED_MODEL = DEFAULT_MODEL


class LedgerRefused(RuntimeError):
    """The ledger is halted, used up, or a required earlier step has not passed."""


class BatchHalted(RuntimeError):
    """A request broke the cost assumption; paid steps must stop."""


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# --- Batch fingerprint ---


def digest(value) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()[:16]


def batch_fingerprint(cases_doc: dict, model_name: str) -> dict:
    """Everything a paid result depends on. Inline gardens live in the cases document."""
    demo = json.loads(resources.files("app.agent").joinpath("demo_garden.json").read_text(encoding="utf-8"))
    return {
        "model": model_name,
        "cases": digest(cases_doc),
        "demo_garden": digest(demo),
        "request_template": digest({"instructions": INSTRUCTIONS, "tools": tool_definitions(), "text": FINAL_OUTPUT_FORMAT}),
        "limits": {
            "max_model_requests": MAX_MODEL_REQUESTS,
            "max_request_bytes": MAX_REQUEST_BYTES,
            "max_output_tokens": MAX_OUTPUT_TOKENS,
            "format_token_allowance": FORMAT_TOKEN_ALLOWANCE,
        },
    }


# --- Ledger ---


def archived_units(evaluation_dir: Path) -> int:
    """Units used by archived batches (evaluation/batch-N/ledger.json)."""
    return sum(
        len(json.loads(path.read_text(encoding="utf-8"))["entries"])
        for path in sorted(evaluation_dir.glob("batch-*/ledger.json"))
    )


class Ledger:
    """The shared record of paid units. Writable only while locked()."""

    def __init__(self, path: Path, data: dict, fingerprint: dict | None = None):
        self.path = path
        self.data = data
        self.fingerprint = fingerprint
        self.archived_used = archived_units(path.parent)

    @staticmethod
    def _load(path: Path, unit_limit: int) -> dict:
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
        return {"unit_limit": unit_limit, "batch": None, "halted": None, "entries": []}

    @classmethod
    def read(cls, path: Path, unit_limit: int = BATCH_UNIT_LIMIT) -> "Ledger":
        """A read-only snapshot, for status."""
        return cls(path, cls._load(path, unit_limit))

    @classmethod
    @contextmanager
    def locked(cls, path: Path, fingerprint: dict, unit_limit: int = BATCH_UNIT_LIMIT) -> Iterator["Ledger"]:
        """Hold the ledger exclusively for one whole command; a second command is refused."""
        path.parent.mkdir(parents=True, exist_ok=True)
        lock_file = open(path.with_name(path.name + ".lock"), "w")
        try:
            fcntl.flock(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            lock_file.close()
            raise LedgerRefused("Another paid command is using the ledger. Wait for it to finish.") from None
        try:
            # Read only after the lock is held, so no other command's writes are missed.
            yield cls(path, cls._load(path, unit_limit), fingerprint)
        finally:
            fcntl.flock(lock_file, fcntl.LOCK_UN)
            lock_file.close()

    @property
    def used(self) -> int:
        return len(self.data["entries"])

    def save(self) -> None:
        if self.fingerprint is None:
            raise RuntimeError("The ledger is read-only outside Ledger.locked().")
        temporary = self.path.with_name(self.path.name + ".tmp")
        temporary.write_text(json.dumps(self.data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        os.replace(temporary, self.path)  # atomic: readers see the old or the new ledger, never half of one

    def passed(self, kind: str) -> bool:
        return any(entry["kind"] == kind and entry["status"] == "passed" for entry in self.data["entries"])

    def check_ready(self) -> None:
        """Refuse paid work while halted, after an interruption, or for a different batch."""
        if self.data["halted"]:
            raise LedgerRefused(f"Paid runs are halted: {self.data['halted']['reason']}")
        interrupted = [entry["unit"] for entry in self.data["entries"] if entry["status"] == "started"]
        if interrupted:
            raise LedgerRefused(
                f"Unit {interrupted[0]} did not finish, so its usage is unknown. Check the OpenAI usage page, "
                "then run resolve-interrupted for that unit."
            )
        batch = self.data.get("batch")
        if batch is not None and batch != self.fingerprint:
            changed = sorted(key for key in {*batch, *self.fingerprint} if batch.get(key) != self.fingerprint.get(key))
            raise LedgerRefused(f"This batch was fixed with different {', '.join(changed)}; paid runs are refused.")
        if self.fingerprint and self.fingerprint["model"] != APPROVED_MODEL:
            raise LedgerRefused(f"Only {APPROVED_MODEL} is approved for this batch.")

    def reserve(self, kind: str, label: str) -> dict:
        """Write the unit down before any paid request, so a crash still counts it."""
        self.check_ready()
        if self.used >= self.data["unit_limit"]:
            raise LedgerRefused(f"All {self.data['unit_limit']} paid units are used.")
        if self.archived_used + self.used >= TOTAL_UNIT_LIMIT:
            raise LedgerRefused(
                f"All {TOTAL_UNIT_LIMIT} paid units across batches are used "
                f"({self.archived_used} in archived batches)."
            )
        if self.data.get("batch") is None:
            self.data["batch"] = self.fingerprint
        entry = {"unit": self.used + 1, "kind": kind, "label": label, "status": "started", "started_at": now()}
        self.data["entries"].append(entry)
        self.save()
        return entry

    def finish(self, entry: dict, status: str, **details) -> None:
        entry.update(status=status, finished_at=now(), **details)
        self.save()

    def halt(self, reason: str) -> None:
        self.data["halted"] = {"reason": reason, "at": now()}
        self.save()

    def resolve_interrupted(self, unit: int, note: str) -> None:
        """A person checked an interrupted unit's usage. The unit stays counted."""
        entry = next((item for item in self.data["entries"] if item["unit"] == unit), None)
        if entry is None or entry["status"] != "started":
            raise LedgerRefused(f"Unit {unit} is not an interrupted unit.")
        if not note.strip():
            raise LedgerRefused("Describe what the usage check found.")
        entry.update(status="interrupted", resolved_at=now(), resolution=note.strip())
        self.save()


# --- Recording wrapper ---


class RecordingModel:
    """Wraps the real client: keeps every request and response, and checks usage
    against the byte count plus the formatting allowance after each request."""

    def __init__(self, inner: ModelClient):
        self.inner = inner
        self.name = inner.name
        self.requests: list[dict] = []
        self.halt_reason: str | None = None

    def respond(self, request: ModelRequest) -> ModelTurn:
        size = request.byte_size()
        entry = {"step": len(self.requests) + 1, "bytes": size, "params": request.to_params()}
        self.requests.append(entry)
        try:
            turn = self.inner.respond(request)
        except ModelProviderError as error:
            entry.update(outcome="provider_error", error=str(error), input_tokens=None, output_tokens=None)
            # Usage is unknown, so the request may still have been billed.
            self.halt_reason = f"Request {entry['step']} failed without usage: {error}"
            raise
        entry.update(
            outcome=turn_outcome(turn),
            input_tokens=turn.input_tokens,
            output_tokens=turn.output_tokens,
            tool_call=asdict(turn.tool_call) if turn.tool_call else None,
            text=turn.text,
        )
        if turn.input_tokens is None or turn.output_tokens is None:
            self.halt_reason = f"Request {entry['step']} reported no usage."
            raise BatchHalted(self.halt_reason)
        entry["allowance_ok"] = turn.input_tokens <= size + FORMAT_TOKEN_ALLOWANCE
        if not entry["allowance_ok"]:
            self.halt_reason = (
                f"Request {entry['step']} used {turn.input_tokens} input tokens; "
                f"the bound was {size} bytes + {FORMAT_TOKEN_ALLOWANCE}."
            )
            raise BatchHalted(self.halt_reason)
        return turn

    def usage(self) -> dict:
        """Token totals, or None when any request's usage is unknown (never counted as zero)."""
        unknown = sum(entry.get("input_tokens") is None or entry.get("output_tokens") is None for entry in self.requests)
        return {
            "requests": len(self.requests),
            "unknown_usage_requests": unknown,
            "input_tokens": None if unknown else sum(entry["input_tokens"] for entry in self.requests),
            "output_tokens": None if unknown else sum(entry["output_tokens"] for entry in self.requests),
        }


# --- Gardens and cases ---


def snapshot_from_spec(spec: str | dict) -> GardenSnapshot:
    if spec == "demo":
        return load_demo_garden()
    return GardenSnapshot(
        garden_id=spec["gardenId"],
        areas=tuple(AreaSnapshot(area["id"], area["name"], area["kind"]) for area in spec["growingAreas"]),
        plantings=tuple(
            PlantingSnapshot(
                id=planting["id"],
                common_name=planting["commonName"],
                crop_family=planting["cropFamily"],
                planting_date=date.fromisoformat(planting["plantingDate"]),
                growing_area_id=planting["growingAreaId"],
            )
            for planting in spec["plantings"]
        ),
    )


def case_request(case: dict) -> AllocationRequest:
    request = case["request"]
    return AllocationRequest(
        crops=request["crops"],
        preference=request.get("preference", ""),
        growing_area_ids=request.get("growingAreaIds"),
    )


def check_case(checks: list[dict], result: AllocationRunResult, baseline_warnings: int | None) -> list[dict]:
    """Each written-in-advance check, marked passed or failed. Nothing passes without a draft."""
    placed = {(item.crop, item.growing_area_id) for item in result.allocation}
    outcomes = []
    for check in checks:
        if result.status != "draft":
            passed = False
        elif check["type"] == "assigned":
            passed = (check["crop"], check["area"]) in placed
        elif check["type"] == "not_assigned":
            passed = (check["crop"], check["area"]) not in placed
        elif check["type"] == "max_warnings":
            passed = len(result.warnings) <= check["value"]
        elif check["type"] == "warnings_at_most_baseline":
            passed = baseline_warnings is not None and len(result.warnings) <= baseline_warnings
        else:
            raise ValueError(f"Unknown check type {check['type']}")
        outcomes.append({**check, "passed": passed})
    return outcomes


def validate_cases(cases: list[dict]) -> None:
    """Fail before any paid run if a case is malformed or has no checkable condition."""
    ids = [case["id"] for case in cases]
    if len(set(ids)) != len(ids):
        raise ValueError("Case ids must be unique.")
    for case in cases:
        if not case.get("checks"):
            raise ValueError(f"Case {case['id']} has no pass condition.")
        snapshot = snapshot_from_spec(case["garden"])
        scope, missing = build_scope(snapshot, case_request(case), date.fromisoformat(case["today"]))
        if scope is None:
            raise ValueError(f"Case {case['id']} would return needs_input: {missing}")
        area_ids = {area.id for area in scope.areas}
        for check in case["checks"]:
            if check["type"] in {"assigned", "not_assigned"}:
                if check["crop"] not in scope.crops or check["area"] not in area_ids:
                    raise ValueError(f"Case {case['id']} checks a crop or area outside its scope: {check}")


# --- Paid steps ---


@dataclass
class StepOutcome:
    passed: bool
    record: dict = field(default_factory=dict)


def write_record(directory: Path, name: str, record: dict) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{name}.json"
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)
    return path


def run_case(
    ledger: Ledger,
    model: ModelClient,
    case: dict,
    *,
    kind: str,
    runs_dir: Path,
) -> StepOutcome:
    """One paid unit: run the agent once on a case and keep everything it saw."""
    entry = ledger.reserve(kind, case["id"])
    snapshot = snapshot_from_spec(case["garden"])
    today = date.fromisoformat(case["today"])
    request = case_request(case)
    scope, _ = build_scope(snapshot, request, today)
    baseline = baseline_allocation(snapshot, scope) if scope else None
    recorder = RecordingModel(model)
    result: AllocationRunResult | None = None
    halted = None
    try:
        result = run_allocation_agent(snapshot, request, recorder, today=today)
    except BatchHalted as error:
        halted = str(error)
    halted = halted or recorder.halt_reason

    if halted:
        # Saved first: even if writing the report fails, no later paid step may run.
        ledger.halt(halted)
    checks = check_case(case["checks"], result, baseline.warnings if baseline else None) if result else []
    baseline_checks = (
        check_case(case["checks"], baseline_result(snapshot, scope, baseline), baseline.warnings) if baseline else []
    )
    record = {
        "kind": kind,
        "case": case,
        "model": model.name,
        "recorded_at": now(),
        "status": result.status if result else "halted",
        "failure_reason": result.failure_reason if result else None,
        "result": camel_case_response(result) if result else None,
        "agent_warnings": len(result.warnings) if result and result.status == "draft" else None,
        "baseline": (
            {
                "assignments": [item.model_dump() for item in baseline.assignments],
                "warnings": baseline.warnings,
                "checks": baseline_checks,
            }
            if baseline
            else None
        ),
        "checks": checks,
        "usage": recorder.usage(),
        "requests": recorder.requests,
        "halted": halted,
    }
    # If this write fails the unit stays "started", which blocks paid runs until resolved.
    path = write_record(runs_dir, f"{entry['unit']:02d}-{kind}-{case['id']}", record)
    passed = bool(result and result.status == "draft" and all(check["passed"] for check in checks))
    ledger.finish(entry, "passed" if passed else "failed", record=path.name, usage=record["usage"])
    return StepOutcome(passed, record)


def baseline_result(snapshot: GardenSnapshot, scope, baseline) -> AllocationRunResult:
    """The baseline shaped as a draft, so it faces the same preference checks as the agent."""
    checks = check_assignments(snapshot, scope, baseline.assignments)
    return AllocationRunResult(
        status="draft", allocation=baseline.assignments, warnings=[check for check in checks if check.warning]
    )


class ScriptedStressModel:
    """Plays the heaviest conversation so its five requests can be built by the real loop."""

    def __init__(self, name: str, turns: list[ModelTurn]):
        self.name = name
        self.turns = list(turns)
        self.requests: list[ModelRequest] = []

    def respond(self, request: ModelRequest) -> ModelTurn:
        self.requests.append(request)
        return self.turns.pop(0)


def stress_requests(model_name: str) -> list[ModelRequest]:
    """The five requests of a constructed worst case: every area grew every group
    in all three history years, names and preference at their longest, and
    three full checks that each return complete warning details."""
    kinds = (("stress-bed", "raised-bed"), ("stress-ground", "in-ground"), ("stress-pots", "container"))
    families = ("nightshade", "brassica", "cucurbit", "legume", "allium", "root", "leafy", "other")
    snapshot = GardenSnapshot(
        "stress-garden",
        tuple(AreaSnapshot(area_id, "名" * 200, kind) for area_id, kind in kinds),
        tuple(
            PlantingSnapshot(f"{area_id}-{year}-{family}", family, family, date(year, 5, 1), area_id)
            for area_id, _ in kinds
            for year in (2024, 2025, 2026)
            for family in families
        ),
    )
    everything = json.dumps(
        {
            "assignments": [
                {"growing_area_id": "stress-bed", "crop": "tomato"},
                {"growing_area_id": "stress-ground", "crop": "bean"},
                {"growing_area_id": "stress-pots", "crop": "lettuce"},
                {"growing_area_id": "stress-pots", "crop": "cucumber"},
                {"growing_area_id": "stress-ground", "crop": "carrot"},
            ]
        }
    )
    turns = [ModelTurn(tool_call=ToolCall("call_" + "h" * 24, "get_planting_history", "{}"))]
    turns += [ModelTurn(tool_call=ToolCall(f"call_{n}" + "c" * 24, "check_allocation", everything)) for n in range(4)]
    builder = ScriptedStressModel(model_name, turns)
    run_allocation_agent(
        snapshot, AllocationRequest(crops=list(CROPS), preference="生" * 200), builder, today=date(2026, 9, 24)
    )
    if len(builder.requests) != 5 or any(request.byte_size() > MAX_REQUEST_BYTES for request in builder.requests):
        raise RuntimeError("The constructed stress conversation no longer yields five requests within the byte limit.")
    return builder.requests


def verify_cost(ledger: Ledger, model: ModelClient, *, runs_dir: Path) -> StepOutcome:
    """One paid unit: send the five constructed requests and compare real usage with the bound.
    This is a cost stress test on a constructed conversation, not an agent quality check."""
    entry = ledger.reserve("verify-cost", "constructed-five-request-conversation")
    recorder = RecordingModel(model)
    halted = None
    for request in stress_requests(model.name):
        try:
            recorder.respond(request)
        except (BatchHalted, ModelProviderError) as error:
            halted = recorder.halt_reason or str(error)
            break
    if halted:
        ledger.halt(halted)
    record = {
        "kind": "verify-cost",
        "note": "Constructed worst-case conversation; the model's answers are ignored. Checks input tokens <= bytes + allowance for each request.",
        "model": model.name,
        "recorded_at": now(),
        "allowance_tokens": FORMAT_TOKEN_ALLOWANCE,
        "requests": recorder.requests,
        "usage": recorder.usage(),
        "halted": halted,
    }
    path = write_record(runs_dir, f"{entry['unit']:02d}-verify-cost", record)
    passed = halted is None and len(recorder.requests) == 5
    ledger.finish(entry, "passed" if passed else "failed", record=path.name, usage=record["usage"])
    return StepOutcome(passed, record)


# --- Example run for the frontend replay ---


def example_run_from_record(record: dict) -> dict:
    """The frontend's example run, built from a saved draft on the demo garden. No API call."""
    if record.get("status") != "draft" or record["case"]["garden"] != "demo":
        raise ValueError("Only a successful run on the demo garden can become the example run.")
    last_input = record["requests"][-1]["params"]["input"]
    calls = {item["call_id"]: item for item in last_input if item.get("type") == "function_call"}
    tool_results = []
    for item in last_input:
        if item.get("type") != "function_call_output":
            continue
        call = calls[item["call_id"]]
        tool_results.append(
            {"tool": call["name"], "arguments": call["arguments"], "output": json.loads(item["output"])}
        )
    return {
        "recordedAt": record["recorded_at"],
        "model": record["model"],
        "gardenId": "demo-garden",
        "gardenName": "Demo Garden",
        "caseId": record["case"]["id"],
        "request": record["case"]["request"],
        "result": record["result"],
        "toolResults": tool_results,
    }


def load_api_key(env_file: Path) -> str | None:
    """OPENAI_API_KEY from the environment or a KEY=value file. The value is never printed."""
    if os.getenv("OPENAI_API_KEY"):
        return os.environ["OPENAI_API_KEY"]
    if not env_file.exists():
        return None
    for line in env_file.read_text(encoding="utf-8").splitlines():
        key, _, value = line.strip().partition("=")
        if key == "OPENAI_API_KEY" and value:
            return value.strip().strip('"').strip("'")
    return None
