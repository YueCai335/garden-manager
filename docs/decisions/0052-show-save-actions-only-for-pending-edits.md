# ADR-0052: Show Save Actions Only for Pending Edits

- Status: Accepted
- Date: 2026-09-03
- Related: [ADR-0048](0048-place-garden-properties-above-the-plan-canvas.md) and [ADR-0050](0050-use-a-garden-plan-planting-area-inspector.md)

## Context

Garden properties, planting-area properties, plant details, care records, and
care tasks have editable fields. A static Save button visually competes with
input fields and provides no indication of whether a change is waiting to be
persisted. Garden dimensions also use internal coordinate terminology that
does not match how gardeners describe a physical garden.

## Decision

Use `Garden width (m)` and `Garden length (m)` for garden dimensions.

Show a Save action only after a user changes an existing garden, planting
area, plant, care event, or care task. Hide the Save action again after the
saved state is restored.

Keep `Add`, `Create`, `Complete`, and `Save to Care History` visible in
creation and confirmation flows because they create a new record or confirm a
generated draft.

## Why This Option

- Garden-facing language is clearer than coordinate-axis terminology.
- A visible Save action communicates a pending edit.
- Clean forms focus attention on the current values until a user changes one.
- Creation actions remain immediately available when a new record is being
  defined.

## Alternatives Considered

### Always-Visible Save Actions

Persistent Save controls add repeated visual weight and make unchanged forms
look unfinished.

### Automatic Save on Every Field Change

Automatic persistence can record incomplete or accidental values while a
gardener is still editing a form.

## Consequences

- Existing records retain explicit user-controlled persistence.
- Each editable form compares its current values with the saved record.
- Users can still cancel an unchanged editing session.

## Revisit When

Revisit when the product adds reliable draft autosave, conflict handling, and
an explicit saved-state indicator.
