# ADR-0048: Place Garden Properties Above the Plan Canvas

- Status: Accepted
- Date: 2026-09-03
- Related: [ADR-0045](0045-use-a-garden-properties-panel-and-module-cards.md)

## Context

Garden Plan presents a measured view of the current garden. The garden name,
plan width, and plan depth establish the scale and identity of that view, so
they should be visible before the editor canvas.

## Decision

Place the Garden properties form directly after the Garden Plan introduction
and above the plan canvas. Keep the garden name, plan width, and plan depth in
one form with one Save action.

## Why This Option

- Garden identity and scale are available before users inspect or arrange beds.
- The editor canvas follows the properties it represents.
- The form remains compact and preserves the existing save flow.

## Alternatives Considered

### Properties Below the Canvas

Properties below the canvas require users to scan past the primary workspace
before viewing the plan dimensions.

### Properties in the Page Header

Header controls compete with navigation and the primary planting-area action.

## Consequences

- Garden Plan starts with the current garden metadata and continues directly
  into its visual layout.
- Existing name and boundary validation remains unchanged.

## Revisit When

Revisit when Garden Plan adds more garden-level settings that need a dedicated
properties view.
