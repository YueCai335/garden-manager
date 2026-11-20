"""Run the batch Garden Note's paid evaluation against the real OpenAI API (ADR-0085 N8).

The batch lives in backend/evaluation/care_note/batch-5/: frozen cases, the
ledger, and one run record per request. It allows 39 requests: one
compatibility request at the largest size the API accepts, then each of the 38
cases once (batch 4's 26 and 12 holdout cases).

Paid commands need --confirm-spend, hold the ledger lock for their whole run,
and refuse to run while anything except the batch's ledger and run records is
uncommitted. Failed and interrupted requests count, nothing retries, and a
usage problem halts the ledger. The API key is read from OPENAI_API_KEY or
backend/.env and is never printed.

    python scripts/care_note_batch_live.py validate      # no API call: cases, sizes, cost bound
    python scripts/care_note_batch_live.py status        # no API call
    python scripts/care_note_batch_live.py report        # no API call
    python scripts/care_note_batch_live.py replay --batch batch-4   # no API call: current rules on saved answers
    python scripts/care_note_batch_live.py compatibility --confirm-spend
    python scripts/care_note_batch_live.py evaluate --confirm-spend
    python scripts/care_note_batch_live.py resolve-interrupted --unit N --note "what the usage page showed"
"""

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.agent.live import BatchHalted, LedgerRefused, load_api_key  # noqa: E402
from app.care_note_batch import OpenAICareNoteBatchExtractor  # noqa: E402
from app.care_note_batch_live import (  # noqa: E402
    APPROVED_MODEL,
    BATCH,
    EVALUATION_DIR,
    BatchNoteLedger,
    batch_fingerprint,
    cost_bound,
    evaluation_records,
    replay_evaluation,
    load_cases,
    request_sizes,
    run_compatibility,
    run_evaluation,
    spend,
    summarize,
)
from app.care_note_live import blocking_changes  # noqa: E402

# Tests redirect these so they never touch the real ledger or the real key file.
EVALUATION_PATH = Path(os.getenv("CARE_NOTE_EVALUATION_DIR", str(EVALUATION_DIR)))
ENV_FILE = Path(os.getenv("CARE_NOTE_LIVE_ENV_FILE", str(BACKEND_DIR / ".env")))
LEDGER = EVALUATION_PATH / BATCH / "ledger.json"
RUNS = EVALUATION_PATH / BATCH / "runs"


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=BACKEND_DIR.parent, capture_output=True, text=True, check=True).stdout


def code_version() -> str:
    """The commit that runs, refusing uncommitted changes other than the ledger and run records."""
    commit = git("rev-parse", "HEAD").strip()
    if os.getenv("CARE_NOTE_LIVE_ALLOW_DIRTY") == "tests-only":
        return f"{commit}+uncommitted"
    dirty = blocking_changes(git("status", "--porcelain", "--untracked-files=all"))
    if dirty:
        sys.exit("Commit these changes before a paid run, so the record names the code that ran:\n" + "\n".join(dirty))
    return commit


def real_extractor() -> OpenAICareNoteBatchExtractor:
    if os.getenv("CARE_NOTE_LIVE_OFFLINE"):
        sys.exit("Offline mode: the real model is disabled.")
    api_key = load_api_key(ENV_FILE)
    if not api_key:
        sys.exit("Set OPENAI_API_KEY in backend/.env first.")
    return OpenAICareNoteBatchExtractor(api_key, APPROVED_MODEL)


def print_status(ledger: BatchNoteLedger) -> None:
    print(f"{BATCH}: {ledger.used}/{ledger.data['unit_limit']} requests used")
    if ledger.data["halted"]:
        print(f"HALTED: {ledger.data['halted']['reason']}")
    for entry in ledger.data["entries"]:
        print(
            f"  {entry['unit']:>2} {entry['kind']:<13} {entry['label']:<34} {entry['status']:<9} "
            f"bytes={entry.get('bytes', '?')} in={entry.get('input_tokens', '?')} out={entry.get('output_tokens', '?')} {entry.get('duration_ms', '?')} ms"
        )
    print("Spend:", json.dumps(spend(ledger.data)))


def print_validation(cases: dict) -> None:
    sizes = request_sizes(cases)
    print(f"{BATCH}: {len(cases['cases'])} cases valid; today = {cases['today']}; model {APPROVED_MODEL}")
    print(f"Request bytes: smallest {min(sizes.values())}, largest {max(sizes.values())} ({max(sizes, key=sizes.get)})")
    print("Cost bound:", json.dumps(cost_bound(cases)))
    print("Batch fingerprint:", json.dumps(batch_fingerprint(cases, APPROVED_MODEL)))


def print_report() -> None:
    for record in evaluation_records(RUNS):
        score = record["score"]
        print(
            f"  {record['case']['id']:<34} {'PASS' if score['passed'] else 'FAIL'} {score['outcome']:<8} "
            f"drafts {score['actual_drafts']}/{score['expected_drafts']} missing={score['missing_drafts']} extra={score['extra_drafts']} "
            f"empty={score['missing_fields']} wrong={score['wrong_values']} quoted={score['quoted_differently']} "
            f"notices-missing={score['missing_notices']} task-empty={score['task_missing_fields']}"
            f"{' HARD-GATE' if score['hard_gate_failure'] else ''}"
        )
    print(json.dumps(summarize(evaluation_records(RUNS)), indent=2))


def current_version() -> str:
    """The commit, marked when the working tree has other changes; a replay costs nothing, so it never refuses."""
    commit = git("rev-parse", "--short", "HEAD").strip()
    return commit + ("+uncommitted" if blocking_changes(git("status", "--porcelain", "--untracked-files=all")) else "")


def write_replay(batch: str) -> None:
    replay = replay_evaluation(batch, code_version=current_version(), evaluation_dir=EVALUATION_PATH)
    path = EVALUATION_PATH / batch / "replays" / f"replay-{replay['source']}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(replay, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for item in replay["cases"]:
        mark = "PASS" if item["replayed_passed"] else "FAIL"
        changed = "" if item["recorded_passed"] == item["replayed_passed"] else f" (recorded {'PASS' if item['recorded_passed'] else 'FAIL'})"
        score = item["replayed_score"]
        print(f"  {item['id']:<34} {mark}{changed} {score['outcome']} drafts {score['actual_drafts']}/{score['expected_drafts']} "
              f"extra={score['extra_drafts']} empty={score['missing_fields']} wrong={score['wrong_values']} quoted={score['quoted_differently']} "
              f"notices-missing={score['missing_notices']}{' HARD-GATE' if score['hard_gate_failure'] else ''}")
    print(json.dumps({"recorded": replay["recorded_summary"], "replayed": replay["replayed_summary"]}, indent=2))
    print(f"Wrote {path.relative_to(EVALUATION_PATH)} at {replay['code_version']}.")


def run_paid(command: str, ledger: BatchNoteLedger, cases: dict, version: str) -> None:
    ledger.check_ready()
    extractor = real_extractor()
    runner = run_compatibility if command == "compatibility" else run_evaluation
    for outcome in runner(ledger, extractor, cases, runs_dir=RUNS, code_version=version):
        record = outcome.record
        print(
            f"{record['kind']} {record['label']}: {'passed' if outcome.passed else 'failed'} "
            f"bytes={record['bytes']} in={record['input_tokens']} out={record['output_tokens']} {record['duration_ms']} ms"
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", choices=["validate", "status", "report", "replay", "compatibility", "evaluate", "resolve-interrupted"])
    parser.add_argument("--batch", default="batch-4", help="replay: the batch whose saved answers to score again")
    parser.add_argument("--confirm-spend", action="store_true", help="required for commands that call OpenAI")
    parser.add_argument("--unit", type=int, help="resolve-interrupted: the request that did not finish")
    parser.add_argument("--note", default="", help="resolve-interrupted: what the usage check found")
    args = parser.parse_args()

    cases = load_cases()
    if args.command == "validate":
        print_validation(cases)
        return
    if args.command == "status":
        print_status(BatchNoteLedger.read(LEDGER))
        return
    if args.command == "report":
        print_report()
        return
    if args.command == "replay":
        write_replay(args.batch)
        return
    if args.command in {"compatibility", "evaluate"} and not args.confirm_spend:
        sys.exit(f"{args.command} calls the paid API. Re-run with --confirm-spend.")
    if os.getenv("CARE_NOTE_OPENAI_MODEL", APPROVED_MODEL) != APPROVED_MODEL:
        sys.exit(f"This batch is approved for {APPROVED_MODEL} only; unset CARE_NOTE_OPENAI_MODEL.")

    version = code_version() if args.command in {"compatibility", "evaluate"} else ""
    try:
        with BatchNoteLedger.locked(LEDGER, batch_fingerprint(cases, APPROVED_MODEL)) as ledger:
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
