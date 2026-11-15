# ADR-0073: Separate the Landing Page from the App and Use a Textured Deep-Green Look

- Status: Accepted on 2026-11-14; S1 to S5 implemented (S4 and S5 on 2026-11-15), S6 and S7 pending. The form of the landing showcases (S6b) is undecided until the app is final.
- Date: 2026-11-14
- Supersedes in part, as each phase lands:
  - [ADR-0051](0051-prioritize-daily-garden-work-on-the-dashboard.md): the dashboard card groups.
  - [ADR-0063](0063-use-workspace-routes-and-shared-session-state.md): the route list, the garden subnavigation, and "Back to gardens".
  - [ADR-0067](0067-project-care-across-locations-with-explicit-ownership.md): the garden Care page and its "Applies to all gardens" section, in phase S3.
  - [ADR-0069](0069-open-garden-notes-in-place-from-overview.md): the note entry point.
  - [ADR-0072](0072-use-a-single-plan-canvas-with-guided-setup.md): the G1 presentation and the wide-layout side column.
- Amends for canvas colors, in phase S4: [ADR-0030](0030-use-context-aware-plant-colors.md) and [ADR-0049](0049-use-visually-distinct-automatic-plant-colors.md).
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

- An "Open app" button in the landing header.
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
- The Gardens page keeps a short "Today" strip at the top. It shows the count
  of due care tasks and links to Care, which holds the full list. This keeps
  the intent of ADR-0051 with one home for the list.

### 3. Landing page look

The landing page has three bands: the hero, the two showcase sections, and the
footer.

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
- **Showcases.** Garden Plan drawing and AI Note are presented as animated
  cards or short videos, not as a live embedded canvas. The owner chooses the
  form after the app is final, and the showcases are built from its real
  screens. Until then, the landing page shows placeholders with "Try it".
- **Fallbacks.** Without WebGL2, or when the user prefers reduced motion, the
  hero and footer show a pre-rendered still of the same grade. Animation
  pauses when its band is off screen.
- **Assets.** The photos ship as web exports of about 2400 px wide in WebP. The
  originals stay out of Git, and `CREDITS.md` records each one.

### 4. App look

The app is quiet: a neutral white work surface with deep green on the
elements that mean something.

- **Header.** A deep-green bar `#264A33`. A grayscale copy of the hero photo
  sits over it in overlay blend at 75%, with a light gradient on the left. The
  bar must read clearly green, never black. The nav text is white, 15.5 px,
  weight 500. The active module gets a lighter pill.
- **Neutrals.** The neutrals have no hue: page `#F4F4F3`, surface `#FFFFFF`,
  lines `#E3E3E1`, and ink `#18181A`, `#5F5F63`, and `#8D8D91`. Neutrals are
  never tinted green.
- **Content green.** `#1F4230` (hover `#285239`, headings `#173322`) marks:
  - the primary button
  - the selection box and handles
  - the garden boundary
  - page and panel headings
  - the saved-status dot
- **Frosted glass.** The Garden Plan toolbar, zoom control, legend, and area
  panel float over the canvas as light glass: white at 40%, 10 px blur, 150%
  saturation, and a white hairline border. A faint dot grid outside the garden
  gives the blur something to show. Below 900 px the overlays return to the
  normal page flow.
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

The interactions from ADR-0072 do not change: zooming, placing, dragging,
filling, undo, and the guided setup.

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
  "Back to gardens" link change in S1.
- Removing the garden tabs changes `AppShell`, the garden switcher, and the
  routing tests.
- The redirects keep the old garden Care and Season URLs alive.

**Visual system and canvas**
- Every page restyles with the new tokens. Pages restyle in phases, so the app
  mixes old and new styles between phases.
- The canvas colors, thumbnails, and their screenshots change. ADR-0072's wide
  side column becomes a floating glass panel, and the panel's width and
  scroll behavior need new browser checks.
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
