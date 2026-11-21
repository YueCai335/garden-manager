# Batch 8: English notes after the fourth server fixes (ADR-0085 N8)

Batch 7 missed its gates with one wrong value (see `../batch-7/README.md`).
Batch 8 measures the fourth round of server rules on fresh English notes as
well as batch 7's.

- Cases: `cases.json`. Batch 7's 40 English cases, unchanged except that only
  the new cases are marked `"holdout": true`, and 14 English holdout cases
  written on 2026-11-20 after batch 7's results and before any batch-8
  request. Same date (2026-11-20) and the same three showcase gardens.
- Model: `gpt-4o-mini-2024-07-18`, the request the app sends, with
  `temperature: 0`.
- Allowance: 55 requests: one compatibility request, then each case once.
- Cost bound: $0.321 at every cap; expected about $0.02. Status: **not run**.

## Server fixes since batch 7

All three read the note's own words and are covered by
`backend/tests/test_care_note_batch_types.py`:

- A planting whose quote names one bed targets that bed, never the same plant
  growing in another bed. Area names made only of digits ("1", "2") do not
  count, since they also read as plant counts.
- The quote widening looks for a quote in the note's sentences without the
  quote's own end punctuation.
- A detail made only of date words ("next week") is left empty.

Replaying batch 7's saved answers under these rules (`replays/` in batch 7)
passes 39 of 40 and all 15 ordinary cases, with no wrong value; the case left
is one of twelve jobs left out. Replays of batches 4 to 6 show no new wrong
value or hard-gate failure.

## Holdout cases

| Case | Group | What it checks |
| --- | --- | --- |
| `b8-en-sow-new-bed` | ordinary | Sowing a crop into a bed other than the one where it already grows. |
| `b8-en-water-two-plants` | ordinary | Two plant groups in one garden. |
| `b8-en-feed-pepper-tonight` | ordinary | 'Fed' with an amount in ml, 'tonight', and no garden named for a plant grown in one garden. |
| `b8-en-deadhead-marigold` | ordinary | Pruning in one verb, no part named; Marigold also grows in Backyard. |
| `b8-en-slug-traps` | ordinary | A pest treatment that is not a spray. |
| `b8-en-whole-garden-last-night` | ordinary | A whole garden, a noun for the job, and 'last night'. |
| `b8-en-container-two-gardens` | missing | Container 2 exists in two gardens, so the gardener chooses. |
| `b8-en-month-day` | missing | A written-out date the rules do not read stays empty. |
| `b8-en-plan-weekend` | planned | A planting plan for 'this weekend', which is not one day. |
| `b8-en-done-and-tonight` | planned | Done this morning, planned for tonight: the plan is due today. |
| `b8-en-could-not` | not_completed | Work that could not be done. |
| `b8-en-should-i-prune` | not_completed | A question that names a care type and a plant. |
| `b8-en-chatty-one-job` | boundary | One job at the end of a chatty note. |
| `b8-en-numbered-two-dates` | boundary | A numbered list with a different day on each line. |

## Gates

Scoring is batch 4's. The gates keep the allowance of batches 4 to 7, about
one failing case in nine and one failing ordinary case, fixed before the
first request:

- No hard-gate failure, no wrong value, no draft the app's save validation
  would reject, and usage known for every request.
- At least 48 of 54 cases pass, and at least 20 of the 21 ordinary cases.

## Run

```bash
cd backend && .venv/bin/python scripts/care_note_batch_live.py compatibility --confirm-spend
```

```bash
cd backend && .venv/bin/python scripts/care_note_batch_live.py evaluate --confirm-spend
```

```bash
cd backend && .venv/bin/python scripts/care_note_batch_live.py report
```
