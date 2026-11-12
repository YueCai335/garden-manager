# ADR-0063: Use Workspace Routes and Shared Session State

- Status: Accepted
- Date: 2026-11-10
- Refines: ADR-0029, ADR-0051, ADR-0055, ADR-0061, ADR-0062
- Authorization: the owner approved the frontend professionalization plan and requested T02 as a separate delivery batch.

## Context

The original application changed an internal screen variable and used selectedGardenId for context. Refresh always returned to the overview. Moving those screens into individual pages without shared ownership would restart restoration, reset revisions, and discard unsaved editor and AI drafts.

## Decision

Adopt the approved routes: `/`, `/gardens/new`, `/gardens/[gardenId]/plan`, `/gardens/[gardenId]/care`, `/gardens/[gardenId]/season`, `/care`, `/season`, `/notes`, `/guide`, and `/doctor`. Use `area` for the plan inspector, `view=tasks|history` for care, and optional `garden` context for Guide and Doctor. Encode IDs and keep notes, workspace identifiers, and photos out of URLs.

Place one WorkspaceProvider and one AppShell in the persistent `(workspace)` layout. The provider owns useWorkspaceSync, workspace state, editor drafts from ADR-0062, and small session fields for other existing forms. Existing screen actions receive their garden context from the route. selectedGardenId remains compatible persisted data but does not select a route's garden. Dynamic pages await Next.js 15 params and pass the garden ID to the client screen.

Resolve missing entities only after restoration. Unknown gardens have a dedicated message, and unknown areas keep their garden visible with a parent link. Garden switching keeps Plan/Care/Season and removes the previous area parameter. Invalid care views normalize to tasks with replace navigation.

Use Link for ordinary navigation and buttons for mutations. Show global navigation and garden subnavigation. The mobile navigation is a disclosure with aria-expanded and aria-controls. Focus the page heading when the pathname changes, without refocusing on form fields or query-only changes. Page metadata contains generic module titles.

Share raw note text between the homepage and `/notes`. Opening a route never invokes a model. Keep the note request guard and input revision counter in the persistent session so a late response cannot overwrite a new homepage note. Generation remains an explicit action and still uses the existing single-event API. Local single-event drafting requires an explicit target-garden choice; public demo targets and switches remain unchanged. Clear the saved note draft after successful local application, while existing server synchronization still owns durability.

Until T07, `/care` retains its location chooser and exposes workspace-wide care records separately. It does not claim to aggregate all per-garden records yet. T04 will refine the homepage presentation and generation entry flow, and T08 supplies multi-event extraction and review.

## Rationale

The shared layout provides stable state and synchronization across navigation. URL ownership makes deep links and updates predictable. In-memory session fields preserve work without adding a state-management dependency or storing private draft content in URLs or new persistent storage.

## Alternatives

Keeping internal screen switching cannot restore deep links. Mounting an independent workspace on every page duplicates synchronization and drops revisions. Persisting every draft to browser storage requires separate retention and migration decisions. Keeping all screens hidden in the DOM would obscure state ownership and increase page weight.

## Consequences

Module URLs and browser history become meaningful within the restored workspace. These URLs do not share private gardens between devices or users. Session drafts survive application navigation but are not restored after refresh. The existing workspace PUT/revision flow and database schema remain unchanged. Native modal behavior, final visual styling, Care aggregation, and batch AI are still owned by their later tasks. Browser acceptance requires local test-port permission; unit routing tests do not prove actual Next.js history behavior.

## Reconsideration

Revisit when authentication, shared workspaces, cross-device drafts, or a different routing framework changes ownership and URL requirements.
