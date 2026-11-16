# ADR-0076: Color Each Plant Type from a Shared Muted Palette

- Status: Accepted on 2026-11-16 and implemented on 2026-11-16.
- Date: 2026-11-16
- Supersedes in part: [ADR-0073](0073-separate-the-landing-page-and-use-a-textured-deep-green-look.md)
  section 6: plant circles on the Garden Plan canvas and the Gardens thumbnails
  no longer take their crop family's color, and the legend lists plants instead
  of crop families.
- Refines: [ADR-0049](0049-use-visually-distinct-automatic-plant-colors.md),
  whose rule, "keep a plant's own color unless it is too close to another one",
  returns for the canvas.
- Related: [ADR-0025](0025-use-three-season-crop-rotation-warnings.md) for the
  crop families that rotation warnings still use.

## Context

ADR-0073 phase S4 colored each plant circle by its crop family. In real
gardens this made two problems:

- Plants of one family looked identical. Tomato, pepper, and eggplant were all
  the same nightshade coral, so a bed with pepper and eggplant read as one
  crop.
- Every plant outside the seven vegetable families fell into a grey "Other".
  A front garden of hydrangea, sunflower, and marigold was three grey groups,
  although these are the most colorful plants in a garden.

The user likes the muted look of the family palette and wants to keep it. The
change needs more distinct colors without a new visual style.

## Decision

Each plant type gets its own color from two rings of muted swatches, defined
in `src/lib/planAppearance.ts`.

- **Plant ring (14 swatches).** The seven ADR-0073 family colors stay, and a
  blend between each neighboring pair fills the gaps: coral, orange, amber,
  olive, leaf, green, sea, teal, blue, periwinkle, lavender, plum, pink, and
  red. Every swatch has the same light fill and dark stroke style.
- **Flower ring (6 swatches).** Red, orange, yellow, blue, violet, and pink.
  Flowers are a little richer than vegetables. The user chose a soft version
  from a side-by-side mockup, so flowers stay in the same family of tones.
- **A preferred swatch per plant.** Each known plant type prefers a swatch
  close to how it looks: tomato red, pepper coral, eggplant plum, kale blue,
  marigold orange, sunflower yellow, meadow sage violet, and hydrangea pink.
  A plant type the list does not name keeps its crop family's ADR-0073 color.
  An unknown plant takes a steady swatch from a hash of its name.
- **Distinct within a garden.** Colors are resolved once per garden, so the
  canvas, its legend, and the thumbnail agree, and one plant type has one
  color everywhere in that garden. Plant types are resolved in a fixed
  priority order, the order of the known-plant list and then by name. A plant
  type moves when its swatch is taken, sits next to a taken one, or shares its
  hue with a plant in the other ring (for example, squash amber beside
  sunflower yellow). It takes the closest clear swatch within three steps,
  then any unused swatch, and shares a swatch only when its ring is full.
- **Legend.** The legend's title is "Plants". It lists each plant type in view
  with its color, grouped by crop family and then by name, so related plants
  sit together.

Crop families still drive rotation warnings and the family fallback. The
stored per-plant `color` field stays unused by the canvas.

## Why This Option

- Every plant type in the user's three gardens now has its own color, and the
  front garden's flowers read as pink, yellow, and orange.
- The palette keeps the ADR-0073 colors and adds only blends between them, so
  the plan keeps its look.
- The rule is deterministic and tested. The same plants always produce the
  same colors, whatever order they were added in.

## Alternatives Considered

### Keep Family Colors and Add Flower Families

Flowers would gain colors, but tomato, pepper, and eggplant would still match.

### Fill by Plant, Stroke by Family

A second color cue on every circle made small circles noisy, and the family
stroke was hard to read at thumbnail size.

### Use the Saturated Per-Plant Colors from ADR-0030

These colors are the plant-type defaults in `gardenWorkspace.ts`. They are
bright and clash with the muted planting-chart look of ADR-0073.

### Resolve Colors per Planting Area

Each bed would be distinct, but one plant type could show different colors in
different beds of the same garden, and the legend could not name one color.

## Consequences

- Adding a plant type to a garden can change the color of a lower-priority
  plant type in that garden. ADR-0049 accepted the same tradeoff.
- Some swatch pairs remain close, such as two neighbors on a ring. The garden
  rule keeps them apart while a ring has room.
- Gardens with more than 14 vegetable or 6 flower types reuse swatches.
- Unit tests in `src/lib/planAppearance.test.ts` check stroke contrast,
  per-plant colors, the flower ring, collision moves, order independence, and
  the legend order. The component test and the Garden Plan acceptance spec
  check the canvas fill and the "Plants" legend.

## Reconsideration

- The product adds a sourced cultivar appearance catalog or user-selected
  colors on the canvas.
- Users garden with many more plant types than the rings hold.
- An accessibility review asks for a pattern or label cue beyond color.
