# ADR-0060: Offer Assisted Care-Note Drafting in the Portfolio Demo

- Status: Accepted (2026-10-06); deployment, C3, and the trial are recorded
  separately, each with the owner's approval
- Date: 2026-10-06
- Follows: [ADR-0059](0059-open-budgeted-public-care-note-generation.md)
  (Rejected; unchanged by this decision)
- Amends: [ADR-0040](0040-use-vercel-render-and-supabase-for-the-portfolio-demo.md)
  (AI Garden Note drafts in the hosted demo) and
  [ADR-0057](0057-keep-live-allocation-runs-closed-after-evaluation.md)
  (a backend OpenAI key may live in Render for AI Garden Note only)
- Related: [ADR-0058](0058-classify-care-notes-before-filling-a-draft.md)

## Context

ADR-0059 tried to open public AI Garden Note generation behind a completion
gate: at least 18 of 20 frozen cases, and 7 of 8 ordinary notes, had to come
back exactly as expected. Both paid evaluations missed it, and ADR-0059 is
`Rejected` with its scores as recorded:

- **Batch 1, real responses (2026-10-05):** 17/20. One completed note got a
  date the note never gave. ADR-0058's date rule was added afterwards; its
  effect is shown by an offline replay of those saved responses (18/20,
  nothing invented), not by a new measurement.
- **Batch 2, real responses (2026-10-06):** 17/20, ordinary 6/8, with no
  invented or wrong value; the date rule cleared the model's date in five
  completed notes.

Across the 30 completed drafts of both batches, the server's target handling
gave 24 correct prefills, 1 correctly empty target (the note named none), and
5 targets left empty because the model's answer could not be resolved: three
areas returned as plant groups, and two injected "every garden" requests that
the public path refused. No wrong prefill was observed. Batch 2's three
failures all left the target empty for the gardener. Batch 1 did produce a
savable false value: a date the note never gave. The date rule's effect on it
is shown by the offline replay, not by a new real measurement.

This is a product decision made after seeing those results. It changes what
the public feature promises, not how the earlier evaluations are scored.

## Decision

The public demo offers **AI-assisted drafting** of a care record, not
automatic record creation:

- The model drafts what the note states clearly: the care type, the date,
  fertilizer details, and the target when it resolves to exactly one item.
- Anything uncertain stays empty: an unresolved or ambiguous target, a date
  without evidence or with conflicting evidence, a fertilizer detail the note
  never gave. The gardener fills it in.
- The gardener reviews every field and confirms before anything is saved.
  Choosing or correcting the target is part of the normal flow, not a
  failure.

This is the behavior the public path already has (ADR-0058, ADR-0059); no
target-matching or extraction code changes.

### Opening conditions

The feature opens with the existing checks in place and its limits stated.
The completion rate is reported, but it is not a gate:

- The existing server checks stay: the date needs evidence in the note
  (ADR-0058), a garden-wide target needs garden-wide wording, a target name
  must match exactly one item, the public path refuses all-gardens, and the
  strict schema fixes the response's structure.
- When the model classifies a note as negated, planned, multi-event, or
  unrelated, no draft is made.
- A draft with a missing type, date, or target cannot be saved until the
  gardener completes it.
- Every record passes the gardener's review before it is saved.

These checks do not make every draft correct. Classification relies on the
model's `kind`, so a note the model wrongly calls completed still produces a
draft. Fertilizer names, amounts, and units are not checked against the note.
The strict schema guarantees the response's shape, not its content. Other
extraction errors can therefore reach the review screen, and the gardener has
to check every field; a review can still miss an error, and this decision
accepts that limit for a demo trial.
- ADR-0059's request and cost controls stay: the 58-request online cap, 30
  per UTC day, 5 per IP per minute, the byte and token limits, the automatic
  usage stop, and the manual switch-off.

The evidence for these conditions is the 40 real responses already recorded
(with the replay for the date rule) and the offline tests. No third paid
evaluation runs. Before visitors see the feature: the Render checks
(trusted client-IP source, manual switch-off) and C3, at most 3 real
requests from a Preview build, each authorized separately. A limited trial
(at most 55 requests) follows only after C3 passes and the owner approves.

### What this decision does not say

- ADR-0059 stays `Rejected`; its gates were not met and are not re-scored.
- The 40 real responses are not "zero fabrication": batch 1 invented one
  date, and the fix for it is shown by replay.
- No wrong prefill in 30 drafts supports keeping prefills; it does not show
  that prefills cannot be wrong on other notes. The gardener's review and the
  server's target checks remain the safeguard.

## Why This Option

The demo's value is that a visitor writes one sentence and gets most of a
correct record filled in. In the recorded responses the classification and
the clear fields mostly worked: batch 2's misses all left a gap the gardener
sees, and batch 1's one false value, an invented date, is what the date rule
now addresses (shown by replay). Measuring the feature by how often it
completes a record without help asked for more than the product needs.

## Alternatives Considered

- **Keep the demo closed (ADR-0059's outcome).** No new risk or cost, but
  visitors cannot try the feature on their own note.
- **Never prefill the target.** Every visitor would pick the target by hand,
  including the 24 drafts where the prefill was right, with no safety gain
  observed in return.
- **Another paid batch to reach 18 of 20.** That chases the score of a gate
  this decision no longer uses, and tunes rules to cases already seen.

## Consequences

- Visitors sometimes pick the target or the date themselves.
- The screen already asks the visitor to review every field before saving
  and says that drafts use the example garden; no code changes with this
  decision.
- The live entry stays off until the Render checks and C3 pass and the owner
  approves the trial.
- Opening rests on 40 recorded responses and the server rules; unusual notes
  can still be misread, and the review step stays the last check.

## Revisit When

The model, prompt, schema, demo garden, or server rules change; a wrong
prefill or invented value appears in C3, the trial, or a report; or the cost
assumptions stop holding.
