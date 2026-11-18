# ADR-0080: Show Care as a Today Board with a Separate History Log

- Status: Accepted on 2026-11-16. Implemented on 2026-11-17 (C0–C6 of the plan).
- Date: 2026-11-16
- Supersedes in part:
  - [ADR-0067](0067-project-care-across-locations-with-explicit-ownership.md):
    the Location filter on the Tasks view, the Tasks and History tabs, the
    Overdue / Due today / Upcoming text groups, and the location cards.
  - [ADR-0073](0073-separate-the-landing-page-and-use-a-textured-deep-green-look.md):
    the rules that the display font and the lime accent stay on the landing
    page.
- Related:
  - [ADR-0023](0023-keep-care-history-as-completed-record.md): completing a
    task writes one history record. This stays.
  - [ADR-0034](0034-use-workspace-and-garden-care-targets.md) and ADR-0067:
    record ownership and owner-specific writes. These stay.
- Implementation plan: [docs/care-redesign-plan.md](../care-redesign-plan.md)
- Approved mockups: [design/care-redesign/](../../design/care-redesign/)

## Context

The owner opens Care to answer four questions: what to do today, what is
already done today, what comes next, and what each garden needs. The current
page answers them poorly. It shows three plain text groups, every row carries
three buttons, completing a task takes a button and a date form, and the
per-garden view sits collapsed at the bottom of the page. The owner also found
the page visually flat next to the landing page.

Four clickable mockups were reviewed on 2026-11-16. The owner chose the parts
to keep from each and then asked for History to become a secondary page.

## Decision

Care becomes a board with three stacked blocks.

1. A dark, textured Today band. The left side holds a headline that counts
   what is left, a progress bar, and one small tile per garden. The right side
   is a glass card with two lists: To do (overdue first) and Done today.
2. An Upcoming ribbon: one card with seven day columns, tomorrow through the
   seventh day.
3. Garden cards: a plan thumbnail, today's tasks for that garden, and its next
   seven days. Workspace-wide tasks sit in an All gardens row above the cards.

The same task appears in the time blocks and in its garden card. Both places
update together.

Ticking the circle completes a task with today's date and can be undone during
the visit. Edit, delete, and completing on another date move into a row menu.
Task and record forms open in a dialog.

Care shows the next seven days only. A task due later appears when it enters
that window.

The Tasks view has no Location filter. A link with `?location=` scrolls to that
garden's card and highlights it.

History is a secondary page reached from a History button on the band. It
lists completed care only, newest first, grouped by day, with a solid green
date block for each day. A slim textured strip holds the title, Add record, and
two filter groups: garden and care type. It shows 15 records and loads 15 more
on request.

Two app elements use the landing page's display font: the band headline and
the History title. The lime accent appears once in the app, on the progress
bar.

The data model, storage, synchronization, and AI note flow do not change.

## Rationale

The band gives the page one heavy element, so the rest can stay neutral and
quiet. Putting today's list on that band matches what the owner looks for
first. The ribbon reads as a calendar, which the owner asked to keep. Garden
cards with thumbnails answer "what does this garden need" without a filter.

Ticking in place matches the "Care to do" box on Gardens, so both pages
complete tasks the same way and share one implementation.

History holds what happened. A missed task stays overdue on the board until it
is done or deleted, so History does not need to repeat it.

## Alternatives considered

- A light page with no band, where Upcoming lives only inside garden cards.
  The owner kept its garden cards and rejected the rest as too plain.
- One list with a switch between "by time" and "by garden". It is the shortest
  page, and it hides one of the two views at any moment.
- History as an equal tab beside Tasks, with its own large band and a
  four-week activity grid. The owner wants Care to focus on today and what
  comes next.
- A plain light History page. The owner found it too light and unbalanced; the
  slim strip and date blocks add weight without a second large band.
- A "Later" list or week paging for tasks beyond seven days. The owner prefers
  a clean page over a complete one.
- Keeping the Complete button and date form on every row. It costs two steps
  for the most common action.

## Consequences

- Today's work, today's progress, the week ahead, and each garden are visible
  without filters or tabs.
- Completing a task takes one click, and Gardens and Care share the tick logic.
- A task due more than seven days out cannot be seen, edited, or deleted from
  Care until it enters the window. Saving such a task states when it will
  appear.
- The same task is drawn twice on one page. The projection must come from one
  source so both copies stay in step.
- The band image adds about 300 KB to the Care page. It is a static image, not
  a shader.
- Existing unit and end-to-end tests that use the Location filter, the tabs,
  and the Complete button need rewriting. Owner-specific write checks stay.

## Implementation notes (2026-11-17)

These choices were made while building the plan. They keep the approved look
and rules; they only settle details the plan left open or that met existing
app rules.

- The app shell keeps its `h1` ("Care") for focus after navigation, visually
  hidden, as the Gardens home does (ADR-0081). The band headline and the
  History title are therefore `h2`, the To do and Done today labels, garden
  names, and History days are `h3`. The page has one `h1`.
- The page width follows the app's content width (the same as Gardens), so
  the band lines up with the other pages instead of the mockup's 64 px inset.
- The page's status line sits directly under the band or the History strip,
  so a message such as "Task added. It will appear here 7 days before …" is
  seen where the change was made.
- A tick made in a garden card stays in its place in that card; in the band it
  moves from To do to Done today. Keyboard focus follows the row in the list
  where the tick was made.
- History orders records within one day by the order they were stored, root
  records first and then each garden in turn, newest first. Records do not
  store a time, so the exact order across owners is not known.
- The row menu opens upwards when the band or the History card would clip it.
- History filters update the address with `replace`, and Clear filters resets
  both in one change.
- The app shell now focuses its page title with `preventScroll`, so a
  `?location=` link can scroll to its garden card on load.
- Shared code: `src/lib/careBoard.ts`, `src/lib/careHistory.ts`, and
  `src/lib/careLabels.ts` (the words Gardens and Care share), and
  `src/hooks/useCareTicks.ts` (ticking, used by Gardens and Care).

## Reconsideration

Revisit when gardeners keep many tasks beyond seven days and need to manage
them ahead of time, when a third care type makes the two-icon rows unclear,
when History grows enough to need search or server-side paging, or when the
dark band proves hard to read on common displays.
