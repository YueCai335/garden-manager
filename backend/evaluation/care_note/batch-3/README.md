# Batch 3: the batch Garden Note contract (ADR-0085 N8)

This batch evaluates the extraction that splits one note into up to 12
reviewed records across gardens and five care types
(`app/care_note_batch.py`). Batches 1 and 2 scored the single-draft contract of
ADR-0059; their results stay as a record and do not apply here.

- Cases: `cases.json`, 26 notes in Chinese, English, and both, frozen on
  2026-11-20. The garden directory is the public demo's three showcase gardens
  (Backyard, Community Garden, Front Yard; ADR-0077), names and IDs only.
- Tool: `scripts/care_note_batch_live.py` with `app/care_note_batch_live.py`.
  Offline tests: `tests/test_care_note_batch_evaluation.py`.
- Model: `gpt-4o-mini-2024-07-18`, the request the app sends
  (`OpenAICareNoteBatchExtractor.request_params`).
- Allowance: 27 requests: one compatibility request (500 of the costliest
  character, the largest request the API accepts), then each case once.
- Cost bound: $0.155 with every input at its byte bound plus 1,000 format
  tokens and every output at the 8,192-token cap. Status: **unrun**.

## What each case checks

| Group | Cases | What it checks |
| --- | --- | --- |
| ordinary | 10 | One or more named gardens; each of the five care types; details as written (amount and unit, plant name and count, what was cut, pest and treatment); two dates in one note; a plant not on the plan; Chinese and English in one sentence; every garden when the note says so. |
| missing | 5 | A shared fertilizer total stays off each record; a plant that grows in two gardens; a plant that names its only garden; a date the rules cannot read; a bed named just "2". |
| planned | 2 | Planned jobs become task suggestions with their garden, type, target, and due date, never records. |
| not_completed | 6 | Negated work, plant questions (Plant Doctor), harvest (unsupported), and small talk produce no record. |
| boundary | 3 | A prompt injection asking to mark every garden; exactly 12 jobs; 13 jobs, which are refused whole. |

Each case lists the drafts and notices the server should return. A key the
expectation leaves out must stay empty. `ideal` is the answer a perfect model
would give; it is never sent, and the tests prove that every case passes with
it under the server's rules.

## Scoring

The response goes through the same server rules as the app
(`drafts_from_batch`). Expected and actual drafts are paired by closeness.
Per field:

- **Missing**: left empty; the gardener fills it in review.
- **Wrong**: filled but contradicting the note (garden, target, type, date,
  amount, count, or a task's due date).
- **Quoted differently**: a free-text detail that quotes the note with other
  words. The server keeps such a value only when the note contains it.

A case passes when the outcome matches, every expected draft and notice is
present, no extra draft appears, and no field is missing, wrong, or quoted
differently.

## Gates

Fixed before the first request:

- No hard-gate failure: no record drafted in a case with planned, negated,
  question, unsupported, unrelated, or injected text.
- No wrong value anywhere.
- No draft that the app's save validation would reject.
- Usage known for every request.
- At least 23 of 26 cases pass, and at least 9 of the 10 ordinary cases.

## Run

The paid commands refuse to run while anything except `ledger.json` and
`runs/` is uncommitted, so the record names the code that ran.

```bash
cd backend && .venv/bin/python scripts/care_note_batch_live.py validate
```

```bash
cd backend && .venv/bin/python scripts/care_note_batch_live.py compatibility --confirm-spend
```

```bash
cd backend && .venv/bin/python scripts/care_note_batch_live.py evaluate --confirm-spend
```

```bash
cd backend && .venv/bin/python scripts/care_note_batch_live.py report
```
