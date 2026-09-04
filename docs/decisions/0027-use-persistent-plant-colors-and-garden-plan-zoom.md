# ADR-0027: Use Persistent Plant Colors and Garden Plan Zoom

- Status: Superseded in part by ADR-0054
- Date: 2026-09-01
- Related: [ADR-0014](0014-use-metric-planting-layouts-with-grid-snapping.md)

## Context

Garden Plans preserve real metre-based dimensions. A large garden can contain a
small cluster of planted areas, which makes the cluster difficult to inspect in
a fit-to-plan view. The existing plan also renders every allocation with the
same color and displays labels at every zoom level, creating visual overlap.

Each layout allocation already owns the visual position and spacing circle. A
planting record remains a separate operational record because one record can
represent a group while several layout allocations represent individual
placements.

## Decision

Keep plant color on each layout allocation and add Garden Plan view controls.

- Every allocation supports an optional six-digit hex color that persists in
  browser storage and PostgreSQL layout JSON.
- Recognized common plant names receive a small local fruit-or-flower color
  default. Unrecognized names receive a neutral leaf-green default.
- Users can set any allocation color through a native color control in the
  planting-layout editor.
- Garden Plan provides zoom out, fit plan, and zoom in controls. Zoom changes
  the canvas scale and does not change metre coordinates, dimensions, or area
  placement.
- The fit view hides allocation labels. Zoomed-in views and selected
  allocations show labels.

## Why This Option

- Color makes the plan scannable while retaining direct user control.
- A small local default palette gives useful first-render colors without a
  sourced botanical catalog or external dependency.
- View controls allow gardeners to inspect a planted corner while preserving
  the full garden as the coordinate reference.
- The existing JSON layout field carries the optional color without new tables
  or schema migrations.

## Alternatives Considered

### One Color for Every Allocation

A uniform color provides little visual distinction when several plant types
share a growing area.

### A Full Botanical Appearance Database

Reliable flower and fruit color metadata needs source ownership, species and
cultivar handling, and validation. The current product benefits more from
simple defaults and direct user choice.

### Change the Garden's Measured Dimensions to Fill the Canvas

Measured dimensions are planning data. View zoom preserves those facts while
allowing the gardener to focus on a smaller area.

## Consequences

- Layout allocations gain a backward-compatible optional color field.
- Older saved layouts display through the fallback palette until a user selects
  a custom color.
- Garden Plan has explicit viewing controls and a focused label policy.
- Future plant-knowledge work can replace the small default palette with
  sourced species metadata.

## Revisit When

Revisit when the product has a validated plant catalog, cultivar-level visual
metadata, shared garden plans, or map-scale interactions that require a more
advanced viewport model.
