# ADR-0071: Recover Missing Workspaces From Browser Copies

- Status: Accepted
- Date: 2026-11-12
- Refines: ADR-0055, ADR-0064
- Scope: the saved-workspace load flow in R4 of the frontend redesign plan.

## Context

A browser can remember a server workspace ID that the connected database no
longer contains. The browser may still hold the local snapshot from before
the first import. The previous UI offered the same Retry action for every
load failure, including a persistent 404.

## Decision

A 404 when loading the saved workspace shows the missing-workspace screen.
Retry checks the same reference again. A readable browser copy can be
downloaded as JSON or restored after confirmation. An absent or unreadable
copy leads to confirmed empty onboarding, with download available for any
unreadable data.

Before switching, confirm that the active browser reference and snapshot still
match the ones offered to the user. Archive the old reference and exact saved
bytes on the device. Stop if the archive cannot be written. Import a readable
copy with a fresh workspace ID using the existing browser sync flow.

Temporary load failures continue to offer Retry. Save failures and revision
conflicts continue to use the existing save recovery controls.

## Rationale

The user can retain a local copy and choose when to start a new workspace.
Using a fresh ID prevents recovery from targeting the old workspace if it
becomes available again.

## Alternatives

Automatically restoring the browser copy could hide the loss of more recent
server edits. Reusing the missing ID would tie the recovery to a workspace
that may still exist on another server. Both were ruled out in favor of an
explicit recovery under a fresh ID.

## Consequences

The recovered workspace contains the browser snapshot. Later server-only
edits, server-hosted files, and unsaved form drafts require their original
source. The archive uses localStorage on this origin, so the user can keep
the JSON download independently of browser storage. The existing import API
and its session-scoped retry identity apply to the new workspace.

## Reconsideration

Revisit when accounts or cross-device restore provide a durable way to locate
earlier workspaces, or when a first-class backup manager replaces local
archives.
