"""Run AI Garden Note's paid checks against the real OpenAI API (ADR-0059).

Paid commands need --confirm-spend, hold the ledger lock for their whole run,
and draw from one Garden Note ledger of 22 requests (backend/evaluation/
care_note/ledger.json): compatibility uses 2 (C1), evaluate uses 20 (C2) and
runs only after both C1 checks pass. Failed and interrupted requests count,
nothing retries, and a usage problem halts the ledger. Paid commands also
refuse to run from a working tree with uncommitted changes other than the
ledger and the run records (the cases file included), so every record names
the exact commit that produced it.
The API key is read from OPENAI_API_KEY or backend/.env and is never printed.

    python scripts/care_note_live.py validate          # no API call
    python scripts/care_note_live.py status            # no API call
    python scripts/care_note_live.py compatibility --confirm-spend
    python scripts/care_note_live.py evaluate --confirm-spend
    python scripts/care_note_live.py report            # no API call
    python scripts/care_note_live.py resolve-interrupted --unit N --note "what the usage page showed"
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
    EVALUATION_DIR,
    TOTAL_UNIT_LIMIT,
    CareNoteLedger,
    batch_fingerprint,
    blocking_changes,
    evaluation_records,
    load_cases,
    request_sizes,
    run_compatibility,
    run_evaluation,
    summarize,
)

# Tests redirect these so they never touch the real ledger or the real key file.
EVALUATION_PATH = Path(os.getenv("CARE_NOTE_EVALUATION_DIR", str(EVALUATION_DIR)))
ENV_FILE = Path(os.getenv("CARE_NOTE_LIVE_ENV_FILE", str(BACKEND_DIR / ".env")))
CASES_PATH = EVALUATION_DIR / "cases.json"
RUNS_DIR = EVALUATION_PATH / "runs"
LEDGER_PATH = EVALUATION_PATH / "ledger.json"


def code_version() -> str:
    """The commit that runs, refusing uncommitted changes outside the evaluation records."""
    repository = BACKEND_DIR.parent
    commit = subprocess.run(["git", "rev-parse", "HEAD"], cwd=repository, capture_output=True, text=True, check=True).stdout.strip()
    if os.getenv("CARE_NOTE_LIVE_ALLOW_DIRTY") == "tests-only":
        return f"{commit}+uncommitted"
    changes = subprocess.run(
        ["git", "status", "--porcelain", "--untracked-files=all"], cwd=repository, capture_output=True, text=True, check=True
    ).stdout
    dirty = blocking_changes(changes)
    if dirty:
        sys.exit("Commit or stash these changes before a paid run, so the record names the code that ran:\n" + "\n".join(dirty))
    return commit


def real_extractor() -> OpenAICareNoteExtractor:
    if os.getenv("CARE_NOTE_LIVE_OFFLINE"):
        sys.exit("Offline mode: the real model is disabled.")
    api_key = load_api_key(ENV_FILE)
    if not api_key:
        sys.exit("Set OPENAI_API_KEY in backend/.env first.")
    return OpenAICareNoteExtractor(api_key, APPROVED_MODEL)


def print_status(ledger: CareNoteLedger) -> None:
    print(f"Paid requests used: {ledger.used}/{TOTAL_UNIT_LIMIT} (C1 compatibility 2, C2 evaluation 20)")
    if ledger.data["halted"]:
        print(f"HALTED: {ledger.data['halted']['reason']}")
    for entry in ledger.data["entries"]:
        print(
            f"  {entry['unit']:>2} {entry['kind']:<13} {entry['label']:<30} {entry['status']:<11} "
            f"bytes={entry.get('bytes', '?')} in={entry.get('input_tokens', '?')} out={entry.get('output_tokens', '?')}"
        )


def print_validation(cases: dict) -> None:
    sizes = request_sizes(cases)
    print(f"{len(cases['cases'])} cases valid; today = {cases['today']}")
    print(f"Request bytes: smallest {min(sizes.values())}, largest {max(sizes.values())} ({max(sizes, key=sizes.get)})")
    print("Batch fingerprint:", json.dumps(batch_fingerprint(cases, APPROVED_MODEL)))


def print_report() -> None:
    records = evaluation_records(RUNS_DIR)
    for record in records:
        score = record["score"]
        print(
            f"  {record['case']['id']:<30} {'PASS' if score['passed'] else 'FAIL'} kind={(record['draft'] or {}).get('kind')} "
            f"mismatches={score['mismatches']} invented={score['invented']} validation={score['validation']}"
            f"{' HARD-GATE' if score['hard_gate_failure'] else ''}"
        )
    print(json.dumps(summarize(records), indent=2))


def run_paid(command: str, ledger: CareNoteLedger, cases: dict, version: str) -> None:
    ledger.check_ready()
    extractor = real_extractor()
    if command == "compatibility":
        outcomes = run_compatibility(ledger, extractor, today=date.fromisoformat(cases["today"]), runs_dir=RUNS_DIR, code_version=version)
    else:
        outcomes = run_evaluation(ledger, extractor, cases, runs_dir=RUNS_DIR, code_version=version)
    for outcome in outcomes:
        record = outcome.record
        print(
            f"{record['kind']} {record['label']}: {'passed' if outcome.passed else 'failed'} "
            f"bytes={record['bytes']} in={record['input_tokens']} out={record['output_tokens']} {record['duration_ms']} ms"
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", choices=["validate", "status", "compatibility", "evaluate", "report", "resolve-interrupted"])
    parser.add_argument("--confirm-spend", action="store_true", help="required for commands that call OpenAI")
    parser.add_argument("--unit", type=int, help="resolve-interrupted: the request that did not finish")
    parser.add_argument("--note", default="", help="resolve-interrupted: what the usage check found")
    args = parser.parse_args()

    cases = load_cases(CASES_PATH)
    if args.command == "validate":
        print_validation(cases)
        return
    if args.command == "status":
        print_status(CareNoteLedger.read(LEDGER_PATH))
        return
    if args.command == "report":
        print_report()
        return
    if args.command in {"compatibility", "evaluate"} and not args.confirm_spend:
        sys.exit(f"{args.command} calls the paid API. Re-run with --confirm-spend.")
    if os.getenv("CARE_NOTE_OPENAI_MODEL", APPROVED_MODEL) != APPROVED_MODEL:
        sys.exit(f"This batch is approved for {APPROVED_MODEL} only; unset CARE_NOTE_OPENAI_MODEL.")

    version = code_version() if args.command in {"compatibility", "evaluate"} else ""
    try:
        with CareNoteLedger.locked(LEDGER_PATH, batch_fingerprint(cases, APPROVED_MODEL)) as ledger:
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
