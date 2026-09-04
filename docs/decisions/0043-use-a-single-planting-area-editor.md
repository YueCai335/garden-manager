# ADR-0043: Use a Single Planting-Area Editor

- Status: Superseded by [ADR-0044](0044-use-plan-canvas-and-bed-shortcuts.md)
- Date: 2026-09-02
- Related: [ADR-0038](0038-link-current-plantings-to-layout-positions.md) and [ADR-0042](0042-use-a-direct-garden-editing-workflow.md)

## Context

The garden editor exposed the same planting area through a Garden Plan selection
panel, a separate planting-area list, a layout editor, and a visible planting
record list. Gardeners had to decide which surface owned an edit even though
they were working on one physical bed.

Current plants still require durable planting data for care targets and
season-to-season rotation. Those records can remain an implementation detail
of the visual planting workflow.

## Decision

Use the Garden Plan as the visual entry point and one planting-area editor for
each bed or container group.

- Click a growing area in Garden Plan to open its editor; drag it on the plan
  to adjust its position.
- Keep naming, type, measured dimensions, placement settings, and current
  plant placement in that editor.
- Add and edit current plants through their colored circles on the measured
  layout canvas.
- Remove the repeated garden-level planting-area list, Garden Plan selection
  sidebar, and visible planting-record list.
- Preserve linked Planting Records behind the visual workflow for care events
  and rotation rules.

## Why This Option

- Each physical planting area has one clear editing surface.
- The canvas remains the primary representation of current-season planting.
- Care and rotation continue to use durable operational data without adding a
  parallel routine for gardeners.

## Alternatives Considered

### Separate Plan Controls and Area List

Repeated entry points make it unclear where to edit a growing area.

### Visible Planting Record Management

Plant records are useful operational data but are unnecessary as a separate
current-season editing surface when every visual plant is linked to one.

## Consequences

- Garden Plan focuses on visual placement and direct entry.
- Plant details remain available through the layout interaction rather than a
  record-management list.
- Tests cover direct canvas entry, one planting-area editing surface, and the
  retained linked current-season data.

## Revisit When

Revisit when gardeners need bulk import, individual plant health timelines, or
many unmeasured plantings in one area.
