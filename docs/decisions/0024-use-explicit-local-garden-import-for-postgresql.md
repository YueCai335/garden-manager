# ADR-0024: Use An Explicit Local-Garden Import For PostgreSQL

- Status: Superseded
- Date: 2026-08-31
- Superseded by: [ADR-0055](0055-use-automatic-sync-with-optimistic-locking.md)
- Related: [ADR-0002](0002-use-fastapi-python-backend.md),
  [ADR-0003](0003-start-with-modular-monolith.md), and
  [ADR-0006](0006-adopt-employment-oriented-production-stack.md)

## Context

The Garden Operations MVP currently stores gardens, planting areas, plants,
care events, and care tasks in browser storage. Phase 2 introduces FastAPI and
PostgreSQL so this workflow can demonstrate validated APIs, relational
persistence, schema migrations, and a reproducible local environment.

Existing browser data contains real garden records. Changing the save location
must preserve that data and make the transition understandable to the user.

## Decision

Provide an explicit one-time import of locally stored gardens into PostgreSQL.
The import runs only after the user requests it. A successful import makes the
database the authoritative source for that workspace. The browser copy remains
untouched until the import succeeds.

If the import fails, the application keeps the browser data available and
reports the failure. The feature does not silently merge concurrent browser and
database edits.

## Why This Option

- Existing garden records remain available during the migration.
- The user controls when storage moves to the database.
- One source of truth prevents conflicting browser and database copies.
- The import flow demonstrates a practical data-migration boundary for
  portfolio and interview discussion.

## Alternatives Considered

### Replace Browser Storage Automatically

Automatic replacement risks confusing users and makes recovery harder when the
database service is unavailable.

### Start With An Empty Database Only

Starting over would discard existing work and would not demonstrate a credible
transition from a browser-only prototype.

### Write To Browser Storage And PostgreSQL Indefinitely

Two writable sources require conflict resolution, ordering rules, and failure
recovery that exceed the current product need.

## Consequences

- The backend needs import validation and a transaction that persists a
  complete garden workspace safely.
- The frontend needs a visible import action and success or failure states.
- PostgreSQL becomes the source for later server-backed operations.
- Authentication and shared-garden ownership remain separate future decisions.

## Revisit When

Revisit this decision when the product adds accounts, offline-first support,
multi-device synchronization, shared gardens, conflict resolution, or a public
data-export requirement.
