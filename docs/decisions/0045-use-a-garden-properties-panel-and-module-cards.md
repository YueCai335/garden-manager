# ADR-0045: Use a Garden Properties Panel and Module Cards

- Status: Superseded by ADR-0051
- Date: 2026-09-03
- Related: [ADR-0044](0044-use-plan-canvas-and-bed-shortcuts.md)

## Context

Garden Plan already owns the measured garden boundary and provides direct
access to each planting area. Garden name belongs with those garden-level
properties so users can maintain the complete garden identity in one place.
The dashboard also needs clear visual entry points for planning, care, and the
AI-supported workflows without changing the canvas-first workspace.

## Decision

Use a compact Garden properties panel below the Garden Plan canvas. It saves
the garden name, plan width, and plan depth together.

Keep the canvas and planting-area cards as the two direct entrances to each
bed. Present the five dashboard workflows as distinct colored module cards:
season planning, care, AI garden notes, plant health, and plant knowledge.
The application header displays the product identity and current workspace
actions without repeating the selected garden name.

## Why This Option

- Garden-level properties remain together and are easy to find while editing
  the garden plan.
- Color-coded module cards improve scanning while keeping the interface calm
  and garden-focused.
- The visual hierarchy prioritizes the garden canvas and avoids a repeated
  selected-garden title on the dashboard.

## Alternatives Considered

### Dashboard Name Form

A dashboard name form separates the garden identity from its measured plan
properties and adds editing controls before a user enters the workspace.

### Identical Module Buttons

Identical outlined controls flatten the dashboard hierarchy and make the
planning and care workflows harder to scan.

## Consequences

- Renaming a garden is available from Garden Plan and persists with its plan
  dimensions.
- Module cards use restrained green, soil, plum, and health accents while
  preserving text labels and keyboard behavior.
- The header remains stable when users switch gardens.

## Revisit When

Revisit when the dashboard grows beyond the current five workflows or users
need configurable shortcuts.
