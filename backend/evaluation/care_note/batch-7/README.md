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
- Cost bound: $0.239 at every cap; expected about $0.015. Status: **ran on
  2026-11-20; the gates were not met** (see Results).

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

## Results (2026-11-20, commit `d8f2e8b`)

All 41 requests ran once with known usage: 45,336 input and 14,845 output
tokens, about **$0.016**.

| Gate | Result |
| --- | --- |
| Cases passed (at least 36 of 40) | 36 |
| Ordinary cases passed (at least 14 of 15) | **13** |
| Holdout cases passed | 18 of 21 |
| Hard-gate failures (none allowed) | 0 |
| Wrong values (none allowed) | **1** (`b7-en-plant-basil`) |
| Drafts the app would reject (none allowed) | 0 |
| Usage unknown (none allowed) | 0 |

Expected drafts found: 50 of 51, with no extra draft and no unusable answer.
The four failures:

| Case | What the answer did |
| --- | --- |
| `b7-en-plant-basil` | **Wrong value.** "Planted 3 Basil in Community Garden Raised bed 1" was labelled a plant group named Basil, so the server attached it to the existing Basil in Raised bed 2 instead of Raised bed 1. |
| `b7-en-aphids-neem` | The quote "sprayed them with neem oil today." kept its full stop. The server's widening compares against sentences without their stop, so it did not widen to the sentence that names the Cucumber and Community Garden: the garden, the plant and the problem were left for the gardener. |
| `b7-en-done-and-next-week` | The planned task's pruning detail was "next week", a date, not the part cut. |
| `b3-en-twelve-jobs` | One of the twelve jobs left out, as in batch 6. |

The first three are server rules, not model limits: a planting that names its
bed must target that bed, the widening must ignore the quote's own end
punctuation, and a detail made only of date words says nothing about the job.
