# Allocation Assistant: A Small Tool-Calling Agent

The Allocation Assistant helps a gardener decide which growing area each crop
goes to next season. It is a small agent: a language model that can call two
read-only tools, read their results, and revise its plan before answering.

This page explains how it works, how it is kept safe and cheap, and what the
paid evaluation found. The decisions behind it are in
[ADR-0056](decisions/0056-use-a-budgeted-tool-calling-agent-for-season-allocation.md)
and [ADR-0057](decisions/0057-keep-live-allocation-runs-closed-after-evaluation.md).

## Status

| Part | Status |
| --- | --- |
| Agent, tools, loop, and HTTP endpoint | Implemented and tested |
| Allocation Assistant panel in the Season Planner | Implemented and tested |
| Live runs in the local app (with an OpenAI key) | Available |
| Live runs in the public demo | **Closed.** The run limit is `0` ([ADR-0057](decisions/0057-keep-live-allocation-runs-closed-after-evaluation.md)) |
| Example run in the public demo | Shown: one recorded, labelled, successful run |

## What the gardener does

1. Open **Next season plan**. Each garden has its own Allocation Assistant.
2. Tick crops from a fixed list: tomato, bean, lettuce, cucumber, carrot.
3. Optionally write one preference, such as "Put the lettuce in the
   containers". Pick areas only when more than three are eligible.
4. Select **Plan with AI**. After the run, the panel shows the draft, the
   rotation warnings, the model's explanation, and every tool call in order.
5. Select **Add to 2027 plan** to append the draft to next season's plan. The
   existing automatic sync saves it. Nothing is saved before this step.

## How a run works

```text
gardener input ──► input check ──(problem)──► needs_input, no model call
                       │
                       ▼
             ┌──► model request ──► tool call? ──yes──► run tool ─┐
             │                         │                           │
             │                         no                          │
             │                         ▼                           │
             │             final answer ──► server re-check ──► draft
             └──────────────── tool result sent back ◄─────────────┘
                         (at most 5 model requests)
```

- **Tools.** `get_planting_history` returns which crop groups each selected
  area grew in the last three years. `check_allocation` runs the project's
  existing crop-rotation rule on a candidate plan and returns warnings. Both
  only read data.
- **Loop.** The loop is hand-written (`backend/app/agent/loop.py`), with no
  agent framework. Each model request carries the full conversation so far.
  The model may make one tool call per request, and the tool result goes back
  in the next request.
- **Final answer.** The model returns JSON with the assignments and a short
  explanation. The server validates it with the same rules as the tools, then
  recomputes the rotation warnings itself.

## Guardrails

| Risk | Guardrail |
| --- | --- |
| Bad input costs money | The input is checked before any model call; problems return `needs_input` |
| The model invents areas or crops | Tool arguments and the final answer pass one rule set: selected areas only, selected crops only, each crop exactly once |
| The model misstates rotation | Warnings shown to the gardener are computed by the server, never taken from the model |
| Unknown tool or malformed arguments | Returned to the model as an error; nothing runs |
| The loop never ends | At most 5 model requests; the SDK's own retries are off, so every retry is counted |
| AI writes to the garden | The endpoint never writes. Only the gardener's confirmation appends to the plan |
| A stale draft is confirmed | Confirming re-checks the season year, areas, crops, preference, and rotation history against the newest data |
| Unexpected or malformed replies | Refusals, empty or cut-off replies, several tool calls, or unreadable responses end as `generation_failed` |

## Cost control

- Before sending, every request's full parameters are measured in UTF-8
  bytes. A byte-level tokenizer maps each token to at least one byte, so the
  byte count bounds the tokens. A request over 10,000 bytes is never sent.
- Output is capped at 800 tokens per request.
- The ADR-0056 bound, 5 × ((10,000 + 1,000 allowance) input + 800 output),
  is about US$0.0107 per run with `gpt-4o-mini-2024-07-18`.
- The public demo has a cumulative run counter in PostgreSQL. It is `0`, so
  no public run can start.

### Measured cost

A constructed worst-case conversation was sent to the real model. The model's
answers were ignored; this check measures usage only.

| Request | Bytes | Input tokens | Output tokens | Bound (bytes + 1,000) |
| --- | --- | --- | --- | --- |
| 1 | 4,179 | 868 | 14 | 5,179 |
| 2 | 5,517 | 1,200 | 84 | 6,517 |
| 3 | 6,932 | 1,530 | 83 | 7,932 |
| 4 | 8,347 | 1,860 | 83 | 9,347 |
| 5 | 9,762 | 2,190 | 83 | 10,762 |

Input tokens were about 22% of the byte count, so the bound is conservative.
All paid runs together (13 units) used about US$0.0067 at published prices.

## Evaluation

The evaluation used ten fixed cases, written before any paid run
(`backend/evaluation/allocation_cases.json`). Each case ran once. Every paid
step drew from one ledger with a hard unit limit. Failed steps counted, and
nothing was retried.

Each case is compared with an **enumerating baseline**. The baseline tries
every assignment and keeps the one with the fewest rotation warnings. It
cannot read the preference text.

### Results

| Measure | Agent | Baseline |
| --- | --- | --- |
| Valid drafts | 10 / 10 | — |
| Cases passing every automatic check | **7 / 10** | — |
| Preference checks (5 cases) | 5 / 5 | 1 / 5 |
| Rotation checks, warnings ≤ baseline (8 cases) | 5 / 8 | 8 / 8 |

| Case | Result | Requests | Agent warnings | Baseline warnings |
| --- | --- | --- | --- | --- |
| demo-tomato-bean | passed | 4 | 0 | 0 |
| demo-three-new-crops | passed | 3 | 0 | 0 |
| demo-all-five | **failed** (rotation) | 3 | 2 | 0 |
| demo-lettuce-in-containers | **failed** (rotation) | 3 | 1 | 0 |
| demo-tomato-stays-in-bed | passed | 3 | 2 | 0 |
| demo-chinese-preference | passed | 3 | 0 | 0 |
| demo-keep-beans-out | passed | 3 | 0 | 0 |
| demo-conditional-preference | passed | 3 | 0 | 0 |
| four-areas-chosen | **failed** (rotation) | 3 | 3 | 0 |
| crowded-unavoidable | passed | 3 | 2 | 2 |

`demo-tomato-stays-in-bed` asks for a repeat on purpose, so it has no
rotation check.

### What the results show

- **Preferences.** The agent followed every written preference, including a
  Chinese one and a conditional one. That is better than the current
  baseline, which cannot read natural language. It is not a claim against
  every possible deterministic method.
- **Rotation.** The agent revised its plan after a warning in only one case
  (`demo-tomato-bean`: 2 warnings, then 0). In the three failures, it
  accepted warnings on the first check that another assignment avoids. The
  instruction not to "keep searching for a warning-free plan" may discourage
  revision. This is a hypothesis; it was not tested.
- **Duplicates.** Batch 1's smoke run assigned a crop twice in every
  candidate and failed. After the instructions said areas may stay empty, 11
  runs (one smoke and ten evaluation cases) made 12 `check_allocation` calls
  with no duplicate assignment. This small sample does not prove that the
  problem is gone for good.
- **Sample size.** Ten cases, one run each, show where the agent works and
  where it fails. They do not give a stable success rate.

### Explanation accuracy (manual review)

The automatic checks do not score the explanation, so it was reviewed by hand.
Server warnings were correct in every run. The model's text was not always
correct:

| Run | Statement | Fact |
| --- | --- | --- |
| four-areas-chosen | "The selected crops have been assigned based on growing area preferences." | The case gave no preference |
| demo-lettuce-in-containers | "consider cropping friendly to nightshade, such as brassica, cucurbit, legume…" | These are rotation-friendly groups for the bed, not groups "friendly to nightshade" |
| demo-all-five | "Tomatoes and cucumbers are assigned to the Sample raised bed, but this would mean the same crop group (nightshade) is repeated" | Only tomato is a nightshade; cucumber is a cucurbit |
| demo-chinese-preference | The explanation is in English | The instructions ask for the language of the preference |
| Batch 2 smoke | "Both areas are thus in line with their respective crops." | Both areas repeat the crop group, which is why they warn |

Six of the ten evaluation explanations matched the server's facts.

## Why the public demo shows a recording

The cost bound is verified, but a live visitor would see explanations that
were wrong or misleading in 3 of 10 evaluation runs. The public demo therefore
keeps live runs closed. When the API answers `provider_unavailable`, the
panel offers **View example run**.

The example is the real `demo-tomato-bean` evaluation run. It shows the whole
loop: read history, check a plan with two warnings, revise, check again with
none, and answer. It is labelled with its date, model, and garden, and it
cannot be added to a plan. It is a selected success, so read it together with
the results above.

## Running it

- **Local app:** put `OPENAI_API_KEY` in the API's environment. Without it,
  the endpoint returns `provider_unavailable`.
- **Paid evaluation:** `backend/scripts/agent_live.py` (`status`, `smoke`,
  `verify-cost`, `evaluate`, `example`). Paid commands need `--confirm-spend`
  and hold a lock on the shared ledger. The current ledger is used up (13 of
  13 units across batches).

## Where things are

| Path | Contents |
| --- | --- |
| `backend/app/agent/allocation.py` | Crop table, input check, rotation summary, allocation rules |
| `backend/app/agent/tools.py` | The two tools and their JSON schemas |
| `backend/app/agent/loop.py` | The loop, request building, byte check, result shape |
| `backend/app/agent/openai_model.py` | OpenAI Responses adapter |
| `backend/app/agent/budget.py`, `service.py` | Public run limit, lock, and HTTP flow |
| `backend/app/agent/baseline.py`, `live.py` | Baseline and paid-run tooling |
| `backend/evaluation/` | Cases, ledgers, and every paid run record, including failures |
| `src/components/AllocationAssistant.tsx` | The panel and the example-run replay |
| `src/data/exampleAllocationRun.json` | The recorded example run |
