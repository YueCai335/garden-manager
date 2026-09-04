# ADR-0051: Prioritize Daily Garden Work on the Dashboard

- Status: Accepted
- Date: 2026-09-03
- Related: [ADR-0045](0045-use-a-garden-properties-panel-and-module-cards.md)

## Context

Gardeners record care and create a structured garden note during regular
maintenance. Diagnosis, reference research, and seasonal planning are useful
when a specific need arises. Displaying all five workflows with equal visual
weight makes the dashboard harder to scan and obscures daily work.

## Decision

Group dashboard actions into two sections.

- **Daily garden work** contains `Care records` and `AI garden note` as larger
  primary cards.
- **Garden tools** contains `Plant doctor`, `Plant guide`, and `Next season
  plan`, in that order.

Keep every workflow on its existing route and retain its current behavior.

## Why This Option

- Daily records become the immediate next action after selecting a garden.
- `Plant doctor` communicates a diagnosis workflow more clearly than a broad
  health label.
- `Plant guide` communicates a reference workflow more clearly than a broad
  knowledge label.
- Seasonal planning remains accessible without competing with daily work.

## Alternatives Considered

### Equal Five-Card Row

An equal row provides a compact display but gives occasional planning and
reference tools the same priority as recurring records.

### Separate Pages for Every Tool

Additional navigation does not improve the clarity of the dashboard entry
point and adds unnecessary transitions.

## Consequences

- Dashboard card placement communicates task frequency and intent.
- Existing deep workflows retain stable state and persistence behavior.
- New dashboard modules require placement in either daily work or tools.

## Revisit When

Revisit when scheduled task queues, account notifications, or additional
high-frequency workflows require a dedicated daily-work surface.
