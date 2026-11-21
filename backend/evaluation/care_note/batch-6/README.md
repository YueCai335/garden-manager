# Batch 6: after the second server fixes, with new holdout cases (ADR-0085 N8)

Batch 5 missed its gates (see `../batch-5/README.md`). Batch 6 measures the
second round of server rules and `temperature: 0` on fresh cases as well as
the old ones.

- Cases: `cases.json`. Batch 5's 38 cases, unchanged except that only the new
  cases are marked `"holdout": true`, and 10 holdout cases written on
  2026-11-20 after batch 5's results and before any batch-6 request. Same date
  (2026-11-20) and the same three showcase gardens.
- Model: `gpt-4o-mini-2024-07-18`, the request the app sends, now with
  `temperature: 0`.
- Allowance: 49 requests: one compatibility request, then each case once.
- Cost bound: $0.286 at every cap; expected about $0.02. Status: **ran on
  2026-11-20; the gates were not met** (see Results).

## Holdout cases

| Case | Group | What it checks |
| --- | --- | --- |
| `b6-en-two-plants-one-product` | ordinary | Two plants share a product and no amount; Eggplant also grows in Community Garden. |
| `b6-zh-prune-old-leaves` | ordinary | Pruning with what was cut ("老叶") before the verb. |
| `b6-mixed-plant-greenhouse` | ordinary | Planting 5 Spinach in a greenhouse, mixed languages. |
| `b6-en-pest-yesterday` | ordinary | Pest treatment yesterday, the problem named last. |
| `b6-zh-repeated-marigold` | missing | Marigold grows in two gardens, so the gardener chooses. |
| `b6-en-weekday` | missing | "on Monday" is a date the rules do not read. |
| `b6-zh-done-and-intended` | planned | Done work and "打算后天..." in one note. |
| `b6-en-forgot` | not_completed | "Forgot to water" is not done work. |
| `b6-zh-observation` | not_completed | Birds ate the lettuce: no care work. |
| `b6-zh-list-with-emoji` | boundary | A list with line breaks and an emoji; the date sits on its own line. |

## Gates

Scoring is batch 4's. The gates keep the same allowance as batches 4 and 5,
about one failing case in nine and one failing ordinary case, fixed before the
first request:

- No hard-gate failure, no wrong value, no draft the app's save validation
  would reject, and usage known for every request.
- At least 43 of 48 cases pass, and at least 18 of the 19 ordinary cases.

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

## Results (2026-11-20, commit `02ec2e2`)

All 49 requests ran once with known usage: 53,992 input and 16,277 output
tokens, about **$0.018**.

| Gate | Result |
| --- | --- |
| Cases passed (at least 43 of 48) | **40** |
| Ordinary cases passed (at least 18 of 19) | **14** |
| Holdout cases passed | 8 of 10 |
| Hard-gate failures (none allowed) | 0 |
| Wrong values (none allowed) | 0 |
| Drafts the app would reject (none allowed) | 0 |
| Usage unknown (none allowed) | 0 |

Expected drafts found: 59 of 60, with no extra draft and no unusable answer.
Every safety gate held. The eight failures:

| Case | What the answer did |
| --- | --- |
| `b3-en-prune-detail` | Pruning detail "the dead heads off" for "dead heads". |
| `b3-en-unique-plant-no-garden` | Pruning detail "pruned the Panicle hydrangea" where the note gives none. |
| `b5-zh-pest-bt` | Treatment "喷了苏云金杆菌" for "苏云金杆菌". |
| `b6-zh-prune-old-leaves` | Pruning detail "老叶剪掉了" for "老叶". |
| `b5-mixed-fertilize-spoons` | The amount "2" (tbsp) left out. |
| `b5-zh-prune-then-water` | The second clause's garden, named only in the first clause, left out. |
| `b3-en-twelve-jobs` | One of the twelve jobs (Greenhouse 1) left out. |
| `b6-zh-observation` | A note that birds ate the lettuce read as a question, not unrelated. |

Four of the eight are free-text details quoted wider than expected. Counting
those as passing when the quote contains the expected words, a reading
decided only after this run and therefore not a gate, gives 43 of 48 cases
but 17 of 19 ordinary cases, still below the ordinary gate.
