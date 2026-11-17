# ADR-0082: Show Next Season as a Rotation Sheet with a Dark Plan Lane

- Status: Accepted on 2026-11-16. Not implemented yet.
- Date: 2026-11-16
- Supersedes in part:
  - [ADR-0039](0039-use-separate-season-plans-for-future-planting.md): the
    presentation of the planner. The area cards, the folded plan preview with
    labelled circles and area names, and the all-gardens default are replaced.
    The data model and the save rules stay.
  - [ADR-0056](0056-use-a-budgeted-tool-calling-agent-for-season-allocation.md):
    the placement of the Allocation Assistant as a panel inside each garden
    section. It opens from a button. The agent, its limits, and its request
    stay.
  - [ADR-0073](0073-separate-the-landing-page-and-use-a-textured-deep-green-look.md)
    (phase S3): a garden's season plan was the all-gardens list filtered to
    that garden. `/season` now always shows one garden. The redirect from
    `/gardens/[gardenId]/season` stays.
  - [ADR-0081](0081-stage-the-gardens-on-a-textured-band-on-the-gardens-home.md):
    its count of the places that use the display font. This ADR adds two.
- Related:
  - [ADR-0025](0025-use-three-season-crop-rotation-warnings.md) and
    [ADR-0037](0037-use-area-summary-and-pairing-notes-for-season-planning.md):
    the three-season window, advisory guidance for every area kind, and
    source-backed pairing notes. These rules stay.
  - [ADR-0057](0057-keep-live-allocation-runs-closed-after-evaluation.md): the
    public demo shows a recorded run. This stays.
  - [ADR-0076](0076-color-each-plant-type-from-a-shared-muted-palette.md):
    plant colors. The sheet and the map reuse them.
  - ADR-0080 (Care as a Today board): the lime accent means today's care
    progress. This page does not use it.
- Implementation plan: [docs/season-redesign-plan.md](../season-redesign-plan.md)
- Approved mockup: [design/season-redesign/](../../design/season-redesign/)

## Context

Next Season is where the gardener chooses what each planting area grows next
year, guided by a three-season crop rotation check. The page stacks every
garden. Each planting area is a card with the same four blocks of text: last
season, a rotation sentence, the plan, and a button. The demo shows 19 such
cards. The plan preview, the rotation history, and the Allocation Assistant
sit behind disclosure arrows.

The owner raised these problems on 2026-11-16.

- The page is flat and reads like an article, not like a plan. Nothing can be
  understood at a glance.
- The deep green stops at the app bar. The owner wants more of it on the page.
- The page has no real blocks. Folding content behind arrows feels odd.
- The page carries more functions than it needs. The owner asked for cuts.

The owner had approved the Care redesign (ADR-0080) and the Gardens home
redesign (ADR-0081) the same day and asked for the same family of design.

## Decision

Next Season shows one garden at a time as a **rotation sheet** beside a small
map.

1. **Garden switch.** A row of links replaces the dropdown. Each link shows
   the garden name and its progress, for example `Backyard 3/10`. The
   `?garden=` parameter still owns the choice. `/season` without it shows the
   first garden.
2. **Rotation sheet.** One row per planting area. The columns read left to
   right: the area, what it grew in the last three seasons, the crop families
   it should rest from, and the plan for next year. Plants appear as a color
   dot and a name. Families appear as small tags.
3. **Plan lane.** The plan column is one dark slab with the landing hero's
   leaf texture. It stands out of the white sheet above, below, and on the
   right. Its head carries the year in the display font, a white progress
   bar, and the count of planned areas. Chosen plants are white text on the
   lane. An area without a plan shows a dashed "Choose a plant" button.
4. **Choosing in place.** The existing plant form opens inside the lane cell
   as a white field on the green. The crop-family inference and the manual
   override work as before. One form is open at a time.
5. **Repeat tag.** A planned plant whose crop family the area grew in the last
   three seasons carries a tag such as "Root crop again". The lane head counts
   these as "1 to check". The tag informs and never blocks a save.
6. **Map.** A card beside the sheet shows the garden's planting areas, always
   open. Each area carries its row number. A planned area is drawn solid with
   one circle per planned plant type. An area without a plan is dashed.
   Pointing at a row highlights its area, and the reverse.
7. **Plan with AI.** One button in the sheet head opens the Allocation
   Assistant in a drawer. The page shows nothing of it until then.

Narrow screens cannot hold a side lane. Below 860 px the lane head becomes a
dark tile on top and each area becomes a short white card.

These parts leave the page: the all-gardens view, the "Rotation details" and
"Plan preview" disclosures, the planting dates in the history list, the
always-visible "Good rotation fit" list, the "Planting areas / Full garden"
toggle, and the plant labels inside the map circles. Companion notes show only
when the chosen plants produce one.

## Rationale

- Crop rotation is a before-and-after relation. A row that reads "grew this,
  rest from that, next year this" shows it without a sentence.
- The green supports the subject of the page, as on Care and Gardens. Here the
  subject is next year's plan, so the green is the plan column. It is a new
  shape and does not repeat the bands of the other two pages.
- A slab that overlaps the sheet avoids white cards boxed inside a dark frame,
  which the owner rejected on the Gardens home.
- One garden at a time turns 19 cards into at most ten rows and lets the map
  stay open.
- Row numbers tie the sheet to the map without hover and without long labels
  that collide on small areas.
- The plan data, the rotation rule, the form logic, and the agent stay. The
  change is presentation, so the risk is in layout and tests.

## Alternatives Considered

- **Map first** (direction B): a large clickable map with a side panel for the
  selected area. Not chosen: small containers are hard to hit, it works poorly
  on phones, and it hides what each area grew before.
- **Map and list with a dark year tile** (direction C). Not chosen: the green
  shrinks to one tile and the page stays flat.
- **A permanent dark block for the Allocation Assistant** at the bottom of the
  page. The owner preferred a button. In the public demo the block would also
  show a notice instead of a working tool.
- **One column per year** (2024, 2025, 2026). Not chosen: most gardens have one
  season of records, so two columns would be empty.
- **A lime progress bar.** Not chosen: lime means today's care progress
  (ADR-0080, ADR-0081).
- **Keeping the all-gardens view** as a second mode. Not chosen: it brings back
  the long page and a second layout to maintain.

## Consequences

- The gardener cannot see two gardens' plans side by side. The switch shows
  each garden's progress instead.
- Planting dates are no longer on this page. The year and the plant remain.
- The map is small. It answers "which area is this row" and "what goes
  where", and the Garden Plan stays the place for detail.
- Phones and tablets lose the lane. The dark tone there is the head tile only.
- The page loads two texture images that the landing page already uses.
- The display font appears in two more places: the year on the lane and the
  drawer title.
- Unit and end-to-end tests assert on the dropdown, the disclosures, the page
  heading, and the area cards. The plan lists them. The README screenshot of
  this page changes.
- The Allocation Assistant keeps its logic. Its heading and form controls are
  restyled for the drawer.

## Reconsideration Conditions

- A garden has around twenty or more planting areas, and the sheet becomes a
  long scroll with the map out of view.
- Gardeners keep three full seasons of records, and the single history column
  becomes crowded. Then consider one column per year.
- Users ask to compare or copy plans between gardens.
- The AI features are redone for the three demo gardens. Then revisit where
  the assistant lives.
- The landing hero changes its texture or color. The lane follows it.
