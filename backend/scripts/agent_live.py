"""Run the allocation agent against the real OpenAI API (ADR-0056).

Every paid command needs --confirm-spend, holds the ledger lock for its whole
run, and draws from one shared batch of 12 units (backend/evaluation/
ledger.json): smoke 1, verify-cost 1, evaluate one unit per case. Failed and
interrupted units count, nothing retries, and a usage problem halts the batch.
The batch is fixed to the approved model, the cases, the demo garden, the
request template, and the limits at its first unit. The API key is read from
OPENAI_API_KEY or backend/.env and is never printed.

    python scripts/agent_live.py status
    python scripts/agent_live.py smoke --confirm-spend
    python scripts/agent_live.py verify-cost --confirm-spend
    python scripts/agent_live.py evaluate --confirm-spend [--case ID ...]
    python scripts/agent_live.py resolve-interrupted --unit N --note "what the usage page showed"
    python scripts/agent_live.py example --case ID      # no API call
"""

import argparse
import json
import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.agent.live import (  # noqa: E402
    APPROVED_MODEL,
    TOTAL_UNIT_LIMIT,
    EVALUATION_DIR,
    Ledger,
    LedgerRefused,
    batch_fingerprint,
    example_run_from_record,
    load_api_key,
    run_case,
    validate_cases,
    verify_cost,
)
from app.agent.openai_model import OpenAIAllocationModel  # noqa: E402

# Tests redirect these so they never touch the real ledger or the real key file.
EVALUATION_PATH = Path(os.getenv("AGENT_EVALUATION_DIR", str(EVALUATION_DIR)))
ENV_FILE = Path(os.getenv("AGENT_LIVE_ENV_FILE", str(BACKEND_DIR / ".env")))
CASES_PATH = EVALUATION_DIR / "allocation_cases.json"
RUNS_DIR = EVALUATION_PATH / "runs"
LEDGER_PATH = EVALUATION_PATH / "ledger.json"
EXAMPLE_PATH = BACKEND_DIR.parent / "src" / "data" / "exampleAllocationRun.json"


def load_cases() -> dict:
    cases = json.loads(CASES_PATH.read_text(encoding="utf-8"))
    validate_cases(cases["cases"])
    return cases


def real_model() -> OpenAIAllocationModel:
    if os.getenv("AGENT_LIVE_OFFLINE"):
        sys.exit("Offline mode: the real model is disabled.")
    api_key = load_api_key(ENV_FILE)
    if not api_key:
        sys.exit("Set OPENAI_API_KEY in backend/.env first.")
    return OpenAIAllocationModel(api_key, APPROVED_MODEL)


def print_status(ledger: Ledger) -> None:
    print(
        f"Paid units used: {ledger.used}/{ledger.data['unit_limit']} in this batch, "
        f"{ledger.archived_used + ledger.used}/{TOTAL_UNIT_LIMIT} across batches"
    )
    if ledger.data["halted"]:
        print(f"HALTED: {ledger.data['halted']['reason']}")
    for entry in ledger.data["entries"]:
        usage = entry.get("usage", {})
        print(
            f"  {entry['unit']:>2} {entry['kind']:<11} {entry['label']:<34} {entry['status']:<11} "
            f"requests={usage.get('requests', '?')} in={usage.get('input_tokens', '?')} out={usage.get('output_tokens', '?')}"
        )


def write_example(case_id: str) -> None:
    records = sorted(RUNS_DIR.glob(f"*-evaluate-{case_id}.json"))
    if not records:
        sys.exit(f"No evaluation record for case {case_id}.")
    example = example_run_from_record(json.loads(records[-1].read_text(encoding="utf-8")))
    EXAMPLE_PATH.write_text(json.dumps(example, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {EXAMPLE_PATH.relative_to(BACKEND_DIR.parent)} from {records[-1].name}.")


def run_paid(command: str, ledger: Ledger, cases: dict, case_ids: list[str]) -> None:
    ledger.check_ready()
    if command == "smoke":
        outcome = run_case(ledger, real_model(), cases["smoke"], kind="smoke", runs_dir=RUNS_DIR)
        print(f"smoke: {'passed' if outcome.passed else 'failed'} ({outcome.record['status']})")
    elif command == "verify-cost":
        outcome = verify_cost(ledger, real_model(), runs_dir=RUNS_DIR)
        for request in outcome.record["requests"]:
            print(
                f"  request {request['step']}: bytes={request['bytes']} input_tokens={request.get('input_tokens')} "
                f"allowance_ok={request.get('allowance_ok')}"
            )
        print(f"verify-cost: {'passed' if outcome.passed else 'failed'}")
    else:
        if not ledger.passed("verify-cost"):
            raise LedgerRefused("Run verify-cost successfully before the evaluation.")
        selected = [case for case in cases["cases"] if not case_ids or case["id"] in case_ids]
        if case_ids and len(selected) != len(case_ids):
            raise LedgerRefused("Unknown case id.")
        model = real_model()
        for case in selected:
            outcome = run_case(ledger, model, case, kind="evaluate", runs_dir=RUNS_DIR)
            print(
                f"{case['id']}: {'passed' if outcome.passed else 'failed'} status={outcome.record['status']} "
                f"agent_warnings={outcome.record['agent_warnings']} baseline_warnings="
                f"{(outcome.record['baseline'] or {}).get('warnings')}"
            )
            if ledger.data["halted"]:
                break


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "command", choices=["status", "smoke", "verify-cost", "evaluate", "resolve-interrupted", "example"]
    )
    parser.add_argument("--confirm-spend", action="store_true", help="required for commands that call OpenAI")
    parser.add_argument("--case", action="append", default=[], help="case id (evaluate: repeatable; example: one)")
    parser.add_argument("--unit", type=int, help="resolve-interrupted: the unit that did not finish")
    parser.add_argument("--note", default="", help="resolve-interrupted: what the usage check found")
    args = parser.parse_args()

    if args.command == "status":
        print_status(Ledger.read(LEDGER_PATH))
        return
    if args.command == "example":
        if len(args.case) != 1:
            sys.exit("example needs exactly one --case.")
        write_example(args.case[0])
        return
    if args.command in {"smoke", "verify-cost", "evaluate"} and not args.confirm_spend:
        sys.exit(f"{args.command} calls the paid API. Re-run with --confirm-spend.")
    if os.getenv("AGENT_OPENAI_MODEL", APPROVED_MODEL) != APPROVED_MODEL:
        sys.exit(f"This batch is approved for {APPROVED_MODEL} only; unset AGENT_OPENAI_MODEL.")

    cases = load_cases()
    try:
        with Ledger.locked(LEDGER_PATH, batch_fingerprint(cases, APPROVED_MODEL)) as ledger:
            try:
                if args.command == "resolve-interrupted":
                    if args.unit is None:
                        raise LedgerRefused("resolve-interrupted needs --unit.")
                    ledger.resolve_interrupted(args.unit, args.note)
                else:
                    run_paid(args.command, ledger, cases, args.case)
            finally:
                print_status(ledger)
    except LedgerRefused as error:
        sys.exit(str(error))


if __name__ == "__main__":
    main()
