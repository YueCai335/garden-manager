# Public Care Note Delivery — Checks and Evidence

- Decision: [ADR-0059](decisions/0059-open-budgeted-public-care-note-generation.md)
  (Proposed). Design, limits, and gates live there; this file lists the
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
| A missing, non-numeric, negative, or above-78 run limit, a disabled switch, or a different model sends no provider request | Passed 2026-10-04: `test_run_limit_must_be_an_integer_from_0_to_78`, `test_any_missing_setting_closes_public_generation_before_any_reservation` |

### Quota and stop

| Check | Result |
| --- | --- |
| Concurrent requests for the last cumulative or daily slot: exactly one reaches the fake provider | Passed 2026-10-04 on PostgreSQL 16: four spawned processes race for the last cumulative request; exactly one reserves and the counter ends at 78 |
| A daily-limit failure rolls back the cumulative increment | Passed 2026-10-04 on SQLite and on PostgreSQL 16 with four processes: one reserves, three roll back, cumulative ends at 1. Breaking the rollback makes it end at 4 and the test fail |
| Two first requests of a UTC day create one daily row and count both | Passed 2026-10-04 on PostgreSQL 16: three processes, one daily row at 3 |
| Limit 3 → 78 keeps the used count; 78 grants only the remainder | Passed 2026-10-04 |
| Restart, UTC rollover, missing row, database error: usage persists and uncertainty blocks the call | Passed 2026-10-04: rollover, missing row, and database error on SQLite; a fresh process after a stop stays blocked on PostgreSQL 16 |
| Usage above bytes + 1,000, output above 800, or missing usage: the cumulative row reaches 78 and other processes and a restart stay blocked, including after the limit is raised | Passed 2026-10-04: in one process on SQLite, and across processes on PostgreSQL 16 (a stop written by one process blocks a new process on a later day) |
| A failed stop write returns an error, logs the stop as unconfirmed, and the manual Render disable procedure is exercised | Error response and `care_note_public_stop_unconfirmed` log passed 2026-10-04; the manual procedure is written in the deployment guide and is exercised on Render (see below) |
| Timeout, refusal, truncation, malformed draft: reservation kept, no retry, no partial draft | Passed 2026-10-04 |
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
| Backend tests, SQLite and isolated PostgreSQL | Passed 2026-10-04: PostgreSQL 16, 287 passed, 0 skipped; SQLite, 280 passed, 7 skipped |
| Frontend tests, typecheck, lint | Passed 2026-10-04: 144/144, typecheck and lint clean |
| `git diff --check` | Passed 2026-10-04 |

## Task C: Paid Evidence

| Stage | Check | Result |
| --- | --- | --- |
| Before C1 | Prices, account access, and the 20 C2 inputs with expected outcomes are frozen (8 ordinary / 3 missing or ambiguous / 5 not completed / 4 boundary, including ADR-0058's three local failures) | Pending |
| C1 (≤ 2) | Strict schema accepted; near-maximum request usage within bytes + 1,000; cost recorded | Pending |
| C2 (20) | Every result published against each ADR-0059 gate, including the hard gate on negated, planned, and multi-event notes | Pending |
| C3 (≤ 3) | From a Preview build with the live entry on (commit recorded), the browser flow runs on the deployed endpoint with limit 3; each request ID is matched to its log line; the API switch is closed and the preview origin removed afterwards | Pending |
| C3 extra checks | Owner approval recorded; each extra check reduces C4 | Not needed yet |
| C4 (≤ 75) | A Production build with the live entry on is deployed (commit recorded), then the limit is raised to 78; used count kept | Pending |

## Status

| Area | Status |
| --- | --- |
| ADR-0059 | Proposed |
| Task B offline checks | Passed 2026-10-04; Render checks remain for before C3 |
| C1–C4 | Pending |
