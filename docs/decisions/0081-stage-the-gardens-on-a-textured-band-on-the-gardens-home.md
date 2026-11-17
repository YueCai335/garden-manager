# ADR-0081: Stage the Gardens on a Textured Band on the Gardens Home

- Status: Accepted on 2026-11-16. Implemented on 2026-11-17 (H1–H4 of the plan).
- Date: 2026-11-16
- Supersedes in part:
  - [ADR-0073](0073-separate-the-landing-page-and-use-a-textured-deep-green-look.md):
    the 2026-11-16 amendments "Care to do" (the Overdue, Today, and Coming up
    groups on the Gardens page) and "Gardens fill the page" (the 300 px side
    column and the narrow-screen order).
  - ADR-0080 (Care as a Today board): its plan says the Care progress bar is
    the only lime element in the app and that the display font appears in two
    places. This ADR adds the Gardens home to both rules.
- Related:
  - [ADR-0023](0023-keep-care-history-as-completed-record.md): ticking a task
    writes one history record. This stays.
  - [ADR-0076](0076-color-each-plant-type-from-a-shared-muted-palette.md):
    plant colors. The garden cards reuse them unchanged.
- Implementation plan: [docs/garden-home-redesign-plan.md](../garden-home-redesign-plan.md)
- Approved mockup: [design/garden-home-redesign/](../../design/garden-home-redesign/)

## Context

Gardens is the first page of the app. It shows the garden thumbnails, the
care that is due, and the AI Garden Notes entry. The owner raised two problems
on 2026-11-16.

- The boxes do not line up. The "Care to do" box starts at the section
  heading, and the garden cards start below the heading and the Add garden
  button.
- The page is top-heavy and flat. The app bar is deep green, and everything
  below it is white cards on a gray page. The owner called this look "light"
  and "AI-made", and asked for the textured deep green of the landing hero
  further down the page, without a new color and without a flat color block.

The owner had just approved the Care redesign (ADR-0080), which puts a
textured band behind today's tasks, and wanted the Gardens page to belong to
the same family.

## Decision

The Gardens home has two stacked blocks on one grid.

1. **Gardens.** A dark band with the landing hero's leaf texture carries the
   date, the title "Your gardens", one line of totals, and the Demo garden
   button. The garden cards stand half on the band and half on the page: the
   grid has a negative top margin, so the band supports the first row and does
   not enclose it. Each card shows the plan thumbnail, the garden name, a line
   of counts, up to three plant names with their plan colors, and a label for
   today's open care. The last grid cell is a dashed "New garden" card. It is
   the only way to add a garden on this page.
2. **Today and AI Garden Notes**, side by side as two separate blocks.
   - Today is a white card with a textured date tile (weekday, day number,
     month, and today's progress) and a list of today's care only: overdue
     tasks, tasks due today, and care already recorded today. Rows are ticked
     off in place as before. The "Coming up" group leaves this page.
   - AI Garden Notes is a dark block with the landing footer's leaf-vein
     texture. A white sheet of ruled paper lies on it. The paper is the
     existing textarea, so the block reads as a place to write. The existing
     Generate draft and Open note editor actions sit below the paper.

The guiding rule is that the green supports the subject of the page. On
Gardens the subject is the gardens. On Care it is today's tasks.

Phones show the gardens first, as short horizontal rows, then Today, then the
note block.

## Rationale

- One grid fixes the alignment. Every block starts and ends on shared lines.
- Three textured pieces (top band, bottom-left date tile, bottom-right note
  block) spread the dark tone down the page, which answers "top-heavy".
- Real photographs carry the green. The owner has rejected flat green areas
  and drawn textures before (ADR-0073).
- The half-step keeps the gardens as the subject without boxing white cards
  inside a dark frame, which the owner found disharmonious in the first
  round.
- Today-only care keeps this page distinct from Care, which owns the
  seven-day view.
- Ruled paper is a familiar object. The owner said the earlier note designs
  did not show at a glance that the block is for writing.

## Alternatives Considered

The mockups for these are in `design/garden-home-redesign/explorations/`.

- **A dark side rail** holding Care and the note entry together (round 1, A).
  Rejected: the two features read as one, and the gardens stayed flat.
- **Garden cards fully inside a dark band** (round 1, B). The owner liked the
  idea that the green belongs to the gardens. Rejected in this form: the band
  became a frame around white boxes.
- **A Care-style Today band on top with a note strip at the bottom** (round 1,
  C). Rejected: it repeats the Care page and pushes the gardens down.
- **A textured name plate on every garden card** (round 2, 2). Not chosen:
  the dark tone breaks into many small pieces.
- **A dark title panel beside a 2 × 2 garden grid** (round 2, 3). Not chosen:
  the panel takes a third of the width for a title and three numbers.
- **A notepad with a green binding strip** for the note block (round 2). Not
  chosen: the owner preferred the paper lying on the green.

## Consequences

- The page loads two texture images that the landing page already uses. They
  are CSS backgrounds with a solid dark fallback.
- The lime accent now has one meaning in the app, today's care progress, in
  two places: Care and the Gardens home. The display font appears in three
  more places: the band title, the date number, and the note title.
- With more than three gardens, only the first row stands on the band. The
  dashed card can sit alone at the start of a row.
- Upcoming care is no longer visible on Gardens. Care shows it.
- Narrow screens no longer lead with care. The garden rows are short so Today
  stays within one or two scrolls.
- Several unit and end-to-end tests assert on the old region names, the
  column counts, and the order of blocks. The plan lists them.
- The design tokens and the shared font declaration overlap with ADR-0080.
  Whichever feature is built first adds them.

## Reconsideration Conditions

- A user keeps many gardens (around eight or more), and the page becomes a
  long list before Today. Then consider a compact list or a "show all" fold.
- Users miss the upcoming tasks on this page.
- The two texture images measurably slow the first paint of the app.
- The landing hero changes its texture or color. The bands follow it.
