# ADR-0067: Project Care Across Locations with Explicit Ownership

- Status: Accepted
- Date: 2026-11-11
- Refines: ADR-0034's Care hub presentation
- Related: ADR-0023, ADR-0061, ADR-0063, ADR-0064
- Authorization: the owner approved T00–T08; this is the bounded Care portion of T07.

## Context

The global Care route previously showed only root workspace records. Records in individual gardens required navigating through location cards. A combined list must distinguish browsing all locations from recording one action that applies to all gardens, and must preserve each record's actual owner.

## Decision

Project the root and garden collections into rows carrying the original record, explicit workspace/garden owner, garden context, a stable owner-qualified key, and a full target path. Never persist the projection or duplicate records into another collection. Root-wide legacy mirrors with the same ID count once; independently owned garden IDs remain distinct.

Make All locations the default global browsing filter. All gardens records filters the workspace-wide collection. Named gardens filter their own collections. Keep the filter in the global Care URL and preserve it between Tasks and History. Garden-page links remain available as secondary navigation.

Each event form, task form and completion form retains its own owner separately from the browsing filter. Existing records cannot change owners during correction. New global records require an explicit location selection unless a specific location filter supplies it. All gardens is an actual target, never an alias for All locations. Changing a new record's location keeps its entered details but resets its target to the selected location.

All corrections, deletions and completions update only the captured owner collection in the newest workspace. Missing owners or records do not cause a fallback write to root or another garden. Retain drafts for correction/copying. Destructive confirmations recheck the current target. Repeating tasks use the existing completion-date-plus-interval calculation, with one completion history event and a guard against duplicate submission.

Garden Care shows local records and a separate Applies to all gardens section. Root records in that section link to their global owner for editing. Task rows retain Overdue, Due today and Upcoming groups and show target, date/repetition and note on separate lines. The homepage summary uses the same ownership projection and stable row keys.

## Rationale and alternatives

Projection supplies a useful global view while preserving the established data model and revision-protected persistence. Copying root records into each garden duplicates totals and mutations. Looking up only by ID risks changing a different owner's record. Reusing the current browse filter as the form owner risks silently retargeting an in-progress correction.

## Consequences

Global Care can show all locations at once and mutate the correct source without a backend migration. Explicit location choice adds one step for creating an unfiltered global record. Garden pages can show workspace-wide context without granting local ownership. The previous location cards are secondary navigation rather than the main task list.

Global Care preserves the existing AI contract, public availability, quotas, model calls, future-season entities, and session draft retention. The macOS Chromium run verified the location filter, owner-specific writes, recurring task completion, and persistence after reload at 390px and 1440px.

## Reconsideration

Revisit for actual multi-target records, collaboration, server-side pagination or filters, or larger datasets that make client-side projection insufficient.
