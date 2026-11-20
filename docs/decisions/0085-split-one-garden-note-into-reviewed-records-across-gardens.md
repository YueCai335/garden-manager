# ADR-0085: Split One Garden Note into Reviewed Records Across Gardens

- Status: Accepted on 2026-11-19. Implemented on 2026-11-20 (steps N1–N7 of
  the plan). The first paid evaluation ran on 2026-11-20 and missed its gates;
  the public demo keeps ADR-0060's flow until a later batch passes (N8).
- Date: 2026-11-19
- Supersedes in part:
  - [ADR-0068](0068-extract-bounded-workspace-care-note-batches.md): the limit
    of six completed drafts per note, the two care types, and the rule that a
    planned fragment produces only a notice.
  - [ADR-0069](0069-open-garden-notes-in-place-from-overview.md): the look of
    the note dialog and its review rows. The dialog itself, its focus rules, and
    the shared draft session stay.
  - [ADR-0080](0080-show-care-as-a-today-board-with-a-separate-history-log.md):
    Care's two care types and the rule that lime appears only on the progress
    bar.
  - [ADR-0081](0081-stage-the-gardens-on-a-textured-band-on-the-gardens-home.md):
    the note card's "Open note editor" link and its "Generate draft" label.
- Related:
  - [ADR-0058](0058-classify-care-notes-before-filling-a-draft.md): classify
    first, fill only what the note states, and keep unknown fields empty. This
    stays and now covers five care types.
  - [ADR-0023](0023-keep-care-history-as-completed-record.md): completing a
    task writes one history record. This stays.
  - [ADR-0060](0060-offer-assisted-care-note-drafting-in-the-portfolio-demo.md):
    the public demo's assisted drafting. It stays as it is until the last stage
    of this work (see "Public demo").
- Implementation plan: [docs/ai-note-redesign-plan.md](../ai-note-redesign-plan.md)
- Approved mockups: [design/ai-note-redesign/](../../design/ai-note-redesign/)

## Context

The owner wants a gardener to type or dictate a few sentences about a day's
work, across several gardens and jobs, and get one care record per job without
filling a form for each one. A job that was due should be ticked off in Care at
the same time.

A local run on 2026-11-19 with the current AI Garden Note showed the gaps. The
note "watered Backyard and Front Yard, fed the Community Garden tomatoes 50 ml,
planning to prune the peppers tomorrow" produced three drafts. Every draft
needed a target chosen again, the fertilizer draft lost both its date and its
amount, and pruning could not be recorded because the app knows only watering
and fertilizing. The home card and the header button looked like two different
features, and every draft was a full form.

The owner reviewed clickable mockups over several rounds on 2026-11-19 and
chose each part below. Cost is not the constraint for this work; the owner
asked for the feature to be done well, with the paid model run and the
deployment as the last stage.

## Decision

### Care types

The app has five care types: watering, fertilizing, planting (including
sowing), pruning, and pest treatment. Records and tasks use the same five.

Each type keeps optional details of its own:

| Type | Details |
| --- | --- |
| Watering | none |
| Fertilizing | product, amount, unit (unchanged) |
| Planting | plant name, count |
| Pruning | what was cut |
| Pest treatment | problem, treatment used |

A detail belongs only to its type, as fertilizer details do today. Planting
records the work and links to a plant group when one matches. It does not add
plants to the garden plan. When the plant is not on the plan, the review and
the saved screen show "Basil isn't on the Front Yard plan yet · Add on plan".

Care shows each type with its own icon and colour: drop (watering), sprout
(fertilizing), trowel (planting), scissors (pruning), bug (pest treatment). The
new colours are `#4a6a12`, `#44506a`, and `#8f3a1c`, at the same depth as the
two existing ones. The task form picks the type with five icon pills and shows
that type's detail fields. History filters by all five.

### One note, many records

A note can hold up to 12 completed jobs. The AI splits it into fragments and
classifies each one, as ADR-0058 and ADR-0068 describe. Two changes:

- A planned fragment also returns its type, target, and date when the note
  states them, so the review can offer "Add as a task" with those values.
- A fragment that reads as a plant question is shown with "Ask Plant Doctor".

The server still resolves names only against stored records and literal
evidence in the note. A date or a target the note does not state stays empty
for the gardener to fill. A note with more than 12 jobs is rejected whole with
a request to split it; nothing is truncated.

### Ticking off tasks

Deterministic code, not the AI, matches each reviewed record to open tasks by
care type, target, and date. It considers tasks due on the record's date or
overdue, never future tasks. A wider target covers a narrower task (watering a
whole garden completes a bed's watering task), never the reverse. An
all-gardens task completes only when the note's records cover every garden.

The review shows "Completes 'Water Backyard' · due today" on a matched record,
checked by default. The gardener can uncheck it. A matched record is the
task's completion record, so saving never writes a second history event.
Repeating tasks advance with the existing completion logic.

### The note dialog

The dialog keeps one layout through five screens:

1. Write: a short green textured strip with the heading "What did you do in
   the garden?", a large light frosted input card, a "Due today" row that lists
   open tasks, and a hint to use the keyboard's microphone. There is no
   in-app microphone button.
2. Reading: the note becomes read-only, a lime line sweeps under it, and lime
   branches flow down from the note to one light card per garden.
3. Review: the heading counts the records and gardens. Under the note, lime
   branches split from one point into the garden cards, as on the landing
   page's AI Note card. Below sits one white card per garden with one row per
   record, then a "Not recorded" box for planned and unrelated fragments.
   Hovering a record, a sentence, or a garden card highlights the others that
   belong to it, and the branch to that garden thickens.
4. Saved: the garden cards show a check and a count, and a card lists the
   tasks ticked off and the tasks added.
5. Problems: the model did not answer, nothing in the note is finished, the
   note has more than 12 jobs, and saving failed. Each keeps the note and
   offers the next step.

The dialog footer is a green textured band with a white primary button on
every screen. The green strip ends halfway down the garden cards, so the
dialog is green at both ends and light in the middle.

On a phone the dialog fills the screen, the footer stays at the bottom, and
the three garden cards sit in one row as small cards with type dots under a
smaller branch fan.

Lime is used in two places in the app: the Care progress bar and the note's
branch lines. The branch lines echo the landing page's AI Note card on purpose.

### Entry

The Gardens home card stays the quick way in. Its button reads "Split into
records" and opens the dialog at the Reading screen. Its "Open note editor"
link is removed; the header's "+ Note" opens the same draft from any page. The
card shows the draft's state: writing, "6 records waiting for review" with
"Continue review", or "Saved 6 records" with "Write another note".

### Public demo

The public demo keeps ADR-0060's assisted drafting until the last stage of the
implementation plan. That stage evaluates the new extraction with a paid model,
then decides with the owner whether the public demo moves to this flow.

## Rationale

- Splitting one note across gardens is the product's point, so the review shows
  the split itself rather than a list of forms.
- Grouping records by garden matches how gardeners think about the work and
  cuts repeated target choices.
- Deterministic task matching keeps the tick-off explainable and testable; the
  AI only reads the note.
- The owner chose the five types from a list of commonly logged garden jobs.
  Harvest was offered and left out.
- The hero-style split ties the app to the landing page, and the light frosted
  cards keep the dialog from becoming top-heavy, which the owner rejected in
  the darker versions.
- Keyboard dictation already works on phones and desktops and needs no audio
  handling, permission prompt, or transcription service.

## Alternatives considered

- Review directions: the original note beside numbered cards, and one record
  at a time. The owner chose the grouped list and kept the note highlighting
  from the first.
- Review depth: an all-white dialog, a dark header band, a dark summary card in
  the body, and thin brand stripes on the cards. The owner found all-white flat
  and the dark versions top-heavy.
- The hero glass split with a dark note card. The owner liked the split and
  found the dark note too heavy.
- Branch lines in brand green or white. The owner chose lime.
- A white footer. The owner chose the green footer for balance.
- A write screen that shows the garden cards from the start. It was busier and
  heavier than the input alone.
- On phones, a vertical lime trunk with stacked garden cards. It filled the
  first screen with green.
- An in-app microphone with the browser's speech recognition, or a paid
  transcription API.
- Planting that adds plants to the garden plan automatically. Placement on the
  plan is a separate, larger task.
- A harvest type.

## Consequences

- The data model gains three care types and their detail fields on records and
  tasks. The database gains nullable columns and a migration; the stored type
  is already a plain string. The browser workspace format gains a version.
- Care, History, the Gardens home, and every care label and icon change.
- The extraction contract changes, so the recorded evaluations of the old
  contract no longer apply. The paid evaluation runs again on new frozen cases
  before any public use.
- Saving a note can write records and complete tasks in one workspace save.
  The existing revision check and retry stay.
- The dialog has more motion: the sweep, the flowing branches, and the branch
  growth. All of it stops under `prefers-reduced-motion`.
- A note with many jobs needs a larger output budget and takes longer on the
  local model.

## Implementation notes

These choices were made during implementation (2026-11-20). The plan records
each one under its step.

- **Workspace format (N1).** The browser workspace stays at `version: 10`. The
  change only adds care types and optional fields, so every older workspace is
  already valid and needs no migration function. The database gains nullable
  columns in one Alembic migration (`20261119_10`).
- **Extraction contract (N3).** A plant question is a notice with
  `reason: "question"`. A planned job carries its prefilled values in the
  notice's `task` field. The batch limits are 12 drafts and 24 fragments. The
  local Ollama timeout is 90 seconds and the output budget is 8192 tokens. The
  offline cases are in `backend/tests/test_care_note_batch_types.py`; frozen
  cases for the paid evaluation wait for N8, because the evaluation harness
  must first move to the new format.
- **Named gardens (N5).** The local model sometimes marks a record for one
  named garden as "all gardens". The server keeps the garden that the note
  names, and a test covers it.
- **Task matching (N4).** `src/lib/noteTaskMatch.ts` matches at the moment of
  saving, against the latest workspace, so a target the gardener changes in
  review changes the match. One record can complete several tasks, such as a
  garden watering task and a bed watering task in that garden. An all-gardens
  task that every garden's records cover finishes without a history record of
  its own, because each garden's record is already history. Only records
  written by this save finish tasks, so saving the same batch again never
  advances a repeating task twice.
- **Dialog (N5).** The new screens replace the contents of
  `BatchGardenNote.tsx`; styles are in `NoteFlow.module.css`, the branches in
  `NoteFan.tsx`, and sentence splitting and garden grouping in
  `src/lib/noteFragments.ts`. Each record's editor is a native `<details>`, so
  a failed save opens a collapsed row and focuses the field with the problem.
  In the dialog, the heading and Close sit on the green strip and scroll with
  the content. The `/notes` page uses the same component.
- **Home card (N6).** Only the local card follows the draft's state; the public
  demo's single-note card and its button text stay until N8. While the note is
  being read the card shows **Continue**, and while saving it shows **View
  status**. Each state's button has its own React key, so closing the dialog
  returns focus to a button that still exists; the dialog reads its fallback
  focus target when it closes, not when it opens.
- **Final checks (N7).** `e2e/garden-note-flow.spec.ts` walks the whole flow
  from the home card to Care and History. The review was checked at 320, 390,
  768, and 1440 px and at 200% zoom, and by keyboard. The sticky footer had
  covered controls reached by Tab, so focusable elements now keep a scroll
  margin equal to the measured footer height. The saved home card's two
  actions now wrap at 320 px. White text on the green strip and footer
  measured at least 6.4:1 against the photo behind it.

## Paid evaluation and the public demo (N8)

- **Harness.** `app/care_note_batch_live.py` and
  `scripts/care_note_batch_live.py` evaluate the batch contract with the same
  ledger rules as ADR-0059: each request is recorded before it is sent, failures
  count, nothing retries, and a usage problem halts the batch. The request is
  the one the app sends; the cases use the three showcase gardens of the public
  demo. `OpenAICareNoteBatchExtractor` gained `request_params`, and its OpenAI
  timeout is 90 seconds, like the local model's.
- **Batch 3** halted at its first request: the OpenAI key had expired, and the
  tool did not yet record provider errors. It now records the error class,
  status, and code, never the message.
- **Batch 4** (`gpt-4o-mini-2024-07-18`, 26 cases, 27 requests, about $0.011)
  passed 11 of 26 cases and missed the gates. No draft carried a value that
  contradicts the note, and negated work, questions, the prompt injection, and
  the 13-job refusal held. One case recorded a harvest as planting. Most other
  failures came from the model rewriting quotes, padding with empty events, and
  over-long shared date text, each of which made the server refuse the whole
  note. The details are in `backend/evaluation/care_note/batch-4/README.md`.
- **Server fixes after batch 4.** The server now drops empty padding
  events and an over-long shared date hint, re-anchors a rewritten quote to
  the one clause or sentence of the note that names its gardens and targets,
  ignores names the quote does not state, collapses exact repeats, reads a
  named bed or plant labelled "garden" as that target, needs a planting word
  for a planting record, and gives an undated fragment the note's one date
  when every date word in the note is one it reads. Every check still reads
  the note's own words. A quote that matches nothing drafts nothing and adds a
  notice, and the rest of the note still counts. Replaying batch 4's saved
  answers with these rules passes 21 of 26 with no hard-gate failure and no
  wrong value; a replay cannot measure the prompt changes.
- **Batch 5** keeps batch 4's 26 cases and adds 12 holdout cases written
  before any batch-5 request, with the same gate shares (34 of 38, 14 of 15
  ordinary).
- **Batch 5** (39 requests, about $0.014) passed 19 of 38 and missed the
  gates, again with no wrong value. The tighter prompt made `gpt-4o-mini`
  less steady: it set the overflow flag on one-job notes and listed every bed
  of a garden-level note. The requests had no `temperature`, so the model
  sampled at its default of 1. A second round of server rules followed: the
  job limit counts settled jobs and the overflow flag only asks for a check, a
  scope without its name is decided by the quote, a harvest without a type is
  unsupported, a job whose words say it is planned or not done gets that
  notice, and a planned quote keeps its day. The OpenAI request now sets
  `temperature: 0`. Replaying batch 5's answers passes 33 of 38, one short of
  its gate, with no hard-gate failure and no wrong value. Details:
  `backend/evaluation/care_note/batch-5/README.md`.
- **Public demo.** The owner wants the public demo to offer this flow on the
  low-cost paid model, with request limits that keep the spend small. It moves
  only after a later batch, with new frozen cases added, meets the gates; the
  opening then follows `docs/portfolio-demo-deployment.md`, closed first and
  opened in small steps. Until then the public demo keeps ADR-0060's flow.

## Reconsideration

Revisit when gardeners regularly need more than 12 jobs in one note, when a
care type outside the five keeps appearing in notes, when planting records
without plan changes leave the plan out of date for most users, when keyboard
dictation proves unreliable for mixed Chinese and English, or when task
matching ticks off the wrong task in review.
