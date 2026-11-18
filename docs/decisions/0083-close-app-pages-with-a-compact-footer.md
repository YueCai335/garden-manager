# ADR-0083: Close App Pages with a Compact Footer

- Status: Accepted on 2026-11-17 and implemented on 2026-11-17.
- Date: 2026-11-17
- Amends: [ADR-0073](0073-separate-the-landing-page-and-use-a-textured-deep-green-look.md):
  the landing page keeps its full footer, and the app frame now has a footer
  of its own.
- Related: [ADR-0081](0081-stage-the-gardens-on-a-textured-band-on-the-gardens-home.md),
  which uses the same leaf-vein photo as a still image on the Gardens home.
- Note: the number 0082 belongs to a decision on another branch
  (`season-redesign`).

## Context

ADR-0073 split the site into a landing frame and an app frame. The landing
frame has a header and a tall textured footer. The app frame has only its
sticky app bar. Every app page (Gardens, Care, Next Season, AI Note, Plant
Doctor, Plant Guide, and a garden's plan) ended at its last card, with gray
page below. The owner said the pages looked cut off and asked whether the app
could reuse the landing footer.

## Decision

Every app page ends with one compact footer band, rendered once by the app
shell:

- It uses the landing footer's leaf-vein photo as a still image
  (`/landing/footer-still.webp`) under a dark wash, with rounded corners. It
  has the same width as the page content.
- It holds one row: "Garden Manager · A portfolio project", the project links
  (GitHub, Architecture, Decision records), and the photo credit. Below
  720 px the parts stack.
- It carries no module links. The modules stay in the app bar.
- The shell is a column, so a short page still puts the footer at the bottom
  of the window.

## Rationale

- A closing band tells the user the page ends there, which answers "cut off".
- The leaf-vein photo and deep green tie the footer to the app bar and the
  landing footer without adding a new color or texture.
- A still image costs one cached image. The landing footer's live shader
  would run on every app page for decoration only.
- The project links matter to interviewers and visitors on any page; the
  module links already sit one glance away in the app bar.

## Alternatives Considered

### Reuse the full landing footer

It matches the landing page exactly, but it is about 300 px tall, repeats the
app bar's modules in its Product column, and runs a WebGL shader. Its headline
speaks to a visitor deciding whether to try the product, not to a user who is
already working. The owner compared it with the compact band in a clickable
mockup and chose the compact band.

### No footer

Many tools end their pages without one. Here the pages read as cut off, and
the project links were reachable only from the landing page.

### A plain text footer on the page background

It is the lightest option, but it reads as unfinished next to the textured
app bar and the textured bands on Gardens and Care.

## Consequences

- Every app page grows by the footer's height and a 24 px gap above it. Pages
  already end with their own bottom padding, so the gap stays small.
- The Gardens home shows the leaf-vein photo twice: in the AI Garden Notes
  block and in the footer. The footer's darker wash and single row keep the
  two apart.
- The photo credit now appears on the pages that show the photos.

## Reconsideration Conditions

- A page needs the full window height, such as a full-screen plan canvas, and
  the footer gets in the way.
- Usability checks show users mistake the footer for page content or
  navigation.
- The app gains settings, help, or legal pages that belong in a footer, which
  would justify a second row.
