# ADR-0062: Preserve Planting-Area Editor Drafts

- Status: Accepted; amended for Garden Plan by [ADR-0072](0072-use-a-single-plan-canvas-with-guided-setup.md) (phase G5, 2026-11-14): valid area and plant values apply when their field loses focus, so drafts, the discard confirmation, and the unload warning now cover only values that are still being typed or could not apply.
- Date: 2026-11-10
- Related: ADR-0052, ADR-0053, ADR-0055, ADR-0061
- Authorization: owner approved T00–T08 and requested delivery in small batches.

- Implementation refinement: ADR-0063 moves the draft maps into the persistent workspace provider; the validation and merge rules remain unchanged.

## Context

The area inspector reset its fields whenever its area object changed. Adding a plant or moving the area could erase an unsaved name. The plant editor also cleared open forms after area property changes. A property save must preserve plants added since editing began.

## Decision

Keep area-property and plant-editor drafts in the existing workspace component, keyed by both garden and area ID. T02 will move that ownership into its persistent route provider. Drafts remain in memory for application navigation and are separate from persisted workspace data.

Compare normalized properties with the baseline captured when editing begins. Keep dirty fields when the current properties change and show the current values with an explicit reload action. Save properties into the latest area and retain its latest allocations. Persisted positions retain the existing clamp and grid rules.

Keep numeric input as text while editing. Validate plant positions against the current area dimensions before saving. Preserve invalid text for correction. Confirm discarding dirty editors and warn before unloading dirty drafts or unsynchronized server writes. Keep unavailable-target drafts available to copy and discard.

## Rationale

Entity-keyed memory state prevents unrelated updates and module navigation from destroying input. Separating property merges from plant collections prevents stale forms from overwriting newer plants. The change uses existing React state and confirmation components.

## Alternatives

Resetting from the entire area object loses edits. Saving a captured layout can overwrite newer allocations. Keeping every editor mounted would hide the lifetime problem and grow the DOM. Persisting drafts in browser storage adds migration and recovery rules beyond this task.

## Consequences

Same-tab application navigation preserves these editor drafts. Refresh recovery is not promised, and browsers may suppress beforeunload prompts. Reloading changed properties deliberately discards that property draft. Server revision protection and data schemas stay unchanged. T06 still owns modal focus management and the unified deletion policy.

## Reconsideration

Revisit for cross-tab or cross-device draft recovery, collaborative field merging, or changes to the workspace provider's lifetime.
