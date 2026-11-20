# Batch 4: the batch Garden Note contract (ADR-0085 N8)

This batch evaluates the extraction that splits one note into up to 12
reviewed records across gardens and five care types
(`app/care_note_batch.py`). Batches 1 and 2 scored the single-draft contract of
ADR-0059; their results stay as a record and do not apply here. Batch 3 used
the same cases and halted at its first request (see `../batch-3/README.md`).

- Cases: `cases.json`, 26 notes in Chinese, English, and both, frozen on
  2026-11-20 and copied unchanged from batch 3 except the batch name. The garden directory is the public demo's three showcase gardens
  (Backyard, Community Garden, Front Yard; ADR-0077), names and IDs only.
- Tool: `scripts/care_note_batch_live.py` with `app/care_note_batch_live.py`.
  Offline tests: `tests/test_care_note_batch_evaluation.py`.
- Model: `gpt-4o-mini-2024-07-18`, the request the app sends
  (`OpenAICareNoteBatchExtractor.request_params`).
- Allowance: 27 requests: one compatibility request (500 of the costliest
  character, the largest request the API accepts), then each case once.
- Cost bound: $0.155 with every input at its byte bound plus 1,000 format
  tokens and every output at the 8,192-token cap. Status: **ran on 2026-11-20;
  the gates were not met** (see Results).

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

## Results (2026-11-20, commit `f0cc1e8`)

All 27 requests ran once with known usage: 26,870 input and 11,492 output
tokens, about **$0.011** at the published prices. Batch 3's one failed request
reported no usage. The median request took 5.7 s and the slowest 30.7 s, so
the 90-second timeout was needed.

| Gate | Result |
| --- | --- |
| Cases passed (at least 23 of 26) | **11** |
| Ordinary cases passed (at least 9 of 10) | **4** |
| Hard-gate failures (none allowed) | **1**: `b3-zh-harvest-unsupported` |
| Wrong values (none allowed) | 0 |
| Drafts the app would reject (none allowed) | 0 |
| Usage unknown (none allowed) | 0 |

Expected drafts found: 16 of 37. Extra drafts: 5. Fields left empty that the
note supports: 10.

### What failed

1. **Rewritten quotes refuse the whole note (3 cases).** The model rewrote
   `sourceText` instead of quoting it, for example "今天给 Backyard 都浇了水"
   for "今天给 Backyard 和 Front Yard 都浇了水", or "I watered the Backyard"
   with an added "I". The server refuses the whole batch when any quote is
   not in the note. The twelve-job note also lost one job.
2. **Padding events break parsing (2 cases).** The model added 11 and 14
   empty `unrelated` events with an empty `sourceText`, which fails the
   one-character minimum.
3. **A long `sharedDateText` breaks parsing (2 cases).** The model copied the
   whole note into `sharedDateText`, past its 40-character limit.
4. **One event per garden (2 cases).** For "今天所有花园都浇了水" and for
   "Today I watered the Eggplant." the model returned one event per garden,
   so the server made three drafts with empty targets.
5. **Harvest recorded as planting (hard gate).** "在 Backyard 摘了 Pepper"
   became a completed planting record.
6. **Empty dates and targets the note supports (6 cases).** Quotes that drop
   "Today" or "今天" lose their date evidence; a garden name the note does not
   state empties the whole target (`b3-en-unique-plant-no-garden`); a garden
   repeated as `targetName` empties the garden target; one pruning detail
   repeated the plant name.

What worked: negated work, plant questions, small talk, the prompt injection,
and the 13-job refusal were all handled, no draft carried a value that
contradicts the note, and planned jobs produced their task suggestions when
the batch parsed.

The public demo does not use this flow while the gates are unmet. A later
batch needs new frozen cases as well as these, so changes are not tuned to
the cases that found the problems.

## Replay after the server fixes (no requests)

`scripts/care_note_batch_live.py replay --batch batch-4` scores the saved
answers again with the current server rules. Nothing is sent, the run records
stay unchanged, and the result is in `replays/`. A replay measures the server
rules only; it cannot measure the prompt changes, which need a new paid batch.

| | Recorded | Replayed |
| --- | --- | --- |
| Cases passed | 11 | 21 |
| Ordinary cases passed | 4 | 9 |
| Expected drafts found | 16 of 37 | 36 of 37 |
| Extra drafts | 5 | 0 |
| Hard-gate failures | 1 | 0 |
| Wrong values | 0 | 0 |
| Unusable answers | 7 | 0 |

The server rules that changed (`app/care_note_batch.py`):

1. Empty padding events are dropped, and a shared date hint longer than 40
   characters is ignored, before strict parsing.
2. A quote that is not in the note takes the one clause, or the one sentence,
   that names every garden and target the event names. A quote that matches
   none drafts nothing and adds one notice; the rest of the note still counts.
   A quote too narrow for its names widens to its sentence.
3. A garden or target name that the quote does not state is ignored, and a
   target name that is a garden's name is dropped; exact repeats collapse, so
   one event copied per garden becomes one.
4. A target name that is one bed or one plant in its named garden sets that
   target kind when the model labelled it "garden".
5. A completed planting needs a planting word; a harvest becomes an
   unsupported notice.
6. A fragment with no date words takes the note's one date, when every date
   word in the note (planned fragments aside) is one the rules read.

The five cases that still fail after the replay come from the answers themselves:
a missing amount, a malformed unit, a pruning detail that repeats the plant
name, a missing target scope, and one job left out of the twelve.
