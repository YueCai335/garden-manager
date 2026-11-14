# Public Care Note Delivery — Checks and Evidence

- Decision: [ADR-0059](decisions/0059-open-budgeted-public-care-note-generation.md)
  (Rejected 2026-10-06), followed by
  [ADR-0060](decisions/0060-offer-assisted-care-note-drafting-in-the-portfolio-demo.md)
  (Accepted 2026-10-06: assisted drafting). Design, limits, and gates live there; this file lists the
  checks that show they hold and records the results.
- Branch: `care-note-public-budget`, on task A `6e7aba0`.
- Task B spends no model fees. Paid stages C1–C4, deployment, commits, and
  pushes each need the owner's explicit approval.

Each row starts as **Pending** and gets a dated result: the command or
procedure, what it showed, and any skipped coverage. Offline, real-model, and
deployed results stay in separate tables.

## Task B: Offline Checks

Fake providers, isolated databases, and no real OpenAI key. Quota and stop
checks use real PostgreSQL with independent processes; the owner's existing
database and volumes stay untouched.

### Build and configuration

| Check | Result |
| --- | --- |
| The shared demo data file loads for Garden Note and the allocation agent, including from an installed package; the agent's batch fingerprint is unchanged by the move | Passed 2026-10-04: agent tests 89/89; `demo_garden` fingerprint `5adce3bd905086f0` equals the archived ledger; a built wheel in a fresh venv loads 3 areas |
| `src/lib/demoGarden.test.ts` passes against the shared file | Passed 2026-10-04 (frontend suite) |
| `render.yaml` sets `CARE_NOTE_PUBLIC_ENABLED=false`, `CARE_NOTE_PUBLIC_RUN_LIMIT=0`, `CARE_NOTE_AI_PROVIDER=openai`, `CARE_NOTE_OPENAI_MODEL=gpt-4o-mini-2024-07-18`, `AGENT_PUBLIC_RUN_LIMIT=0`; the agent comment cites ADR-0057's quality reason | Done 2026-10-04 |
| `.env.example` keeps `CARE_NOTE_AI_PROVIDER=ollama` and the public switch off, so a copied local config never reaches the paid path | Done 2026-10-04 |
| `.env.example` lists `NEXT_PUBLIC_CARE_NOTE_LIVE_ENTRY=false`; the deployment guide gives the C3 and C4 order, including closing the API switch after C3 | Done 2026-10-04 |
| A missing, non-numeric, negative, or above-cap run limit (cap 58 since 2026-10-06, 78 before), a disabled switch, or a different model sends no provider request | Passed 2026-10-04: `test_run_limit_must_be_an_integer_from_0_to_78`, `test_any_missing_setting_closes_public_generation_before_any_reservation` |

### Quota and stop

| Check | Result |
| --- | --- |
| Concurrent requests for the last cumulative or daily slot: exactly one reaches the fake provider | Passed 2026-10-04 on PostgreSQL 16: four spawned processes race for the last cumulative request; exactly one reserves and the counter ends at 78 |
| A daily-limit failure rolls back the cumulative increment | Passed 2026-10-04 on SQLite and on PostgreSQL 16 with four processes: one reserves, three roll back, cumulative ends at 1. Breaking the rollback makes it end at 4 and the test fail |
| Two first requests of a UTC day create one daily row and count both | Passed 2026-10-04 on PostgreSQL 16: three processes, one daily row at 3 |
| Limit 3 → the cap keeps the used count; the cap grants only the remainder; a counter already above the cap keeps its value and is refused | Passed 2026-10-04 |
| Restart, UTC rollover, missing row, database error: usage persists and uncertainty blocks the call | Passed 2026-10-04: rollover, missing row, and database error on SQLite; a fresh process after a stop stays blocked on PostgreSQL 16 |
| Usage above bytes + 1,000, output above 800, or missing usage: the cumulative row reaches the cap and other processes and a restart stay blocked, including after the limit is raised | Passed 2026-10-04: in one process on SQLite, and across processes on PostgreSQL 16 (a stop written by one process blocks a new process on a later day) |
| A failed stop write returns an error, logs the stop as unconfirmed, and the manual Render disable procedure is exercised | Error response and `care_note_public_stop_unconfirmed` log passed 2026-10-04; the manual procedure is written in the deployment guide and is exercised on Render (see below) |
| Timeout, refusal, truncation, malformed draft: reservation kept, no retry, no partial draft | Passed 2026-10-04 |
| A note that is not valid text (a lone surrogate from an escape such as `\ud800`) gets a 422, not a 500, with no reservation and no model request; Chinese and emoji notes still work | Passed 2026-10-04: the 422 body is written as ASCII-escaped JSON; the frozen batch fingerprint is unchanged |
| An oversized note or request is rejected before any reservation | Passed 2026-10-04; a separate test confirms the byte check measures exactly the parameters sent |
| With a key present and `AGENT_PUBLIC_RUN_LIMIT=0`, the allocation agent makes no provider call | Passed 2026-10-04 |

### Scope, targets, and screen

| Check | Result |
| --- | --- |
| Another workspace ID, another garden ID, or `all-gardens` cannot change the fixed context or public target scope | Passed 2026-10-04 |
| A draft whose target ID survives but whose name or planting area changed in the visitor's garden is not saved | Passed 2026-10-04: frontend tests for a renamed area and a plant group moved to another area |
| A changed note, garden, or target discards the draft; missing fields block saving | Passed 2026-10-04 (task A tests) |
| The public live form needs loaded settings, the build switch `"true"`, and server availability; all four switch combinations and the local app with the build switch off behave as designed | Passed 2026-10-04 (frontend tests) |
| While settings load or after they fail, no generation is offered; retry loads them | Passed 2026-10-04 (frontend tests) |
| Every public attempt, including rejected ones, returns a request ID that matches its log line and the run limit in force | Passed 2026-10-04 |
| A double click sends one request; separate accepted requests each reserve | Passed 2026-10-04 |
| With a fake provider, the public screen generates, edits, saves, survives a refresh, and offers manual entry | Passed 2026-10-04: component tests cover manual entry; a browser run used the real API in demo mode (limit 3) on an isolated PostgreSQL database, with the OpenAI SDK pointed at a local fake server. Generate → edit type, date, and fertilizer → save → refresh showed the record; the database row held the edited values; the budget rows read 1 cumulative and 1 for the day; the page's request ID `dd6bd55280d1` matched the API log line; the fake server received one 2,134-byte request, the size the byte check logged |

### IP limit and switch (simulated)

| Check | Result |
| --- | --- |
| Behind a simulated trusted proxy, two client IPs get separate limits; forged forwarding headers from an untrusted peer do not change the client used | Passed 2026-10-04 with Uvicorn's `ProxyHeadersMiddleware` and a trusted test peer |
| Restarting the process clears only the IP counters; paid quotas stay | Passed 2026-10-04 |
| Turning `CARE_NOTE_PUBLIC_ENABLED` off blocks the next request without a restart of the quota state | Passed 2026-10-04 |

## Deployment Checks on Render

Offline tests cannot prove these; each stays Pending until it is measured on
the deployed service, before C3.

| Check | Result |
| --- | --- |
| Render's proxy chain and the trusted client-IP hop are measured; the deployed Uvicorn version and `FORWARDED_ALLOW_IPS` are recorded ([Uvicorn proxy settings](https://uvicorn.dev/settings/#http)) | Pending |
| Two real client IPs get separate limits; a forged forwarding header does not change the client used | Pending |
| A cold start clears only the IP counters ([Render free lifecycle](https://render.com/docs/free)); paid quotas stay | Pending |
| The owner turns `CARE_NOTE_PUBLIC_ENABLED` off in Render, waits for the change to apply, and confirms new generations are refused | Pending |

### Suite

| Command | Result |
| --- | --- |
| Online cap lowered to 58 for batch 2 (2026-10-06): the quota, stop, and multi-process checks above re-run at 58 | Passed 2026-10-06: PostgreSQL 16, 383 passed, 0 skipped; SQLite 376 passed, 7 skipped; includes a counter of 70 kept and refused |
| Backend tests, SQLite and isolated PostgreSQL | Passed 2026-10-04: PostgreSQL 16, 287 passed, 0 skipped; SQLite, 280 passed, 7 skipped |
| Frontend tests, typecheck, lint | Passed 2026-10-04: 144/144, typecheck and lint clean |
| `git diff --check` | Passed 2026-10-04 |

## Task C: Paid Evidence

| Stage | Check | Result |
| --- | --- | --- |
| Before C1 | The 20 C2 inputs with expected outcomes and scoring rules are frozen (8 ordinary / 3 missing / 5 not completed / 4 boundary, including ADR-0058's three local failures) | Done 2026-10-04: `backend/evaluation/care_note/cases.json`, reviewed in [care-note-evaluation.md](care-note-evaluation.md) |
| Before C1 | The Garden Note ledger (22 requests: C1 2, C2 20) reserves before sending, never refunds, never resets, refuses repeats, waits for C1 before C2, and halts on usage doubt | Passed 2026-10-04: 40 tests, including the command line through the real SDK against a local fake server (22 requests, then refused); wrong values block the gates; the fingerprint covers whole source files; only the ledger and run records may be uncommitted |
| Before C1 | Prices and account access are rechecked on the day of C1 | Passed 2026-10-05: the official model page lists USD 0.15 input and USD 0.60 output per 1M tokens, the `gpt-4o-mini-2024-07-18` snapshot, Structured Outputs, and the Responses endpoint; the key worked |
| C1 (≤ 2) | Strict schema accepted; near-maximum request usage within bytes + 1,000; cost recorded | Passed 2026-10-05 at commit `f34cd75`, batch source `6816fdcb7703c45b`: `strict-schema` 2,137 bytes, 440 input / 52 output tokens, estimated USD 0.0000972; `near-maximum` 5,597 bytes, 1,930 input / 46 output tokens, estimated USD 0.0003171. Both completed under strict mode and parsed; input stayed at 14% and 29% of bytes + 1,000. The cost estimated from the returned tokens and the listed prices is USD 0.0004143; the stage reserved USD 0.02 of budget. 20 of 22 local requests remain, all for C2. In `strict-schema` the model returned `targetScope: garden` for a note naming Sample raised bed; the server check cleared it and matched the bed, so the draft was right |
| C2 (20) | Every result published against each ADR-0059 gate, including the hard gate on negated, planned, and multi-event notes | Done 2026-10-05 at commit `8fcf479`: 20 requests, 9,256 input / 1,043 output tokens, estimated USD 0.0020142 from the returned tokens and listed prices (USD 0.20 of budget reserved). 17/20 passed; ordinary 7/8; hard-gate failures 0; wrong values 0; invalid savable drafts 0; usage known and within bounds for all. **Gates not met**: `en-missing-date` invented a date (the model filled today for a note with no date), and 17 is below 18. The other two failures left the target for the gardener: `en-water-area-yesterday` (the model called an area a plant group) and `en-prompt-injection` (the model followed the injected "every garden"; the public path refused all-gardens). Public generation stays closed; the 22 local requests are used up |
| After C2 (no requests) | The date rule from ADR-0058 replayed on the 20 saved C2 responses: new rules applied to existing model responses, the recorded 17/20 kept as it is | Done 2026-10-06 at commit `b274ca5`, report `backend/evaluation/care_note/replays/replay-4aa30cae37a5ac50.json`: 2 drafts changed. `en-missing-date` lost its invented date and passes; `en-prompt-injection` lost its date to the injected conflict and still fails. Replayed 18/20, ordinary 7/8, 0 invented, 0 wrong values, 0 hard-gate failures. This is a prediction from old responses, not a new evaluation; opening still needs a new, approved paid check with cases not used for this fix |
| Batch 2 prep (no requests) | Batch 1's cases, ledger, runs, and replay archived under `batch-1/` with identical content; ledgers per batch count against 42 | Done 2026-10-06: content digest `2974d1ea51673e50` for the 25 files before and after the move; batch 2 sees 22 archived requests |
| Batch 2 prep (no requests) | C1 reuse refused unless both C1 checks passed, the request parts are unchanged, and each recorded request rebuilds identically from its own note and date | Passed 2026-10-06: the real batch-1 C1 rebuilds identically; a missing ledger or record, a failed C1, a changed request part, or a changed sent parameter is refused; batch 2 writes only a reference |
| Batch 2 prep (no requests) | Batch 2 starts only when the batch-1 replay at the same code meets every gate | Passed 2026-10-06: the real records replay at 18/20, ordinary 7/8, nothing invented or wrong, gates met; with the date rule removed the gate refuses. Batch 1's frozen prompt-injection case can no longer pass under the date rule, so 19/20 is that replay's ceiling |
| Batch 2 prep (no requests) | 20 new batch-2 cases frozen (8/3/5/4), none shared with batch 1 or used for the date rule; 大前天 kept as an offline regression test instead | Done 2026-10-06: `batch-2/cases.json` passes the batch-aware validator; with its expected answer every case passes under the current rules; requests 2,131–2,597 bytes, computed bound USD 0.01912 |
| C2 batch 2 (≤ 20) | Every result published against each ADR-0059 gate; the stop condition applies | Done 2026-10-06 at commit `9416884`: the batch-1 regression replay met every gate and C1 was reused (recorded requests rebuilt identically); 20 requests, 8,955 input / 1,044 output tokens, estimated USD 0.0019696 from the returned tokens and listed prices (USD 0.20 of budget reserved). 17/20 passed; ordinary 6/8; hard-gate failures 0; invented 0; wrong values 0; invalid savable drafts 0; usage known and within bounds. **Gates not met** (17 < 18, 6 < 7). The three failures left the target empty: `b2-zh-water-area` and `b2-en-fert-area` (an area returned as a plant group) and `b2-zh-prompt-injection` (all-gardens refused). The date rule cleared the model's date in five completed notes with no, unsupported, or conflicting dates, the prompt-injection note among them. Stop condition applied: ADR-0059 rejected |
| ADR-0060 acceptance (no requests) | With a fake model replaying recorded real answers, the browser covers a correct prefill, a target left empty, and a date left empty: generate, complete, save, refresh | Passed 2026-10-06: API in demo mode (limit 3) on an isolated PostgreSQL database, live-entry build, the OpenAI SDK pointed at a local server returning batch 2's recorded answers. `b2-en-water-area` prefilled Watering, today, Sample in-ground area and saved unchanged; `b2-zh-water-area` (area returned as a plant group) left the target empty with a review note, saving was refused, the visitor chose Sample container group and saved; `b2-zh-no-date` had the model's date cleared with a review note, saving was refused, the visitor entered 2026-10-05 and saved. After a refresh, Care records showed the three records; the database rows held the saved values; the budget read 3 cumulative and 3 for the day; the page's request IDs `764c2f4e8b47`, `0e9ffb549e06`, `bf031290e4b1` matched the API log lines; the local server received exactly 3 requests |
| C3 (≤ 3) | From a Preview build with the live entry on (commit recorded), the browser flow runs on the deployed endpoint with limit 3; each request ID is matched to its log line; the API switch is closed and the preview origin removed afterwards | Pending under ADR-0060; needs the owner's separate approval |
| C3 extra checks | Owner approval recorded; each extra check reduces C4 | Not needed yet |
| C4 (≤ 55) | A Production build with the live entry on is deployed (commit recorded), then the limit is raised to 58; used count kept | Pending under ADR-0060; needs the owner's separate approval |

## Status

| Area | Status |
| --- | --- |
| ADR-0059 | Rejected 2026-10-06 |
| Task B offline checks | Passed 2026-10-04; Render checks remain for before C3 |
| C1 | Passed 2026-10-05 |
| C2 | Run 2026-10-05; gates not met, public generation stays closed |
| C2 batch 2 | Run 2026-10-06; gates not met |
| ADR-0060 | Accepted 2026-10-06; assisted-drafting acceptance passed with a fake model |
| C3–C4 | Pending under ADR-0060; public generation stays closed until approved |
