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
| [ADR-0024](0024-use-explicit-local-garden-import-for-postgresql.md) | Use an explicit local-garden import for PostgreSQL | Accepted |
| [ADR-0025](0025-use-three-season-crop-rotation-warnings.md) | Use three-season crop rotation warnings | Accepted |
| [ADR-0026](0026-use-a-next-season-planning-workspace.md) | Use a next-season planning workspace for crop rotation | Superseded by ADR-0039 |
| [ADR-0027](0027-use-persistent-plant-colors-and-garden-plan-zoom.md) | Use persistent plant colors and Garden Plan zoom | Superseded in part by ADR-0054 |
| [ADR-0028](0028-use-plant-types-varieties-and-bilingual-color-aliases.md) | Use plant types, varieties, and bilingual color aliases | Accepted |
| [ADR-0029](0029-use-a-thumbnail-first-garden-hub.md) | Use a thumbnail-first Garden Hub | Accepted |
| [ADR-0030](0030-use-context-aware-plant-colors.md) | Use context-aware plant colors | Accepted |
| [ADR-0031](0031-use-review-first-ai-care-note-extraction.md) | Use review-first AI care note extraction | Superseded by ADR-0032 |
| [ADR-0032](0032-use-local-first-ai-providers-for-care-notes.md) | Use local-first AI providers for care notes | Accepted |
| [ADR-0033](0033-use-deterministic-fallbacks-for-clear-ai-care-notes.md) | Use deterministic fallbacks for clear AI care notes | Accepted |
| [ADR-0034](0034-use-workspace-and-garden-care-targets.md) | Use workspace and garden care targets | Accepted |
| [ADR-0035](0035-use-reviewable-plant-health-records.md) | Use reviewable plant health records | Accepted |
| [ADR-0036](0036-use-curated-local-rag-for-plant-knowledge.md) | Use curated local RAG for plant knowledge | Accepted |
| [ADR-0037](0037-use-area-summary-and-pairing-notes-for-season-planning.md) | Use area summaries and pairing notes for season planning | Superseded by ADR-0039 |
| [ADR-0038](0038-link-current-plantings-to-layout-positions.md) | Link current plantings to layout positions | Accepted |
| [ADR-0039](0039-use-separate-season-plans-for-future-planting.md) | Use separate season plans for future planting | Accepted |
| [ADR-0040](0040-use-vercel-render-and-supabase-for-the-portfolio-demo.md) | Use Vercel, Render, and Supabase for the portfolio demo | Accepted |
| [ADR-0041](0041-use-a-garden-operations-ui-shell.md) | Use a Garden Operations UI shell | Superseded |
| [ADR-0042](0042-use-a-direct-garden-editing-workflow.md) | Use a direct garden editing workflow | Superseded |
| [ADR-0043](0043-use-a-single-planting-area-editor.md) | Use a single planting-area editor | Superseded |
| [ADR-0044](0044-use-plan-canvas-and-bed-shortcuts.md) | Use a Plan canvas and bed shortcuts | Superseded |
| [ADR-0045](0045-use-a-garden-properties-panel-and-module-cards.md) | Use a Garden properties panel and module cards | Superseded by ADR-0051 |
| [ADR-0046](0046-use-an-in-context-planting-area-creation-panel.md) | Use an in-context planting-area creation panel | Superseded by ADR-0050 |
| [ADR-0047](0047-use-a-unified-planting-area-properties-form.md) | Use a unified planting-area properties form | Superseded by ADR-0050 |
| [ADR-0048](0048-place-garden-properties-above-the-plan-canvas.md) | Place Garden properties above the Plan canvas | Accepted |
| [ADR-0049](0049-use-visually-distinct-automatic-plant-colors.md) | Use visually distinct automatic plant colors | Accepted |
| [ADR-0050](0050-use-a-garden-plan-planting-area-inspector.md) | Use a Garden Plan planting-area inspector | Superseded by ADR-0053 |
| [ADR-0051](0051-prioritize-daily-garden-work-on-the-dashboard.md) | Prioritize daily garden work on the dashboard | Accepted |
| [ADR-0052](0052-show-save-actions-only-for-pending-edits.md) | Show Save actions only for pending edits | Accepted |
| [ADR-0053](0053-keep-plant-layout-in-the-planting-area-inspector.md) | Keep plant layout in the planting-area inspector | Accepted |
| [ADR-0054](0054-use-fixed-canvas-garden-plan-views.md) | Use fixed-canvas Garden Plan views | Accepted |

## Interview Use

These records are evidence of engineering judgment. Interview answers should
describe the constraint, tradeoff, selected option, downside, and trigger for
reconsideration rather than claiming one technology is always best.
