# ADR-0029: Use a Thumbnail-First Garden Hub

- Status: Accepted
- Date: 2026-09-01
- Supersedes: [ADR-0021](0021-use-dashboard-garden-setup-and-direct-editing.md)
- Related: [ADR-0018](0018-use-a-multi-garden-thumbnail-dashboard.md) and [ADR-0026](0026-use-a-next-season-planning-workspace.md)

- Implementation refinement: Route ownership and navigation are refined by ADR-0063; selectedGardenId no longer selects a URL garden.
- Implementation refinement: Overview shows compact garden cards that open on one activation. The gallery fits up to three columns, and thumbnails fit measured beds with a tighter frame. The detailed plan owns full-garden scale and editing.

## Context

The home page already presents each garden as a visual thumbnail with a green
selection state. A separate selected-garden panel repeats the garden name and
uses valuable space without adding garden information. Care and next-season
planning are global workflows with their own destination pages.

Garden Plan labels also need to remain visually associated with their planting
areas when areas are close together or rotated.

## Decision

Use the home page as a thumbnail-first Garden Hub.

- Garden thumbnails provide selection through a green outline.
- Double click opens the selected garden for detailed editing.
- A second keyboard activation on a selected thumbnail opens detailed editing.
- The home page provides independent entries for Add garden, Care, and Plan
  next season.
- The selected-garden panel is removed.
- Each Garden Plan growing-area label is horizontally centered above its actual
  boundary. Labels move below the boundary when the canvas top edge leaves too
  little room above it.

## Why This Option

- The visual garden gallery remains the primary orientation surface.
- Global operations stay visible without suggesting that they only apply to the
  currently selected garden.
- Direct placement of each label makes the relationship between a name and its
  planting area clear.
- Keyboard activation retains a direct editing route without adding a repeated
  control to every thumbnail.

## Alternatives Considered

### Retain a Separate Selected-Garden Panel

The selected thumbnail already communicates the current garden and supports
direct editing.

### Put All Garden Labels Inside Their Boundaries

Plants can occupy the same visual space, making both labels harder to read.

### Use a Fixed Label Position for Every Garden

Garden areas can begin near the top edge or rotate, so a fixed offset cannot
reliably preserve the label-to-area relationship.

## Consequences

- Home navigation is more compact and emphasizes visual scanning.
- The persisted selected garden still establishes the initial garden context
  for detailed editing and garden-scoped views.
- Label placement calculates a visual bounding box from each measured area.
- Closely stacked planting areas can still have neighbouring labels; a future
  collision-avoidance policy belongs to a denser multi-area planning phase.

## Revisit When

Revisit when the app adds many gardens, bulk operations, touch-native editing,
search across gardens, or label collision handling.
