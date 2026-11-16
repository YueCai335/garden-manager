# ADR-0077: Show Three Real Gardens as the Demo

- Status: Accepted on 2026-11-16 and implemented on 2026-11-16.
- Date: 2026-11-16
- Related:
  - [ADR-0040](0040-use-vercel-render-and-supabase-for-the-portfolio-demo.md):
    the hosted portfolio demo where visitors load the demo.
  - [ADR-0057](0057-keep-live-allocation-runs-closed-after-evaluation.md) and
    [ADR-0060](0060-offer-assisted-care-note-drafting-in-the-portfolio-demo.md):
    the public AI features, which keep the sample garden for now.
  - [ADR-0076](0076-color-each-plant-type-from-a-shared-muted-palette.md): the
    plant colors the demo shows off.

## Context

"Load demo garden" opened one garden with three areas named "Sample ..." and a
single tomato. It did not show what the planner is for. The owner had planned
three gardens of their own in the app, each a common situation:

- **Backyard**: a home vegetable garden with raised beds, containers, and
  greenhouses.
- **Front Yard**: in-ground flower beds.
- **Community Garden**: a small shared plot packed with vegetables and herbs.

A visitor who sees these three understands the product at a glance and can
picture their own garden in it.

The old sample garden is also the fixed context of the public AI features.
The backend copy (`backend/app/demo_garden.json`), AI Garden Note's public
path, the Allocation Assistant's recorded example run, and the paid
evaluation records all describe it. The owner plans to redo the AI demo data
and its evaluations after the site redesign is finished, not now.

## Decision

- "Load demo garden" opens the three gardens. Their layout is a copy of the
  owner's gardens on 2026-11-16, kept in `src/lib/demoGardenData.ts`, with
  readable stable IDs (`demo-backyard`, `demo-backyard-raised-bed-1`, and so
  on).
- `createShowcaseWorkspace(today)` builds the workspace. Planting dates and
  care due dates count from the visitor's today, so the demo never looks out
  of date. Each plant group has a planting record whose quantity equals the
  plants placed, and whose crop family comes from the plant name.
- The demo includes one workspace-wide care task: fertilize all gardens every
  seven days, first due in four days. This keeps "Care to do" filled.
- When a user with gardens of their own opens the demo, its three gardens join
  their workspace and Backyard opens. The demo's workspace-wide care stays
  out, because it would apply to the user's gardens too. `isDemoGardenId`
  lets the gardens list hide demo gardens beside the user's own, as it did for
  the sample garden.
- The old sample garden stays as `createSampleGardenWorkspace()`:
  - The public AI paths and `backend/app/demo_garden.json` still use it until
    the AI redo. AI Garden Note's public path and the Allocation Assistant
    therefore do not offer AI drafts on the three demo gardens yet.
  - Unit and end-to-end tests set `NEXT_PUBLIC_DEMO_FIXTURE=sample` and run on
    it, so their steps stay short and do not change whenever the showcase
    changes. The showcase has its own unit and UI tests.
- Workspaces that already contain the old "Demo Garden" keep it; it is the
  user's data now.

## Why This Option

- The demo shows the product's range: vegetables, flowers, four area types,
  dense and sparse beds, and the per-plant colors.
- Dates relative to today keep the demo current without maintenance.
- Keeping the sample garden for tests and AI leaves about 30 test files, the
  backend, and the evaluation records untouched until the planned AI redo.

## Alternatives Considered

### Replace the Sample Garden Everywhere Now

The AI paths, the backend copy, the recorded example, and about 30 test files
would all change now, and the paid evaluation records would describe a garden
that no longer exists. The owner will redo the AI demo data and evaluations in
one pass after the redesign.

### Keep the Sample Garden as a Fourth Demo Garden

AI features would keep working in the demo, but visitors would see an old
garden that no longer matches the current interface. The owner rejected it.

### Fixed Calendar Dates

The data would match the owner's records exactly, but within weeks every task
would show as overdue.

## Consequences

- Visitors see three full gardens, but AI Garden Note and the Allocation
  Assistant do not draft for them until the AI redo.
- Tests run on a different garden from the one visitors see. The showcase
  tests check its structure, dates, links, and loading from the demo button.
- Updating the showcase means editing `demoGardenData.ts`, for example by
  copying the owner's gardens again.

## Reconsideration

- The AI redo: point the backend copy, the public AI paths, the recorded
  example, and new evaluations at the showcase gardens, then retire the
  sample garden.
- Visitors find three gardens too much to take in at once.
