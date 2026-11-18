# ADR-0084: Show the Garden Plan on the Landing Page as an Exploded Build

- Status: Accepted on 2026-11-18. Not implemented. The owner asked to build it
  together with the AI Note section once that section is designed.
- Date: 2026-11-18
- Amends: [ADR-0073](0073-separate-the-landing-page-and-use-a-textured-deep-green-look.md)
  (phase S6b): the form of the Garden Plan showcase was left open. This ADR
  decides it for the Garden Plan section only. The AI Note, Plant AI, and
  Season Planner sections stay open.
- Related:
  - [ADR-0075](0075-edit-an-existing-garden-in-three-levels.md): the three
    levels of a garden (garden, planting areas, plants). The showcase shows
    the same three levels.
  - [ADR-0076](0076-color-each-plant-type-from-a-shared-muted-palette.md):
    plant colors. The showcase reuses them.
  - [ADR-0081](0081-stage-the-gardens-on-a-textured-band-on-the-gardens-home.md)
    and [ADR-0082](0082-show-next-season-as-a-rotation-sheet-with-a-dark-plan-lane.md):
    the family of textured deep-green blocks on white.
- Approved mockup: [design/landing-garden-section/garden.html](../../design/landing-garden-section/garden.html)

## Context

The landing page stacks one full-width section per feature: Garden Plan,
AI Note, Plant AI, and Season Planner. Each section is a placeholder with a
title, three bullet points, and a "Try it" link. The Garden Plan section is
the first thing a visitor sees after the hero.

The owner wants the four sections to impress an interviewer at first sight
("酷炫、帅气、镇住人"), in the same design family as the Gardens home, Care,
and Next Season pages. The Garden Plan section went through four mockup rounds
on 2026-11-18.

## Decision

The Garden Plan section is a white card inside a textured deep-green frame.
A textured slab on the left holds the text. The right side plays a 2.5D
**exploded build** of a sample garden.

1. **Layout.** The card is 720 px tall at desktop width. A 16 px textured
   frame surrounds it. The left slab (about 380 px wide) holds the kicker
   "01 Garden Plan", the headline "Draw your garden to scale.", three step
   cards, a one-line summary, and the "Try it" and "Replay" buttons. The right
   side is white with a faint dot grid. Both textures are the hero's leaf-ridge
   photo under a light wash, so the green reads clearly and never as black.
2. **Steps.** Three frosted-glass step cards, each with a number:
   01 Draw your garden, 02 Add planting areas, 03 Plant at real spacing.
   The active step brightens.
3. **Scene.** A 10 × 6 m sample backyard, drawn in the plan's own style in a
   symmetric 45° isometric view:
   - Layer 01, the garden: a white plan sheet with thickness, a grid, a green
     boundary drawn as a line, the dimension lines "10 m" and "6 m", and a
     "Backyard" label.
   - Layer 02, planting areas: two raised beds as wooden boxes, two pots as
     cylinders, and a flat dashed in-ground bed. Each one shows its name and
     size as it lands.
   - Layer 03, plants: circles sized by plant spacing in the plant colors. Each
     crop group lands together with its name label (for example "Tomato ×3"),
     so plants and names read as one layer.
4. **Sequence: build, explode, close.** The garden builds step by step on one
   level. The three layers then lift apart over glass shelves with soft
   shadows, and the camera pulls back slightly. A numbered marker pinned to
   each layer's outer corner ("01 Your garden", "02 Planting areas",
   "03 Plants") lights up in turn, together with its step card and its shelf.
   The layers then close into the finished plan, and the summary "One plan,
   from the whole garden down to every plant." appears.
5. **Playback.** The animation plays once when the section scrolls into view
   and stops on the finished plan. "Replay" plays it again. With
   `prefers-reduced-motion`, the section shows the finished plan without
   motion.
6. **Labels.** Labels keep one screen size while the scene zooms. They are
   small solid-white pills with a hairline border: 12 px for plant and area
   names, 13 px for layer markers, and 10.5 px grey dimension text. A hairline
   stem and a green pin dot attach each label to its object.
7. **Mobile.** Below the desktop layout, the slab stacks above the scene. The
   three steps shrink to one short line each, so the garden appears soon
   after the headline instead of below a tall block of text.
8. **Color.** The section uses the deep green, the plant colors, and neutrals.
   It does not use the lime accent.

## Rationale

- An exploded view shows the product's model (garden → planting areas →
  plants, all to scale) in one motion. A screenshot or a list of features
  cannot show that structure.
- The three layers match the three steps and the three editing levels of
  ADR-0075, so the text, the motion, and the app tell the same story.
- Lighting a step card, its shelf, and its marker together makes the
  correspondence between text and layer obvious. In an earlier round the owner
  found the link too weak.
- A white stage keeps the green boundary of the garden visible. A fully dark
  textured section was too dark and swallowed the boundary.
- The textured frame balances the heavy left slab; with a plain white right
  side the card felt heavy on the left.
- Pinned markers need no column of their own, so opening the layers does not
  push the garden into the slab.
- Plain CSS 3D transforms on flat drawings keep lines sharp and stay close to
  the app's plan style. They need no 3D library and no models.
- Autoplay once with Replay suits a page with four animated sections. A
  scroll-driven animation would make each section several screens tall.

## Alternatives Considered

### Camera zoom from garden to bed to plant

A flat plan that zooms in level by level. It explains scale, but it has no
depth, and the owner preferred the layered, dimensional look.

### Scroll-driven playback

The animation follows the scroll position, as on many product pages. Each
section would need two to three screens of height, which is too long for four
sections.

### Build the layers apart, then close

Each step fills its own floating shelf, and the shelves close at the end. It
links text and layers clearly from the start, but the owner preferred building
on one level first and then opening it.

### Front view

A straight-on tilted view. It reads less dimensional than the 45° view.

### A fully dark textured section

The first round. It was too dark to view comfortably, and the garden's green
boundary disappeared into it.

### Other green placements

A textured strip across the top, a textured plinth under the garden, or a
thin textured line at the bottom. The owner chose the left slab with a
textured frame.

### A fourth "Names" layer and side callout cards

Names arrived after the plants as their own layer, and a column of callout
cards explained the layers. The extra layer confused the three-step story, and
the cards pushed the garden into the slab.

### Frosted or very small labels

Labels that grew with the zoom looked coarse. Very small labels on frosted
glass were hard to read. Solid white at 12–13 px is the accepted middle.

## Consequences

- The landing page gains a client component that runs a timed sequence of CSS
  transitions, and an intersection observer to start it.
- The sample garden is fixed data in the component. It does not follow the
  demo workspace, so changes to the demo never break the showcase.
- The section loads the hero's still texture a second time; the browser serves
  it from cache.
- The section's look sets the pattern for the other three landing sections.
  Their design may still ask for small changes here so the four stay
  consistent.

## Implementation Notes

- Build it when the AI Note section is designed, in one focused branch.
- Port the mockup's scene into `src/components/marketing/` as a component with
  CSS Modules, reusing the plan's colors from `src/lib/planAppearance.ts`.
- Keep the step copy in `landingFeatures.ts`.
- Tests: a unit or component test for the reduced-motion final state and the
  step order, and a browser check at 1440, 768, and 390 px with no horizontal
  scroll.
- Confirm the mobile layout with a mockup before building it, including where
  the layer markers go on a narrow screen.

## Reconsideration Conditions

- The animation stutters on common laptops or phones, or CSS 3D renders
  inconsistently across browsers.
- Visitors or interviewers miss what the section shows without watching the
  whole animation.
- The design of the other three sections calls for a different shared
  pattern.
- The app's plan style changes enough that the showcase no longer looks like
  the product.
