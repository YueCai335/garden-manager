# ADR-0061: Prioritize Global Garden Notes and Consistent Workflows

- Status: Accepted for product direction; implementation pending
- Date: 2026-11-09
- Refines: ADR-0029 and ADR-0051 for homepage priorities and workspace navigation
- Related: ADR-0034, ADR-0052, ADR-0053, ADR-0055, ADR-0058, ADR-0060
- Implementation proposal: [Frontend professionalization plan](../frontend-professionalization-plan.md)

## Context

The owner reviewed the frontend audit and agreed to distinguish the global
workspace, individual gardens, and individual planting areas. The owner
explicitly rejected placing AI Garden Note only beside a garden-specific care
form. Recording a note is a frequent first action on opening the application,
and one day's work can cover several gardens.

The current note contract produces one event for one target. Explicit
workspace-wide care and several different actions across selected gardens are
different workflows. ADR-0058 currently returns no draft for multi-event notes,
and the public demo remains governed by ADR-0060.

The owner also accepted separating local form feedback from global saving
feedback and protecting unsaved edits from unrelated workspace updates.

## Decision

- Organize navigation around global workspace, garden, and planting-area scope.
- Treat AI Garden Note as a first-class global capability with a prominent,
  directly usable homepage entry. Starting a note does not require entering a
  garden first.
- Include reviewable recording of work across multiple gardens in the product
  goal. Preserve the distinction between selected gardens and every garden.
- Keep local input validation and operation feedback near the form. Keep
  saving, connection failures, and revision conflicts visible across modules.
- Preserve unsaved form drafts during unrelated edits. Make discarding a draft
  deliberate and visible.
- Retain explicit review before AI-generated data enters care history.

This records the owner's confirmed direction. The implementation plan proposes
specific routes, presentation, responsive behavior, and a batch extraction
contract. Those implementation decisions are adopted when the owner authorizes
that proposal and are recorded separately where material.

## Rationale

The homepage should support the owner's frequent cross-garden activity without
forcing an artificial garden choice. Explicit scopes make record ownership
understandable. Persistent saving feedback and protected edits make everyday
operations trustworthy.

## Alternatives Considered

- **Garden-specific AI note entry only:** rejected by the owner because frequent
  notes may cover several gardens and should begin on the homepage.
- **A global entry that still silently binds every note to the last garden:**
  fails to communicate the real target and can create incorrectly owned data.
- **Reclassifying selected-garden work as all-gardens care:** changes the meaning
  of the record and remains inappropriate.
- **Visual styling alone:** leaves navigation, feedback, and draft-loss issues
  unresolved.

## Consequences

- Homepage priorities and navigation need implementation work.
- Single-event note handling remains the current implementation until a batch
  contract is implemented and evaluated.
- A new multi-event implementation must revisit ADR-0058 without weakening its
  uncertainty, date-evidence, and review principles.
- Existing public-demo provider limits, paid-request approvals, and capability
  switches remain governed by ADR-0060. This ADR does not open public batch AI.
- Existing data ownership, revision protection, and future-season separation
  remain intact unless a later explicit decision changes them.

## Reconsideration Conditions

Revisit when usage evidence changes the homepage's main task, when notes need
new event types or planned-task creation, when collaborative use changes draft
ownership, or when evaluated batch extraction justifies a public rollout.
