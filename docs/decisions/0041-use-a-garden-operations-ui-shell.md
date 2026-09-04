# ADR-0041: Use a Garden Operations UI Shell

- Status: Superseded by [ADR-0042](0042-use-a-direct-garden-editing-workflow.md)
- Date: 2026-09-02
- Related: [ADR-0027](0027-use-persistent-plant-colors-and-garden-plan-zoom.md) and [ADR-0029](0029-use-a-thumbnail-first-garden-hub.md)

## Context

The application already provides a working multi-garden hub, metric Garden Plan,
care workflow, season planning, and reviewable AI workflows. Those screens grew
from individual feature slices and need a shared operational presentation that
makes the product easier to scan and more credible as a production portfolio
application.

The interface needs clear garden context, direct routes to the core workspaces,
a high-visibility Garden Plan, and styling that feels practical and horticultural
without adopting a generic blue AI product aesthetic.

## Decision

Use a compact Garden Operations UI shell.

- Keep the thumbnail-first Garden Hub as the multi-garden entry point.
- Add a contextual desktop navigation rail for Gardens, Plan, Care, and Season.
- Use the Garden Plan as the primary visual surface inside garden management.
- Apply shared warm-neutral backgrounds, charcoal-green text, forest-green
  actions, and plant-specific colors for allocations and statuses.
- Use small-radius rectangular controls, square icon controls, compact status
  labels, and consistent panel spacing across operations and AI workflows.
- Preserve the existing browser and PostgreSQL persistence model, metric garden
  coordinates, plan zoom, and direct manipulation behavior.

## Why This Option

- Gardeners can maintain orientation while moving between visual planning,
  recurring care, and next-season choices.
- The Garden Plan receives the space needed to communicate measured growing
  areas and plant locations.
- A restrained visual system supports repeated operational use and keeps plant
  colors meaningful.
- The redesign strengthens the portfolio presentation without adding UI
  libraries or changing domain behavior.

## Alternatives Considered

### Full Marketing-Style Redesign

Large hero treatments and decorative imagery would reduce working space for
garden records and planning controls.

### Generic Blue AI Dashboard

A blue technology palette would weaken the product's garden context and make
plant, warning, and task colors less distinctive.

### Separate Navigation Model for Every Feature

Independent headers would continue to fragment the experience and make the
application harder to scan as more workflows are added.

## Consequences

- The dashboard and detailed workspaces share a recognisable visual system.
- Existing feature components gain consistent spacing, controls, and empty
  states through common styles.
- Desktop navigation requires responsive fallback behavior on narrow screens.
- Visual changes need component and interaction regression coverage because
  key actions remain available through the updated shell.

## Revisit When

Revisit when the product adds user accounts, collaborative gardens, mobile-first
field workflows, bulk work queues, or a larger set of independent modules.
