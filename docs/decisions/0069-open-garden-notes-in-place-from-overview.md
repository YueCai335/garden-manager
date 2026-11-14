# ADR-0069: Open Garden Notes in Place from Overview

- Status: Accepted; entry and route access amended on 2026-11-12 (see Amendment)
- Date: 2026-11-12
- Refines: ADR-0061, ADR-0063, ADR-0068
- Implementation plan: [Frontend UI and UX redesign](../frontend-ui-ux-redesign-plan.md)

## Context

Garden Note is a frequent action on Overview. A gardener can record care across
several gardens in one session. The Overview button previously navigated to
`/notes`, which removed the garden maps from view. The owner confirmed an
in-place dialog for entry, review, and saving.

## Decision

Open a native modal dialog from Overview. Use a bounded desktop panel and a
full-screen phone layout with one scroll area. Escape and Close dismiss the
dialog and restore focus to the opening button. Dismissal preserves the note,
drafts, selection, and save status in the current tab. Explicit discard requires
confirmation. `/notes` remains a directly accessible screen for the same draft
session, including from other workspace pages.

Render the same note review inside the dialog and on `/notes`. Use the existing
runtime capability to select batch or single-event review. Apply reviewed
records through the existing revision-checked workspace save, and surface the
same retry and conflict actions inside the dialog. Show confirmed saving only
after the workspace acknowledges it. Dismissal during a save leaves the save in
progress. Public demo eligibility stays governed by ADR-0060.

## Rationale

The dialog keeps the gardener in the context where recording began. A single
workspace session preserves the reviewed work and makes retries operate on the
already-submitted snapshot. Native modal behavior provides background inertness
and supports the existing nested confirmation flow.

## Alternatives

Route-only editing interrupts the frequent Overview workflow. A permanent
inline editor competes with the garden maps and tasks. Separate modal state
would require coordinating duplicate draft, validation, and save lifecycles.

## Consequences

Overview retains its URL during note entry, review, and save. View records can
navigate to History after confirmation. Drafts remain tied to the current tab
and the existing page-exit warning. Mobile keyboard positioning needs
verification on physical devices.

The Overview action appears as a full-width primary button above Care Tasks.
On desktop the group sits beside the garden gallery. On narrow screens it
sits above the gallery, within reach when a workspace has many gardens.

## Reconsideration

Revisit when collaboration or cross-device draft recovery changes the session
lifetime, or when user testing finds the dialog unsuitable for reviewing longer
notes.

## Amendment (2026-11-12): Overview-only quick note entry

The owner confirmed two changes to the entry point after the original decision.

- Overview shows an "AI Garden Notes" panel above Care Tasks with a quick note
  field. When batch drafting is available and the workspace is synced,
  "Generate draft" opens the dialog and starts extraction for the typed note,
  and "Open note editor" opens the dialog without a model request. Otherwise
  the primary button opens the dialog and names the current state: Open note
  editor, Continue note, Continue note · N drafts, or View note status. The
  field becomes read-only while the dialog holds a note or drafts.
- Garden Note is started only from Overview. Other workspace pages carry no
  note entry. The `/notes` route stays available by direct URL and serves the
  same tab session, so existing links and drafts keep working.

Typing on Overview removes a click for the most frequent action. One entry
point keeps the module pages focused on their own tasks. The cost is that a
gardener on Care or Plant Guide returns to Overview to record a note; drafts
persist across that navigation within the tab. Revisit if usage shows that
notes are frequently started from module pages.
