# ADR-0059: Open Budgeted Care Note Generation in the Portfolio Demo

- Status: Proposed
- Date: 2026-10-04
- Amends on acceptance: [ADR-0040](0040-use-vercel-render-and-supabase-for-the-portfolio-demo.md)
  (Garden Note runs in the hosted demo) and
  [ADR-0057](0057-keep-live-allocation-runs-closed-after-evaluation.md)
  (a backend OpenAI key may live in Render for Garden Note only)
- Related: [ADR-0055](0055-use-automatic-sync-with-optimistic-locking.md),
  [ADR-0056](0056-use-a-budgeted-tool-calling-agent-for-season-allocation.md),
  [ADR-0058](0058-classify-care-notes-before-filling-a-draft.md)

## Context

AI Garden Note turns one Chinese or English note into a reviewable care
draft. ADR-0058 added classification, a strict output schema, explicit target
selection, and the gardener's local date. Its local acceptance with
`qwen3:4b` called one planned note and both multi-event notes completed, and
gave the planned note today's date. OpenAI compatibility and quality are
unmeasured.

The public demo shows a preview. A live Garden Note would send visitor text
to OpenAI and spend money on an unauthenticated endpoint. Opening it needs a
fixed context, durable limits, measured quality, and a way to stop.

## Proposed Decision

### Public workflow

- Visitors follow **Demo Garden → note → editable draft → review and save →
  Care records**. Generation writes nothing; saving uses the existing
  workspace sync.
- Generation reads the server's fixed `demo-garden` snapshot, never stored
  workspace data. Other garden IDs are rejected before any quota is used.
  Garden Note and the allocation agent share one demo data file and a small
  amount of reading and matching code; the existing frontend consistency
  test keeps it in step with the browser's demo garden.
- ADR-0058's rules apply. Public drafts and the public save form allow
  `garden`, `planting-area`, and `plant-group`; a model's `all-gardens`
  target is rejected with a review message.
- The screen says that generation uses the example garden and sends the note
  and example context to OpenAI. Before saving, the browser checks that the
  draft's target ID, name, and planting area still match the example
  snapshot in the visitor's garden, so a renamed or moved item with the same
  ID is not saved by mistake. A changed note, garden, or target discards the
  draft, and manual entry stays available.
- Requests keep `store=False`. Provider retention follows
  [OpenAI's data controls](https://developers.openai.com/api/docs/guides/your-data);
  the request setting alone does not establish zero retention, and the
  screen asks visitors to use generic gardening examples.
- `CARE_NOTE_PUBLIC_ENABLED` defaults to false. Runtime configuration exposes
  only whether the feature is available. Every request checks the switch,
  `CARE_NOTE_AI_PROVIDER=openai`, the evaluated model
  `gpt-4o-mini-2024-07-18`, and the quotas; anything missing or uncertain
  blocks the paid call.
- `OPENAI_API_KEY` is set only in the Render backend. With the key present,
  `AGENT_PUBLIC_RUN_LIMIT=0` must still block every allocation-agent call.

### Limits and cost

| Control | Value |
| --- | --- |
| Note | 500 Unicode code points |
| Complete serialized request | 8,000 UTF-8 bytes, checked on the exact parameters sent |
| Format allowance | 1,000 input tokens beyond the byte bound |
| Output | 800 tokens |
| Requests per generation | One; SDK retries disabled; 30-second timeout |
| Paid allocation | 22 local (C1 + C2) and 78 online (C3 + C4); 100 in total |
| Online daily limit | 30 per UTC day |
| Short-term limit | 5 per client IP per rolling minute |

With GPT-4o mini at USD 0.15 per million input tokens and USD 0.60 per
million output tokens
([official model and pricing page](https://developers.openai.com/api/docs/models/gpt-4o-mini),
2026-10-04), the bound is
`((8,000 + 1,000) × 0.15 + 800 × 0.60) / 1,000,000 = USD 0.00183` per
request. Each request is booked at USD 0.01, so 100 requests reserve USD
1.00. The format allowance is an assumption that every response checks; the
USD 1.00 figure holds only while the model, prices, and bounds stay as
stated. OpenAI adds formatting tokens that local byte counting cannot see
([token counting](https://developers.openai.com/api/docs/guides/token-counting)).
Prices and account access are rechecked before C1.

### Online quota and automatic stop

- The quota reuses `AgentRunBudget(name, used_runs)`: one cumulative Garden
  Note row and one row per UTC day, independent of the agent's row. One
  transaction raises the cumulative row, then the daily row, each only below
  its limit; if either fails, both roll back. The transaction commits before
  the model call. Missing rows or database errors mean no call.
- A reservation is never refunded: success, refusal, invalid output,
  timeout, and crashes all keep it.
- The cumulative limit comes from `CARE_NOTE_PUBLIC_RUN_LIMIT`, an integer
  from 0 to 78; a missing or out-of-range value disables public calls, and 78
  stays a hard cap in code. Nothing resets or recreates the cumulative row;
  changing the limit never restores used requests.
- Every response's usage is checked before its draft is returned. When
  `input_tokens` exceeds the request's bytes plus 1,000, output exceeds 800
  tokens, or usage is missing or invalid, the request fails and a separate
  transaction raises the cumulative row to 78. All workers, restarts, and
  later days then refuse new calls. Calls already sent can still finish and
  cost money.
- If that stop write fails, the request returns an error and logs it, and
  the stop counts as unconfirmed. The project has no alerting, so the owner
  checks Render logs and turns `CARE_NOTE_PUBLIC_ENABLED` off by hand; the
  deployment guide documents and the offline tests exercise this procedure.
- Logs record stage, timing, model, bytes, status, usage, estimated cost,
  and any stop reason, never note text or keys.
- The browser blocks double clicks. Separate tabs and retries each use a
  reservation; there is no request-deduplication store.

### IP limit

The single Render worker keeps short-lived per-IP counters in memory. They
reset on every restart, and the free plan restarts after idling, so this
limit only slows rapid use; the PostgreSQL quotas bound spending. The client
IP comes only from the forwarding hop that Render's proxy is measured to
add. Uvicorn by default trusts forwarding headers only from `127.0.0.1`, so
without configuration every visitor shares the proxy's address. Trusting
every forwarding header is not acceptable. If the trusted source cannot be
measured, public generation stays off.

## Release Gates

| Stage | Paid requests | Purpose |
| --- | --- | --- |
| C1 local compatibility | 2 | Strict-schema acceptance, account access, usage of a near-maximum request |
| C2 fixed local evaluation | 20 | One run per frozen case; every result published |
| C3 deployment check | 3 | Real public path, save, refresh, and online quota |
| C4 visitor trial | Up to 75 | Whatever remains of the online allocation |

C1 and C2 use a Garden Note file ledger capped at 22, built like the agent's
ledger (file lock, reserve before each request, atomic writes, batch
fingerprint); the agent's ledger and limit stay untouched. C3 runs with the
online limit set to 3 and the visitor entry hidden: the production frontend
is built with `NEXT_PUBLIC_CARE_NOTE_LIVE_ENTRY` off and keeps the preview,
while a Preview build with it on serves the check. The API switch closes
again after C3, and C4 starts with a production build that turns the entry
on. Anyone calling the
endpoint directly in that window uses one of those 3. A used-up count does
not show that the check passed; the request logs must show the owner's
checks. Any extra check needs the owner's approval, uses what remains of the
78, and reduces C4 by the same amount; the count never resets. C4 raises the
limit to 78 and keeps the count.

The 20 C2 cases and their expected outcomes are frozen before any spending:
8 ordinary completed notes (4 Chinese, 4 English, watering and
fertilizing), 3 with missing fields or an ambiguous target, 5 that are not
completed events (the Chinese planned note and both multi-event notes from
ADR-0058's local run, one negated note, one unrelated question), and 4
boundary cases (date, quantity and unit, length, prompt injection).

This ADR is accepted only when all of these hold:

- C1 succeeds.
- No negated, planned, or multi-event case comes back as `kind: completed`.
  This blocks opening whatever the overall score: such a draft needs only a
  target choice to become a false record.
- At least 18 of 20 cases meet their expected outcome, and at least 7 of the
  8 ordinary notes.
- No draft invents a date, fertilizer, quantity, or target, and every
  savable draft passes server validation.
- Usage stays within the cost bound, and every paid request has a ledger
  entry and a recorded result.
- Task B's offline checks pass, and the owner confirms the deployment steps,
  the measured IP source, and the manual stop procedure.

Twenty cases are limited evidence, with only one or two cases for each risky
kind of note. They support a first bounded release check, not a claim that
Chinese and English classification is reliable, and the report says so. A failed gate keeps
public generation off. On acceptance, ADR-0040 and ADR-0057 are annotated and
the deployment guide is updated. The visitor entry opens after C3 passes, and
the deployed check is recorded separately.

## Why This Option

One reviewed care event is a small, visible AI workflow. A fixed context
keeps request size and targets predictable. The existing quota table gives
durable limits without a new store, and separate local and online
allocations keep evaluation away from production credentials. A hard gate on
false completed records protects the property that matters most in a care
history: that every record describes something that happened.

## Alternatives Considered

- **Keep the preview.** No cost or privacy exposure, but visitors cannot try
  their own note.
- **Generate from any stored garden.** More data access, larger context, and
  harder target matching; revisit with accounts.
- **Owner-only access for C3.** Needs a credential mechanism the project does
  not have. A 3-request online limit bounds the same risk.
- **Browser or IP limits alone.** Both reset, so neither can enforce a paid
  allocation.
- **Judge C2 by overall score alone.** A score of 18/20 could hide a negated
  note saved as completed, the error that most damages trust in the records.

## Consequences

- Some failed requests use trial capacity, and anonymous visitors can use up
  the shared allocation.
- An unconfirmed stop needs a manual response from the owner.
- Notes outside the evaluated cases can still be misread; the review step
  remains the safeguard.

## Revisit When

The model, prompt, schema, demo context, prices, limits, worker count, or
proxy chain changes; or accounts, recurring budgets, or alerting are added.
