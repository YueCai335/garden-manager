# ADR-0046: Use an In-Context Planting-Area Creation Panel

- Status: Superseded by ADR-0050
- Date: 2026-09-03
- Related: [ADR-0045](0045-use-a-garden-properties-panel-and-module-cards.md)

## Context

Garden Plan is the primary workspace for arranging physical planting areas.
Creating an area through a lower-page form and opening a separate editor
delays visual placement and separates the new area's measured properties from
the plan where gardeners arrange it.

## Decision

Open Add planting area as a compact right-side panel beside Garden Plan.
The panel collects the new area's name, type, length, width, and rotation.
Saving creates a measured rectangular layout, displays it on the canvas, and
keeps Garden Plan open for direct dragging.

The canvas retains the card and double-click entrances to the detailed
planting-area editor. Garden properties remain below the plan canvas.

## Why This Option

- The canvas remains visible while gardeners define a new physical bed.
- New dimensions and rotation produce an immediately meaningful plan shape.
- Direct dragging completes placement without an intermediate editor step.
- The right panel keeps the form compact and visually associated with Garden
  Plan.

## Alternatives Considered

### Lower-Page Creation Form

A lower-page form places the measurements away from the canvas and increases
scrolling before gardeners can see the new area.

### Empty Area Followed by a Layout Editor

An empty area requires a second interaction before it becomes visible and
draggable on Garden Plan.

## Consequences

- Every newly created planting area has measured rectangular geometry.
- Garden Plan becomes narrower while the creation panel is open and returns to
  its full workspace width after the panel closes.
- Gardeners can refine a new bed through its canvas target or shortcut card
  after placing it.

## Revisit When

Revisit when gardeners need irregular boundaries at creation time, bulk bed
creation, or reusable area templates.
