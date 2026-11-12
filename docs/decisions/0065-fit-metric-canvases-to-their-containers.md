# ADR-0065: Fit Metric Canvases to Their Containers

- Status: Accepted
- Date: 2026-11-11
- Refines: ADR-0054
- Authorization: the owner approved T00–T08; this implements the canvas portion of T05 in a separate, bounded batch.

## Context

Fixed logical canvas sizes and minimum metre scales can overflow narrow editors or clip large gardens. CSS stretching also risks separating pointer coordinates from rendered positions. Plants need a usable alternative when their real spacing is too small for a readable label or touch target.

## Decision

Measure each canvas container with ResizeObserver and use its actual available dimensions for the Konva Stage. Show a placeholder until both dimensions are usable. Use viewport-constrained heights of approximately 480px on desktop, 420px on tablet, and 320px on mobile; thumbnails retain a compact 168px height.

Compute one transform from the current bounds, padding, and available dimensions. Render and convert drag positions with that same transform, freezing it during an active drag and recalculating after release. Retain Focus beds and Full garden, stored metre geometry, rotation, existing boundary behavior, and 0.1m snapping. Bound grid density for very large gardens.

Keep dragging off until Move is explicitly enabled. Ordinary browsing permits vertical touch scrolling. Keep plant circles at their actual spacing scale, hide labels that do not fit, and use at least 12px text when shown. Provide full plant names as DOM buttons that open the existing editor with X/Y fields. Remove the small canvas deletion hotspot; use the confirmed, named panel action.

## Rationale and alternatives

Container measurement supports both a full-width editor and a later side panel without changing garden data. CSS-only stretching leaves two coordinate systems to reconcile. A minimum visual plant radius misrepresents spacing. Always-on dragging competes with page scrolling. A new pan/zoom system would exceed the accepted scope.

## Consequences

Resizing and switching views do not mutate stored coordinates. Small plants remain accessible by name even when their circles cannot be tapped easily. Move is an additional deliberate action before dragging. During a drag, a resized container may temporarily clip the frozen stage; release restores the fitted view using the correct metre conversion.

ADR-0066 covers the editor panels and planting-area X/Y fields. macOS Chromium verified canvas fitting, pointer drag, and saved positions after reload at 390px, 900px, and 1440px. Mobile emulation verified tapping a bed to select it. Physical-device touch gestures remain pending.

## Reconsideration

Revisit for map layers, arbitrary pan/zoom, irregular garden geometry, or user evidence that explicit Move impedes frequent placement work.
