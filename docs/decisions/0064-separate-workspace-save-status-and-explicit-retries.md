# ADR-0064: Separate Workspace Save Status and Explicit Retries

- Status: Accepted
- Date: 2026-11-10
- Refines: ADR-0055, ADR-0061, ADR-0063
- Authorization: the owner approved T00–T08 of the frontend professionalization plan; this implements the global synchronization portion of T03.

## Context

The shared workspace provider survives navigation, but synchronization still wrote strings into the same message slot as form feedback. Next Season could lose sight of a failed save. Snapshot deduplication also prevented retrying unchanged data, so a gardener had to edit another field to trigger a write. Local-storage failures could coexist with generic saved wording.

## Decision

Keep business messages separate from typed workspace synchronization state. Render one shared saving status in AppShell, including loading, load failure, local persistence, local-storage failure, saving, confirmed save, ordinary save failure, and revision conflict. A confirmed server snapshot, no pending writes, no unresolved failure, and no conflict are required for All changes saved. Explain that unsubmitted form drafts are separate.

Retry sends the newest workspace snapshot through the existing serial PUT queue and bypasses snapshot deduplication. A synchronous pending-request guard prevents repeated clicks from enqueuing the same retry. Retry never calls a record-creation action or AI endpoint. A newer edit waits behind the current write and uses the revision returned by that write. An earlier success does not clear a newer unconfirmed failure.

Preserve the existing generation invalidation on HTTP 409. A lost response followed by a 409 requires the same explicit conflict decision as any other conflict. Both reloading the remote copy and replacing it with the local copy require consequence-specific confirmation. If a new workspace edit arrives during a confirmed reload, retain it and require another decision. Retain form drafts for baseline/entity review under ADR-0062 and ADR-0063.

Apply a 30-second timeout to workspace GET, import, and PUT requests, including response-body reading. Display a slow-operation explanation after five seconds. A timeout leaves save outcome uncertain and preserves the local workspace. AI requests keep their independent lifecycle and limits. Online/offline events update connection information without replaying writes automatically.

Keep automatic import on local workspace changes, with explicit Retry also available after failure. Reuse an import attempt's original ID and payload during this session so a lost response can use the backend's existing idempotent import behavior. Once acknowledged, enqueue any newer local snapshot. Discard late import results after the local workspace is deliberately removed. Claim Saved on this device only after a successful localStorage write; preserve warnings until persistence actually succeeds.

## Rationale

This supplies recovery without a new state library, mutation API, backend migration, automatic retry loop, or duplicate business actions. Revision checking remains the authority for concurrent writes. The global status is available on every module while the original form inputs stay available.

## Alternatives

Requiring another edit hides a recoverable failure. Replaying a business action can duplicate records and IDs. Automatic overwrite or unconditional retries after uncertain writes can destroy another tab's changes. A durable offline outbox requires storage, retention, and recovery decisions outside this task.

## Consequences

Retry works without changing a field, and all routes show the same save state. Local-only work can continue when the connection fails. Unsynced server changes and form drafts remain session-only; keeping the tab open and beforeunload warnings do not guarantee recovery after browser termination. Import retry identity is also session-only. Existing public AI availability and quotas remain unchanged.

Global synchronization is the first small T03 batch. Shared field validation, form-specific feedback, and first-invalid-field focus remain a separate T03 batch. Broader modal focus behavior remains T06. Real-browser acceptance still requires the local test-port permission previously denied by the sandbox.

## Reconsideration

Revisit when cross-device editing, authentication, offline recovery, or collaborative merging requires a durable operation queue or per-entity mutations.
