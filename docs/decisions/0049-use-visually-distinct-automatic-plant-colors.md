# ADR-0049: Use Visually Distinct Automatic Plant Colors

- Status: Accepted
- Date: 2026-09-03
- Refines: [ADR-0030](0030-use-context-aware-plant-colors.md)

## Context

Plant types receive recognizable default colors, such as tomato red and
hydrangea pink. Some default colors remain visually close when they appear in
the same planting area, which makes mixed beds harder to scan.

## Decision

Keep a plant type's default color when it remains clearly separated from the
other colors in its planting area. Select a high-contrast fallback color when
an automatic color is too close to an existing automatic or manually selected
color in that area.

Manual colors continue to take priority.

## Why This Option

- Familiar plant colors stay visible whenever the bed remains easy to read.
- Mixed beds receive distinct markers without requiring users to tune colors.
- The shared resolver keeps the editor, Garden Plan, and thumbnails aligned.

## Alternatives Considered

### Different Color for Every Plant Allocation

Repeated plants would lose their group identity within a bed.

### Keep All Recognized Default Colors

Close red, orange, and pink defaults can blend together in a dense plan.

## Consequences

- A plant's automatic color can change when another plant type is added to the
  same area.
- Saved manual colors retain their selected value.

## Revisit When

Revisit when the product adds an accessibility-reviewed color theme or a
sourced cultivar appearance catalog.
