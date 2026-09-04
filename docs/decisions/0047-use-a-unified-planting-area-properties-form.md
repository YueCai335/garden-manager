# ADR-0047: Use a Unified Planting-Area Properties Form

- Status: Superseded by ADR-0050
- Date: 2026-09-03
- Related: [ADR-0044](0044-use-plan-canvas-and-bed-shortcuts.md) and [ADR-0046](0046-use-an-in-context-planting-area-creation-panel.md)

## Context

The planting-area editor previously separated the area identity and rotation
from measured layout dimensions. Gardeners had to save the same physical
planting area through two controls before moving on to plant placement.

## Decision

Use one properties form for planting-area name, type, length, width, and
rotation. A single Save updates the planting-area metadata, its rectangular
layout, and the saved rotation together.

Keep Add plant as the primary independent action in the right-side controls
next to the measured plant-layout canvas. Plant editing and duplicate actions
remain in that control area after a plant is selected.

## Why This Option

- Each physical planting area has one clear group of editable properties.
- One save action prevents uncertainty about which changes are persisted.
- The canvas retains visual priority while Add plant stays reachable beside it.

## Alternatives Considered

### Separate Area and Dimension Forms

Separate forms require two saves for one physical planting area and divide
closely related measurements across the page.

### Add Plant Above the Properties Form

An upper-page action pulls plant placement away from the layout canvas where
spacing and positions are visible.

## Consequences

- Resizing a planting area preserves existing plant allocations within the
  updated rectangular boundary.
- Area metadata and geometry are persisted together by one user action.
- Plant controls retain their dedicated right-side workspace.

## Revisit When

Revisit when planting areas support irregular editable boundaries, multiple
layout templates, or bulk property edits.
