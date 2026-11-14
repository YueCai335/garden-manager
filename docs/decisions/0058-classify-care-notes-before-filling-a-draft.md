# ADR-0058: Classify Care Notes Before Filling a Reviewable Draft

- Status: Accepted
- Date: 2026-10-04
- Amends: [ADR-0032](0032-use-local-first-ai-providers-for-care-notes.md)
  (provider configuration) and
  [ADR-0033](0033-use-deterministic-fallbacks-for-clear-ai-care-notes.md)
  (fallback scope)
- Related: [ADR-0031](0031-use-review-first-ai-care-note-extraction.md),
  [ADR-0034](0034-use-workspace-and-garden-care-targets.md),
  [ADR-0055](0055-use-automatic-sync-with-optimistic-locking.md)

## Context

AI Garden Note turns one Chinese or English note into a reviewable watering or
fertilizing draft. Offline checks on commit `5412df0`, with no paid requests,
found five defects:

- The output schema generated from `CareNoteExtraction` has no `required`
  list. OpenAI strict structured output rejects such a schema, so the OpenAI
  path fails before any extraction.
- The output has no way to say that a note is not a completed event. A
  planned, negated, multi-event, or unrelated note can only come back with
  every field empty, which looks the same as a completed note with missing
  details.
- The ADR-0033 fallback fills empty fields from keywords. For
  "今天没给番茄浇水" (did not water the tomatoes today), an offline check that
  calls the fallback with an empty extraction turns the note into a completed
  watering record for today.
- A draft without a target becomes a whole-garden draft with no review note,
  so "今天浇了水" (watered today) widens the record to the whole garden.
- "Today" means the server date. The deployed API runs in UTC, so a gardener
  west of UTC in the evening gets tomorrow's date.

Garden Note also shares `AI_PROVIDER` and `OPENAI_MODEL` with Plant Health,
and its OpenAI default `gpt-5.6-luna` has no verified listing or price. A
public Garden Note is under consideration in a separate deployment ADR; these
defects affect the local app today.

## Decision

Classify the note first, fill fields only for a completed event, and keep
every missing field visibly empty until the gardener fills it.

### Output contract

- Every output field is listed in `required`. Fields that a note may omit
  accept `null`. Every object sets `additionalProperties: false`.
- A new required field `kind` takes one of `completed`, `planned`,
  `negated`, `multiple`, or `unrelated`. A plant-health question counts as
  `unrelated`.
- A contract test checks the generated schema against these rules, so the
  schema cannot drift out of strict mode unnoticed.
- Both providers use the same contract. A response that fails validation, or
  has no `kind`, produces an error and no draft.

### Draft rules

- Only `kind == completed` produces an editable draft. The other kinds return
  the kind and a fixed server-written message. The note stays in the input and
  manual entry stays available.
- The keyword fallback runs only for `completed`, never sets `kind`, and skips
  notes that contain a negation or future marker from a small list that grows
  only from regression cases. English markers match whole words or phrases,
  so `will` does not match inside another word. The model classifies the note;
  the fallback fills plain gaps only.
- The marker check only stops keyword filling. When the model itself returns
  a filled `completed` draft for a negated note, skipping the fallback does
  not correct it; the paid evaluation and the gardener's review cover that
  case.
- A missing target stays unselected. A model-supplied name resolves only on a
  unique match; an ambiguous or unknown name also stays unselected, with a
  review note. The keyword fallback fills a target only when exactly one
  planting-area or plant-group name appears in the note, so overlapping names
  such as "Bed" and "North bed", or two named targets, leave the choice to the
  gardener regardless of name order.
- The server, not the prompt, enforces the wording behind a garden-wide
  target, on the path both providers share. A model's `garden` target stands
  only when the note uses whole-garden wording, and `all-gardens` only when it
  uses all-gardens wording; whole-garden wording does not support
  `all-gardens`. The check reuses the fallback's existing phrase lists. A
  target without that wording is cleared before the fallback and matching
  run, so a named area or plant group can still match, and the target stays
  unselected when nothing matches one item. Wording outside the lists means
  the gardener chooses the target.
- The local app keeps ADR-0034's `all-gardens` target for a note that
  explicitly says all gardens. Any public-demo restriction on that target
  belongs to the deployment ADR.
- The server, not the prompt, also enforces the evidence behind a date, in
  one step on the path both providers share (added 2026-10-06 after the C2
  evaluation, where the model gave today's date to a note with no date). The
  first version recognizes today, yesterday, and the day before yesterday in
  English and Chinese, and `YYYY-MM-DD`. A model date stays only when the
  note's recognized expressions name exactly that one date. Two different
  dates, a date that is not a real calendar date, or one later than today
  leave the date empty; such a date is never dropped first, so it cannot hide
  a conflict. A cleared date is never filled back in; an empty date is filled
  only from one unambiguous expression in a completed note without a
  negation or future marker. Other wording, such as a month and day without
  a year, leaves the date for the gardener.
- `completed` is necessary, not sufficient, for saving. The gardener saves
  only after the type, date, and target are all set and pass the existing
  Care History validation.
- The request carries the gardener's local date. The server accepts it only
  within one day of the server's UTC date, which covers UTC−12 to UTC+14, and
  uses it for "today" and "今天". This check rejects implausible dates; it
  cannot prove the browser clock is right.
- Notes are limited to 500 Unicode code points, checked the same way in the
  browser and the API.

### Provider configuration

- `CARE_NOTE_AI_PROVIDER` selects the Garden Note provider and defaults to
  `ollama`. `AI_PROVIDER` and `OPENAI_MODEL` keep controlling Plant Health.
- `CARE_NOTE_OPENAI_MODEL` defaults to `gpt-4o-mini-2024-07-18`. The
  allocation agent already uses this snapshot and measured its cost bound
  (ADR-0056), and OpenAI lists structured-output support for it. The agent
  sends non-strict schemas, so strict-mode compatibility for this schema is
  still unverified; the first paid compatibility check confirms it.
- The OpenAI client disables automatic retries, sets a 30-second timeout, and
  caps output at 800 tokens. An incomplete response, a refusal, or an empty
  output is an error; a partial output never becomes a draft.

### Local acceptance finding

The first local run with `qwen3:4b` (2026-10-04, 12 fixed notes, one run
each) set `garden` for every completed note, including notes that named one
bed or plant and notes that named no target. Only the server check above
keeps those drafts from covering the whole garden. The same run classified 9
of 12 notes correctly: it called one Chinese planned note and both mixed
multi-event notes completed, and gave the planned note today's date. The
server does not correct these; they go to the fixed paid evaluation set, and
the gardener's review covers them.

## Why This Option

- A schema the provider accepts is a precondition for every other quality
  claim about the OpenAI path.
- An explicit `kind` lets the server tell "not a record" from "a record with
  missing details" and show the right message for each.
- Gating the fallback on `kind` keeps ADR-0033's benefit for the compact local
  model, which still returns empty fields for plain notes, without letting
  keywords overrule a negation.
- An unselected target keeps a record from silently covering more of the
  garden than the gardener meant.
- A pinned model with a published price makes the later cost bound possible.

## Alternatives Considered

### Add negation keywords to the fallback only

This fixes the one known sentence but keeps no general signal for planned,
multi-event, or unrelated notes. The vocabulary would grow with every new
phrasing.

### Remove the fallback

ADR-0033 added it because the default local model leaves plain notes empty.
Removing it would make the local demo noticeably worse.

### Keep the whole-garden default and add a review note

The note would warn the gardener, but a careless save would still create a
wider record than the note supports.

### Classify in a separate model call

A second call adds one model request, with its latency and cost, for a field
that fits in the existing structured output.

## Consequences

- The draft response allows an unselected target. The response type, the
  frontend types, the form defaults, and the save check change together.
- More drafts require a manual target choice, which adds one step for notes
  that name no plant or area, or that describe the whole garden in words the
  phrase lists do not cover.
- The model can misclassify `kind`. Offline tests cover the control flow
  only; classification quality is measured in the paid evaluation planned
  under the deployment ADR.
- The compact local model may classify less reliably than the OpenAI model,
  which can send more local notes to manual entry.
- Plant Health keeps its current configuration and behavior.

## Revisit When

- The paid evaluation shows that `kind` misclassification blocks ordinary
  completed notes.
- Garden Note adds multi-event extraction or planned-task creation.
- The default local or OpenAI model changes.
