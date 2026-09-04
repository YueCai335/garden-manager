# ADR-0044: Use a Plan Canvas and Bed Shortcuts

- Status: Superseded by ADR-0045
- Date: 2026-09-02
- Related: [ADR-0043](0043-use-a-single-planting-area-editor.md)

## Context

Garden Plan needs a large visual workspace for arranging planting areas and a
quick way to scan and open a specific bed. Gardeners also need one place to
maintain each bed's properties and current-season plants.

## Decision

Use Garden Plan as a visual overview with an always-visible garden boundary
panel and a compact card for every planting area.

- Canvas clicks and double-clicks open the selected planting-area editor.
- Bed cards open that same editor for a predictable, scannable entry point.
- A planting area owns its name, type, measured dimensions, and rotation.
- Current-season plants are managed through the measured bed layout with
  explicit Add plant, Duplicate plant, and Save plant actions.

## Why This Option

- The canvas remains the primary representation of the garden.
- Bed cards reduce reliance on precise canvas targets when a garden has many
  similarly sized areas.
- A clear property boundary keeps plan placement, bed geometry, and plant data
  easy to explain and maintain.

## Alternatives Considered

### Canvas-Only Entry

Canvas-only entry slows down scanning and makes densely packed beds harder to
open.

### Repeated Area and Plant Forms

Parallel forms make it unclear where each property should be changed.

## Consequences

- Garden Plan has both visual and structured entrances to every bed.
- Rotation stays attached to the physical bed and is saved with its other
  properties.
- Current plants remain linked to durable planting data for care history and
  season rotation.

## Revisit When

Revisit when users need bulk plant import, grouped editing across many beds,
or a separate historical planting-data workspace.
