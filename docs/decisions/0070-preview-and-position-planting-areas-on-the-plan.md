# ADR-0070: Preview and Position Planting Areas on the Plan

- Status: Superseded in part by [ADR-0072](0072-use-a-single-plan-canvas-with-guided-setup.md). G2 removed Focus beds and Full garden; G3 replaced the phone summary card with planting controls below the zoomed plan, and the area URL now zooms the plan at every width. G4 removed the Move mode for mouse and pen, which drag areas directly and resize them from a corner handle; the Move mode remains on touch screens only. The six-pixel threshold, frozen transform, original-position outline, snapped preview, and Escape cancel remain and also apply to the corner handle.
- Date: 2026-11-12
- Refines: ADR-0054, ADR-0065, ADR-0066
- Implementation plan: [Frontend UI and UX redesign](../frontend-ui-ux-redesign-plan.md)

## Context

Garden Plan supports measured areas and text coordinates. A gardener also
needs to see the intended position while moving a bed and to recognize the
selected bed before opening the full editor on a phone.

## Decision

On wide screens, keep a 360px side column for the area list or the open area
editor. At medium widths, use the existing modal inspector. On phones, a map
tap highlights the area and shows a compact summary with an Edit area link.
Text links still open the editor directly. Closing the phone editor returns to
the selected area's summary. The existing area URL still opens the editor.
The modal inspector wraps Tab and Shift+Tab at the first and last available
controls so keyboard navigation remains in the inspector.

Keep Focus beds and Full garden as the two fitting modes. Move remains an
explicit action on desktop and mobile. A drag starts after six pixels, freezes
its metric transform, and shows the original outline and snapped target
coordinates. Pointer release saves one position. Escape and canceled touch
gestures restore the original position. Coordinate fields and 0.1 m step buttons
stage a position edit that is applied through Save.

The plant canvas shows an unsaved position and spacing preview using the same
metric scale as the saved plants. The text preview expresses spacing in
centimetres and the saved model keeps metres.

## Rationale

Visible preview and deliberate commit make position edits predictable. The text
list, coordinate fields, and step buttons support editing without a drag. One
responsive editor and the established session drafts preserve work when the
layout changes.

## Alternatives

Always-on dragging competes with scrolling on touchscreens. Independent map
and form positions create mismatched previews. Free zoom and pan would expand
the scope of the existing fixed-canvas views.

## Consequences

The existing origin-based boundary and 0.1 m grid rules still govern placement.
The dialog on medium widths and full editor on phones retain the same forms.
Planting-area height needs a separate persisted field and schema change. This
decision covers two-dimensional placement and spacing.

## Reconsideration

Revisit when usability testing indicates a need for pan and zoom, or when the
product adopts height or full-shape placement constraints.
