# ADR-0030: Use Context-Aware Plant Colors

- Status: Accepted; amended for canvas colors by [ADR-0073](0073-separate-the-landing-page-and-use-a-textured-deep-green-look.md) (phase S4, 2026-11-15): the Garden Plan canvas and the Gardens thumbnails color plants by crop family, and the plant panel hides its color picker. The stored `color` field and this resolver stay, so the change can be reversed in the interface alone. [ADR-0076](0076-color-each-plant-type-from-a-shared-muted-palette.md) (2026-11-16) returns the canvas to one color per plant type, from a muted palette.
- Date: 2026-09-01
- Refines: [ADR-0027](0027-use-persistent-plant-colors-and-garden-plan-zoom.md) and [ADR-0028](0028-use-plant-types-varieties-and-bilingual-color-aliases.md)

## Context

Gardeners scan a planting area by color. A single fallback green makes unknown
plants indistinguishable, and several plants with green foliage can still need
separate markers in the same layout. The visual color also needs to match
between the layout editor and the Garden Plan.

## Decision

Resolve allocation colors from the complete set of plants in one planting
area.

- Extend the local bilingual aliases with common ornamentals, including Meadow
  sage / 林荫鼠尾草 and Panicle hydrangea / 圆锥绣球.
- Recognized types receive a flower or fruit-oriented default color.
- Unknown types receive a stable color from a compact categorical palette.
- Automatic colors reserve already-used colors in their planting area, so
  different plant types receive distinct markers.
- Allocations with the same plant type retain the same automatic color.
- A manually selected allocation color always takes priority.
- The layout editor and Garden Plan use the same shared resolver.

## Why This Option

- Garden plans remain readable when several visually green plants share a bed.
- The color result stays deterministic without requiring an external botanical
  database or AI classification.
- Manual control preserves cultivar-specific flower colors and gardener
  preferences.
- A shared resolver prevents the overview and editor from drifting apart.

## Alternatives Considered

### One Fallback Green

This hides the difference between unrelated unknown plants in the same area.

### Assign a Different Color to Every Allocation

Repeated plants of the same type become harder to scan as a group.

### Add a Full Botanical Appearance Database

Reliable cultivar-level color metadata requires sourced ownership and ongoing
maintenance. The current product benefits from direct user input plus a small
explainable catalog.

## Consequences

- Automatic colors can change when gardeners add or remove plant types from a
  planting area.
- Saved manual colors retain their selected value.
- The local alias catalog remains intentionally small and can grow from tested
  user needs.

## Revisit When

Revisit when the product adds a sourced plant catalog, cultivar-level visual
metadata, shared team gardens, or a design system with accessibility-tested
color themes.
