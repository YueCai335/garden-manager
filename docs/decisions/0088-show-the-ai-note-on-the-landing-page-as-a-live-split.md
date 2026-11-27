# ADR-0088: Show the AI Note on the Landing Page as a Live Split

- Status: Accepted on 2026-11-25. Amended on 2026-11-26 (instant split in
  numbered color blocks; see the amendment below).
- Date: 2026-11-25
- Amends: [ADR-0073](0073-separate-the-landing-page-and-use-a-textured-deep-green-look.md)
  (phase S6b): the form of the AI Note showcase was left open. This ADR
  decides it for the AI Note section only.
- Related:
  - [ADR-0084](0084-show-the-garden-plan-on-the-landing-page-as-an-exploded-build.md):
    the Garden Plan showcase. This section shares its frame, step cards, and
    white stage, and changes the outline.
  - [ADR-0085](0085-split-one-garden-note-into-reviewed-records-across-gardens.md):
    the note workflow the showcase demonstrates.
  - [ADR-0087](0087-focus-the-portfolio-release-on-garden-operations-and-ai-notes.md):
    AI Garden Note is the sole featured AI workflow of the release.
- Approved mockup: [design/landing-ai-note-section/note.html](../../design/landing-ai-note-section/note.html)
  (v3, stacked layout).

## Context

The AI Note section of the landing page is a placeholder with a title, three
bullet points, and a "Try it" link. It sits directly after the Garden Plan
showcase. ADR-0087 makes AI Garden Note the one featured AI workflow, so this
section carries the product's AI story for a first-time visitor such as an
interviewer.

The owner wants the section to look as striking as the Garden Plan showcase,
in the same design family, without reading as a copy of it. The section went
through three mockup rounds on 2026-11-25.

## Decision

The AI Note section is a **stacked** showcase: a short textured strip on top
and a wide white stage below, inside the same 16 px textured frame as the
Garden Plan section.

1. **Strip.** A 172 px textured strip holds the kicker "02 AI Note" and the
   headline on the left, and three frosted step cards in a row on the right:
   01 Write it your way, 02 AI splits it into records, 03 You review, then
   save. The active step brightens, as in the Garden Plan section.
2. **Stage.** A white stage with the faint dot grid. One centered group, at
   most 940 px wide, holds the note card on the left, the record cards on the
   right, and the wires between them. A row of sample notes sits above the
   group, and the "Try it" and "Replay" buttons and the save bar sit below it,
   all aligned to the group's edges.
3. **Green on the white stage.** The note card is a dark card cut from the
   same leaf photo, with white display type. The record cards stay white. The
   selected sample, the wires and their end dots, "Try it", the save button,
   and the "Saved" status are the content brand green. The dot grid stays a
   hue-free grey.
4. **Sequence.** The note types out. A "Read note" chip pulses. Each phrase
   lights in its care type color, a green wire draws from the note card's
   edge at that phrase to a record card, and a small dot runs along the wire.
   Each card shows its care type, garden, and details, starts as "Review",
   and turns "Saved" after the save button is pressed. A watering card shows
   the due task it completes. Step cards follow the sequence.
5. **Samples.** Three fixed sample notes, each spanning one or two gardens,
   labeled "Sample notes · pre-recorded". Choosing one plays it. The showcase
   never calls the note API; "Try it" opens the real note page.
6. **Playback.** It plays once when the stage scrolls into view and stops on
   the saved state. "Replay" plays the current sample again. With
   `prefers-reduced-motion`, or without IntersectionObserver, the section
   shows the saved state without motion.
7. **Mobile.** At 860 px and narrower the strip stacks its headline above the
   step cards, and each step shrinks to one line. The note card sits above the
   record cards and the wires are hidden; the phrase colors and the card
   icons keep the link. Nothing scrolls sideways at 390 px.
8. **Color.** Deep green, the care type colors from `tokens.css`, and
   neutrals. The section does not use the lime accent.

## Amendment: Instant Split in Numbered Color Blocks (2026-11-26)

The owner found the typed note too slow: a visitor who scrolls to the section
should see at once how the note splits. Items 3, 4, 7, and 8 change as
follows, and everything else stands.

- **No typing.** The note shows in full when the stage comes into view. The
  first phrase splits off at 0.3 s and the next ones every 0.4 s, so a
  three-record note is fully split in about 1 second. Review and save follow
  as before, and the sequence ends after about 3 seconds instead of about 11.
- **Numbered blocks.** Each phrase waits as a faint outlined block with its
  number. When it splits off, it fills solid in its block color with dark
  text. Its record card shows the same number in the same color, with a
  colored bar on its left edge.
- **Block colors by position.** Block 1 is sky (`#7fd3f5`, deep `#1b9fd6`),
  block 2 is sun (`#ffd166`, deep `#e3a008`), and block 3 is coral
  (`#ff9478`, deep `#ec5f3b`). The bright tone fills the block on the dark
  note card; the deep tone draws the wire, its end dots, the card's number,
  and the card's left bar. The owner chose these over the care type colors,
  which read as dull and dark on this section. Colors follow the block's
  position, not its care type, so each sample has at most three records.
  The app's care type colors in `tokens.css` do not change.
- **Wires.** Each wire takes its block's deep color instead of brand green.
  Buttons, the selected sample, and the "Saved" status stay brand green.
- **Mobile.** Without wires, the matching numbers and colors link each block
  to its card.

The owner compared three color options in an inline mockup on 2026-11-26 and
chose solid blocks (option C) over outlined tints.

## Rationale

- A note that visibly turns into reviewed records shows the workflow in one
  motion: free text in, structured records out, nothing saved until review.
- Garden, area, plant, and the completed due task on each card show that the
  output is matched to the gardener's own data, which a chat demo cannot show.
- The stacked outline answers the owner's main concern. The frame, step cards,
  and white stage tie the two sections together, while a top strip instead of
  a left slab gives this section its own silhouette.
- The dark note card puts green on the right side of the page and gives the
  input and the output different materials.
- Fixed samples cost nothing per visit, cannot be abused, and always play
  the same way. The "pre-recorded" label keeps the demo honest.
- Measured wires follow the real card positions, the same approach as the
  note page's split (ADR-0085).

## Alternatives Considered

### Records land on a garden plan

Record tags fly onto a small garden plan. It links the section to the Garden
Plan section, but two plans in a row leave the AI Note without its own look.

### Leaf-vein glass stage

The first round. The footer's leaf-vein photo filled the stage, with glass
cards and lime wires. The owner preferred a white stage.

### Same layout as the Garden Plan section, or mirrored

The second round offered both. The original read as a copy of the section
above it. The mirrored layout cramped the wires between the note and the
cards.

### A live AI demo on the landing page

It would show real output, but it would spend the public note budget on
every visit and could show a slow or failed call on the first impression.
The real demo stays one click away.

## Consequences

- The landing page has two animated showcases built on the same frame and
  step card styles.
- The sample notes and their records are fixed data in the landing code. They
  do not follow the workspace, so demo changes cannot break the landing page.
- The landing tests cover the end state, reduced motion, sample switching,
  and the absence of API calls.
- The hero still image is reused for the note card texture, so the section
  adds no new image download.

## Reconsideration

Revisit if the note page's review screen changes its record fields or
wording enough that the showcase no longer matches the product, or if ADR-0087
release work reorders the landing sections.
