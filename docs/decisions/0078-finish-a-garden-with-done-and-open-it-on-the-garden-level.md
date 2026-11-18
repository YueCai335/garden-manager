# ADR-0078: Finish a Garden with Done and Open It on the Garden Level

- Status: Accepted on 2026-11-16 and implemented on 2026-11-16. Amended on
  2026-11-17: the guided setup's Garden size step shows Delete garden.
- Date: 2026-11-16
- Supersedes in part: [ADR-0075](0075-edit-an-existing-garden-in-three-levels.md):
  the default level (Plants), Delete garden in the Garden level's panel, and
  the setup track's look for the level bar.
- Related:
  - [ADR-0072](0072-use-a-single-plan-canvas-with-guided-setup.md): autosave
    and undo on the single canvas, which Done relies on.
  - [ADR-0073](0073-separate-the-landing-page-and-use-a-textured-deep-green-look.md):
    the page title row and the pill buttons.

## Context

ADR-0075 split an existing garden's plan into three levels: Garden, Planting
areas, and Plants. Using it, the project owner found three problems:

- **No clear end.** Every edit saves as it happens, but nothing on the page
  says "I am finished". After renaming a garden, adding a bed, or moving a
  plant, the owner looked for a place to save or close and found none.
- **A surprising start.** A garden opened from its card started on Plants. An
  owner who only wanted to rename the garden landed among the plants and did
  not know where the name was.
- **A weak level bar.** The bar reused the guided setup's track: small numbered
  circles on a thin line. Only the circle and the bold label changed with the
  level, so the current level was hard to see at a glance.

## Decision

### Done and Delete garden on the title row

The garden's title row, beside its name, holds the page's actions:

- **Done**, a primary pill button, on every level. Done means the whole
  garden is finished for now, not the current level: the levels are a
  switcher, not steps, so a per-level Done would imply an unfinished flow.
  Done checks for unsubmitted area or plant drafts and asks before discarding
  them, then returns to Gardens with "<Garden> saved.", or with a note that
  some changes are not saved when the sync state shows an error.
- **Delete garden**, a danger pill button, on the Garden level only. Each
  level deletes its own things: the garden on Garden, an area in the Planting
  areas panel, a plant in the Plants panel. Delete garden is removed from the
  Garden level's panel, so it has one home.

The guided setup keeps its own Continue and Finish setup and shows neither
button. The visible label is "Done"; its accessible name is "Done editing
<Garden>", so it stays distinct from the area panel's and plant form's Done.

### Open on the Garden level

A garden opened from its card, the garden switcher, or the breadcrumb starts
on **Garden**, the top level. The bare plan address now means Garden, and
Plants without an area is `?level=plants`. An address that names an area
(`?area=<id>`) still opens that area on Plants, because the user chose that
area.

### The level bar as joined arrows

The bar is one strip of three joined arrow shapes. Each part points into the
next, and a thin seam keeps the parts separate. The current part is filled
with the brand green, with a white number. Each part carries a one-line hint:
"Name and size", "Add and place beds", and "What grows where". Below 600 px
the hints hide and the labels shorten to "Garden", "Areas", and "Plants".
There is still no step count and no Continue.

## Rationale

- Autosave stays: Done does not save, it ends the task and confirms the save.
  This keeps undo and autosave unchanged and gives the user the closure the
  owner asked for.
- One Done for the whole garden answers "am I finished?" with one control in
  one place, whichever level the last edit was on.
- Starting on Garden matches the model's hierarchy, and the arrow bar shows
  the next level, so no separate guide or hint is needed.
- The arrow shape implies "deeper into the same garden" without the progress
  wording ADR-0075 rejected for daily edits. The filled part is visible from
  across the page.

## Alternatives

### A Done on each level

It would end each level separately. It is precise, but users cannot tell
whether finishing one level finishes the garden, and the levels are not a
sequence.

### Keep opening on Plants, with a hint

A hint such as "To rename the garden, choose Garden" keeps the shortest path
for daily planting, but it adds text to read on every visit and still lands
the user somewhere unexpected.

### Remember the last level per garden

It returns a user to where they were, but the start becomes unpredictable,
especially for a first-time visitor or an interviewer.

### Delete garden on every level, or in a "More" menu

On every level it sits beside plant work where it is never needed and is easy
to hit by mistake. A menu hides the only other action on the row.

### A single capsule or tabs joined to the panel

Both were shown as clickable mockups. The capsule is calmer but has a weak
sense of direction; the tabs tie the bar to the panel but read as unrelated
sections. The owner chose the arrows.

## Consequences

- Adding a plant from a garden's card takes one more click (Plants). Area
  links in the area list and Care still open their area on Plants directly.
- Unit and end-to-end tests that opened a garden and went straight to its
  plants first switch to Plants; the address of the Garden level is now the
  bare plan address.
- The app shell offers a slot on the page title row; only the garden page
  uses it.
- The "<Garden> saved." message appears where the Gardens page already shows
  its messages, below the garden cards.

## Reconsideration

- Users who open a garden go to Plants almost every time, and the extra click
  costs more than the clearer start.
- Users press Done expecting to stay on the page, or look for a per-level
  Done, in usability checks.
- A fourth level makes the arrow strip too narrow on phones.

## Amendment 2026-11-17: Delete an Unfinished Garden

The owner started a new garden, stopped halfway, and found no way to delete
it. The guided setup showed neither title-row button, so the only path was to
finish the setup first.

The guided setup's **Garden size** step now shows **Delete garden** on the
title row, the same danger pill in the same place as on the Garden level.
Garden size is the setup's Garden level, so the rule "each level deletes its
own things" still holds. The other setup steps do not show it, and the setup
still shows no Done. Completed steps stay clickable, so a user on a later step
reaches Delete garden with one click on Garden size. Deleting uses the same
confirmation and checks as before, and it also ends the guided setup for that
garden.
