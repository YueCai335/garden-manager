# ADR-0073: Separate the Landing Page from the App and Use a Textured Deep-Green Look

- Status: Accepted on 2026-11-14 and implemented: S1 to S3 on 2026-11-14, S4 to S7 on 2026-11-15. Amended on 2026-11-15: the brand link returns to the landing page, the header modules sit in one tray, and the landing page has a fixed header over four feature sections. Amended on 2026-11-15: the app header is sticky. Amended on 2026-11-15: the area panel sits beside the canvas, "Whole garden" only zooms out, Delete garden moves into the garden details form, and the Today strip marks care types with a dot. Amended on 2026-11-16: the area panel's button reads Done, plant names replace area names on planted areas, and the area panel drops the type field and the step buttons. Amended again on 2026-11-16: "Care to do" and AI Garden Notes stack in a column beside the gardens, "Care to do" ticks tasks off in place, and garden thumbnails carry no text. The landing showcases (S6b) remain placeholders; their form is undecided until the app is final.
- Date: 2026-11-14
- Supersedes in part (all marked in the decision index):
  - [ADR-0051](0051-prioritize-daily-garden-work-on-the-dashboard.md): the dashboard card groups.
  - [ADR-0063](0063-use-workspace-routes-and-shared-session-state.md): the route list, the garden subnavigation, and "Back to gardens".
  - [ADR-0067](0067-project-care-across-locations-with-explicit-ownership.md): the garden Care page and its "Applies to all gardens" section, in phase S3.
  - [ADR-0069](0069-open-garden-notes-in-place-from-overview.md): the note entry point.
  - [ADR-0072](0072-use-a-single-plan-canvas-with-guided-setup.md): the G1 presentation and the wide-layout side column.
- Amends for canvas colors (phase S4): [ADR-0030](0030-use-context-aware-plant-colors.md) and [ADR-0049](0049-use-visually-distinct-automatic-plant-colors.md).
- Related:
  - [ADR-0025](0025-use-three-season-crop-rotation-warnings.md): crop families.
  - [ADR-0040](0040-use-vercel-render-and-supabase-for-the-portfolio-demo.md): the demo deployment.
  - [ADR-0065](0065-fit-metric-canvases-to-their-containers.md): fitting canvases to their containers.
  - [ADR-0067](0067-project-care-across-locations-with-explicit-ownership.md): Care across locations.
- Implementation plan: [Site redesign plan](../site-redesign-plan.md)
- Prototypes the owner reviewed and approved on 2026-11-14:
  - Landing page (version 4): https://claude.ai/artifact/9C4EYxPXFYGcg3DGzonWwn
  - App and canvas (version 8): https://claude.ai/artifact/41FXSnHJFAVvBBVppYA5iH
- Source photos: [design/source-photos/CREDITS.md](../../design/source-photos/CREDITS.md)

## Context

The project is a portfolio piece. Its first visitors are interviewers who
open a link without context. The current `/` is the workspace Overview, so a
visitor lands in an app full of someone's gardens and has to guess what the
product does. Nothing presents the two features worth showing first: drawing
a garden plan and turning a free-text note into reviewed care records.

The owner reviewed the app after the single-canvas Garden Plan merged (PR #9)
and reported these problems:

- "Back to gardens" is a bare underlined link that is easy to miss.
- Care and Next Season appear twice. They appear in the global header and
  again as tabs inside a garden. A user cannot tell which one they are in.
- The header items have no visual weight or grouping.
- The palette is pale green and beige everywhere. It reads as generic and
  machine-made.
- The canvas looks cartoonish. Area fills are saturated soil and terracotta,
  and plant markers are bright dots.

The owner set two constraints for the new look:

- It must stay plant-themed. Purple and blue gradients, plain black-and-white
  copies of Linear or Notion, and an industrial instrument look were all
  reviewed and rejected.
- The canvas must stay clear. It is a vegetable plan, not landscape
  architecture. Decorative rendering that competes with "what is planted
  where" was rejected.

Several rounds of prototypes settled the details:

- A flat swatch board cannot show texture or glass, so each round was a real
  HTML page.
- Procedurally drawn ridges and veins looked fake and blurry.
- Large dark-green or mid-green app surfaces were rejected at every lightness
  ("都很丑").
- Pale or grey-green neutrals read as machine-made.
- Deep green used as a header read as black until it matched the brightness
  of the hero's mid-tones.

The owner approved what remained, described below.

## Decision

### 1. Two frames on one deployment

The landing page and the app are separate frames. Each has its own layout and
header, and they never mix. Next.js route groups provide the split inside the
same project and deployment:

- `src/app/(marketing)/`: `/` is the landing page.
- `src/app/(app)/`: the existing workspace, renamed from `(workspace)`. It keeps
  its `WorkspaceProvider` and `AppShell`.

The landing page does not load the workspace provider or call the API. A
visitor reads it without a backend.

Entry points into the app:

- An "Open app" glass button in the landing header.
- The primary hero call to action.
- One "Try it" link per showcase feature. Each opens that feature's app page.

### 2. App routes and page layers

The app has three strict layers:

| Layer | What it is | Routes |
| --- | --- | --- |
| L1: modules | The header modules: Gardens, Care, and Next Season, then a divider, then Plant Doctor and Plant Guide, plus a global "+ Note" button | `/gardens`, `/care`, `/season`, `/doctor`, `/guide`, `/notes` |
| L2: one garden | Editing only: the single-canvas Garden Plan | `/gardens/[gardenId]/plan`, `/gardens/new` |
| L3: one area | The zoomed planting area on the same canvas | `/gardens/[gardenId]/plan?area=` |

Rules:

- The Overview moves from `/` to `/gardens` and is renamed "Gardens".
- The "Garden Manager" brand in the app header always links to the landing
  page at `/`. The brand names the whole site. Gardens, the first header
  module, is the app's home. The landing page's "Open app" button leads back
  into the app. Gardens keeps its name; a second "Home" would compete with the
  brand.
- Care, Next Season, Plant Doctor, and Plant Guide are siblings of Gardens,
  not children of it. They cover every garden.
- A garden page no longer has Care or Next Season tabs. A link from a garden
  to its care or its season plan is a filtered link to the L1 module, such as
  `/care?location=<gardenId>`.
- The old garden routes `/gardens/[gardenId]/care` and
  `/gardens/[gardenId]/season` redirect to those filtered views, so existing
  links keep working.
- Below L1, the page shows a breadcrumb (Gardens › Backyard › Raised bed A)
  and an "All gardens" button styled as a real button.
- The "+ Note" header button opens the existing Garden Note dialog from any
  app page. This extends ADR-0069, which opens the dialog only from Overview.
- The Gardens page keeps a short "Care to do" box with a link to Care, which
  holds the full list. This keeps the intent of ADR-0051 with one home for the
  list.
- **Care to do** (amended 2026-11-16). The box splits tasks into Overdue,
  Today, and Coming up (the next seven days), with a hairline between groups.
  Each row reads as a verb and a place, such as "Water Front garden", with the
  planting area or plant group, or how late it is, on a second line. Overdue
  and Today rows have a round checkbox on the right; Coming up rows show
  "Tomorrow" or a weekday instead. Ticking a row completes the task the same
  way Care does (ADR-0023): it records care history for today, and a repeating
  task moves to its next date. The ticked row stays in place, struck through,
  and the header counts progress ("1 of 3 done", then "All done"). A tick can
  be undone until the user leaves the page. Care work recorded earlier today,
  from Care or a note, shows in Today already ticked. The earlier "Today" strip
  read as a date, not a list of jobs, mixed today's and future tasks in one
  row of chips, and repeated the garden name and date on every chip.
- **Gardens fill the page** (amended 2026-11-16). From 1024 px the garden
  cards fill the left of the Gardens page, and a 300 px column on the right
  stacks the Care to do box above the AI Garden Notes box. Narrower screens show
  Care to do, then the gardens, then the note box; the header "+ Note" keeps note
  entry one tap away. Before, Today ran as a full-width strip above both the
  gardens and the note box, which pushed the gardens down and split the daily
  items across two places.

### 3. Landing page look

The landing page has the hero band, four feature sections on the neutral page,
and the footer band.

- **Landing header.** The header stays fixed at the top of the window. Over the
  hero it is clear. Once the page scrolls, it becomes a bar graded by the
  hero's own shader and photo: the same greens, relief, and moving light. A
  separate flat or glass green looked like a different, lighter color, so the
  bar keeps the hero's look instead. The bar starts its shader only after the
  page scrolls, and it falls back to the hero still like the hero does.
  It holds the brand, one link per feature section, a GitHub icon, and the
  "Open app" glass button. The link for the section in view is marked. Below
  860 px the section links hide, and the brand, GitHub, and "Open app" stay on
  one row.
- **Feature sections.** The sections follow a growing season, and the header
  links follow the same order:
  1. Garden Plan: draw the garden to scale.
  2. AI Note: log the work in one note; Care keeps the records and tasks.
  3. Plant AI: Plant Doctor and Plant Guide.
  4. Season Planner: the Next Season module and its crop rotation checks.
  Each section spans the full width and stacks below the previous one. It has
  no side-by-side cards. Each section names only features the app has today.
  A sowing calendar joins the Season Planner section once that feature exists.
- **GitHub.** The header shows a GitHub icon so a reviewer finds the code on
  the first screen. The footer keeps the full project links.

- **Hero.** The background is a real photo of light banana-leaf ridges (Pexels
  12321610). A WebGL2 fragment shader re-grades the photo:
  - It maps luminance onto three fixed deep greens.
  - It derives surface normals from blurred luminance.
  - It lights the relief with a soft light that follows the cursor and orbits
    slowly when there is no pointer.
- **Footer.** The background is a dense leaf-vein photo (Pexels 35451631). A
  band-pass filter (the luminance difference between two blur levels)
  extracts the veins. The veins near the cursor light up lime like circuit
  traces. SVG nodes sit on the strongest vein points.
- **Type and color.** All type is white. Lime `#D6FF5C` appears in only two
  places: the primary call to action and the split lines in the AI Note
  showcase. Large landing headings use Bricolage Grotesque.
  The landing header links and the footer link columns are white at weight
  500 with a soft dark shadow. Thin, translucent white was hard to read on the
  textured bands, and the footer links sit where the veins light up. Weight
  500 reads clearly without looking bold; weight 700 is not used.
- **Hover on the bands.** A small change in white opacity disappears on the
  texture, so the landing links use pills with clear steps:
  - A header link on hover or keyboard focus gets a translucent white pill
    with a hairline. The section in view gets a solid white pill with deep
    green text, like the app's module tray.
  - "Open app" fills solid white with deep green text on hover.
  - A footer link on hover gets a dark pill with a hairline. The footer light
    follows the pointer to the brightest veins, so a brighter color cannot
    mark the link there.
  - Dimming the other links and a lime hover were tried and rejected. Dimmed
    links became unreadable on the lit veins, and lime is limited to two
    places.
- **Showcases.** Each feature section later gains a showcase, such as an
  animation or a short video, not a live embedded canvas. The owner chooses the
  form after the app is final, and the showcases are built from its real
  screens. Until then, each section shows its text, its points, and "Try it".
- **Fallbacks.** Without WebGL2, or when the user prefers reduced motion, the
  hero and footer show a pre-rendered still of the same grade. Animation
  pauses when its band is off screen.
- **Assets.** The photos ship as grayscale WebP exports 2000 px wide (about
  1.1 MB together; 2400 px would be about 1.7 MB). The originals stay out of
  Git, and `CREDITS.md` records each one. `scripts/export-landing-assets.mjs`
  makes the exports and renders the stills with the same shader code the page
  runs.

### 4. App look

The app is quiet: a neutral white work surface with deep green on the
elements that mean something.

- **Header.** A deep-green bar `#264A33`. A grayscale copy of the hero photo
  sits over it in overlay blend at 75%, with a light gradient on the left. The
  bar must read clearly green, never black. The nav text is white, 15.5 px,
  weight 500. The active module gets a lighter pill. At 1024 px and wider, the
  five modules sit in one capsule tray (white 9%, a white 18% hairline), and
  the brand stands outside it. The tray separates the site's brand from the
  app's modules. Below 1024 px the modules fold into Menu without the tray.
  The bar is sticky: it stays at the top of the window while the page
  scrolls, like the landing header, so the modules stay one click away on
  long pages. It is a solid bar, so it needs no transparent state. The bar
  publishes its live height as `--app-header-height`; the area panel's sticky
  parts sit below it, and `scroll-padding-top` keeps a focused field from
  scrolling under it.
- **Neutrals.** The neutrals have no hue: page `#F4F4F3`, surface `#FFFFFF`,
  lines `#E3E3E1`, and ink `#18181A`, `#5F5F63`, and `#8D8D91`. Neutrals are
  never tinted green.
- **Content green.** `#1F4230` (hover `#285239`, headings `#173322`) marks:
  - the primary button
  - the selection box and handles
  - the garden boundary
  - page and panel headings
  - the saved-status dot
- **Frosted glass.** The Garden Plan toolbar, zoom control, and legend float
  over the canvas as light glass: white at 40%, 10 px blur, 150% saturation,
  and a white hairline border. A faint dot grid outside the garden gives the
  blur something to show. Below 900 px the overlays return to the normal page
  flow.
- **Area panel beside the canvas** (amended 2026-11-15). The Edit planting
  area panel sits in its own 320 px column to the right of the canvas, runs
  the canvas height, and scrolls inside it. It covers no part of the plan, so
  the whole canvas stays visible while an area is open. A panel floating over
  the canvas hid the garden's right side.
- **Care types on the Today strip** (amended 2026-11-15). A 6 px dot before
  each task name marks its type in the Care chip colors: watering `#195B70`,
  fertilizing `#805B17`. The cards stay identical otherwise, so the two types
  read as related but distinct.
- **Tokens.** `src/styles/tokens.css` holds every color as a token. Konva
  cannot read CSS variables, so `src/lib/planAppearance.ts` mirrors the canvas
  colors, as it already does.

### 5. Fonts

- Instrument Sans is the body font on both the landing page and the app. A
  shared font keeps the two frames one brand. The system font differs by
  operating system, so a visitor on Windows would see a different app from
  the one designed on macOS.
- Bricolage Grotesque appears only in large landing headings. Its character
  suits a headline and tires the eye in small labels, buttons, and numbers.
- Both are Open Font License fonts, self-hosted through `next/font`. The site
  makes no runtime request to Google Fonts.

### 6. Canvas presentation

The plan reads as a plain metric planting chart:

- The garden ground is near-white on a light metre grid.
- Area outlines are thin:
  - Raised beds: pale soil inside a thin wood-brown frame.
  - In-ground beds: a dashed edge.
  - Containers: round, with a terracotta edge.
- Each plant is a circle whose diameter is its spacing footprint. The
  allocation already stores this diameter.
- Fills are muted and strokes are darker. The colors come from the plant's
  crop family. Plants with no known family use a neutral "Other" color. The
  stored per-plant `color` field stays unchanged, and the plant panel hides
  its color picker.
- Every plant group in an area carries a short label, such as "Tomato ×2". A
  legend lists the families in view.
- **Plant names lead** (amended 2026-11-16). An area with plants is named by
  its plants; its own name shows only while it is open. Empty areas keep their
  names. Thumbnails draw every plant at least 3 px in radius so small spacings
  stay visible.
- **Thumbnails carry no text** (amended again 2026-11-16). A garden thumbnail
  on Gardens draws planting areas and plants, colored by crop family, and no
  plant or area names. The card below it already lists "Growing now", and the
  Garden Plan names every plant. Long plant names overlapped at thumbnail size,
  and repeating the card's list added clutter without new information. The
  first 2026-11-16 amendment showed plant names in planted thumbnails and area
  names in empty ones. Before,
  both names crowded each planted area, and thumbnails showed area names with
  plants as specks, so the overview read as a list of containers rather than a
  garden. A user setting for labels was considered and rejected: one rule
  answers the question each view asks, and "both" was the cluttered state.

The interactions from ADR-0072 do not change: zooming, placing, dragging,
filling, undo, and the guided setup, with two amendments from 2026-11-15:

- **"Whole garden" only zooms out.** While an area is open, "Whole garden"
  frames the whole garden and keeps the area selected, its panel open, and its
  resize handle active. The button then reads "Zoom to <area>" and zooms back
  in. Close and Escape close the area. Before, "Whole garden" closed the area,
  so looking at the garden ended the edit.
- **The area panel's button reads Done** (amended 2026-11-16). Edits apply as
  they are made, so leaving the panel ends a finished edit; "Close" read as
  leaving without saving. Every layout uses Done: the wide panel, the 820 px
  dialog, the phone properties page (formerly "Back to plan"), and the phone
  area card. The plant form's own button reads "Done adding" so the two never
  share a name. A value that cannot apply still asks before Done discards it.
- **The area panel edits only what the canvas cannot** (amended 2026-11-16).
  The 0.1 m step buttons are removed: dragging moves an area, and the X and Y
  position fields stay as the precise, keyboard-friendly alternative. The type
  field is removed: the type is chosen with the Add button that creates the
  area, and changing it afterwards read as odd. A wrong type is fixed by
  deleting the area and adding the right one; the stored `kind` is unchanged.
- **Delete garden sits in the garden details form.** "Edit garden details"
  opens the name and size fields with Delete garden at the bottom. The
  separate "Garden settings" section held only this button, so it is removed.

## Rationale

- An interviewer who opens the link first learns what the product is and sees
  its two strongest features. The working app is one click away.
- Separate frames let the landing page be expressive and the app stay calm.
  Neither compromises the other.
- Route groups keep one codebase, one deployment, and one set of tests. They
  need no new service or domain.
- Strict layers remove the duplicated Care and Next Season entries. Each
  module has one home, and each cross-layer link says what it filters.
- Real photos graded in a shader give texture that a procedural drawing could
  not match. Fixed target greens keep the brand consistent whichever photo is
  used.
- The shader has no library and the fonts are self-hosted, so the stack gains
  no runtime dependency. It does add a small amount of hand-written WebGL that
  needs a fallback.
- A neutral app with green only on meaningful elements matches the owner's
  feedback: green looked good in small, textured doses, and large green
  surfaces looked bad.
- A planting chart with spacing footprints and family colors answers the
  canvas's real question, what grows where and how much room it takes. Family
  colors also connect the plan to crop rotation (ADR-0025).

## Alternatives

### Keep the workspace at `/` and add an about page

This is the smallest change. An interviewer would still land inside the app
first.

### A separate marketing site or repository

A static site generator or a second Vercel project gives full isolation. It
also doubles the build, deployment, and analytics setup for one page.

### An embedded live canvas on the landing page

This was considered and declined by the owner. It needs the workspace and the
API on the landing page, adds weight, and competes with the app itself.

### A full dark or dark-green app theme

Three lightness levels of a deep-green app were prototyped. The owner rejected
all of them.

### Procedural textures instead of photos

These were prototyped in version 1. They looked flat, blurry, and fake.

### Landscape-style canvas rendering

Leaf rosettes, fruit, gravel paths, and shadows were started and stopped
mid-build. Decoration hid the planting layout.

### Tailwind CSS or a component library for the restyle

The project strategy lists Tailwind and shadcn/ui as planned. The restyle
needs tokens and a few component rules, which CSS Modules already provide. A
second styling system during a visual rewrite would add migration work
without a product reason.

## Consequences

**Routes and tests**
- The app's home moves to `/gardens`. Almost every Playwright journey starts at
  `/` and must start at `/gardens` instead, through one shared helper.
- The README screenshots and the demo link change.
- `routeFromPath`, the brand link, the guided setup's Ready links, and every
  "Back to gardens" link change in S1. The 2026-11-15 amendment points the
  brand link at `/`, because the app had no way back to the landing page.
- Removing the garden tabs changes `AppShell`, the garden switcher, and the
  routing tests.
- The redirects keep the old garden Care and Season URLs alive.

**Visual system and canvas**
- Every page restyles with the new tokens. Pages restyle in phases, so the app
  mixes old and new styles between phases.
- The canvas colors, thumbnails, and their screenshots change. ADR-0072's wide
  side column first became a floating glass panel; the 2026-11-15 amendment
  returns it to a column beside the canvas. The panel's width, height, and
  scroll behavior have browser checks.
- Plant colors on the canvas stop following per-plant colors. The stored
  `color` field stays, so the change can be reversed in the interface alone.

**Landing page**
- WebGL adds a code path that unit tests cannot cover. Playwright checks the
  canvas and the fallback still. A frame-time check on a mid-range laptop is
  part of acceptance.
- The photos add about 1 MB to the landing page. They load after the text and
  never block the first paint.

**Records**
- Each superseded record is marked when the phase that replaces it lands.

## Reconsideration

- Interviewers or visitors skip the landing page, or the landing page's
  performance hurts the first impression.
- The landing page needs content that a static page cannot serve, such as
  sign-in, pricing, or a blog. A separate site may then pay off.
- The app gains a real dark mode requirement. The token layer then needs a
  second set of values, including for Konva.
- Users find family colors less useful than per-plant colors on the canvas.
- Low-end devices cannot keep the shader smooth, even with the still fallback.
- Users need to untick a task after leaving Gardens. Each history record from a
  tick would then need to remember its task's previous due date.
