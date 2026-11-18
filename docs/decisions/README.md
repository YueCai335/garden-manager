# Architecture Decision Records

This directory records important product and engineering decisions so they can
be explained, challenged, and revisited.

## What Must Be Recorded

Create or update a decision record when a choice materially affects:

- Product scope or user workflow.
- Architecture or module boundaries.
- Data ownership, persistence, privacy, or security.
- Accuracy, reliability, or explainability.
- External services, licensing, cost, or deployment.
- A technology that an interviewer may reasonably ask about.

Small implementation details remain in code, tests, issues, and commit history.
Recording every variable name or visual adjustment here would hide the
decisions that matter.

## Required Content

Each record must state:

1. The context and constraints.
2. The selected option.
3. Why it was selected.
4. Which alternatives were considered and why they were not selected.
5. Positive and negative consequences.
6. Conditions that would justify revisiting the decision.

Do not rewrite an accepted record to make history look cleaner. If a decision
changes, mark the old record as superseded and add a new record.

## Status Values

- `Proposed`: under discussion and not authorized for implementation.
- `Accepted`: current direction.
- `Superseded`: replaced by a newer record.
- `Rejected`: evaluated but not selected.

## Decision Index

| ID | Decision | Status |
| --- | --- | --- |
| [ADR-0001](0001-use-nextjs-and-typescript.md) | Use Next.js and TypeScript for the web frontend | Accepted |
| [ADR-0002](0002-use-fastapi-python-backend.md) | Use FastAPI for the application backend | Accepted for backend phase |
| [ADR-0003](0003-start-with-modular-monolith.md) | Start with a modular monolith | Accepted |
| [ADR-0004](0004-keep-physics-deterministic.md) | Keep solar physics deterministic and constrain AI | Accepted |
| [ADR-0005](0005-use-hybrid-sun-analysis.md) | Combine an aerial yard model with panoramic calibration | Superseded |
| [ADR-0006](0006-adopt-employment-oriented-production-stack.md) | Adopt an employment-oriented production stack | Accepted |
| [ADR-0007](0007-use-metric-yard-coordinates-and-react-konva-editor.md) | Use metric yard coordinates and a React-Konva editor | Superseded |
| [ADR-0008](0008-use-metric-reference-grid-and-polygon-yard-boundary.md) | Use a metric reference grid and polygon yard boundary | Accepted |
| [ADR-0009](0009-use-address-guided-map-initialization-and-point-sky-calibration.md) | Use address-guided map initialization and point sky calibration | Accepted |
| [ADR-0010](0010-use-mapbox-for-address-guided-map-initialization.md) | Use Mapbox for address-guided map initialization | Accepted |
| [ADR-0011](0011-pin-secure-postcss-for-nextjs-15.md) | Pin secure PostCSS for Next.js 15 | Accepted |
| [ADR-0012](0012-use-address-first-parcel-candidates-with-user-confirmation.md) | Use address-first parcel candidates with user confirmation | Accepted |
| [ADR-0013](0013-prioritize-garden-operations-and-ai-planning.md) | Prioritize garden operations and AI planning | Accepted |
| [ADR-0014](0014-use-metric-planting-layouts-with-grid-snapping.md) | Use metric planting layouts with grid snapping | Accepted |
| [ADR-0015](0015-use-a-metric-garden-plan-overview.md) | Use a metric garden plan overview | Superseded by ADR-0017 |
| [ADR-0016](0016-separate-planting-records-from-layout-allocations.md) | Separate planting records from layout allocations | Superseded by ADR-0038 |
| [ADR-0017](0017-use-a-multi-garden-home-and-management-workspace.md) | Use a visual multi-garden home and dedicated management workspace | Superseded by ADR-0018 |
| [ADR-0018](0018-use-a-multi-garden-thumbnail-dashboard.md) | Use a multi-garden thumbnail dashboard and selected-garden operations | Superseded by ADR-0021 |
| [ADR-0019](0019-use-targeted-care-events-for-watering-and-fertilizing.md) | Use targeted care events for watering and fertilizing | Superseded by ADR-0020 |
| [ADR-0020](0020-support-garden-area-and-plant-group-care-targets.md) | Support garden, planting-area, and plant-group care targets | Superseded by ADR-0034 |
| [ADR-0021](0021-use-dashboard-garden-setup-and-direct-editing.md) | Use dashboard garden setup and direct editing | Superseded by ADR-0029 |
| [ADR-0022](0022-use-repeatable-care-tasks-with-completion-history.md) | Use repeatable care tasks with completion history | Superseded by ADR-0023 |
| [ADR-0023](0023-keep-care-history-as-completed-record.md) | Keep care history as the completed-care record | Accepted |
| [ADR-0024](0024-use-explicit-local-garden-import-for-postgresql.md) | Use an explicit local-garden import for PostgreSQL | Superseded by ADR-0055 |
| [ADR-0025](0025-use-three-season-crop-rotation-warnings.md) | Use three-season crop rotation warnings | Accepted |
| [ADR-0026](0026-use-a-next-season-planning-workspace.md) | Use a next-season planning workspace for crop rotation | Superseded by ADR-0039 |
| [ADR-0027](0027-use-persistent-plant-colors-and-garden-plan-zoom.md) | Use persistent plant colors and Garden Plan zoom | Superseded in part by ADR-0054 |
| [ADR-0028](0028-use-plant-types-varieties-and-bilingual-color-aliases.md) | Use plant types, varieties, and bilingual color aliases | Accepted |
| [ADR-0029](0029-use-a-thumbnail-first-garden-hub.md) | Use a thumbnail-first Garden Hub | Accepted |
| [ADR-0030](0030-use-context-aware-plant-colors.md) | Use context-aware plant colors | Accepted; amended for canvas colors by ADR-0073 (S4): the Garden Plan and thumbnails color plants by crop family, and the plant panel hides the color picker; the stored `color` field stays; ADR-0076 returns the canvas to one muted color per plant type |
| [ADR-0031](0031-use-review-first-ai-care-note-extraction.md) | Use review-first AI care note extraction | Superseded by ADR-0032 |
| [ADR-0032](0032-use-local-first-ai-providers-for-care-notes.md) | Use local-first AI providers for care notes | Accepted; provider configuration amended by ADR-0058 |
| [ADR-0033](0033-use-deterministic-fallbacks-for-clear-ai-care-notes.md) | Use deterministic fallbacks for clear AI care notes | Accepted; fallback scope amended by ADR-0058 |
| [ADR-0034](0034-use-workspace-and-garden-care-targets.md) | Use workspace and garden care targets | Accepted |
| [ADR-0035](0035-use-reviewable-plant-health-records.md) | Use reviewable plant health records | Accepted |
| [ADR-0036](0036-use-curated-local-rag-for-plant-knowledge.md) | Use curated local RAG for plant knowledge | Accepted |
| [ADR-0037](0037-use-area-summary-and-pairing-notes-for-season-planning.md) | Use area summaries and pairing notes for season planning | Superseded by ADR-0039 |
| [ADR-0038](0038-link-current-plantings-to-layout-positions.md) | Link current plantings to layout positions | Accepted |
| [ADR-0039](0039-use-separate-season-plans-for-future-planting.md) | Use separate season plans for future planting | Accepted |
| [ADR-0040](0040-use-vercel-render-and-supabase-for-the-portfolio-demo.md) | Use Vercel, Render, and Supabase for the portfolio demo | Accepted; amended by ADR-0060 |
| [ADR-0041](0041-use-a-garden-operations-ui-shell.md) | Use a Garden Operations UI shell | Superseded |
| [ADR-0042](0042-use-a-direct-garden-editing-workflow.md) | Use a direct garden editing workflow | Superseded |
| [ADR-0043](0043-use-a-single-planting-area-editor.md) | Use a single planting-area editor | Superseded |
| [ADR-0044](0044-use-plan-canvas-and-bed-shortcuts.md) | Use a Plan canvas and bed shortcuts | Superseded |
| [ADR-0045](0045-use-a-garden-properties-panel-and-module-cards.md) | Use a Garden properties panel and module cards | Superseded by ADR-0051 |
| [ADR-0046](0046-use-an-in-context-planting-area-creation-panel.md) | Use an in-context planting-area creation panel | Superseded by ADR-0050 |
| [ADR-0047](0047-use-a-unified-planting-area-properties-form.md) | Use a unified planting-area properties form | Superseded by ADR-0050 |
| [ADR-0048](0048-place-garden-properties-above-the-plan-canvas.md) | Place Garden properties above the Plan canvas | Superseded in part by ADR-0072 (G6) |
| [ADR-0049](0049-use-visually-distinct-automatic-plant-colors.md) | Use visually distinct automatic plant colors | Accepted; amended for canvas colors by ADR-0073 (S4): crop-family colors replace the automatic per-plant colors on the Garden Plan and thumbnails; refined by ADR-0076: one muted color per plant type, distinct within each garden |
| [ADR-0050](0050-use-a-garden-plan-planting-area-inspector.md) | Use a Garden Plan planting-area inspector | Superseded by ADR-0053 |
| [ADR-0051](0051-prioritize-daily-garden-work-on-the-dashboard.md) | Prioritize daily garden work on the dashboard | Accepted; the dashboard care-task card superseded in part by ADR-0073 (S5): a short "Today" strip at the top of Gardens links to Care, which holds the full list |
| [ADR-0052](0052-show-save-actions-only-for-pending-edits.md) | Show Save actions only for pending edits | Accepted; amended for Garden Plan by ADR-0072 (G5, G6) |
| [ADR-0053](0053-keep-plant-layout-in-the-planting-area-inspector.md) | Keep plant layout in the planting-area inspector | Superseded by ADR-0072 (G3) |
| [ADR-0054](0054-use-fixed-canvas-garden-plan-views.md) | Use fixed-canvas Garden Plan views | Superseded in part by ADR-0072 (G2) |
| [ADR-0055](0055-use-automatic-sync-with-optimistic-locking.md) | Use automatic workspace sync with optimistic locking | Accepted |
| [ADR-0056](0056-use-a-budgeted-tool-calling-agent-for-season-allocation.md) | Use a budgeted tool-calling agent for next-season allocation | Accepted; public run limit amended by ADR-0057 |
| [ADR-0057](0057-keep-live-allocation-runs-closed-after-evaluation.md) | Keep live allocation runs closed in the public demo after evaluation | Accepted; key scope amended by ADR-0060 |
| [ADR-0058](0058-classify-care-notes-before-filling-a-draft.md) | Classify care notes before filling a reviewable draft | Accepted |
| [ADR-0059](0059-open-budgeted-public-care-note-generation.md) | Open budgeted care note generation in the portfolio demo | Rejected after two evaluations |
| [ADR-0060](0060-offer-assisted-care-note-drafting-in-the-portfolio-demo.md) | Offer assisted care-note drafting in the portfolio demo | Accepted |
| [ADR-0061](0061-prioritize-global-garden-notes-and-consistent-workflows.md) | Prioritize global AI garden notes, clear workspace scopes, and consistent feedback | Accepted for product direction; implementation pending |
| [ADR-0062](0062-preserve-planting-area-editor-drafts.md) | Preserve planting-area property and plant-editor drafts | Accepted; amended for Garden Plan by ADR-0072 (G5) |
| [ADR-0063](0063-use-workspace-routes-and-shared-session-state.md) | Use workspace routes and shared session state | Accepted; superseded in part by ADR-0073: the home route moved to `/gardens` (S1), the garden subnavigation and "Back to gardens" replaced by the L1 header and a breadcrumb (S2), and `/gardens/[gardenId]/care` and `/gardens/[gardenId]/season` redirect to the filtered `/care` and `/season` (S3) |
| [ADR-0064](0064-separate-workspace-save-status-and-explicit-retries.md) | Separate workspace save status and explicit retries | Accepted |
| [ADR-0065](0065-fit-metric-canvases-to-their-containers.md) | Fit metric canvases to their containers | Accepted |
| [ADR-0066](0066-adapt-area-editing-to-available-space.md) | Adapt area editing to available space | Superseded in part by ADR-0072 (G3) |
| [ADR-0067](0067-project-care-across-locations-with-explicit-ownership.md) | Project Care across locations with explicit ownership | Accepted; superseded in part by ADR-0073 (S3): the garden Care page and its "Applies to all gardens" section are replaced, and a garden's care is global Care filtered to that location |
| [ADR-0068](0068-extract-bounded-workspace-care-note-batches.md) | Extract bounded workspace care-note batches | Accepted; real-model evaluation pending |
| [ADR-0069](0069-open-garden-notes-in-place-from-overview.md) | Open Garden Notes in place from Overview | Accepted; entry superseded in part by ADR-0073 (S2): the header "+ Note" opens the dialog from any app page |
| [ADR-0070](0070-preview-and-position-planting-areas-on-the-plan.md) | Preview and position planting areas on the plan | Superseded in part by ADR-0072 (G2, G3, G4) |
| [ADR-0071](0071-recover-missing-workspaces-from-browser-copies.md) | Recover missing workspaces from browser copies | Accepted |
| [ADR-0072](0072-use-a-single-plan-canvas-with-guided-setup.md) | Use a single plan canvas with guided setup | Accepted; implemented (G1–G7); the G1 presentation and the wide side column superseded in part by ADR-0073 (S4): a pale planting chart, and from 900 px the toolbar, zoom, and legend float over the canvas; amended 2026-11-15: the area panel sits in a column beside the canvas, and "Whole garden" only zooms out while the area stays open; the single panel for area properties and plants superseded in part by ADR-0075: Planting areas and Plants are separate levels |
| [ADR-0073](0073-separate-the-landing-page-and-use-a-textured-deep-green-look.md) | Separate the landing page from the app and use a textured deep-green look | Accepted; implemented (S1–S7); amended 2026-11-16: "Care to do" and AI Garden Notes sit beside the gardens, tasks tick off in place, and garden thumbnails carry no text; the landing showcases (S6b) are placeholders until their form is decided; plant colors superseded in part by ADR-0076; the Gardens home layout ("Care to do", the side column) superseded in part by ADR-0081; the app frame gains a compact footer in ADR-0083 |
| [ADR-0074](0074-keep-the-portfolio-demo-awake-with-a-scheduled-check.md) | Keep the portfolio demo awake with a scheduled check | Accepted; amended by ADR-0079 |
| [ADR-0075](0075-edit-an-existing-garden-in-three-levels.md) | Edit an existing garden in three levels | Accepted; implemented 2026-11-16; superseded in part by ADR-0078: a garden opens on Garden, Delete garden moves to the title row, and the level bar is a strip of joined arrows |
| [ADR-0076](0076-color-each-plant-type-from-a-shared-muted-palette.md) | Color each plant type from a shared muted palette | Accepted; implemented 2026-11-16 |
| [ADR-0077](0077-show-three-real-gardens-as-the-demo.md) | Show three real gardens as the demo | Accepted; implemented 2026-11-16; amended 2026-11-16: saved workspaces swap the old sample demo for the showcase; the public AI features keep the sample garden until the AI redo |
| [ADR-0078](0078-finish-a-garden-with-done-and-open-it-on-the-garden-level.md) | Finish a garden with Done and open it on the Garden level | Accepted; implemented 2026-11-16; amended 2026-11-17: the guided setup's Garden size step shows Delete garden |
| [ADR-0079](0079-wake-the-demo-from-an-external-scheduler-and-the-landing-page.md) | Wake the demo from an external scheduler and the landing page | Accepted; code implemented 2026-11-18; the external scheduler is set up by the owner |
| [ADR-0080](0080-show-care-as-a-today-board-with-a-separate-history-log.md) | Show Care as a Today board with a separate History log | Accepted 2026-11-16; implemented 2026-11-17. |
| [ADR-0081](0081-stage-the-gardens-on-a-textured-band-on-the-gardens-home.md) | Stage the gardens on a textured band on the Gardens home | Accepted 2026-11-16; implemented 2026-11-17 |
| [ADR-0082](0082-show-next-season-as-a-rotation-sheet-with-a-dark-plan-lane.md) | Show Next Season as a rotation sheet with a dark plan lane | Accepted 2026-11-16; implemented 2026-11-18 |
| [ADR-0083](0083-close-app-pages-with-a-compact-footer.md) | Close app pages with a compact footer | Accepted; implemented 2026-11-17 |

## Interview Use

These records are evidence of engineering judgment. Interview answers should
describe the constraint, tradeoff, selected option, downside, and trigger for
reconsideration rather than claiming one technology is always best.
