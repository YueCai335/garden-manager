# Batch 7: English notes only, after the third server fixes (ADR-0085 N8)

Batch 6 missed its gates (see `../batch-6/README.md`). The demo's visitors
write in English (owner, 2026-11-20), so batch 7 scores English notes only.
Chinese and mixed notes stay in batches 4 to 6 as records; French is out of
scope for now, and the server's word rules do not read it.

- Cases: `cases.json`. Batch 6's 19 English cases, unchanged except that only
  the new cases are marked `"holdout": true`, and 21 English holdout cases
  written on 2026-11-20 after batch 6's results and before any batch-7
  request. Same date (2026-11-20) and the same three showcase gardens.
- Model: `gpt-4o-mini-2024-07-18`, the request the app sends, with
  `temperature: 0`.
- Allowance: 41 requests: one compatibility request, then each case once.
- Cost bound: $0.239 at every cap; expected about $0.015. Status: **not run**.

## Server fixes since batch 6

All three read the note's own words and are covered by
`backend/tests/test_care_note_batch_types.py`:

- A pruning detail drops a leading verb and a trailing "off", "back", "away"
  or "out"; a detail that is the target plant itself is left empty.
- A fragment labelled unrelated whose words are a job's own words adds no
  notice.
- "This morning", "this afternoon", "this evening" and "tonight" name today;
  "last night" names yesterday.

Replaying batch 6's saved answers under these rules (`replays/` in batch 6)
passes 42 of 48, and 18 of its 19 English cases; the English failure left is
one of twelve jobs left out. A replay cannot show what the model does with the
new holdout notes.

## Holdout cases

| Case | Group | What it checks |
| --- | --- | --- |
| `b7-en-two-beds-this-morning` | ordinary | All lowercase, two beds, and 'this morning' as the date. |
| `b7-en-bone-meal-grams` | ordinary | Fertilizing with an amount in grams and a verb other than 'fertilized'. |
| `b7-en-plant-basil` | ordinary | Planting into a bed other than the one where Basil already grows. |
| `b7-en-trim-kale` | ordinary | Pruning with the part cut and a trailing 'off'. |
| `b7-en-aphids-neem` | ordinary | Pest treatment where the problem comes first and the treatment later. |
| `b7-en-greenhouses-yesterday` | ordinary | Two greenhouses, 'yesterday evening'. |
| `b7-en-front-yard-and-lettuce` | ordinary | The second job's plant grows in a different garden from the one named first. |
| `b7-en-cut-back-sunflower` | ordinary | Pruning with no part named; Sunflower also grows in Backyard. |
| `b7-en-sunflower-which-garden` | missing | Sunflower grows in two gardens, so the gardener chooses. |
| `b7-en-basil-wednesday` | missing | A weekday the rules do not read stays empty; Basil names its garden. |
| `b7-en-unknown-bed` | missing | A bed that does not exist: the garden stays, the target is the gardener's. |
| `b7-en-squash-tomorrow` | planned | A plan for tomorrow with 'I'll' and 'feed'. |
| `b7-en-done-and-next-week` | planned | Done work and a plan for 'next week', which is not one day. |
| `b7-en-reminder-sunday` | planned | A reminder to oneself is a plan, not done work. |
| `b7-en-tomato-question` | not_completed | A plant question, no care work. |
| `b7-en-rain-no-water` | not_completed | Work not done because of the weather. |
| `b7-en-harvest-and-water` | not_completed | A harvest (not a care type) next to real watering. |
| `b7-en-marigold-blooming` | not_completed | An observation without any care work. |
| `b7-en-thirteen-jobs` | boundary | Thirteen jobs, one over the limit: the note must be split. |
| `b7-en-injection` | boundary | An instruction to the AI inside the note is not care work. |
| `b7-en-bullet-list` | boundary | A dated list over three gardens' worth of names, one line per job. |

## Gates

Scoring is batch 4's. The gates keep the allowance of batches 4 to 6, about
one failing case in nine and one failing ordinary case, fixed before the
first request:

- No hard-gate failure, no wrong value, no draft the app's save validation
  would reject, and usage known for every request.
- At least 36 of 40 cases pass, and at least 14 of the 15 ordinary cases.

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
