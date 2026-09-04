# ADR-0054: Use Fixed-Canvas Garden Plan Views

- Status: Accepted
- Date: 2026-09-03
- Refines: [ADR-0027](0027-use-persistent-plant-colors-and-garden-plan-zoom.md)
- Related: [ADR-0015](0015-use-a-metric-garden-plan-overview.md) and [ADR-0053](0053-keep-plant-layout-in-the-planting-area-inspector.md)

## Context

Large gardens can contain a small cluster of growing areas. Manual zoom expands
the canvas as well as the beds, which makes the editor wider and leaves the
growing areas visually small. Gardeners need an immediate bed-focused working
view and a full-garden reference view.

## Decision

Replace manual Garden Plan zoom controls with two fixed-canvas views:

- `Focus beds` frames the measured bounds of existing planting areas and uses
  the available canvas space to make beds and plants easier to inspect.
- `Full garden` frames the complete garden boundary for placement context.

Both views retain the same visible canvas frame. Garden dimensions, metre
coordinates, planting-area dimensions, and rotations remain unchanged. Dragging
continues to convert the displayed point back to the original metre coordinate
system.

## Why This Option

- The main working view prioritizes the beds and plants a gardener edits.
- The canvas remains stable while the visual scale changes.
- Full-garden context stays one deliberate action away.
- Metric planning data stays trustworthy and persistent.

## Alternatives Considered

### Manual Zoom Controls

Manual zoom provides fine control, though it expands the canvas and makes the
working surface harder to contain alongside an inspector.

### Always Use the Full Garden Boundary

The full boundary is useful for overview work, though small bed clusters become
hard to inspect.

## Consequences

- Garden Plan defaults to `Focus beds` when measured planting areas exist.
- Plant labels are visible in the focused working view.
- Persistent plant colors from ADR-0027 remain unchanged.
- Users can select `Full garden` before moving a bed relative to unused space.

## Revisit When

Revisit when the product adds pan controls, map overlays, irregular garden
boundaries, or named saved views.
