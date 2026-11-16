# ADR-0075: Edit an Existing Garden in Three Levels

- Status: Accepted on 2026-11-16 and implemented on 2026-11-16. Superseded in
  part by [ADR-0078](0078-finish-a-garden-with-done-and-open-it-on-the-garden-level.md):
  a garden opens on Garden, Done and Delete garden sit on the title row, and
  the level bar is a strip of joined arrows.
- Date: 2026-11-16
- Supersedes in part: [ADR-0072](0072-use-a-single-plan-canvas-with-guided-setup.md):
  one side panel that holds both the area properties and the plants of the
  open area.
- Related:
  - [ADR-0072](0072-use-a-single-plan-canvas-with-guided-setup.md): the single
    canvas and the guided setup track, which this record reuses.
  - [ADR-0073](0073-separate-the-landing-page-and-use-a-textured-deep-green-look.md):
    the area panel beside the canvas and the plant-name labels.

## Context

A new garden starts with the guided setup: a four-step track (Garden size,
Planting areas, Plants, Ready) shows where the user is and what comes next.
Each step shows only its own controls on the one canvas.

An existing garden has no such structure. Opening an area shows one panel
that mixes two jobs: the area's name, size, rotation, and position at the
top, and the plant picker, Fill area, and plant groups below. The canvas
also mixes them: in the same view a drag can move a plant or the whole bed.
The project owner found this confusing after using the guided setup: adding
an area to an existing garden, or plants to an existing area, has no clear
"where am I" signal, and the Add plant control under the area properties
reads as part of editing the area.

The garden model already has three levels: a garden has a size, it holds
planting areas with a size and position, and each area holds plants with a
type and an arrangement. The guided setup already follows these levels.

## Decision

An existing garden's plan has three levels, shown as a three-part bar above
the canvas: **Garden**, **Planting areas**, and **Plants**. The bar uses the
look of the guided setup track, but it is a level switcher, not progress:

- Every level is clickable at any time, in any order.
- The current level is highlighted and marked `aria-current`.
- There is no "Step N of 4", no Continue button, and no Ready step.

The guided setup for a new garden keeps its track, its step panels, and its
Continue flow. Its Garden size, Planting areas, and Plants steps use the same
canvas rules as the matching level, so a bed does not zoom while it is placed
and is locked while it is planted, for new and existing gardens alike.

### Each level shows only its own controls

| Level | Canvas | Panel |
| --- | --- | --- |
| Garden | Areas are drawn but cannot be opened or dragged, and the area list is hidden. The garden's corner can be dragged to resize it, as in the setup's size step. | Above the canvas: garden name, width, and length; Delete garden. |
| Planting areas | The Add toolbar (Raised bed, In-ground bed, Container, Greenhouse). Areas can be selected, dragged, and resized. Selecting an area does not zoom; the whole garden stays in view so the area can be placed against its neighbours. | The selected area's name, width, length, rotation, and X and Y position; Delete area. No plant controls. |
| Plants | Areas are locked: they cannot be dragged or resized, and touch screens get no Move mode. Clicking an area zooms into it; "Whole garden" zooms out and keeps it open. Plants are placed, selected, and dragged inside the open area. | Headed "Plants": the open area's Add plant, Fill area, plant groups, and the selected plant's fields. An "Edit area size and position" link switches to Planting areas with that area selected. |

The "Edit garden details" button and its row above the canvas are removed;
the Garden level replaces them. Plants is unavailable, with a hint, while the
garden has no planting area with a size. Undo and Redo stay in the toolbar on every
level and cover all levels, as today.

### Defaults and addresses

- Opening an existing garden starts on **Plants**, the most frequent daily
  task. A garden with no planting areas starts on **Planting areas**.
- The level is part of the address, such as `?level=areas&area=<id>`, so
  reload, Back, and shared links keep it. `?area=<id>` alone keeps its
  current meaning: Plants with that area open.
- Escape closes the open area on Plants and clears the selection on Planting
  areas.

### Narrow layouts

The bar sits above the canvas at every width; below 600 px the labels
shorten to "Garden", "Areas", and "Plants". Below 900 px the selected or
open area's card sits below the canvas. On Plants it holds the plants and an
"Edit area" link that opens the area's properties on Planting areas in one
tap; on Planting areas it holds "Edit area", which opens the properties as a
dialog (768–899 px) or a full page (phones).

## Rationale

- Each level answers one question: how big is the garden, where are the
  beds, and what grows in them. One panel for one question removes the mixed
  panel the owner found confusing.
- Locking areas on the Plants level removes accidental bed moves while
  placing or dragging plants.
- Not zooming on the Planting areas level fits the task: placing a bed is
  about its neighbours, and the zoom-out toggle was only needed because the
  old panel zoomed for planting.
- Reusing the setup track's look makes the levels familiar from the first
  garden the user creates. Making it a switcher, not a progress bar, fits
  daily use: adding one tomato to bed 3 should not mean walking through
  steps 1 and 2 or seeing an unfinished "Step 3 of 4".
- The setup code already gates the canvas controls by step (size, areas,
  plants), so the levels reuse that gating rather than adding a second
  mechanism.

## Alternatives

### A linear wizard for every edit

Every addition to an existing garden would walk Step 1 to Step 3. It is
consistent with the setup, but it adds steps to small daily edits, and a
progress bar implies a flow that is unfinished whenever the user stops.

### Keep one panel and divide it more clearly

Headings or tabs inside the current panel would separate area properties
from plants. It is the smallest change, but the canvas would still mix bed
and plant dragging, and nothing would show the level the user is working at.

### A separate page for each level

Separate routes would make the levels explicit, but they would split the
single canvas that ADR-0072 established and lose the in-place zoom between
the garden and an area.

### A user setting to choose the level layout

A preference adds a setting most users never find. One clear default serves
first-time visitors, including interviewers, better.

## Consequences

- ADR-0072's single side panel is split: area properties move to the
  Planting areas level and plants to the Plants level. The canvas, the zoom,
  autosave, undo, and the guided setup stay as they are.
- Changing an area's size while planting takes one extra click, through the
  "Edit area" link.
- Unit and end-to-end tests that open an area and then edit its properties
  or plants change their steps; the responsive editor and acceptance specs
  need new checks for each level at 390, 820, 900, and 1440 px.
- The phone's full-page area editor stays; its address now carries
  `level=areas`, and Done returns to the area selected on Planting areas.
- The area properties form is no longer rendered on the Plants level. The
  guided setup's Plants step had hidden it with the `hidden` attribute, which
  the form's grid display overrode, so it showed by mistake.

## Reconsideration

- Users switch levels back and forth for most edits; the levels then cost
  more than they clarify.
- Users look for plant controls on the Planting areas level, or the reverse,
  in usability checks.
- A new garden-level capability, such as soil or irrigation zones, needs its
  own level; the bar then needs a design that scales past three parts.
