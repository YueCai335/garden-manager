# ADR-0068: Extract bounded workspace care-note batches

- Status: Accepted under the owner's full T00–T08 authorization; real-model evaluation pending
- Date: 2026-11-11
- Refines: ADR-0058 for the new batch endpoint only
- Related: ADR-0061, ADR-0060, ADR-0034, ADR-0055

## Context

A frequent homepage note can describe completed work in several gardens. The
existing single-event endpoint intentionally refuses multiple events. The owner
authorized section 12 of the frontend professionalization plan in full.

## Decision

Add a local-only `POST /workspaces/{workspace_id}/ai/care-note-drafts` and an
explicit `careNoteBatchAvailable` runtime capability. The old endpoint and public
demo rules stay intact. Public mode rejects batches before constructing a provider.
The request accepts only note and local today, with the existing 500-code-point
limit and server-date ±1-day check. Context comes from stored workspace names;
model output cannot supply IDs. Generation never writes records.

Use one strict structured extraction with at most six completed drafts and at
most twelve classified fragments. An overflow flag or excess completed events
rejects the whole extraction with a request-to-split message, never a truncated
success. Every object forbids extra properties; every field is required, with
null for unknown values. Classifications include planned, negated, unrelated,
ambiguous and unsupported, which produce fixed notices rather than care events.

Providers reuse Garden Note's configuration, with one call, no automatic retry,
a 30-second timeout, at most 32 KiB serialized request and 64 KiB returned text,
and an independent 4096-token output budget. Ollama sets `num_predict`; OpenAI
uses its strict response format and `store=false`. The old 800-token budget and
public cost controls do not change. Compatibility with real providers and batch
quality must be evaluated separately; offline mocks do not establish either.

Resolve names only against trusted records and literal source evidence. A named
garden must match uniquely. Without a garden name, prefill only a uniquely
matching named area/plant across the workspace; never choose the last garden or
the sole garden for an unnamed target. Ambiguous/unknown targets stay empty.
Explicitly named gardens may each have a garden-level event; all-gardens needs
explicit all-gardens wording and no narrower target. Source text must occur in
the note. These checks do not prove the model's classification or segmentation.

Dates require evidence in the event fragment. An explicit shared date may be
used only when it is a recognized leading date phrase in the note and agrees
with the note's sole recognized date; conflicting dates leave gaps. Unsupported
date language needs manual review. Nonpositive or unevidenced fertilizer values
are cleared. A shared total or overlapping fertilizer fragments cannot assign
the same total to each garden; amounts stay empty with a review note.

The review UI uses ephemeral review rows with stable draft/event
IDs, one existing single-target CareEvent per selected row, and one atomic
workspace update after validating all selected rows. No migration, permanent
batch log, automatic task creation or cross-device deduplication is introduced.

## Review and application implementation

The workspace provider owns the shared homepage note and batch review session.
Routes retain edits, exclusions, original source text and stable event IDs.
An explicit generation action is the only provider call; replacing existing
drafts requires confirmation. Changed source text or manual edits invalidate
an in-flight extraction without removing the current drafts.

`applyCareDraftBatch` validates every included row against the latest workspace
before creating one immutable snapshot. Trusted current entities supply target
names. Root records and garden-owned records are written together through the
existing revision-checked workspace transaction. The workspace setter updates
its current-value reference synchronously, so validation also sees earlier
mutations within the same event; React updater replay cannot allocate IDs or
apply a batch twice.

A session receipt separates locally applied records from server-confirmed
records. Retry resends the snapshot with the same IDs. Conflict reload either
recognizes those IDs in their intended owners or restores the retained drafts
for explicit review and reapplication. Identical existing rows are idempotent;
changed/colliding records block the entire reapplication. Successful saving
clears only the included drafts and retains unchecked rows. This provides
session/retry protection, not permanent cross-device deduplication or a stored
batch log. Browser refresh can lose unsaved review drafts and is guarded by the
existing unload warning.

## Rationale and alternatives

One bounded call preserves the note's relationships without mechanically
splitting punctuation or calling once per garden. Separate contracts preserve
the evaluated public demo. Conservative gaps keep uncertain ownership visible.
Expanding selected gardens to all gardens, automatic writes, and a new
multi-target database model would change the meaning or scope of this work.

## Consequences and reconsideration

Large workspaces can exceed the input cap and need manual entry; context is never
silently truncated. Some valid language requires manual fields. Provider output
can still omit or misclassify an event, and source evidence is not proof of
correctness. Evaluate event count, target scope, false completed events, dates
and quantities against a frozen bilingual corpus before claiming extraction
quality. Revisit after measured local/provider results, new event types, public
rollout, or durable multi-user batch requirements.
