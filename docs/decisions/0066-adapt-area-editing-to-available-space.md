# ADR-0066: Adapt Area Editing to Available Space

- Status: Accepted
- Date: 2026-11-11
- Refines: ADR-0048, ADR-0053, ADR-0062
- Related: ADR-0063, ADR-0065
- Authorization: the owner approved T00–T08 and requested small delivery batches. This implements the remaining T05 editor presentation and positioning work.

## Context

The old inspector fell below the entire plan at medium widths. Mobile users had to scroll to find it, and closing did not reliably return to their selected area. The always-open garden form competed with editing plants. Area positioning depended on dragging even though plants already had coordinate fields.

## Decision

Use the editor container width for the desktop side-by-side layout: at least 1080px provides a canvas column of at least 640px, a 400px inspector, and a 24px gap. At viewport widths of at least 768px with insufficient container space, present the inspector as a native modal overlay. Below 768px, the existing area URL presents a full-width editor with garden/area context and Back to plan. Add-area forms use the same responsive panel.

Keep the same form subtree when switching modes, preserving inputs and the existing session draft maps. Desktop and mobile panels are non-modal regions; only the tablet overlay locks background scrolling and interaction. The header stays available while the panel body scrolls. Escape in the modal uses the same dirty-close check as Close. Return focus to the selected area's textual link, with the plan heading as fallback. App navigation retains drafts; explicit Close/Back asks before discarding edits.

Native confirmation dialogs can appear above the editor. Reference-counted scroll locking prevents a nested dialog from unlocking its parent. Delay a panel mode change while a confirmation is present so the editor cannot be placed above that confirmation in the browser top layer.

Above the plan, show garden name and dimensions as a summary. Edit garden details opens the existing form there; save or confirmed cancellation returns to the summary. Garden deletion lives in a separate Garden settings disclosure. Highlight the selected area in both the canvas and its textual link.

Add textual X/Y fields to the area-property draft. Validate against current garden dimensions, and save through the same clamp and 0.1m snapping helper used by dragging. Untouched position fields follow later drags; explicitly edited positions remain drafts and report conflicting updates. Property saves retain the latest allocations. The existing origin-based rotation/boundary model remains unchanged.

## Rationale and alternatives

Container width reflects the space actually available for two columns. The
mobile breakpoint uses a viewport media query so temporary content overflow
cannot switch a phone to the tablet overlay. One panel subtree preserves form
state while resizing. The native modal makes the background inert, and the
overlay explicitly wraps Tab at the ends of the control list. A summary keeps
scale visible while reducing the number of always-open fields.

## Consequences

Garden and area context remain explicit, phone users get a direct editing surface, and positioning has a keyboard alternative. Modal overlays temporarily prevent navigation outside the editor until it closes. macOS Chromium verified responsive panel modes, focus wrapping and restoration, draft retention, and coordinate saves. Mobile emulation verified the path from tapping a bed to opening the mobile editor and returning to the selected bed. The software keyboard on a physical device and 200% browser zoom remain pending.

## Reconsideration

Revisit when multi-area selection, additional garden settings, collaboration, or real usage demonstrates a need for a different mobile editing hierarchy or wider inspector.
