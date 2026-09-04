# ADR-0053: Keep Plant Layout in the Planting-Area Inspector

- Status: Accepted
- Date: 2026-09-03
- Supersedes: [ADR-0050](0050-use-a-garden-plan-planting-area-inspector.md)
- Related: [ADR-0015](0015-use-a-metric-garden-plan-overview.md), [ADR-0048](0048-place-garden-properties-above-the-plan-canvas.md), and [ADR-0052](0052-show-save-actions-only-for-pending-edits.md)

## Context

Editing a planting area includes its physical dimensions, rotation, and the
plants currently placed inside it. Rendering the metric plant layout below the
Garden Plan separates one task across the page and makes routine plant entry
require a long scroll.

## Decision

Keep the Garden Plan on the left as the visual workspace for moving and
rotating planting areas. Keep one selected planting area's full editor in the
right-side inspector.

The inspector presents area properties first, followed directly by `Plant
layout`, its measured plant canvas, and the `Add plant` action. Plant editing,
duplication, and removal remain within that layout section.

On wide screens, the inspector stays beside the plan and scrolls independently
when its content exceeds the viewport. On narrow screens, the inspector follows
the plan in the normal page flow.

## Why This Option

- A gardener can move a bed on the plan while editing everything inside that
  bed in one nearby workspace.
- Plant entry remains visible at the point where the bed's grid is shown.
- The plan retains its role as an overview and placement surface.
- Responsive stacking preserves the same content order on smaller screens.

## Alternatives Considered

### Layout Below the Garden Plan

A full-width layout canvas provides more horizontal space, though it separates
plant work from the selected bed's properties and adds avoidable scrolling.

### Separate Planting-Area Page

A separate editor provides a larger canvas, though it removes the garden plan
from view during routine bed edits.

## Consequences

- The planting-area inspector is the single editing surface for a selected bed.
- Garden Plan continues to own area placement and rotation interactions.
- Existing canvas and shortcut entries open the same inspector.
- Large bed layouts can scroll horizontally within the right-side canvas frame.

## Revisit When

Revisit when gardeners need simultaneous editing of multiple beds, a full-screen
layout mode for unusually large plans, or mobile interactions that require a
dedicated layout view.
