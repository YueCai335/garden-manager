# ADR-0050: Use a Garden Plan Planting-Area Inspector

- Status: Superseded by ADR-0053
- Date: 2026-09-03
- Related: [ADR-0046](0046-use-an-in-context-planting-area-creation-panel.md), [ADR-0047](0047-use-a-unified-planting-area-properties-form.md), and [ADR-0048](0048-place-garden-properties-above-the-plan-canvas.md)

## Context

Gardeners arrange beds on a visual plan, then refine the same bed's identity,
measurements, orientation, and current-season plants. A dedicated planting-area
page hides the Garden Plan after a bed is selected. The creation panel already
keeps the plan visible, so creation and editing need one consistent location.

## Decision

Use one right-side Garden Plan inspector for both adding and editing a
planting area. Selecting a bed from its canvas target or shortcut opens the
inspector beside the plan. The inspector saves the name, type, length, width,
and rotation together.

Keep the selected bed's metric plant layout directly below Garden Plan on the
same management page. Its plant controls remain attached to that layout.

When the inspector is open, render garden name, width, depth, and Save in a
compact three-row form above the plan canvas. The garden-properties eyebrow is
hidden in this narrow workspace state.

## Why This Option

- Gardeners retain spatial context while creating or revising a bed.
- Each planting area has one clear location for physical properties.
- The same interaction works for canvas targets and shortcut cards.
- Numeric garden dimensions stay readable without competing with the inspector.
- Plant placement remains close to the plan while avoiding a second route.

## Alternatives Considered

### Dedicated Planting-Area Page

A separate page provides room for controls but breaks visual continuity with
Garden Plan and repeats navigation for routine edits.

### Separate Creation and Editing Panels

Two panels use different patterns for the same properties and make the
workflow harder to learn.

### Always-Expanded Garden Properties

A wide inline form compresses into the inspector when a bed is open and makes
the plan harder to scan.

## Consequences

- Garden Plan remains visible throughout planting-area creation and editing.
- Existing canvas shortcuts now open the inspector and reveal the selected
  plant layout below the plan.
- The management workspace has responsive narrow and wide inspector states.
- Irregular boundaries and bulk editing remain future workflows.

## Revisit When

Revisit when gardeners need simultaneous editing of multiple beds, irregular
area geometry, or a mobile workflow where an inspector cannot fit beside the
plan.
