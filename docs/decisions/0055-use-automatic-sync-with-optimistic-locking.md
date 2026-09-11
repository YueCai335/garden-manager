# ADR-0055: Use Automatic Workspace Sync With Optimistic Locking

- Status: Accepted
- Date: 2026-09-11
- Supersedes: [ADR-0024](0024-use-explicit-local-garden-import-for-postgresql.md)
- Related: [ADR-0002](0002-use-fastapi-python-backend.md) and
  [ADR-0006](0006-adopt-employment-oriented-production-stack.md)

## Context

ADR-0024 required the gardener to click an import button before a browser
workspace reached PostgreSQL. In practice the button was easy to forget, so a
cleared browser or a second device could silently lose work. The import was
later replaced by an automatic background sync, but the decision record and
README still described the manual step.

An external code review of commit `2ad01c8` also reproduced two data-loss
paths in the save flow:

1. The first automatic import returned an older snapshot after the gardener had
   already edited, and the component adopted the older copy.
2. Two browser tabs holding the same workspace could each save; the later save
   replaced the whole workspace and the earlier tab's change vanished with an
   HTTP 200.

## Decision

- The frontend syncs automatically. A browser workspace is imported into
  PostgreSQL the first time it changes and PostgreSQL is the write source from
  then on. No user action is required.
- Every workspace carries an integer `revision`, separate from the data-format
  `version`. `GET` and `PUT /workspaces/{id}` return it. `PUT` requires the
  revision the client last read; the server bumps it with one conditional
  `UPDATE ... WHERE revision = :expected` so two racing saves cannot both win.
- A stale save returns HTTP 409 with `currentRevision`. The frontend keeps the
  unsaved edits on screen, pauses further saves, and offers two explicit
  choices: reload the newer copy, or save over it with the current revision.
- An import response is adopted only if nothing changed while the request was
  in flight; otherwise the newer local edits win and are queued as a save.

## Why This Option

- One integer column and one conditional update give real concurrency safety
  without CRDTs, WebSockets, or per-entity endpoints.
- 409 with the current revision is a clear API contract that a client can act
  on, unlike a silent last-write-wins 200.
- Keeping unsaved edits visible during a conflict respects the gardener's work
  instead of discarding it on their behalf.

## Alternatives Considered

### Last Write Wins

Simplest, and what the code did. Rejected because it loses data with no
signal to the user or the logs.

### Merge Concurrent Edits Field By Field

Would need per-entity change tracking and merge rules for every record type.
The product has one workspace per browser and no shared editing, so the cost
is not justified yet.

### Lock The Workspace While A Tab Is Open

Pessimistic locks need lease expiry and recovery when a tab closes
unexpectedly. Optimistic locking handles the same conflict at the moment it
matters and needs no background bookkeeping.

## Consequences

- Alembic migration `20260911_07` adds `workspaces.revision`.
- Backend tests cover the 409 path and the retry with a fresh revision.
- Frontend tests cover the in-flight import race and both conflict choices.
- Clients that call `PUT /workspaces/{id}` must now send `revision`; omitting
  it is a 422.

## Revisit When

Revisit when the product adds accounts, shared gardens, or offline editing
across devices. Those need merge semantics that a single revision counter does
not provide.
