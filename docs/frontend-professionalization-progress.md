# Frontend Professionalization — Execution Record

## Scope and baseline

The owner authorized T00–T08 and then requested small, independently verified delivery batches. Each turn completes one batch and records its handoff. AI Garden Note remains a global homepage capability; cross-garden multi-event review and saving remain required in T08.

- Baseline HEAD: `d363e04`; current branch: `care-note-paid-checks`.
- Existing owner work: `docs/decisions/README.md`, `docs/portfolio-demo-deployment.md`, ADR-0061, the frontend plan, and `backend/evaluation/care_note/batch-2/ledger.json.lock`.
- Original baseline tests: 144 passed.
- A feature-branch creation request previously failed because `.git` is read-only in the session sandbox; its escalation was cancelled. The owner then requested work in small batches. This bounded fix stays in the original working directory and current branch. No branch, commit, push, merge, deployment, quota, or paid-model changes occurred.
- The earlier temporary copy under `/tmp/garden-frontend-mHAk10` contains abandoned, unverified preliminary work. It is not the implementation source and must not be copied over this repository. It was left untouched after the owner asked to stop using other directories.

## Delivery batches

### Subsequent visual redesign direction — 2026-11-12

After trying the implementation, the owner requested a garden-first Overview,
one useful thumbnail per garden, a compact due/upcoming task panel, and Garden
Note in a homepage modal. Garden and planting-area editing remain map-centered;
Plant Doctor and Next Season need clear global navigation entries. The owner
requested a concrete professional UI/UX redesign plan before broad changes.

See [Frontend UI/UX redesign plan](frontend-ui-ux-redesign-plan.md) for the
proposed R0–R5 batches, component states, responsive layouts and acceptance
criteria. The product direction and modal choice are confirmed; the detailed
visual proposal has not yet passed owner review or browser acceptance. This
planning step changes no application code. The earlier implementation/test
results below remain valid records of that work, not visual design approval.

| Batch | Tasks | Status |
| --- | --- | --- |
| 1 | T00 baseline and T01 editor draft protection | T01 local checks and prepared browser scenarios passed in batch 3b; T00 historical baseline/branch still partial |
| 2 | T02 routes, shared provider, navigation | Implementation, local checks, and prepared browser scenarios passed |
| 3a | T03 global sync feedback and retries | Implementation, local checks, and prepared browser scenarios passed |
| 3b | T03 form-local validation and feedback | Implementation, local checks, and browser validation scenario passed |
| 4a | T04 homepage and visual foundation | Implemented; 194 local tests and 11 browser scenarios passed |
| 4b | T06 dialogs and consistent deletion | Implemented; 201 local tests/checks passed; real-browser acceptance blocked by current approval policy |
| 5a | T05 responsive canvas foundation | Implemented; 211 local tests/checks passed; real-browser acceptance pending |
| 5b | T05 responsive inspector, details and area positioning | Implemented; 224 local tests/checks passed; real-browser acceptance pending |
| 6a | T07 global Care aggregation and owner-safe workflows | Implemented; 233 local tests/checks passed; real-browser acceptance pending |
| 6b | T07 Season, other AI pages, names and product copy | Implemented; 249 local tests/checks passed; real-browser acceptance pending |
| 7 | T08 batch extraction API and offline tests | Implemented; 416 backend tests and 258 frontend tests passed; real-model evaluation pending |
| 8 | T08 review UI and atomic application | Implemented; 273 frontend / 418 backend tests passed; real-browser and real-model acceptance pending |

T00 remains partially complete: original before-change browser screenshots were not captured, and a dedicated feature branch was not created under the earlier read-only git restriction. Current screenshots and browser scenarios were completed in batch 3b after authorized browser execution became available. Material decisions for routing, responsive editing, and batch AI will be recorded when their batches begin. ADR-0062 records this batch's draft lifetime and merge behavior.

## Batch 1: behavior and files

Goal: preserve unsaved planting-area and plant edits during unrelated workspace updates and same-tab application navigation, with explicit discard and valid saves.

- `src/components/GardenWorkspace.tsx`: owns drafts keyed by garden/area, captures garden ownership for updates, merges properties into current allocations, checks unavailable targets, provides draft recovery text, and registers beforeunload warnings.
- `src/components/PlantingAreaInspector.tsx`: extracted property editor, baseline comparison, conflict display/reload, field errors and first-error focus, and dirty-close confirmation.
- `src/components/GrowingAreaLayoutEditor.tsx`: retained plant drafts, textual numeric inputs, current-boundary validation, clean-draft reconciliation, and deliberate discard before replacing an edited plant.
- `src/lib/areaEditorDrafts.ts`: property validation/comparison/merge and plant-draft helpers.
- Three new test files: `AreaDraftProtection.test.tsx`, `PlantingAreaInspector.test.tsx`, `areaEditorDrafts.test.ts`.
- `e2e/draft-protection.spec.ts`: prepared browser scenarios for 390×844 and 1440×900; not executed successfully yet.
- ADR-0062 and its index entry.

Acceptance covered by automated tests: unsaved name plus plant creation, property saves preserving latest allocations, area and module navigation, external property changes, explicit reload, rejected saves retaining drafts, dirty close/cancel/discard, blank/negative/decimal numeric inputs, resized bounds with pending plant coordinates, name editing including spaces, and unload warnings.

## Batch 1 verification

- The first three regression cases failed against the original implementation before the fix.
- `npm test`: 157 tests passed across 11 files at the last full test run.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run build`: passed; no development server was listening on port 3000 before the build.
- `git diff --check`: passed.
- Real-browser testing: the earlier attempt could not bind the isolated test API to `127.0.0.1:8100` (`operation not permitted`); escalation was cancelled. No further permission requests or port-listening workarounds were attempted. Browser scenarios and screenshots are not claimed as passed. After the owner resolves that permission, run `npm run test:e2e -- e2e/draft-protection.spec.ts`.
- No formatting script exists. Existing tests were retained, and no dependency was added.

## Batch 1 limits and handoff

T01 code is implemented and locally tested; full browser acceptance is outstanding. Current screen navigation is still the original in-memory navigation, so true URL/history tests belong to T02. Move these two small draft maps into T02's persistent workspace provider rather than introducing a second store. Other forms and AI note drafts need their own route-lifetime treatment in that batch.

This batch reuses the existing confirmation component. Native modal focus trapping, keyboard restoration, and the wider deletion policy remain T06 work. Drafts are in memory only; browser beforeunload prompts are best-effort and do not restore drafts after refresh. No new T08 capability is claimed, and public AI restrictions remain unchanged.

## Batch 2: routes and shared session state

Goal: give each module a stable URL, resolve the garden from that URL, and retain workspace synchronization and unsaved drafts while navigating within the same tab.

- `src/app/(workspace)/`: shared layout and ten thin module entries, including dynamic garden Plan/Care/Season pages. The old root page was removed to avoid a duplicate `/`. Module metadata stays generic.
- `src/components/workspace/WorkspaceProvider.tsx`: owns the single synchronization hook, editor drafts from batch 1, other form session fields, and request guards. Drafts remain in memory; unload warnings also cover unsynchronized server changes.
- `src/components/workspace/AppShell.tsx` and its CSS module: global links, mobile disclosure, garden switcher and section links, skip link, heading focus, and basic shared synchronization text. Detailed status and retry behavior remain T03.
- `src/lib/workspaceRoutes.ts` and `GardenWorkspace.tsx`: explicit URL ownership, encoded entity links, query-controlled care view and area inspector, restoration before missing-entity errors, and reliable parent navigation. Navigating to a garden does not mutate the persisted selectedGardenId or trigger a workspace PUT.
- `WorkspaceNoteEntry.tsx` and `AiGardenNote.tsx`: editable homepage entry and `/notes` share raw text and the existing single-event draft. Opening a route never generates a note. A late response cannot replace text edited on the homepage. Local single-event generation requires an explicit garden choice; public demo restrictions remain unchanged.
- `CareWorkspace.tsx`, `GardenPlanOverview.tsx`, `SeasonPlanner.tsx`, `AllocationAssistant.tsx`, `PlantKnowledge.tsx`, and `PlantHealth.tsx`: preserve relevant form inputs/results across route unmounts using scoped session keys. Garden properties and planting-area shortcuts use explicit target context.
- `src/test/WorkspaceHarness.tsx`, `src/test/router.ts`, and test setup: persistent provider and history harness. Existing business assertions were migrated to real navigation semantics; none of the original test cases were deleted.
- `WorkspaceRouting.test.tsx` and `workspaceRoutes.test.ts`: deep-link ownership, delayed restore, missing entities, query cleanup, one workspace restore, no navigation-only writes, Care Back/Forward draft retention, shared note text, no automatic generation, stale-response rejection, and encoded IDs.
- `e2e/workspace-routes.spec.ts`: prepared real-browser deep-link, refresh, history, missing-entity and mobile note scenarios. Earlier browser scripts now follow route links.
- ADR-0063 records routing and shared state; ADR-0029 and ADR-0062 point to the refinement.

## Batch 2 verification

- `npm test`: 164 tests passed across 13 files after migrating navigation and adding routing coverage.
- `npm run lint`: passed.
- `npm run typecheck`: passed after correcting two type errors in the new test mocks/assertions.
- `npm run build`: passed, generating all ten application route entries. No development server was listening on port 3000 before the build.
- `npm run test:e2e -- --list`: passed, discovering five browser scenarios across three files. Discovery does not execute a browser or prove the scenarios pass.
- `git diff --check`: passed.
- Real-browser execution and screenshots remain pending because the previous attempt to bind the test API to `127.0.0.1:8100` was denied and its escalation was cancelled. No further permission prompt or port workaround was attempted in this batch. Once permission is resolved, run `npm run test:e2e` for both batches' browser acceptance.
- No dependencies, backend contracts, public quotas, paid model calls, git mutations, or deployments were introduced. Existing deployment documentation and the evaluation lock remain owner changes.

## Batch 2 limits and next batch

T02 implementation and local checks are complete; actual browser navigation, refresh behavior, focus, and mobile appearance still require browser acceptance. Session drafts survive application navigation, but refresh recovery is not provided. T01 drafts now live in the provider, superseding batch 1's component ownership.

The homepage note entry is retained and shares text with `/notes`; generation still uses the existing single-event API. Homepage presentation and its final explicit generation action belong to T04. Cross-garden multi-event extraction, per-item review, and saving remain mandatory T08 work. `/care` currently retains the location chooser and workspace-wide records; combining all gardens' records belongs to T07.

Next batch: T03, shared save feedback and reliable retry after connectivity returns, including conflict handling and duplicate prevention. Do not start T04–T08 as part of the T03 batch.

## Batch 3a: global saving feedback and recovery

T03 is split into two bounded capabilities. This batch implements global save status and recovery; the next batch applies shared field errors and local operation feedback across forms. The owner authorized continuation without requiring an upload or commit.

Goal: a failed Next Season save stays visible across modules and can be retried without editing another field or adding the record again. Inputs and the latest workspace remain available after connection or storage failures.

Files and behavior:

- `src/hooks/useWorkspaceSync.ts`: typed synchronization state separate from business messages; explicit retry with a synchronous duplicate-request guard; serial saves carrying forward revision; snapshot-based confirmation; slow-operation state; online/offline hints; local write-error state; retryable initial restoration. Conflict generations still invalidate older queued saves.
- `src/lib/gardenWorkspaceApi.ts`: a 30-second timeout for workspace reads, imports, and writes. AI requests are unchanged.
- `src/components/workspace/SyncStatus.tsx`, `AppShell.tsx`, and `AppShell.module.css`: one persistent saving status on every route, Retry, slow/offline guidance, and confirmation of the consequences of either conflict resolution choice. Saved-state wording distinguishes submitted workspace changes from form drafts.
- `WorkspaceProvider.tsx`: separates synchronization from business messages and also warns before unload when device storage failed.
- `GardenWorkspace.tsx`: removes duplicate conflict/status handling, retains the unavailable workspace instead of replacing it with stale browser data, and removes unconditional device-save claims from garden management. Last-garden removal now stops if local deletion failed.
- Import retries reuse their original ID/payload within the session. Acknowledgment then triggers a save of any newer local edits; a late import cannot restore a local workspace that was deliberately removed.
- `src/hooks/useWorkspaceSync.test.tsx` and `src/components/SyncFeedback.test.tsx`: 14 new regression scenarios. Existing conflict tests now perform the explicit confirmation and retain their queue-safety assertions.
- `e2e/sync-recovery.spec.ts`: prepared Next Season failure/retry/persistence scenario. Existing browser scripts now assert the shared saving status.
- ADR-0064 and a refinement pointer in ADR-0055.

Acceptance covered locally: unchanged-snapshot retry; same-tick double retry; edits queued behind a retry; A→B→A pending saves; a newer failure surviving an earlier success; lost response followed by 409; no automatic write on online events; edits during conflict reload; confirmation cancellation; restoration retry; device-write failure and recovery; idempotent import retry; discarded late import; five-second slow feedback; 30-second read/write timeouts; Next Season retry across routes retaining exactly one record and its ID; restoration of that record after remount; unload warning after local storage failure.

## Batch 3a verification and limits

- `npm test`: 178 tests passed across 15 files.
- `npm run lint` and `npm run typecheck`: passed.
- `npm run build`: passed; no development server was listening on port 3000 before the build.
- `npm run test:e2e -- --list`: passed, discovering six scenarios across four files. Browser execution is still pending; listing scenarios is not execution.
- `git diff --check`: passed.
- Actual browser validation and screenshots remain blocked by the previously denied local test API binding to `127.0.0.1:8100`. No new permission prompt or alternate-directory/port workaround was attempted.
- No commit, push, deployment, paid model request, dependency change, backend change, or public limit change. Original owner modifications remain separate and preserved.

T03 is not fully complete: batch 3b still needs form-local field errors, first-error focus, and consistent local operation wording. T04–T08 remain pending, including mandatory cross-garden multi-event note review/save. Refresh still cannot restore unsynced server edits or unsubmitted session drafts. Next: complete T03b before starting T04.


## Batch 3b: local form errors and action feedback

Goal: keep invalid submissions in their form, identify the fields to fix, focus the first invalid field, and retain all input. AI generation errors stay beside the generation form, while reviewed-record validation is separate from global persistence.

Files and behavior:

- `src/components/forms/FormFeedback.tsx` and `FormFeedback.module.css`: shared native-constraint and domain validation, whitespace-required checks, field error descriptions, first-error focus, local notices, and invalid-field styling. Existing hint IDs are retained alongside error descriptions. Changing a select clears errors for dependent fields that may disappear.
- `GardenWorkspace.tsx` and `GardenPlanOverview.tsx`: garden creation, garden properties, and planting-area creation use inline errors. Local success wording describes records added or properties updated. Next Season receives its operation notice.
- `CareWorkspace.tsx`: event, task, and completion forms show date, target, amount, and repeat-interval errors by their fields. Existing former-target allowances remain intact. Fertilizer amounts follow the existing domain rule of strictly greater than zero, including positive decimals below 0.01.
- `GrowingAreaLayoutEditor.tsx`: properties, adding plants, editing plants, and duplicate actions use form validation. Add-and-duplicate and Duplicate plant submit through the same checks. Position validation uses current area dimensions and retains the T01 draft protections.
- `SeasonPlanner.tsx`: a blank crop choice stays open with an inline error; successful plan changes have local feedback.
- `AiGardenNote.tsx`: note input errors and generation errors appear in the generation form; review errors have their own fields/status. Missing or unavailable targets, invalid dates, and invalid amounts cannot apply a draft. Existing request guards, public restrictions, and homepage sharing remain intact.
- `PlantHealth.tsx` and `PlantKnowledge.tsx`: request failures remain inside their forms without clearing input. Health observations are validated again before an already generated assessment is saved, so changing the date after generation cannot bypass validation.
- `AllocationAssistant.tsx`: crop/area requirements explain why planning is unavailable; request failures are inside the form. Existing public-demo and synchronization gates remain unchanged.
- `PlantingAreaInspector.tsx` retains T01's existing field errors, first-error focus, baseline conflict checks, and discard behavior rather than replacing working validation.
- New `FormValidation.test.tsx` and `forms/FormFeedback.test.tsx`: 11 scenarios cover multiple errors, hint/error associations, first-error focus, whitespace, date/interval errors, amount rules, dependent-field cleanup, duplicate-action validation, no model request on invalid notes, failed question retention, and health-save revalidation. The existing AI-target test now asserts the target's accessible error and focus.
- `e2e/form-validation.spec.ts`: real browser validation, focus, retained input, correction, save, and refresh. Routing scripts now wait for the URL transition before Back/Reload and distinguish application alerts from Next.js's route announcer. `playwright.config.ts` uses the same Watchpack polling mode as the project's dev command.

### Validation completed

- `npm test`: **189 passed**, 17 files.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run build`: passed; port 3000 had no active development server.
- `git diff --check`: passed.
- `WATCHPACK_POLLING=true AI_PROVIDER=ollama CARE_NOTE_AI_PROVIDER=ollama npm run test:e2e`: **7 passed** in the final full run, using real Chromium, the local application/API, and the isolated E2E database. No paid AI call was made.

Browser execution status supersedes the earlier blockers: the local test services could now bind their ports. The first browser launch inside the sandbox failed with macOS MachPortRendezvous permission denial. Authorized execution outside the sandbox succeeded. Watchpack polling avoided the file-watcher limit. Earlier browser attempts exposed test timing/locator issues, corrected before the passing full run.

Covered browser journeys: editor drafts at 390×844 and 1440×900; garden creation/edit/season plan persistence; local validation and focus; failed save retried from another route without duplicating a record; deep links, back/forward, reload, missing entities; mobile menu and homepage note sharing without generation.

Current editor screenshots were captured and inspected at:

- `test-results/draft-protection-area-draf-20071-ion-and-navigation-at-390px/editor-390.png`
- `test-results/draft-protection-area-draf-1655a-on-and-navigation-at-1440px/editor-1440.png`

These are ignored test artifacts and can be regenerated by the E2E suite. They show the current post-T03 interface, not an original before-change baseline. The mobile inspector still sits below the canvas and requires scrolling; the responsive editor treatment remains T05. This passing functional suite is not final T04/T05 visual acceptance.

### Next batch

T01–T03 implementation and their current regression scenarios are complete. Next is T04: homepage priorities and shared visual foundations, with AI Garden Note remaining directly editable on the homepage. T06 follows as its own small batch, then T05/T07/T08. Cross-garden multi-event draft review/save remains required T08 work.

No commits, uploads, pushes, deployments, dependency additions, paid model calls, or public-limit changes were made. Original owner modifications remain preserved. Unsubmitted drafts and unsynced server edits still require the tab to remain open; durable draft recovery is outside the accepted session-only design.


## Batch 4a: homepage and shared visual foundation (2026-11-10)

Goal: make the global AI Garden Note directly usable on the first screen, show real due work across gardens, and establish common visual controls without changing the current AI contract.

Implemented:

- `WorkspaceHome.tsx` / `WorkspaceHome.module.css`: extracted homepage with the AI entry first, a compact task summary, Your gardens, a secondary Add garden action, and compact reference links. Demo Garden stays a secondary action after personal gardens. Container queries produce one/two/three card columns; names remain complete and unbroken strings wrap. Navigation cards contain no nested interactive controls. Empty onboarding uses the same note and visual foundation without adding example data automatically.
- `WorkspaceNoteEntry.tsx`: editable three-row, 112px minimum note input; 500 Unicode-code-point count and validation; explicit Review draft and manual-entry link; truthful settings/loading/unavailable/preview/live-demo messages. Until T08, the user explicitly chooses a garden for the current single-event request. Missing gardens require setup before generation/save. Public demo gates and fixed Demo Garden behavior remain unchanged.
- `useGardenNoteDraft.ts`: moved the existing single-event state/action into one shared hook backed by provider session fields and request refs. Homepage submission starts the request directly, then navigates to `/notes`. There is no mount effect that generates a note. Fast duplicate submissions share the immediate request guard, stale responses are rejected after edits, and reviewing an existing draft does not regenerate it. `AiGardenNote.tsx` uses this same action; saving still requires review.
- `homeTasks.ts`: combines root and every garden's task collection, deduplicates IDs, uses local `todayDate` and existing `careTaskStatus`, counts overdue/due-today tasks, and lists at most three by due date with their location. Individual links open the owning Care view; the summary links to `/care?view=tasks`.
- `src/styles/tokens.css`, `controls.css`, and `components/ui/`: shared colors, spacing, typography foundations, flat primary/secondary/text/danger buttons, stable loading labels, disabled states, 44px actions, PageHeader and compact EmptyState. Existing FormField now also accepts label/hint props and links hints to inputs; InlineNotice supports info/success/warning/error while preserving existing status callers.
- Removed obsolete homepage and raised/shifting button rules after searching their references. `globals.css` now contains imports and base reset/typography/focus/reduced-motion rules. Remaining editor/Care/Season/AI layouts are explicitly retained in `legacy-workspace.css` for T05–T07 migration. Existing button class aliases use the same shared control definitions until their JSX callers migrate. No new design-system dependency was added.
- `AppShell` uses PageHeader and the shared Menu button. The workspace layout now places its provider inside the existing Suspense boundary so restoration cannot update a still-dehydrated shell. The new empty-home browser error check exposed the previous saving-status hydration mismatch; moving the boundary eliminated it, and the check remains in the suite.

Validation:

- `npm test`: **194 passed**, 19 files. Added regression coverage for explicit homepage generation under Strict Mode, double submission, navigation without regeneration, code-point limits, required garden selection, demo-preview gates, connection failure retention, and task deduplication/counting/order.
- `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`: passed after the final implementation changes.
- `WATCHPACK_POLLING=true AI_PROVIDER=ollama CARE_NOTE_AI_PROVIDER=ollama npm run test:e2e`: **11 passed**. The new homepage cases cover 390×844, 900×900, and 1440×900; empty, single, and multiple gardens; long names; first-screen note/action visibility; one/two/three columns; no horizontal overflow or nested interactive card contents; no uncaught browser errors. A mocked AI response proves explicit generation is not repeated by navigation or refresh. All existing editor, validation, saving/retry, history and persistence browser scenarios also passed.
- Screenshots were captured and visually inspected. They are ignored, regenerable artifacts under `test-results/homepage-homepage-prioriti-9cb5e-d-multiple-gardens-at-390px/`, `test-results/homepage-homepage-prioriti-db029-d-multiple-gardens-at-900px/`, and `test-results/homepage-homepage-prioriti-545f2--multiple-gardens-at-1440px/` (`home-empty-*`, `home-one-*`, `home-many-*`). These show the actual current browser, not mockups. The Next development indicator is not part of the product UI.
- Measured token contrast ratios: body/white **13.64:1**, muted/page **5.60:1**, white/primary **6.58:1**, input border/white **3.67:1**, focus/page **8.36:1**, error/error-surface **5.98:1**, warning/warning-surface **6.38:1**. This verifies these pairs, not a full-site accessibility certification.
- Final logs: `/tmp/garden-t04-tests.log`, `garden-t04-types.log`, `garden-t04-lint.log`, `garden-t04-build.log`, and `garden-t04-e2e.log`. Browser execution used the authorized local test setup and isolated E2E database; AI requests in generation tests were intercepted.

### Current handoff

T04 is complete for this batch. Next: **batch 4b / T06**, consistent deletion confirmations and native-dialog keyboard/focus behavior. Then T05 responsive editor, T07 workflows, and T08 batch extraction/review/application. No new material product decision was needed beyond the accepted plan and ADR-0061.

Cross-garden multi-event AI drafting and per-item review/save are still mandatory T08 work and are **not implemented yet**. The homepage is global, but its interim single-event API still needs an explicit garden choice. The homepage task summary already aggregates all gardens; the full global Care list aggregation remains T07. Drafts remain session-only. No backend contract, public quota, paid-model call, commit, push, upload, or deployment was changed. Original owner files and the evaluation lock remain preserved.


## Batch 4b: deletion confirmations and keyboard interaction (2026-11-10)

Goal: confirm every persisted-entity deletion, describe its actual effects, and give cancellation and keyboard users a consistent modal interaction. This batch's implementation and local checks are complete; real-browser acceptance remains required before marking T06 fully complete.

Implemented:

- `ConfirmDialog.tsx` / `ConfirmDialog.module.css`: one shared native `dialog.showModal()` rendered through a portal, unique title/description IDs, explicit action labels, initial cancel focus, native background inertness, body scroll locking, Escape cancellation, no backdrop-click dismissal, constrained scrolling content and visible action area, synchronous duplicate-submission guard, and visible async-action errors without losing the confirmation. Closure restores the trigger or a supplied stable heading when the entity is gone. Focus destinations are captured before deferred restoration so a later screen cannot receive stale focus work. Removed the superseded global dialog rules.
- A small `useConfirmation` hook in the same file reuses that modal for action confirmation and dirty-form discard. Existing area/plant draft and sync-conflict confirmations also use the native implementation.
- `GardenWorkspace.tsx` and `deletionImpact.ts`: garden/area deletion names the object and reports actual linked counts. Area removal preserves care/task/health history and marks former targets; garden deletion removes its own history, while other gardens and root care remain (except clearing the final device-only workspace). Removed incorrect “from this browser” claims. The last synced garden remains protected. Confirmation checks the latest target/snapshot, updates the current workspace instead of a stale captured workspace, and preserves context on a rejected deletion or device-storage failure.
- `GrowingAreaLayoutEditor.tsx`: both plant-removal entry points now confirm; wording distinguishes removing a layout plant from archiving its last linked planting record and preserves care/health history. Checks the current layout before applying. Adds initial focus to opened plant forms and a stable editor-heading return destination.
- `CareWorkspace.tsx`: confirms care-record/task deletion, preserves completed history when removing a task, checks missing/changed targets, and focuses the remaining list heading. Baselines retained in session state distinguish unchanged forms from unsaved edits. Cancel and replacing an edited form require Keep editing / Discard changes; completion-date edits are covered. Successful submission still closes directly. URL views remain ordinary links; standalone tabs now have roving tabindex, arrows/Home/End, aria-controls, and associated panels.
- `SeasonPlanner.tsx`: confirms removal of a named future plan item without claiming it deletes current plants/history; validates the target still exists; confirms discarding changed plant choices; opened choice forms focus the plant field.
- New-garden and new-area cancellation now confirms actual changes before clearing fields. Reopening the new-area panel preserves its session draft rather than resetting it. Unavailable-area draft removal also asks before discarding.
- Updated existing deletion tests to perform and inspect the new confirmation instead of bypassing it. Existing business scenarios remain covered. Added `ConfirmDialog.test.tsx`, `DeletionSafety.test.tsx`, `deletionImpact.test.ts`. The jsdom dialog shim intentionally does not claim to simulate browser focus trapping or inert behavior.

Validation:

- `npm test`: **201 passed**, 22 files.
- `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`: passed.
- New local regression cases cover cancel with no mutation, backdrop behavior, native cancel event, focus restoration/fallback, same-tick duplicate confirmation, asynchronous rejection/retry, disappeared task targets, Keep editing / Discard changes retention, standalone tab keyboard/ARIA semantics, and deletion counts/history preservation.
- `e2e/confirmation.spec.ts`: prepared three real-browser scenarios, including 390px/1440px deletion, Tab/Shift+Tab/Escape, default/return/fallback focus, background scroll locking, 44px actions, short-screen internal scrolling, cancel with zero PUTs, one confirmed PUT and reload persistence, plus care-draft cancellation. AI endpoints are blocked in deletion scenarios; no model was called.
- `npm run test:e2e -- --list`: discovers **14 scenarios** in seven files. Discovery is not browser execution.
- The actual targeted browser attempt started the isolated local services but Chromium failed with macOS `MachPortRendezvous ... Permission denied (1100)`. The subsequent normal escalation request was rejected before execution by the current granular approval policy: `sandbox_approval: false`. No alternate browser, directory, or permission workaround was attempted. T04's earlier 11 passing browser tests are historical evidence, not verification of these new changes.
- Logs: `/tmp/garden-t06-tests.log`, `/tmp/garden-t06-types.log`, `/tmp/garden-t06-lint.log`, `/tmp/garden-t06-build.log`, `/tmp/garden-t06-safety.log`, `/tmp/garden-t06-browser.log`, `/tmp/garden-t06-e2e-list.log`.

### Current handoff and required permission

Next step is to allow approval of the local browser-test escalation (`sandbox_approval`, currently false), then run `WATCHPACK_POLLING=true AI_PROVIDER=ollama CARE_NOTE_AI_PROVIDER=ollama npm run test:e2e` and inspect the new dialog screenshots. No writable `.git` access is needed. Real Tab trapping, inert background, Escape and responsive dialog appearance must not be marked accepted until this succeeds. After T06 acceptance, continue batch 5 / T05 responsive garden editor, then T07/T08.

Original owner deployment-doc changes remain 34 additions / 2 deletions; the owner's decision/plan and evaluation lock were preserved. No commit, push, upload, deployment, paid-model call, dependency, backend contract, or public quota change. Cross-garden multi-event AI notes remain mandatory and pending T08.

## Batch 5a: responsive metric canvas foundation (2026-11-11)

The owner requested continuation in small batches. This batch advances the independent canvas work while T06 browser acceptance remains blocked. T05 is not fully complete.

Implemented:

- `useCanvasSize.ts`, `canvasViewport.ts`, and `components/canvas/Canvas.module.css`: observe available width/height, show an initial zero-size placeholder, fit both dimensions without a minimum scale that clips large gardens, use shared metre/pixel conversion, and bound grid density. Viewport-constrained heights are approximately 480/420/320px, with compact 168px thumbnails.
- `GardenPlanOverview.tsx`: responsive Stage dimensions; Full garden / Focus beds continue to preserve geometry. Drag rendering and conversion use one frozen transform until release, followed by refitting. Existing rotation, origin clamping, and 0.1m snapping remain. Removed fixed dimensions and obsolete canvas wrapper styles.
- `GrowingAreaLayoutEditor.tsx`: the same sizing and frozen-drag transform, a deliberate Move plants toggle, and full-name DOM buttons for selecting plants. Ordinary canvas browsing permits vertical touch scrolling; dragging requires Move. Actual plant radius continues to represent spacing. Labels below a readable size are hidden, displayed labels use at least 12px. Removed the small canvas deletion hotspot; the named, confirmed Remove plant panel action remains.
- `ResponsiveCanvas.test.tsx`, `canvasViewport.test.ts`, and `useCanvasSize.test.tsx`: ten added cases cover zero-size measurement, observer updates/disconnection, three viewport sizes, coordinate round trips, negative bounds/rotation, a huge empty garden, view changes without data mutation, both kinds of mid-drag resize, tiny-plant selection, and deletion through the panel. Existing plant-removal tests now exercise that panel action.
- `e2e/responsive-canvas.spec.ts`: three prepared scenarios at 390/900/1440px check rendered/logical/container sizes, a large garden, explicit Move, real plant dragging, server metre coordinates, resize/reload retention, and named editor access. AI routes are blocked. These scenarios have only been discovered, not executed.
- ADR-0065 records the accepted responsive sizing and Move behavior; ADR-0054 and the index reference it.

Validation:

- `npm test`: **211 passed**, 25 files.
- `npm run lint`, `npm run typecheck`, `npm run build`: passed. No development server was listening on port 3000 before building. A trailing blank line was removed after checks; no behavior changed.
- `git diff --check`: passed after that whitespace correction.
- `npm run test:e2e -- --list`: **17 scenarios** across eight files. Listing does not start a browser or establish acceptance.
- Logs: `/tmp/garden-t05a-tests.log`, `/tmp/garden-t05a-lint.log`, `/tmp/garden-t05a-types.log`, `/tmp/garden-t05a-build.log`, `/tmp/garden-t05a-e2e-list.log`.
- Browser execution remains pending under the previously recorded `sandbox_approval: false` rejection. No repeated escalation or alternate execution path was attempted. Native touch scrolling, actual pointer behavior, final overflow/layout and screenshots still need browser acceptance. Mocked Konva tests verify application conversion/state behavior only.

### Next batch / handoff

Continue **T05b**: garden-details summary/edit/cancel, desktop side inspector based on available container width, tablet modal overlay, mobile full-width area view with Back to plan, area X/Y inputs using the existing clamping/snapping rules, selected-area indication, and Garden settings deletion placement. Record the ADR-0048 presentation refinement when implementing it. Preserve the T01 draft maps and the new canvas measurement/transform foundation.

Run T06 and T05 browser scenarios once sandbox browser approval is available. T07 and both T08 batches remain required. **AI Garden Note remains directly usable on the homepage; cross-garden multi-event extraction, individual review and saving are still pending T08 and must not be dropped.**

Original owner deployment-document changes remain 34 additions / 2 deletions; the owner's plan/decision and evaluation lock remain preserved. No commit, push, upload, deployment, dependency, backend contract, paid-model call, or public quota change occurred.

## Batch 5b: responsive editing and keyboard positioning (2026-11-11)

Goal: open the selected area's editor immediately at each screen size, retain drafts while resizing, provide a reliable return path, and allow area positioning without dragging. This completes the planned T05 implementation; browser acceptance for T05 and T06 remains outstanding.

Implemented:

- `components/editor/EditorWorkbench.tsx`, `EditorPanel.tsx`, and `Editor.module.css`: a measured container chooses a side-by-side layout at 1080px available width (at least 640px canvas, 400px panel, 24px gap); smaller containers at tablet/desktop viewport widths use a native modal overlay; mobile uses a full-width editor with garden/area context and Back to plan. The existing `area` URL remains the selected-area source. Add-area forms use the same presentation. Resize changes panel mode without remounting its form subtree. The panel header stays available while its body scrolls.
- `GardenWorkspace.tsx` and `PlantingAreaInspector.tsx`: native Escape, Close and mobile Back share dirty-draft confirmation. Return focus goes to the area link, or the plan heading after deletion. Mobile hides the plan while editing; desktop retains it. Current selection is indicated on the canvas and textual area link. Existing module navigation keeps drafts in the provider.
- `areaEditorDrafts.ts`: area-property drafts now include textual X/Y inputs, validated against current garden dimensions. Saves use the same `clampPlanPosition` and 0.1m snapping as dragging, normalize rotation and retain the latest plants. Untouched coordinates follow later placement updates; typed coordinates stay available with conflict feedback. Existing geometry semantics remain unchanged.
- `GardenPlanOverview.tsx`: name/dimensions appear as a summary above the canvas. Edit garden details opens the form in place, focuses the name, and returns to the summary after save or confirmed cancellation. View and Add planting area actions share a wrapping toolbar. Garden deletion is in Garden settings, away from creation controls.
- `modalScrollLock.ts` and `ConfirmDialog.tsx`: nested editor/confirmation dialogs share a counted body scroll lock. Cancelling a nested confirmation restores focus inside the still-open editor. Panel mode changes wait for an active confirmation to close so a resized editor cannot cover the confirmation in the browser top layer.
- Removed obsolete editor layout/1360px inspector rules from `legacy-workspace.css`; new panel layout is in its CSS module. Existing form styling remains shared. No dependencies were introduced.
- ADR-0066 records the accepted presentation, positioning and modal behavior; ADR-0048 and the index reference the refinement.

Validation:

- `npm test`: **224 passed**, 27 files. Thirteen added cases cover container/viewport thresholds, form identity across modes, nested-modal cancellation/focus/scroll locking, deferred resizing during confirmation, a mobile deep link and guarded return to the selected area, area-coordinate validation/snapping/conflicts, and garden-summary save/cancel behavior.
- Existing tests were migrated to explicitly open garden details and use the responsive panel's semantic role; their persistence, revision, draft-protection and business assertions remain. One new assertion was corrected to compare plants with the restored workspace rather than the pre-normalization demo fixture, which intentionally lacks its later linked record ID.
- `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`: passed. No development server was listening on port 3000 before building. Final toolbar placement was followed by another full test/lint/build run.
- `e2e/responsive-editor.spec.ts`: four prepared real-browser scenarios at 390/900/1280/1440px cover garden summary/settings, panel visibility and measured layout, modal Tab containment, draft preservation across resize, guarded return/focus, coordinate saving and refresh. Existing garden-flow and responsive-canvas scenarios now explicitly open garden details. AI routes in the new scenarios are blocked.
- `npm run test:e2e -- --list`: **21 scenarios**, nine files. Discovery is not execution. Browser runs/screenshots remain pending under the already recorded sandbox approval restriction; no repeated escalation or alternative execution path was attempted. Native inertness, real focus containment, touch scrolling and visual dimensions must still be verified in Chromium.
- Logs: `/tmp/garden-t05b-tests.log`, `/tmp/garden-t05b-focused.log`, `/tmp/garden-t05b-types.log`, `/tmp/garden-t05b-lint.log`, `/tmp/garden-t05b-build.log`, `/tmp/garden-t05b-e2e-list.log`.

### Current handoff

Next independent implementation batch: **T07 global Care aggregation and ownership-preserving workflows**, followed by Season/other AI page consistency as needed. Complete T05/T06 browser acceptance once browser execution approval is available. Do not describe T00–T08 as fully accepted while those checks and T07/T08 remain pending.

**AI Garden Note stays directly usable on the homepage. T08 cross-garden multi-event extraction, per-item review and saving remain required and unimplemented.** This batch did not change AI contracts or gates. Session drafts still require the tab to remain open for retention across application navigation.

Original owner deployment-document changes remain 34 additions / 2 deletions; the owner's decision, plan and evaluation lock remain preserved. No commit, push, upload, deployment, backend contract, public quota, dependency or paid-model call was made.

## Batch 6a: global Care and explicit record ownership (2026-11-11)

Goal: show workspace-wide and individual-garden care in one usable global list, with edits, deletions and completions routed to the original owner. This implements the Care portion of T07; Season and the other AI pages remain batch 6b.

Implemented:

- `careViews.ts`: pure projections carrying original records, workspace/garden owner, garden context, owner-qualified keys and full target paths. Root-wide legacy mirrors count once; independently owned records with equal IDs remain distinct. `updateCareOwner` applies changes to the named collection in the newest workspace, with no copy into other collections and no recreation of missing owners.
- `CareWorkspace.tsx`: global Tasks/History aggregate root and all garden collections. All locations is the default browsing filter; All gardens records and named gardens narrow the list. Global filter state is in the URL and survives view navigation. A browse-filter change leaves an open form's captured owner unchanged. New global records/tasks require an explicit location unless a specific filter supplies it; correction retains the existing owner.
- Event, task and completion forms have independent owner state in the existing session provider. Missing owners/records retain input and refuse a fallback write. Completion of a repeating task retains the existing date-plus-interval rule, writes one history event to that owner, and guards same-tick duplicate submission. A disappeared completion target retains its date and offers cancellation without enabling submission.
- Garden Care shows local records and a separate Applies to all gardens section. Shared records link to a root-filtered global Care route for editing. Location cards remain secondary, collapsed navigation rather than preceding the global list.
- Task groups retain Overdue / Due today / Upcoming. Rows show action, full target path, date/repetition and a separate note; Complete is primary, Edit/Delete secondary. History uses the same readable path and note layout. `care/Care.module.css` handles wrapping and mobile action layout. The global page title is Care.
- `homeTasks.ts` and `WorkspaceHome.tsx` use the same projection and owner-qualified keys, keeping homepage totals consistent with global Care. A root task links to the explicit all-gardens filter.
- ADR-0067 records the projection/ownership and filter semantics, refining ADR-0034's hub presentation. No stored schema or AI contract changed.

Validation:

- `npm test`: **233 passed**, 29 files. Nine added cases verify two front-garden records plus three back-garden records plus one root record; owner-local ID collisions; projection deduplication; owner-specific edit/delete/task completion; explicit root creation and correction; unchanged in-progress ownership when filtering; repeating-task history and duplicate prevention; missing-owner draft retention; and garden-page shared-record links. Existing targeted-history and task tests now assert the separated fields/full path while preserving their business assertions.
- `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`: passed. No development server was listening on port 3000 before the build.
- `e2e/global-care.spec.ts`: prepared 390px and 1440px journeys with six aggregated records, filter changes during correction, API verification of the original owner, repeating-task completion, refresh retention, overflow checking and screenshots. AI routes are blocked. The existing form-validation browser scenario was also updated to explicitly open garden details before editing and after reload, following T05b's summary UI.
- `npm run test:e2e -- --list`: **23 scenarios**, ten files. Discovery is not execution. Browser acceptance still awaits the previously blocked browser permission; no repeated escalation or alternate execution path was attempted. No screenshots or native-browser acceptance are claimed for this batch.
- Logs: `/tmp/garden-t07a-focused.log`, `/tmp/garden-t07a-tests.log`, `/tmp/garden-t07a-types.log`, `/tmp/garden-t07a-lint.log`, `/tmp/garden-t07a-build.log`, `/tmp/garden-t07a-e2e-list.log`.

### Batch 6a handoff

Next: **T07b**, Next Season card priorities and expandable Rotation details, other AI page naming/error consistency, metadata and relevant documentation. Preserve current-plan/future-plan separation, citations, review actions and public gates. The owner's deployment document remains an unrelated 34-addition / 2-deletion change and must be checked before editing.

T05/T06/T07 browser acceptance remains pending. **T08 cross-garden multi-event AI Garden Note extraction, per-item review and saving remain mandatory and unimplemented; the directly usable homepage entry is retained.** Do not mark T00–T08 complete yet.

No commit, push, upload, deployment, paid-model call, dependency, backend contract or public-limit change. Original owner modifications and the evaluation lock remain preserved.


## Batch 6b: Next Season priorities and AI page consistency

Goal: make future planting decisions the primary Season workflow, with concise area summaries, optional supporting evidence, and consistent AI feature names and recoverable errors. This implements the already authorized ADR-0061/T07 direction; it changes no stored entity or AI contract.

Implemented:

- `SeasonPlanner.tsx` and `season/Season.module.css`: Next Season with its planning year; per-garden planned-area count; visible last-season summary, concise rotation constraint, chosen plants and Choose/Add a plant. Rotation details expands the three-season records, family/category guidance and companion notes with the original source links. Plan preview and Allocation Assistant follow the cards as disclosures. The preview fits its container. Empty gardens link to Garden Plan; an empty workspace links to garden creation.
- `GardenWorkspace.tsx` passes explicit route ownership. A garden Season route has no cross-garden filter and ignores global filter state; `/season` retains the overview/filter. Scope-specific draft keys no longer depend on the number of gardens. Future additions/removals still use Season Plans and leave current plantings separate. AI draft confirmation and stale-draft checks remain intact.
- Home navigation, Plant Doctor, Plant Guide, AI Garden Note, previews and README now use consistent product names. The existing root metadata already describes care, planting areas and seasonal planning and was verified without another change. README explains the disclosures, correct single-click garden opening, and that these frontend changes/screenshots are not deployed/refreshed yet. The owner's deployment document is unchanged.
- Plant Doctor and Plant Guide now wait for runtime settings even in a server-backed workspace. A failed settings request offers an explicit retry and does not silently treat a public demo as the local app. Their unavailable state explains synchronization rather than database setup. Preview copy labels read-only examples rather than describing future hosting infrastructure. The Season AI disclosure also offers settings retry, without blocking manual planning.
- `gardenWorkspaceApi.ts`: application-authored, status-specific AI/upload error messages replace arbitrary server/provider details. Known exact care-note quota messages and the request ID remain available; photo size/type and form correction messages stay actionable. Note/Doctor/Guide catches hide unexpected transport exceptions, retain input and explain retry/manual entry. No backend errors, API routes, credentials, quota switches or data disclosures were changed.

Validation:

- `npm test`: **249 passed**, 32 files. Sixteen new cases cover plan priorities and collapsed evidence, explicit garden scope versus global filtering, empty-state links, read-only recorded allocation with no model request or automatic application, runtime loading/failure/retry for Doctor and Guide, unsynced state, retained question and cited retry answer, safe errors for five feature endpoints, exact quota/request-ID retention and photo correction instructions.
- Existing Season allocation integration tests still verify explicit confirmation, latest-workspace merging, year rollover/stale rejection and pending/failed-save gates. Existing care-note review, Doctor review, Guide citation and draft retention tests pass. Selectors were updated for the consistent names and explicit disclosures; historical alias details are now asserted hidden by default while the main summary stays concise.
- `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`: passed. No development server was listening on port 3000 before the build. The first regression runs found ambiguous navigation selectors and an outdated assertion about hidden historical aliases; these were corrected to assert the intended user-visible behavior.
- `e2e/season-hierarchy.spec.ts`: two prepared 390px/1440px scenarios for keyboard disclosures, future-plan save, API-level current-planting preservation, reload, wrapping and screenshots. AI routes are blocked. Existing browser selectors follow the new Next Season name. `npm run test:e2e -- --list` discovers **25 scenarios in 11 files**.
- Real-browser execution remains pending under the previously recorded browser restriction. Discovery does not prove browser behavior; no screenshot or browser acceptance is claimed. No rejected escalation was retried and no alternate execution path was used.
- Logs: `/tmp/garden-t07b-tests.log`, `/tmp/garden-t07b-types.log`, `/tmp/garden-t07b-lint.log`, `/tmp/garden-t07b-build.log`, `/tmp/garden-t07b-e2e-list.log`.

### Batch 6b handoff

Next: **T08 batch extraction API and offline tests**. Read plan section 12 and ADR-0061, inspect the current single-event extractor/provider/demo safeguards, and implement the bounded multi-event extraction contract without any paid calls or public-limit change. Then deliver the separate review UI/application batch. AI Garden Note must stay directly usable on the homepage, global, and support explicit per-item review/save across gardens. **T08 remains unimplemented; T00 and T05–T07 browser acceptance remain partial/pending.**

No commit, push, deployment, paid-model call, dependency addition or public-limit change. The original deployment-document edits (34 additions/2 deletions), ADR-0061/plan and evaluation lock remain preserved.


## Batch 7: bounded cross-garden extraction API (T08a)

Goal: extract reviewable events across the stored workspace in one bounded request, preserving the old single-event API and the public demo. The owner explicitly authorized the complete T08 proposal; ADR-0068 records the implementation decision.

Implemented:

- `backend/app/care_note_batch.py`: independent strict model-output and API-response contracts, local Ollama/OpenAI adapters, bounded input/output, deterministic evidence checks, owner/target resolution and a read-only service. Models receive names, never trusted target IDs. Every output object requires all fields and rejects additional properties. Source quotes must occur in the note. Completed watering/fertilizing fragments become review drafts; other classifications become fixed notices. More than six completed rows or an overflow signal rejects the whole batch with a split-note message.
- Name resolution checks the selected garden before looking up its area/plant. Without a named garden, exactly one matching entity across the workspace can supply ownership; duplicates within one garden still count as ambiguity. No target defaults to the selected or sole garden. All-gardens requires explicit wording and no named narrower scope. Selected gardens cannot absorb a third garden. Contradictory negation/future markers produce an ambiguity notice rather than a completed draft.
- Event-specific dates must agree with source evidence. A shared date is accepted only as a recognized leading date phrase, consistent with the full note; conflicting/unsupported dates stay empty. Unknown, cross-garden or fabricated IDs never resolve. Fertilizer amounts require positive literal quantity/unit evidence; shared totals and overlapping fertilizer fragments clear quantities with a review note. These checks remain conservative safeguards, not proof of extraction correctness.
- Each provider sends at most one request, with 30-second timeout, 32 KiB request cap, 64 KiB response-text cap and separate 4096-token batch output cap. OpenAI reuses the existing zero-retry sender; Ollama sets num_predict and rejects incomplete/oversized output. No context or partial response is silently truncated into success. Provider errors expose only product messages.
- `main.py` adds `POST /workspaces/{workspace_id}/ai/care-note-drafts`. It accepts only `{ note, today }`, uses the existing 500-code-point and local-date boundary checks, and reads the current stored workspace. Public mode rejects before configuring a provider. `RuntimeConfigResponse` adds `careNoteBatchAvailable`, true only outside public mode; it describes supported capability, not provider health. No migration or write endpoint changed.
- Frontend API types and `createAiCareNoteBatch` are prepared without replacing the current note UI. Runtime settings require explicit true and force batch support off in public mode. Missing capability remains unsupported. Known overflow/context failures get actionable product copy.
- `backend/evaluation/care_note_batch/cases.json` freezes 16 bilingual cases and expected review outcomes. Its README defines the required quality metrics and clearly marks the corpus **unrun**. No model compatibility/quality score is claimed, and old single-event evaluation scores do not apply.

Validation:

- New backend file: **40 offline tests**, covering two persisted gardens with equal entity names, exact owner/target IDs, unchanged histories/revision after generation and failure, ambiguous/unique/unknown targets, selected versus all gardens, planned/negated mixtures, source evidence, injection/forged IDs, missing/conflicting/invalid dates, shared/decimal/nonpositive fertilizer quantities, six/seven rows, strict schemas, provider timeout/bad output/bounds, Unicode input, client-date boundary, missing workspace, forged client directory and public rejection before provider setup.
- Focused new/old API and public-demo regression: **204 passed** before the final extra all-gardens evidence guard; the final full run includes that guard.
- Full backend SQLite run: **416 passed, 7 skipped**. The seven PostgreSQL-only concurrency cases require an isolated PostgreSQL test database and were not run. Existing FastAPI/Starlette dependency deprecation warnings remain; no dependency was added.
- The first full run failed four existing SDK/client tests because this session's SOCKS proxy lacks socksio. The successful rerun set `NO_PROXY='*' no_proxy='*'` only for this offline test process; its HTTP traffic targets existing local fake services. No application/global proxy configuration changed and no real model request was made.
- Frontend: **258 passed**, 33 files. Nine added cases cover the workspace-scoped request body, safe batch errors, explicit capability and public/missing-capability refusal. `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`: passed. No development server was listening on port 3000 before building.
- Browser acceptance was not rerun; this batch adds no review UI yet and retains the previously documented browser restriction. Read the existing workspace-save service: it conditionally advances one revision, writes the full workspace and commits once. Actual batch-application/retry/rollback UI tests remain for the next batch.
- Logs: `/tmp/garden-t08a-focused.log`, `/tmp/garden-t08a-backend.log`, `/tmp/garden-t08a-frontend.log`, `/tmp/garden-t08a-types.log`, `/tmp/garden-t08a-lint.log`, `/tmp/garden-t08a-build.log`.

### Batch 7 handoff (completed by batch 8 below)

Next: **T08 review UI and atomic application**, starting with pure `applyCareDraftBatch` validation against the newest workspace and stable per-row event IDs. Connect the homepage and `/notes` to the same global review session, without requiring a garden before writing. Implement include/edit/add/remove per row, stale-response and replacement protection, one workspace update for all valid selected rows, no duplicate apply on retry, sync/conflict outcomes and the completion view. Preserve the single-event/public path when batch capability is absent/false and always offer manual entry. Use mocks for all UI/API tests; no paid calls or public-limit changes.

**T08 is not fully complete:** the new API is not yet connected to the note review UI, batch application is pending, and real-provider compatibility/extraction quality has not been evaluated. T00 historical evidence and T05–T07/final browser acceptance remain pending. Homepage AI Garden Note remains directly available throughout.

No commit, push, deployment, paid-model call, dependency or public-quota change. Original owner modifications and the evaluation lock remain preserved; the deployment document still has exactly the owner's 34 additions/2 deletions.


## Batch 8: global review and atomic application (T08b)

Goal: complete the directly usable homepage → cross-garden review → explicit
save workflow, retaining every draft through navigation and recoverable errors.
The owner authorized this workflow in the complete T00–T08 plan.

Implemented:

- `notes/BatchGardenNote.tsx` and its CSS module provide the global homepage
  input and `/notes` review. Each row has inclusion, garden, care type, date,
  target, fertilizer details, original text and review notes. Users can edit,
  add or confirm removal of up to six drafts. Unchecked rows remain for later.
  Missing fields block the whole selection and focus the first error. Manual
  entry is available without a model call. Empty results and unsupported
  fragments have explicit explanations; generation failures retain old rows.
- `useCareNoteBatchSession.ts`, owned by `WorkspaceProvider`, keeps shared note,
  review rows, stable IDs and request guards across routes. Changing the source
  marks existing drafts stale and invalidates late responses. Replacement is
  explicit and confirmed. Current and original source notes remain available.
  Batch capability is required; public and older backends retain the existing
  single-event path. No public limit or live-entry switch changed.
- `careNoteBatch.ts` validates all included rows against current ownership and
  entities before producing one immutable workspace. Root/global records and
  garden records keep their actual owners, regardless of selectedGardenId.
  Current entity names supply the stored target snapshots. IDs are allocated
  outside React state updaters; identical replay is safe and ID/content
  collisions reject the entire application.
- `useWorkspaceSync` exposes the latest accepted snapshot, including changes in
  the same event. The receipt distinguishes added-but-unsynced from saved.
  Retry only resends the snapshot. Conflict reload recognizes already persisted
  IDs or restores retained drafts for review/reapplication. Successful saving
  clears only included rows and shows View records / Record more, or Review
  remaining drafts. Existing save/conflict/unload controls remain shared.
- README and ADR-0068 describe the local workflow, session lifetime, retry
  semantics and still-unverified model quality. No persistent batch entity,
  schema migration, separate per-row writes or dependency was introduced.

Validation:

- Frontend: **273 passed, 35 files**. Fifteen added cases cover atomic root/front/
  back writes, invalid/missing targets, latest edits, stable IDs/collisions,
  Strict Mode and double save, navigation retention, per-row edits, exclusions,
  manual global entry without AI, stale response and replacement confirmation,
  empty/unsupported results, failure preserving manual drafts, save retry,
  conflict reload, and lost response after server commit. A dedicated sync test
  verifies same-event mutations are visible and combined in one snapshot.
- Backend: **418 passed, 7 skipped** using the same process-scoped offline proxy
  setup described in batch 7. Two new integration tests verify invalid selected
  ownership rejects the entire write, valid rows advance exactly one revision,
  and an exception after actual SQL writes/flush rolls back both records and
  revision. The first fixture omitted its required target-name snapshot; it
  was corrected so the invalid case tests missing ownership rather than a
  structurally incomplete record. PostgreSQL-only cases remain skipped.
- `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`
  passed. The final added notice fixture was corrected from `kind` to the API's
  `reason` field and a Testing Library-only option was removed after typecheck.
  No development server was listening on port 3000 before building.
- `e2e/batch-notes.spec.ts` prepares 390px/1440px journeys using mocked extraction
  and isolated real workspace persistence: homepage entry, validation focus,
  no writes before review, one-revision save across gardens, keyboard submission,
  refresh retention, wrapping and screenshots. **27 scenarios in 12 files** are
  discoverable. These new browser scenarios were not executed. The earlier
  browser restriction remains; no rejected escalation or alternate execution
  path was attempted and no new screenshot/browser acceptance is claimed.
- Logs: `/tmp/garden-t08b-tests.log`, `/tmp/garden-t08b-backend.log`,
  `/tmp/garden-t08b-types.log`, `/tmp/garden-t08b-lint.log`,
  `/tmp/garden-t08b-build.log`, `/tmp/garden-t08b-e2e-list.log`.

### Current handoff

T01–T08 planned implementation is present, including homepage global multi-event
review and atomic save. **Full acceptance is not complete.** Remaining work:

1. Run prepared real-browser acceptance for T05–T08 and final full workflows
   from a shell that can start the isolated test services. Review actual
   390px/1440px screenshots and address any visual or keyboard failures.
2. Evaluate the frozen batch corpus against an available local model, or an
   explicitly authorized paid model, before claiming provider compatibility or
   extraction quality. No real-model call has been made in these batches.
3. Run the seven PostgreSQL-only concurrency cases on an isolated test database
   when available. T00's original before-change screenshots cannot be recovered;
   the dedicated branch remains uncreated under read-only git permissions.

No commit, push, deployment, paid-model call, public-limit change or permission
change. Original owner changes remain preserved; the deployment document still
has exactly the owner's 34 additions / 2 deletions. Continue from this working
copy and do not copy the abandoned temporary checkout over it.

## R1: Overview and workspace navigation

The Overview shows one map card per personal garden, active crop summaries,
areas that need layout setup, and a compact Care tasks panel. The desktop
header includes Next Season and Record Garden Note. Record Garden Note opens
the existing shared `/notes` review screen until R2 adds the Overview dialog.

The browser check exposed a thumbnail canvas that exceeded its card width and
a third column at 1440px. The canvas now measures the bounded 4:3 card surface,
and the third column starts when the gallery itself reaches 1100px. Thumbnail
labels use free space above or below each area. Dense layouts may omit labels
that do not fit. Every area remains available by name in the full garden plan.

Verification covered real-browser checks on the already-running local app with
two gardens. At 1440px the two 512px map surfaces fit their cards and Care tasks
appears beside the gallery. At 390px the gallery uses one column, the note
action remains in view, and all six labels on the example back garden are
readable. Enter opens the garden plan and focuses its heading. The mobile menu
opens with Enter, closes with Escape, and restores focus to Menu. The note
entry opens the shared review screen without submitting a note.

The frontend suite passed 274 tests. Lint, type checking and an isolated
production build passed. On November 12 the owner ran
`npm run test:e2e -- e2e/homepage.spec.ts` from macOS Terminal. The isolated
FastAPI server started and all six Chromium cases passed in 20.1 seconds.
The run covered 320, 390, 768, 1024 and 1440px layouts and explicit note
generation with a mocked AI response. Fifteen screenshots cover empty,
single-garden and multi-garden states. Review of the 390px and 1440px
multi-garden screenshots confirmed one and two columns respectively, visible
note entry, and readable task groups. Long names wrap inside the cards.
The run emitted two duplicate-Konva warnings and exited successfully.

Codex's shell still requires permission to start the test server. The other
23 Playwright cases, including persistence journeys, remain unverified in
this run. Overview design review and the R2 note dialog remain open.

## R2: Record, review, and save a Garden Note on Overview

`AppShell` opens `GardenNoteDialog` on Overview. `WorkspaceGardenNote` uses the
same review and session on `/notes`. The dialog preserves the source note,
draft edits, inclusion choices, and save status when dismissed. Explicit
discard and draft replacement use the shared confirmation. Workspace recovery
actions are accessible inside the dialog. The batch-capability gate also
selects the existing single-record flow for compatible backends and demo modes.

The batch review uses one scroll area and keeps the header and main actions
visible. Each draft shows the action, date, location, and inclusion state.
Fertilizer details expand on request or when an invalid field needs focus.
Both single-record and batch submissions use the same workspace validation
and revision-checked write. Successful saves can close the dialog, start a
new note, or open History. See ADR-0069 for the accepted workflow.

The frontend suite passed 277 tests. Lint, type checking, and an isolated
production build passed. The owner's macOS Terminal rerun passed all 11
Chromium cases in 32.7 seconds. On the first run, the two cross-garden cases
confirmed the records and single revision advance in the API, then refreshed
before the History route finished loading. Waiting for the History URL and
visible record before refreshing verified persistence on both viewport sizes.
The run also covered six drafts on a narrow screen, nested Escape handling,
and retry after a simulated save failure. The 390px and 1440px screenshots
showed visible close and save controls during review. The existing duplicate
Konva warnings did not cause a test failure. Physical phone keyboard behavior
and real-provider extraction quality remain outside this verification.

## R3: Garden Plan and planting-area editing

Garden Plan puts the area list in the wide-screen sidebar and replaces it with
the editor when an area is open. The tablet uses the existing overlay. On a
phone, tapping a bed highlights its map outline and opens a compact summary
before Edit area. Text links remain a direct path to the same editor.

Move previews a snapped position and leaves a dashed outline at the original
position. The area move writes once on release and can be canceled with Escape.
The inspector offers coordinate fields and 0.1 m directional adjustments that
apply on Save. The plant canvas shows the position and spacing of an unsaved
plant. See ADR-0070 for the layout and interaction decisions.

The first 10-case Chromium run passed four cases, including the area drag,
Escape cancellation, and single saved revision. Three plant-drag cases reached
the correct saved coordinates and then matched both the area and plant fields.
The two draft cases attempted navigation before Overview had loaded and matched
the wrong Next Season link. The checks now target exact plant labels and wait
for the correct route and navigation menu.

At 900px, keyboard focus could leave the modal inspector at the end of its tab
order. The overlay now wraps focus in both directions. A component regression
test checks the first and last enabled controls, and the Chromium case checks
both wrap directions. After those fixes, 282 frontend tests, lint, type checking,
an isolated production build, and `git diff --check` passed. The next 10-case
Chromium run passed nine, including draft protection and the 900px focus loop.
The 1440px plant-drag trace showed a complete save request and a concurrent
GET returning the new revision with no growing areas.

File-backed SQLite now uses separate connections. Workspace reads verify the
revision after loading related rows and retry a read that crosses a concurrent
commit. Save responses capture their own revision and snapshot inside the
transaction. Regression tests reproduce uncommitted-row exposure, a commit
between relationship queries, and a second save immediately after the first
commit. The focused database, API, and care-note batch suite passed 145 tests.
The broader backend run passed 418 tests and skipped seven PostgreSQL-only
cases. Three evaluation fixtures could not bind their local mock server in
the sandbox. The next macOS Chromium run passed all ten cases, including
1440px plant drag and persistence after refresh. The `GrowingArea` model and
API have no height field. Height remains a separate schema and migration task.

## R4a: Missing workspace recovery

A saved workspace that returns HTTP 404 now has a dedicated screen on every
workspace route. A readable browser snapshot can be downloaded and restored
under a fresh workspace ID. If no readable snapshot exists, the user can
confirm opening empty onboarding. An unreadable snapshot remains available
for download. A canceled confirmation, a temporary server failure, or an
archive write failure preserves the existing reference and data. Recovery
checks for changes from another tab and archives the original reference and
raw data on the device before switching. See ADR-0071.

The frontend suite passed all 289 tests. The new component and hook tests
cover confirmation, temporary errors, an empty start, an unreadable copy,
a changed reference, storage failure, and a fresh import. Lint, TypeScript,
an isolated production build, and `git diff --check` passed. The owner ran
`e2e/sync-recovery.spec.ts` on macOS. Both Chromium cases passed in 11.2 seconds,
covering browser-copy export, restoration under a fresh ID, reload, and a
cross-route save retry that writes one plan record.

## R4b: Consistent module pages

The workspace header now carries the Care title and the Next Season title
with its planning year. Care puts Tasks, History, the location filter, and
record counts in one toolbar. Its active view remains identifiable by styling
and accessibility state. Next Season puts the garden scope before the plans,
and empty plans link to the next setup action.

Plant Doctor puts the garden and target before the observation and photo
fields. Photo upload and assessment generation have distinct loading states.
Review and save appear in a separate panel after generation. Plant Guide uses
the same panel style for the question and answer and presents citations as
text links. Add garden and missing garden use the existing Overview panel
style. Existing routes, record ownership, API contracts, and model availability
still govern actions.

All 290 frontend tests passed, including a regression check for photo upload
feedback. Lint, TypeScript, an isolated production build, and `git diff --check`
passed. Six Chromium scenarios cover Care, Next Season, and the two plant
tools at 390px and 1440px. The plant tool scenarios use mocked AI responses.
The owner ran the six Chromium scenarios on macOS. Plant Doctor, Plant Guide,
and Next Season passed at both widths, and Care passed at 1440px. At 390px,
the trace showed that selecting All locations and immediately opening Tasks
followed a link that still contained `location=front`. The correction had
already saved to its original owner. The back garden task was filtered out
on the Tasks page.

Care now uses the selected location for its records and view links while the
URL transition is pending. The URL remains the source of truth after navigation.
A component regression test suspends the location navigation and verifies the
selected option, record count, and Tasks link before releasing it. This test
failed before the fix and passed afterward. The browser case still clicks
Tasks immediately after changing location and now verifies the destination and
filter before looking for the task. After the fix, all 291 frontend tests,
lint, type checking, and the production build passed. The macOS Chromium
rerun passed both Care cases at 390px and 1440px in 10.5 seconds. Together with
the earlier Plant Doctor, Plant Guide, and Next Season results, this completes
the six R4b browser scenarios.

## R5: Final browser acceptance

The final pass exercises existing flows and closes coverage gaps in the redesign
plan. The Overview journey now includes eight gardens with long Chinese and
English names, a long task location, 320px reflow, and keyboard opening after
resizing to desktop. The editor journey adds actual Chromium touch events in a
390px emulated mobile context to select a bed, open its editor, and return to
the selected bed. The sync journey now lets the real FastAPI save succeed,
drops its response to the browser, verifies the retry's HTTP 409, and checks
that loading the latest copy recovers the same single plan record. The Care
discard-confirmation journey waits for the demo import before opening its deep
link.

The macOS Chromium run passed 33 of 37 cases. The eight-garden layout and the
lost-response recovery passed. Two deletion confirmation cases exposed a
Shift+Tab focus escape. The main garden journey found both Next Season links
before the Overview route had finished loading. In the emulated touch case,
the tap reached the raised bed and opened the tablet overlay at 390px.

Confirmation dialogs now wrap Tab at both ends. The editor uses a media query
for the mobile breakpoint and waits for measured width before using the
two-column layout. The garden journey waits for Overview and scopes its link
to workspace navigation. All 291 frontend tests, lint, type checking, and the
production build passed after these fixes. The November 12 macOS rerun of
`npm run test:e2e -- --last-failed` passed all four cases in 16.6 seconds. All
37 cases have a passing result across the full run and the targeted rerun.

### Stylesheet cleanup and manual checks

The stylesheet cleanup removed 83 obsolete selector branches from the former
workspace shell, save-conflict notices, plan shortcuts, and tool-page headers.
The remaining selector order, declarations, and media queries matched the
pre-cleanup stylesheet. All 291 frontend tests, lint, type checking, the
production build, and `git diff --check` passed after the cleanup.

The Codex environment still blocks loopback listening. The following checks
remain open on the owner's devices:

1. In desktop Chrome at 200% zoom, open Overview, then open and close Garden
   Note. Open a garden and edit a planting area. Confirm that text reflows and
   that the note and editor actions remain reachable by keyboard and scroll.
2. On a phone, tap a bed, open its editor, and focus a text field. Confirm
   that the software keyboard leaves a way to reach Save and Back to plan.
   Scroll the plan with Move off and check that the bed stays in place. Then
   enable Move and verify deliberate repositioning on the demo garden.
3. Review the Overview and the garden editor on desktop and phone. Confirm
   that the garden maps, Record Garden Note, near-term tasks, and the selected
   bed's edit action are easy to find.

The automated mobile tap result covers Chromium emulation. The owner can
record physical-device and visual acceptance separately after these checks.

### Overview review adjustments

The Overview note button now sits directly above Care Tasks. The two appear
beside the garden gallery on desktop and above it on phones. The gallery fits
three cards per row at 1440px, two at 390px, and one at 320px. Thumbnail height
is capped at 148px on desktop and 112px on phones. Tighter framing around
measured beds uses more of the thumbnail for the growing areas. Clicking a
card opens the detailed garden plan. The note action still opens its dialog
in place and restores focus on close.

All 292 frontend tests, lint, type checking, the isolated production build,
and `git diff --check` passed. The updated homepage browser cases cover the
action location, grid widths, and six cards within the desktop viewport. The
Codex sandbox blocked the Playwright API server from listening on port 8100.

### Overview quick note and test alignment

Overview now starts Garden Note from an "AI Garden Notes" panel above Care
Tasks. A quick note field with Generate draft starts extraction in the dialog,
and Open note editor opens the dialog without a model request. Other workspace
pages carry no note entry; `/notes` stays reachable by direct URL. The owner
confirmed this Overview-only entry, recorded as an amendment to ADR-0069.

The first full run after this change found five failing component tests and
ten failing browser cases that still used the previous Record Garden Note
button. Three batch note tests clicked the primary button before sync finished,
when it still read Open note editor and then became Generate draft. They now
wait for the synced state. Two recovery tests counted the Overview runtime
configuration request as a workspace request; they now count workspace
requests only. The browser cases open the editor from the new panel, and the
cross-page cases return to Overview to confirm that the note survives.

All 292 frontend tests, lint, type checking, the isolated production build,
`git diff --check`, and 421 backend tests passed, with seven PostgreSQL-only
cases skipped. The macOS Chromium run passed 27 of 37 cases, and the rerun of
the ten updated cases passed all ten.

## G1: Garden Plan area styling and Width/Length labels

Phase G1 of the single-canvas plan ([ADR-0072](decisions/0072-use-a-single-plan-canvas-with-guided-setup.md)).
Each planting-area type now has its own look on the plan and on Overview
thumbnails: raised beds show light soil inside a heavy wooden frame, in-ground
beds show dark soil with a dashed edge, containers have a rounded outline, and
greenhouses use a glass fill with a ridge line. A selected area keeps its type
colours and gains a separate green ring. The colours live in
`src/lib/planAppearance.ts` because Konva cannot read CSS custom properties;
the app has a single light theme.

Area names already sat above the outline. They now truncate to the area's
width plus a small margin instead of a fixed 80 px minimum, so names of narrow
beds no longer run into their neighbours. The selected area shows its size,
width by length, below the outline.

The area editor, the add-area form, and the session drafts behind them stored
the left-right size under "length" and the top-bottom size under "width",
opposite to the garden form. Every form now uses Width for the left-right size
(`widthMeters`) and Length for the top-bottom size (`depthMeters`). The stored
field names are unchanged. The canvas descriptions now read "wide by long".

All 303 frontend tests, lint, type checking, the isolated production build, and
`git diff --check` passed. New unit tests cover the per-type appearance, label
placement above or below the outline, truncation, rotated bounds, and the
width/length mapping; a component test checks the selected size label against
the form. The 19 canvas, editor, draft, garden-flow, and Overview Chromium
cases passed, and screenshots at 1440px and 390px confirmed the four area types
and label spacing.

## G2: Zoom the Garden Plan canvas into one planting area

Phase G2 of the single-canvas plan ([ADR-0072](decisions/0072-use-a-single-plan-canvas-with-guided-setup.md)).
Selecting a planting area on the plan or in the area list now zooms the same
canvas to that area over 0.4 seconds. The other areas fade to 35 % opacity and
hide their names, so no label covers the focused area's plants. A "Whole
garden" button and the Escape key return to the whole-garden frame and move
focus to the area's link in the list. Escape inside a text field stays with
the field, and Escape during an area drag cancels the drag first. Reduced
motion switches the frame without animation. Opening a `?area=` link starts
zoomed.

The frame is the bounding box of the area's rotated corners plus a margin of
20 % of its longer side, at least 30 cm. The frame may extend past the garden
edge, so an area in a corner stays centred with room for its name. A selected
area without a size keeps the whole-garden frame.

"Whole garden" closes the area editor through the same path as its Close
button: unsaved area or plant edits ask for confirmation first. On phones the
area editor still opens as a full page; tapping an area zooms the plan and
shows the existing summary card with "Edit area", and "Whole garden" replaces
the card's separate Dismiss button.

The Garden Plan no longer shows the `Focus beds` and `Full garden` buttons
([ADR-0054](decisions/0054-use-fixed-canvas-garden-plan-views.md) is marked as
superseded in part). The whole-garden view keeps the area-fitted framing. The
Next Season preview keeps both buttons.

All 314 frontend tests, lint, and type checking passed. New unit tests cover
the area frame (unrotated, rotated 30°, 90°, 180°, and 225°, at the garden
origin, a 20 cm container, and an area without a size) and the eased
interpolation. Component tests cover framing a 30° area inside the canvas,
dimming and label hiding, Whole garden and Escape, Escape inside a field and
during a drag, the animated and reduced-motion transitions, and the unsaved-
edit confirmation. Three new Chromium journeys passed: zoom and return at
1440px and 390px, and a 30° area that stays zoomed after reload and returns
with Escape.

## G3: Place and move plants on the Garden Plan canvas

Phase G3 of the single-canvas plan ([ADR-0072](decisions/0072-use-a-single-plan-canvas-with-guided-setup.md)).
Plants are now edited on the main Garden Plan canvas. The planting-area panel
no longer has its own canvas.

- With an area zoomed, choosing a plant in "Add plant" shows a spacing ring
  that follows the pointer. A click inside the area places one plant; clicks
  keep placing until Escape or Done. A click outside the area explains where
  to click. Placement snaps to the 0.1 m grid and moves the plant inward so its
  spacing circle stays inside the area. Rotated areas convert the pointer
  through `src/lib/planGeometry.ts`.
- Clicking a plant opens its properties; dragging moves it. Plants in other
  areas stay fixed, and clicking one zooms to its area. Escape cancels a plant
  drag first, then stops placing, and only then leaves the zoomed area.
- "Fill area" places the chosen plant on a grid at its spacing, centred in the
  area and skipping spots next to existing plants, up to 80 plants per Fill.
  "Undo fill" removes that batch and archives any planting record the batch
  alone used.
- Plants closer than 85 % of their average spacing, and plants whose spacing
  circle reaches past the area's edge, get a dashed orange outline and are
  listed under "Spacing warnings". Warnings never block saving.
- The panel lists the area's plant groups (one per plant type and variety),
  which care records and tasks use.
- Typing a known plant fills a suggested spacing, with its source: University
  of Missouri Extension G6201, Table 1, cross-checked against University of
  Maine Cooperative Extension's planting chart. A spacing the user typed is
  kept. Basil and the ornamentals have no suggestion because neither table
  lists them.

Where the controls sit (owner decision): wide layouts keep properties and
planting controls together in the side column. Narrower layouts show the
planting controls below the zoomed canvas and open the properties from "Edit
area" (`&edit=area`) as the existing modal or full page. `?area=` now zooms the
plan at every width, including phones, and an unsaved properties draft keeps
its editor open after a resize or navigation.

Two bugs surfaced and were fixed while testing in Chromium. Konva drag events
bubble, so dragging a plant also started an area move; the area group now
ignores drags that begin on its children. The drag readout lived in the
toolbar, and its shorter text shrank the toolbar mid-drag, which moved the
canvas about 30 px under the pointer; the readout now floats over the canvas.
The canvas exposes `data-zooming` while the 0.4 s zoom runs so browser tests
wait for the final frame.

All 342 frontend tests, lint, type checking, the isolated production build,
and `git diff --check` passed. New unit tests cover coordinate round trips at
0°, 30°, 90°, 180°, and −45°, crowding and edge rules, placement snapping,
Fill (grid, existing plants, the 80-plant limit, a full area), plant groups,
and sourced spacing. Component tests cover placing in a rotated area, clicks
outside the area, the Escape order, selecting and dragging only the zoomed
area's plants, warnings, Fill and Undo fill, Done, and the phone and overlay
panels. A new Chromium journey places, fills, and undoes plants at 1440px and
390px and checks the saved workspace; the canvas, editor, draft, and
confirmation journeys were updated for the new layout.

Known limits: the plant panel rebuilds when the editor crosses the 1080px
layout boundary, which drops a pending "Undo fill" button (placed plants and
plant drafts stay). Choosing a plant in the add form still shows "Unsaved
changes" although placed plants save at once; G5 removes Save-based wording
from Garden Plan.

## G4: Place planting areas directly on the Garden Plan

Phase G4 of the single-canvas plan ([ADR-0072](decisions/0072-use-a-single-plan-canvas-with-guided-setup.md)).
Areas are added, moved, and resized on the canvas. The "Add planting area"
form is gone.

- Four type buttons in the plan toolbar add a Raised bed (1.2 × 2.4 m), an
  In-ground bed (2 × 3 m), a Container (0.6 × 0.6 m), or a Greenhouse
  (2.5 × 3 m). One click places the area in the first free spot with the next
  unused name, such as "Raised bed 2", and zooms the plan into it. The type
  labels across the product now use these words.
- The free-spot search, default names, corner-handle sizing, and overlap test
  live in `src/lib/areaPlacement.ts`. The search walks a half-metre grid in
  reading order, keeps 0.3 m from sized areas (using rotated outlines), then
  accepts touching positions. A full garden centres the area and says it
  overlaps; a garden smaller than the standard size shrinks the area and says
  so.
- Mouse and pen drag areas directly: any area in the whole-garden view, and
  the zoomed area in the zoomed view. A press that moves less than six pixels
  still zooms. The zoomed rectangular area shows a bottom-right corner handle
  that resizes it in 0.1 m steps, at least 0.1 m, and no further than the
  garden edge for an unrotated area. The drag readout shows the size, the
  preview outline is dashed, and Escape cancels a move or a resize.
- Touch screens (`(pointer: coarse)`) keep the Move button, so swiping over the
  canvas scrolls the page until Move is on. On a hybrid device, a touch drag
  outside Move mode stops so the page scrolls.
- Overlapping areas both get a dashed amber outline, and a note below the
  canvas names each pair. Overlap never blocks a move.
- Areas saved without a size are listed under "Needs a size" with "Place on
  plan", which uses that type's standard size in a free spot. Nothing is sized
  without that click. The Overview card reads "1 needs a size" instead of
  "1 needs layout setup".

One bug surfaced in Chromium. After a drag in the zoomed view, the view
re-centres by the same distance the area moved, so the area's x and y props
did not change and react-konva left the node where the drag dropped it: the
area was drawn half a metre off and its corner handle missed the pointer. The
drag end now returns the node to its rendered position before saving, and the
saved placement redraws it.

All 363 frontend tests, lint (one existing warning in `GardenNoteDialog.tsx`),
type checking, the isolated production build, `git diff --check`, and all 43
Chromium cases passed. New unit tests cover the free-spot search (empty
garden, reading order and clearance, unsized and rotated neighbours, the far
edge, touching positions, a full garden, a garden smaller than the standard
size), default names, corner-handle sizing, plant clamping, and overlap with
rotated outlines. Component tests cover the corner handle, Escape during a
resize, no handle while placing plants, the touch-only Move mode, overlap
outlines and the note, "Needs a size" with "Place on plan", one-click areas
in free spots, and the shrunk area in a small garden. `garden-flow.spec.ts`
now adds a raised bed, drags it, resizes it from the corner, and checks the
saved workspace. A new touch journey sends real touch events through the
Chrome DevTools Protocol: with Move off, a swipe that starts on a bed scrolls
the page and leaves the bed in place; with Move on, the same swipe moves the
bed and the page does not scroll.

Known limits: the zoomed view keeps G2's framing, which aligns a tall area to
the left of a wide canvas rather than centring it. Resizing works from the
bottom-right corner only, and rotated areas resize without the garden-edge
stop. Touch users resize with the handle only in Move mode, or with the size
fields.

## G5: Autosave and undo on the Garden Plan

Phase G5 of the single-canvas plan ([ADR-0072](decisions/0072-use-a-single-plan-canvas-with-guided-setup.md)).
Garden Plan has no area or plant Save button. Every edit saves at once, and
Undo and Redo reverse it.

- Undo and Redo sit in the Garden Plan header; their tooltip names the step,
  such as "Undo move Sample raised bed". Ctrl/⌘ Z undoes and Shift+Ctrl/⌘ Z or
  Ctrl+Y redoes, except in text fields and while a dialog is open. A message
  confirms each step ("Undid fill Sample raised bed with Pepper.").
- Each step keeps the whole garden before and after one action
  (`src/lib/planHistory.ts`). Updates made in the same task merge, so a removed
  plant and its archived planting record undo together. The history keeps 100
  steps, drops Redo after a new change, and starts over in another garden.
- Undo writes the stored garden as a new change through the revision-checked
  sync; it never rewinds server revisions. A step applies only when the garden
  still equals what the step left behind. Any other change to the garden makes
  the history stale: Undo clears it and explains why instead of overwriting
  that change. A sync conflict clears it at once with its own message.
- The history lives in the workspace provider (`src/hooks/usePlanHistory.ts`),
  so it survives moving between pages in the tab and clears on reload.
- Area properties and the selected plant's fields apply on blur or Enter; the
  area type and 0.1 m step buttons apply at once. A value that fails
  validation stays with its error ("Not applied yet: fix the highlighted
  values.") and changes nothing; ADR-0062's draft protection now covers only
  such values and text still being typed.
- The plan's Undo replaces G3's "Undo fill" button. Undoing the step that added
  the zoomed area returns to the whole garden, and a plant panel that only
  showed a plant that no longer exists closes.
- The unused area-properties form inside the plant panel, with its own Save,
  was removed; the area inspector is the only area form.
- Garden details (name and size) keep their Save button until G6's guided
  setup revisits them; their saves are undo steps too.
