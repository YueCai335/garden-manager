"""Run AI Garden Note's paid checks against the real OpenAI API (ADR-0059).

Each batch has its own directory, backend/evaluation/care_note/batch-N/, with
its cases, ledger, and run records; all batches together stay within 42 local
requests. Batch 1 ran C1 (2 requests) and C2 (20). Batch 2 evaluates 20 new
cases and reuses batch 1's C1 after checking that today's requests are
byte-for-byte the ones C1 sent; before its first request, the batch-1 replay
at the current code must meet every gate.

Paid commands need --confirm-spend, hold the batch's ledger lock for their
whole run, and refuse to run while anything except a batch's ledger and run
records is uncommitted. Failed and interrupted requests count, nothing
retries, and a usage problem halts the ledger. The API key is read from
OPENAI_API_KEY or backend/.env and is never printed.

    python scripts/care_note_live.py validate [--batch batch-N]   # no API call
    python scripts/care_note_live.py status [--batch batch-N]     # no API call
    python scripts/care_note_live.py report [--batch batch-N]     # no API call
    python scripts/care_note_live.py replay [--batch batch-N]     # no API call: current rules on saved responses
    python scripts/care_note_live.py evaluate --confirm-spend [--batch batch-N]
    python scripts/care_note_live.py compatibility --confirm-spend --batch batch-1
    python scripts/care_note_live.py resolve-interrupted --unit N --note "what the usage page showed" [--batch batch-N]

The batch defaults to the current one (batch-2); replay defaults to batch-1.
"""

import argparse
import json
import os
import subprocess
import sys
from datetime import date
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.agent.live import BatchHalted, LedgerRefused, load_api_key  # noqa: E402
from app.ai import OpenAICareNoteExtractor  # noqa: E402
from app.care_note_live import (  # noqa: E402
    APPROVED_MODEL,
    BATCHES,
    CURRENT_BATCH,
    EVALUATION_DIR,
    TOTAL_UNIT_LIMIT,
    CareNoteLedger,
    batch_dir,
    batch_fingerprint,
    blocking_changes,
    evaluation_records,
    load_cases,
    regression_check,
    replay_evaluation,
    request_sizes,
    run_compatibility,
    run_evaluation,
    summarize,
)

# Tests redirect these so they never touch the real ledgers or the real key file.
# Cases always come from the repository; ledgers and records from EVALUATION_PATH.
EVALUATION_PATH = Path(os.getenv("CARE_NOTE_EVALUATION_DIR", str(EVALUATION_DIR)))
ENV_FILE = Path(os.getenv("CARE_NOTE_LIVE_ENV_FILE", str(BACKEND_DIR / ".env")))


def ledger_path(batch: str) -> Path:
    return batch_dir(EVALUATION_PATH, batch) / "ledger.json"


def runs_dir(batch: str) -> Path:
    return batch_dir(EVALUATION_PATH, batch) / "runs"


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=BACKEND_DIR.parent, capture_output=True, text=True, check=True).stdout


def code_version() -> str:
    """The commit that runs, refusing uncommitted changes other than ledgers and run records."""
    commit = git("rev-parse", "HEAD").strip()
    if os.getenv("CARE_NOTE_LIVE_ALLOW_DIRTY") == "tests-only":
        return f"{commit}+uncommitted"
    dirty = blocking_changes(git("status", "--porcelain", "--untracked-files=all"))
    if dirty:
        sys.exit("Commit or stash these changes before a paid run, so the record names the code that ran:\n" + "\n".join(dirty))
    return commit


def current_version() -> str:
    """The commit, marked when the working tree has other changes; a replay costs nothing, so it never refuses."""
    commit = git("rev-parse", "--short", "HEAD").strip()
    return commit + ("+uncommitted" if blocking_changes(git("status", "--porcelain", "--untracked-files=all")) else "")


def real_extractor() -> OpenAICareNoteExtractor:
    if os.getenv("CARE_NOTE_LIVE_OFFLINE"):
        sys.exit("Offline mode: the real model is disabled.")
    api_key = load_api_key(ENV_FILE)
    if not api_key:
        sys.exit("Set OPENAI_API_KEY in backend/.env first.")
    return OpenAICareNoteExtractor(api_key, APPROVED_MODEL)


def print_status(ledger: CareNoteLedger) -> None:
    stages = ", ".join(f"{stage} {limit}" for stage, limit in ledger.stages.items())
    print(
        f"{ledger.batch}: {ledger.used} requests used ({stages}); "
        f"all batches {ledger.archived_used + ledger.used}/{TOTAL_UNIT_LIMIT}"
    )
    if ledger.data.get("compatibility_reference"):
        reference = ledger.data["compatibility_reference"]
        print(f"  C1 reused from {reference['batch']} units {[unit['unit'] for unit in reference['units']]}")
    if ledger.data["halted"]:
        print(f"HALTED: {ledger.data['halted']['reason']}")
    for entry in ledger.data["entries"]:
        print(
            f"  {entry['unit']:>2} {entry['kind']:<13} {entry['label']:<34} {entry['status']:<11} "
            f"bytes={entry.get('bytes', '?')} in={entry.get('input_tokens', '?')} out={entry.get('output_tokens', '?')}"
        )


def print_validation(cases: dict, batch: str) -> None:
    stages = BATCHES[batch]["stages"]
    sizes = {label: size for label, size in request_sizes(cases).items() if label.split("/")[0] in stages}
    print(f"{batch}: {len(cases['cases'])} cases valid; today = {cases['today']}; stages {', '.join(stages)}")
    print(f"Request bytes: smallest {min(sizes.values())}, largest {max(sizes.values())} ({max(sizes, key=sizes.get)})")
    print("Batch fingerprint:", json.dumps(batch_fingerprint(cases, APPROVED_MODEL)))


def print_report(batch: str) -> None:
    records = evaluation_records(runs_dir(batch))
    for record in records:
        score = record["score"]
        print(
            f"  {record['case']['id']:<34} {'PASS' if score['passed'] else 'FAIL'} kind={(record['draft'] or {}).get('kind')} "
            f"mismatches={score['mismatches']} invented={score['invented']} wrong={score.get('wrong_values', [])} "
            f"validation={score['validation']}{' HARD-GATE' if score['hard_gate_failure'] else ''}"
        )
    print(json.dumps(summarize(records), indent=2))


def print_replay(replay: dict) -> None:
    print(replay["description"])
    for item in replay["cases"]:
        if item["id"] in replay["changed_cases"]:
            print(f"  {item['id']}: recorded {'PASS' if item['recorded_passed'] else 'FAIL'} -> replayed {'PASS' if item['replayed_passed'] else 'FAIL'}")
            for key, change in item["changed_fields"].items():
                print(f"      {key}: {change['recorded']!r} -> {change['replayed']!r}")
    for label in ("recorded_summary", "replayed_summary"):
        summary = replay[label]
        print(
            f"{label}: passed {summary['passed']}/20, ordinary {summary['ordinary_passed']}/8, hard-gate {summary['hard_gate_failures']}, "
            f"invented {summary['invented']}, wrong values {summary['wrong_values']}, invalid {summary['invalid_savable_drafts']}, "
            f"gates met {summary['gates_met']}"
        )


def write_replay(batch: str) -> None:
    replay = replay_evaluation(evaluation_records(runs_dir(batch)), code_version=current_version())
    path = batch_dir(EVALUATION_PATH, batch) / "replays" / f"replay-{replay['source']}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(replay, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print_replay(replay)
    print(f"Wrote {path.relative_to(EVALUATION_PATH)} at {replay['code_version']}.")


def run_paid(command: str, ledger: CareNoteLedger, cases: dict, version: str) -> None:
    ledger.check_ready()
    if command == "compatibility":
        extractor = real_extractor()
        outcomes = run_compatibility(
            ledger, extractor, today=date.fromisoformat(cases["today"]), runs_dir=runs_dir(ledger.batch), code_version=version
        )
    else:
        if BATCHES[ledger.batch].get("reuses_compatibility_from"):
            # Known cases first: no request is sent while they fall short of any gate.
            replay = regression_check(EVALUATION_PATH, code_version=version)
            summary = replay["replayed_summary"]
            print(f"Batch-1 regression replay: {summary['passed']}/20, gates met.")
            ledger.check_compatibility()
            print(f"C1 reused from {ledger.data['compatibility_reference']['batch']}: recorded requests rebuild identically.")
        extractor = real_extractor()
        outcomes = run_evaluation(ledger, extractor, cases, runs_dir=runs_dir(ledger.batch), code_version=version)
    for outcome in outcomes:
        record = outcome.record
        print(
            f"{record['kind']} {record['label']}: {'passed' if outcome.passed else 'failed'} "
            f"bytes={record['bytes']} in={record['input_tokens']} out={record['output_tokens']} {record['duration_ms']} ms"
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", choices=["validate", "status", "compatibility", "evaluate", "report", "replay", "resolve-interrupted"])
    parser.add_argument("--batch", choices=sorted(BATCHES), help=f"default {CURRENT_BATCH}; replay defaults to batch-1")
    parser.add_argument("--confirm-spend", action="store_true", help="required for commands that call OpenAI")
    parser.add_argument("--unit", type=int, help="resolve-interrupted: the request that did not finish")
    parser.add_argument("--note", default="", help="resolve-interrupted: what the usage check found")
    args = parser.parse_args()
    batch = args.batch or ("batch-1" if args.command == "replay" else CURRENT_BATCH)

    cases = load_cases(batch=batch)
    if args.command == "validate":
        print_validation(cases, batch)
        return
    if args.command == "status":
        print_status(CareNoteLedger.read(ledger_path(batch)))
        return
    if args.command == "report":
        print_report(batch)
        return
    if args.command == "replay":
        write_replay(batch)
        return
    if args.command in {"compatibility", "evaluate"} and not args.confirm_spend:
        sys.exit(f"{args.command} calls the paid API. Re-run with --confirm-spend.")
    if os.getenv("CARE_NOTE_OPENAI_MODEL", APPROVED_MODEL) != APPROVED_MODEL:
        sys.exit(f"This batch is approved for {APPROVED_MODEL} only; unset CARE_NOTE_OPENAI_MODEL.")

    version = code_version() if args.command in {"compatibility", "evaluate"} else ""
    try:
        with CareNoteLedger.locked(ledger_path(batch), batch_fingerprint(cases, APPROVED_MODEL)) as ledger:
            try:
                if args.command == "resolve-interrupted":
                    if args.unit is None:
                        raise LedgerRefused("resolve-interrupted needs --unit.")
                    ledger.resolve_interrupted(args.unit, args.note)
                else:
                    run_paid(args.command, ledger, cases, version)
            finally:
                print_status(ledger)
    except (LedgerRefused, BatchHalted) as error:
        sys.exit(str(error))


if __name__ == "__main__":
    main()
