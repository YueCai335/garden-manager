# ADR-0072: Use a Single Plan Canvas with Guided Setup

- Status: Accepted; G1 (presentation), G2 (zoom into an area), G3 (plants on the main canvas), G4 (direct area placement), and G5 (autosave and undo) implemented, G6–G7 pending
- Date: 2026-11-12
- Supersedes in part, as each phase lands: [ADR-0048](0048-place-garden-properties-above-the-plan-canvas.md), [ADR-0053](0053-keep-plant-layout-in-the-planting-area-inspector.md), [ADR-0054](0054-use-fixed-canvas-garden-plan-views.md), [ADR-0066](0066-adapt-area-editing-to-available-space.md), and [ADR-0070](0070-preview-and-position-planting-areas-on-the-plan.md)
- Amends for Garden Plan edits, in phase G5: [ADR-0052](0052-show-save-actions-only-for-pending-edits.md) and [ADR-0062](0062-preserve-planting-area-editor-drafts.md)
- Related: [ADR-0014](0014-use-metric-planting-layouts-with-grid-snapping.md), [ADR-0038](0038-link-current-plantings-to-layout-positions.md), [ADR-0055](0055-use-automatic-sync-with-optimistic-locking.md), and [ADR-0065](0065-fit-metric-canvases-to-their-containers.md)
- Implementation plan: [Garden Plan single-canvas plan](../garden-plan-single-canvas-plan.md)
- Prototype: clickable HTML prototype reviewed and approved by the owner on 2026-11-12

## Context

Every downstream feature depends on the drawn garden. Care events, care tasks,
health records, AI garden notes, and season plans reference a planting area or
a plant group. A plant group is created from the plants placed in an area
(ADR-0038). Users therefore need to finish drawing a garden before the rest of
the product becomes useful.

The owner reports that drawing a garden is the most confusing workflow in the
product. The current editor splits the work across two canvases with two
scales. The Garden Plan canvas moves area rectangles. Plants are placed on a
second canvas inside the planting-area inspector, which appears as a side
column, a modal, or a full page depending on width. Moving an area requires
the Move mode. Area properties use drafts and an explicit Save. A planting
area can exist without a layout, which shows as "Layout needs setup". New
gardens collect only a name, and nothing shows the user how many steps remain.

Six records (ADR-0048, 0050, 0053, 0054, 0066, and 0070) relocated or refined
this editor. Each solved a local layout problem, and the two-canvas structure
remained.

A review of two comparable products informed the direction. Native Garden
Planner uses one scaled canvas: selecting a bed keeps it on the same plan,
plants are placed directly on the plan, a hint line states the next action,
and warnings about crowding never block an edit. Sunplot uses a numbered step
flow with a progress bar, and its area buttons drop a ready-made shape that the
user then adjusts. Both products end at the drawing. This product starts
there.

The data model already supports one canvas. Plant allocations are stored in
area-local metre coordinates. Each area stores its plan position and rotation.
`GardenPlanOverview` already draws plants inside their areas. The change is an
interaction change and needs no API or database migration.

## Decision

### One canvas

Garden Plan has one metric canvas. Selecting an area to plant zooms the same
canvas to frame that area, dims the other areas, and shows a "Whole garden"
control. Plants are placed, selected, moved, and removed directly on this
canvas. The second plant canvas in the inspector is removed. The side panel
holds controls and text: the area properties, the plant picker, warnings, and
the area's plant groups.

Pointer positions convert to area-local coordinates through the inverse of the
area's plan placement and rotation. The saved model keeps metres and the
existing allocation format.

### Where the controls sit at each width (phase G3, decided 2026-11-12)

The canvas must stay visible while plants are placed, so the panel follows the
available width:

- Wide layouts (an editor container of at least 1080px) keep the side column
  with the area properties and the planting controls together.
- Narrower layouts show the planting controls directly below the zoomed canvas
  with the area name, type, and size. "Edit area" opens the area properties in
  the existing modal (medium widths) or full page (phones).
- `?area=` means "zoomed into this area" at every width and survives reload.
  `&edit=area` opens the properties editor on narrower layouts. An unsaved
  properties draft keeps that editor open and adds `&edit=area`, so resizing
  or navigating never hides typed values.

The owner chose this over moving every width to a side column, which would
narrow the canvas at medium widths and remove the modal form entirely.

Suggested plant spacing comes from University of Missouri Extension G6201,
Table 1 (in-row spacing), cross-checked against University of Maine
Cooperative Extension's home vegetable planting chart. Plants missing from
both tables have no suggestion.

### Direct manipulation

- An area type button (raised bed, in-ground bed, container, greenhouse)
  places an area at its standard size in the first free position. A new area
  always has a rectangular layout.
- With a mouse or pen, a selected area moves by dragging its body and resizes
  by dragging its corner handle. The six-pixel threshold, snapped preview, and
  Escape cancellation from ADR-0070 remain.
- With touch, the explicit Move mode remains, so page scrolling over the canvas
  still works. Tap selects an area.
- Coordinate fields and step buttons remain as the non-drag alternative.
- A selected plant type shows a spacing ring that follows the pointer. A click
  inside the area places one plant. "Fill" places that plant on a grid at its
  spacing and skips occupied positions.
- Overlapping areas, crowded plants, and plants outside their area produce
  warnings. They never block an edit.
- Existing areas without a layout appear in a "Needs a size" list with a
  "Place on plan" action. The product does not invent sizes for existing data.

### How direct placement works (phase G4, implemented 2026-11-14)

- The four type buttons sit in the plan toolbar and read "Raised bed 1.2 ×
  2.4 m", "In-ground bed 2 × 3 m", "Container 0.6 × 0.6 m", and "Greenhouse
  2.5 × 3 m" (width × length). The type labels across the product use the same
  words; the earlier "In-ground area", "Container group", and "Greenhouse
  shelf" labels described the same stored kinds.
- A new area gets the next unused name, such as "Raised bed 2", and the plan
  zooms into it (`?area=`). The free-spot search (`src/lib/areaPlacement.ts`)
  tries positions on a half-metre grid in reading order, keeps 0.3 m from every
  sized area (using its rotated outline's bounding box), then accepts
  positions that only touch. A full garden centres the area and the message
  says it overlaps; a garden smaller than the standard size shrinks the area
  to the garden and says so.
- Mouse and pen drag areas directly in the whole-garden view and the zoomed
  area in the zoomed view; dimmed neighbours stay fixed. A press that moves
  less than six pixels is still a click that zooms. The corner handle appears
  on the zoomed rectangular area, snaps to 0.1 m, keeps at least 0.1 m, and
  stops an unrotated area at the garden edge. Plant centres stay inside a
  smaller area, as with the properties form.
- The Move button appears only when the primary pointer is coarse
  (`(pointer: coarse)`). On a hybrid device, a touch drag outside Move mode is
  stopped so the page scrolls.
- "Place on plan" gives an unsized area its type's standard size at a free
  spot with no rotation, because an area without a size has never been drawn
  rotated.
- Overlap uses the areas' rotated outlines (a separating-axis test); outlines
  that only touch do not count.

### Saving and undo (phase G5)

Each finished drag, placement, removal, or fill is one workspace change and
goes through the existing revision-checked sync (ADR-0055). Area property
fields apply on blur or Enter after validation, and the area form drops its
Save button. Undo and Redo cover Garden Plan changes in the current tab. Undo
writes a new forward revision; it never rewinds server revisions. History
clears on a garden change, a reload, or a sync conflict.

### How autosave and undo work (phase G5, implemented 2026-11-14)

- Every Garden Plan edit (add, place, move, resize, delete, or change an
  area; place, move, fill, add, edit, duplicate, or remove a plant; change
  the garden's size or name) goes through one recording function. It keeps
  the whole garden before and after the action. Updates made in the same task
  merge into one step, so a removed plant and its archived planting record
  undo together. The history keeps 100 steps.
- Undo and Redo write the stored garden as a new change through the normal
  revision-checked sync. A step applies only when the garden still equals what
  that step left behind. Any other change to the garden (a next-season choice,
  a care record, another tab) makes the history stale; Undo then clears it and
  says so instead of overwriting that change. A sync conflict clears it at once
  with its own message. The history lives in the workspace provider, so moving
  between pages in the same tab keeps it; another garden starts a new one.
- The Undo and Redo buttons sit in the Garden Plan header with the name of the
  step in their tooltip. Ctrl/⌘ Z undoes and Shift+Ctrl/⌘ Z or Ctrl+Y redoes,
  except in text fields, which keep the browser's own undo, and while a dialog
  is open.
- Area properties and the selected plant's fields apply when a field loses
  focus or on Enter; the area type and the 0.1 m step buttons apply at once.
  A value that fails validation stays in the field with its error and changes
  nothing. Undo replaces G3's "Undo fill" button. Undoing the step that added
  the zoomed area returns the plan to the whole garden.
- Garden details (name and size) keep their Save button until the guided
  setup in G6 revisits them; their saves are still undo steps.

### Guided first-run setup (phase G6)

A newly created garden opens Garden Plan with a four-step progress track above
the same canvas: Garden size, Planting areas, Plants, and Ready. The track
shows "Step N of 4", completed steps with a check, and the current step with an
emphasized marker. Completed steps are reachable; later steps are not. Garden
size offers common presets and a draggable boundary corner. Ready summarizes
the areas, plants, and plant groups, and links to logging the first watering,
writing a Garden Note, and planning the next season. After Ready, the track
disappears and the page is the normal Garden Plan editor. A garden with no
areas offers "Start guided setup". Guide progress uses session state, like the
current setup flag, and adds no stored field.

### Presentation (phase G1)

- The plan dimensions read Width and Length. The data field `depthMeters` keeps
  its name; only the label changes. Height is not part of this record.
- Raised beds show light soil inside a heavy wooden frame. In-ground beds show
  dark soil with a dashed edge. Containers are round, and greenhouses use a
  glass fill with a ridge line.
- Area names sit above the area outline and truncate to its width, with the
  full name available as accessible text. Dimensions sit below the selected
  area. Labels never cover plants.

## Rationale

- One canvas gives the user one scale and one place to look. The user stays
  oriented in the garden while planting a bed.
- Dropping a standard shape removes the empty first step and the half-finished
  area state. Adjusting a shape is easier than filling a form before seeing
  anything.
- Warnings that never block keep the user moving while still showing the
  problem.
- The guided steps answer "what do I do now" for a first-time user and
  disappear once they have done it once.
- Linking Ready to care, notes, and season planning connects drawing to the
  features that make the drawing worth doing.
- The existing data model and sync carry the change, so the risk stays in the
  frontend.

## Alternatives

### Keep the inspector canvas and add a step guide

A guide on top of the current editor shows progress, but the two-scale
switching that confuses users remains.

### Copy a full design tool (layers, free polygons, hardscape materials)

Native Garden Planner targets designers. These tools add weight that care
logging and season planning do not need. Rectangular areas match the current
model.

### A separate multi-page setup wizard

Sunplot moves through separate pages. Users would learn a wizard and then a
different editor. Steps on top of the real canvas teach the editor itself.

### Persisted undo history

Server-side history adds schema, retention, and conflict rules. Tab-scoped undo
covers the common mistake of an accidental drag or fill.

## Consequences

- Plant editing moves from `GrowingAreaLayoutEditor`'s own canvas onto
  `GardenPlanOverview`. Unit tests and the browser journeys for plant drag and
  draft protection (`draft-protection.spec.ts`, `responsive-editor.spec.ts`,
  `responsive-canvas.spec.ts`, `garden-flow.spec.ts`) need rewriting.
- Area-local coordinate conversion with rotation becomes shared logic with its
  own unit tests.
- Mouse and touch have different move behavior. Tests cover both.
- Removing the area Save button changes ADR-0052 and ADR-0062 behavior for
  Garden Plan only. Care, notes, and health keep their review and Save flows.
- Undo issues extra revisions. Every undo is visible in sync status like any
  other change.
- Old areas without a layout still need one user action before they appear on
  the plan.
- Each superseded record is marked when the phase that replaces it lands, so
  the records describe what the product actually does at each commit.

## Reconsideration

- Usability checks show users still cannot finish a first garden without help.
- Users need irregular shapes, layers, or hardscape that rectangles cannot
  express.
- Touch users report that the Move mode is still hard to find after G4.
- Undo conflicts with multi-device editing often enough to need server history.
- Large gardens with many plants make one Konva canvas slow on phones.
