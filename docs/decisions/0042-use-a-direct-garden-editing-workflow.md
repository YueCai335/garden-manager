# ADR-0042: Use a Direct Garden Editing Workflow

- Status: Superseded by [ADR-0043](0043-use-a-single-planting-area-editor.md)
- Date: 2026-09-02
- Related: [ADR-0029](0029-use-a-thumbnail-first-garden-hub.md), [ADR-0038](0038-link-current-plantings-to-layout-positions.md), and [ADR-0039](0039-use-separate-season-plans-for-future-planting.md)

## Context

The Garden Hub supports both a built-in reference garden and user-created
gardens. The detailed editor contains a metric Garden Plan, planting-area
measurements, plant allocations, care records, and next-season plans.

The interface must keep these workflows clear without introducing repeated
navigation, duplicate entry points, or visual competition with the growing
areas that gardeners edit most often.

## Decision

Use direct entry from a garden thumbnail into its editor.

- Show the Demo Garden as the primary card only when no user-created garden
  exists. Offer it as a compact reference action when personal gardens exist.
- Keep the dashboard's actions at the same visual priority, except for
  creating a garden.
- Open a garden directly from its thumbnail and remove the separate management
  entry point.
- Remove the workspace navigation rail.
- Keep garden-boundary dimensions available in a compact, collapsed setting.
- Show the Garden Plan followed by planting areas. Keep garden naming and
  deletion settings after those primary editing surfaces.
- Keep Garden Plan placement-only. Planting-area dimensions and plant
  allocations remain in the planting-area editor.

## Why This Option

- A gardener can move from the garden overview to the relevant editing surface
  in one action.
- Existing gardens stay visually prominent while the reference garden remains
  available for exploration.
- The metric plan supports orientation without competing with the growing-area
  workflow.
- The separation between garden boundaries, growing-area geometry, and plant
  allocations stays technically accurate and easier to explain.

## Alternatives Considered

### Persistent Workspace Navigation

An always-visible navigation layer adds another interaction model before the
user has selected work to perform.

### Prominent Demo Garden Alongside User Gardens

The reference garden can distract from a gardener's active spaces once they
have created their own records.

### Exposing Garden-Boundary Inputs in the Main Plan Flow

Boundary inputs occupy space needed for the visual plan and the planting-area
controls.

## Consequences

- The dashboard card interaction becomes the direct entry point for detailed
  editing.
- A small reference action keeps the demo available without changing the user's
  working garden list.
- Garden boundary changes remain available through a deliberate settings
  control.
- Tests must cover direct card entry, Demo Garden visibility, and the retained
  garden-boundary controls.

## Revisit When

Revisit when the product adds account-level work queues, collaborative gardens,
or a larger number of independent workspace modules.
