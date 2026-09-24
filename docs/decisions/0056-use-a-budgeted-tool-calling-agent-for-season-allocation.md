# ADR-0056: Use a Budgeted Tool-Calling Agent for Next-Season Allocation

- Status: Accepted; public run limit amended by [ADR-0057](0057-keep-live-allocation-runs-closed-after-evaluation.md)
- Date: 2026-09-23
- Amends: [ADR-0040](0040-use-vercel-render-and-supabase-for-the-portfolio-demo.md)
  for this one workflow
- Related: [ADR-0004](0004-keep-physics-deterministic.md),
  [ADR-0025](0025-use-three-season-crop-rotation-warnings.md),
  [ADR-0028](0028-use-plant-types-varieties-and-bilingual-color-aliases.md),
  [ADR-0032](0032-use-local-first-ai-providers-for-care-notes.md),
  [ADR-0039](0039-use-separate-season-plans-for-future-planting.md), and
  [ADR-0055](0055-use-automatic-sync-with-optimistic-locking.md)

## Context

The project strategy lists tool calling as the remaining planned piece of the
AI application layer. Every current AI workflow is a single model call inside a
fixed pipeline: care-note extraction, plant-health drafts, and Plant Knowledge
answers. None of them lets the model choose an action, observe the result, and
adjust.

The Season Planner already has the inputs such a workflow needs: growing areas,
three years of rotation-group history, deterministic rotation warnings, and
separate next-season plans that save through automatic workspace sync.

ADR-0040 keeps every AI workflow out of the public demo because the project had
no hosted AI budget. It names "a hosted AI provider with an explicit budget" as
a reason to revisit. The owner accepts a total OpenAI spend of US$5 for this
feature, including development, evaluation, and the public demo.

The allocation problem itself is small. Three areas and five crops allow at
most 3⁵ = 243 assignments, so a deterministic search can find the assignment
with the fewest rotation warnings. The model adds value in understanding a
free-text preference, choosing which tool to call, and revising a candidate
after tool feedback.

## Decision

### Workflow and placement

Add a garden-level **Allocation Assistant** inside the Season Planner. The
gardener selects crops to grow next season and optionally writes one short
preference, such as "put the lettuce in containers". The agent proposes which
growing area each crop goes to, explains the rotation warnings, and returns a
draft. The gardener confirms the draft before anything is saved.

First-version limits:

- One garden and at most three growing areas per run. When the garden has more
  than three rotation-eligible areas, the request names up to three; otherwise
  the server returns `needs_input`.
- Crops come from a fixed list of five. Each has a stable key and maps to one
  of the project's rotation groups through a deterministic table. The rotation
  groups are the existing `cropFamily` values; `root` and `leafy` are
  gardening groups, not botanical families.

  | Crop key | Label | Rotation group |
  | --- | --- | --- |
  | `tomato` | Tomato | nightshade |
  | `bean` | Bean | legume |
  | `lettuce` | Lettuce | leafy |
  | `cucumber` | Cucumber | cucurbit |
  | `carrot` | Carrot | root |

- The preference text is at most 200 characters.
- The server fixes the season year as the current calendar year plus one,
  matching the Season Planner, and returns it with the draft.

### Allocation rules

One validation function checks every tool argument and the final allocation:

- Every growing area belongs to the set selected for this run.
- Every crop belongs to the set the gardener selected.
- Every selected crop is assigned exactly once.
- One area may receive several crops. The result states area assignment only;
  spacing and plant counts stay with the existing layout editor.

### Agent loop

- Endpoint: `POST /workspaces/{workspace_id}/gardens/{garden_id}/ai/season-allocation`.
- A hand-written loop over the OpenAI Responses API with function calling. No
  agent framework.
- Two read-only tools:
  1. `get_planting_history` returns a rotation summary: one row per selected
     area, year, and rotation group from the previous three years. It does not
     send raw planting records.
  2. `check_allocation` takes a candidate `{growing_area_id, crop}` list, runs
     the existing `evaluate_rotation` rule for each pair, and returns warnings
     and rotation-friendly groups.
- The model may revise a candidate after a warning and check again. A draft
  may still contain warnings; the instructions tell the model to keep a
  complete allocation with warnings rather than keep searching for a
  warning-free one. The gardener judges the warnings.
- At most five model requests per run. The OpenAI SDK's automatic retries are
  disabled (`max_retries=0`), so every retry is a counted request in this loop.
- Tool arguments are validated with Pydantic and the allocation rules. An
  unknown tool name or invalid arguments go back to the model as an error
  message and do not execute.
- Each run returns
  `{status, season_year, allocation, explanation, warnings, rotation_summary, missing_inputs, failure_reason, trace}`.
  `trace` lists `{step, tool, args, short_result}`.
- `status` is one of:
  - `draft`: a complete allocation that passed server validation.
  - `needs_input`: the input is incomplete or unsupported; no model call ran.
  - `budget_exhausted`: the public run limit is used up.
  - `provider_unavailable`: no API key is configured or the provider rejected
    the request.
  - `generation_failed`: the fifth request still asked for a tool, the output
    reached the token limit, the input check stopped the run, or the final
    output was incomplete or failed validation. `failure_reason` states which.

  Only `draft` offers a confirm action. Every other status except
  `needs_input` offers the example run.

### Guardrails

- The server checks inputs before calling the model. An unsupported crop,
  missing crop selection, or an ambiguous area set returns `needs_input` and
  spends nothing.
- Tools only read the requested workspace and garden and only the selected
  areas.
- The server re-validates the final allocation with the allocation rules and
  recomputes rotation warnings with `evaluate_rotation`. The response shows the
  server-computed warnings. The model text explains them and never replaces
  them.
- The endpoint never writes garden data.

### Confirmation and stale drafts

- The draft records the complete input it was generated from: season year,
  selected areas, each area's kind, the crop selection, the preference text,
  and the `rotation_summary`. The frontend compares each of these with the
  current garden and the current panel input. When any of them differs,
  including an edited preference, the confirm button is disabled and the panel
  asks the gardener to generate again. This covers history edited after
  generation and a public demo garden that no longer matches the server copy.
- The panel waits for pending workspace sync before it starts a run.
- Confirmation **appends** every allocated crop in one change to the
  next-season plan for the draft's `season_year`, creating the plan when none
  exists. It skips a crop already planned in the same area that year. Existing
  planned plantings are matched to crop keys only through the known plant-type
  aliases in `src/lib/gardenWorkspace.ts`; unrecognized records stay untouched.
  The panel then reports "Added X, skipped Y".
- The existing automatic sync and revision check persist the change.

### Model and cost control

- Model: a pinned `gpt-4o-mini` snapshot, set by environment variable. The key
  lives only in backend environment variables and a dedicated OpenAI project.
- The OpenAI account is prepaid with US$5 and auto-recharge off. OpenAI stops
  usage when the balance runs out, but the stop can be delayed and the balance
  can go slightly negative. The prepaid balance is therefore the outer limit,
  and the application limits below keep spend well inside it.
- Budget allocation: US$1 for development and about ten evaluation cases, US$2
  for the public demo, US$2 reserve. Automated tests and CI use a scripted fake
  model and never call OpenAI. The evaluation script takes an explicit maximum
  run count.
- Every request enforces two limits before it is sent:
  - `max_output_tokens=800`.
  - An input limit of 10,000 UTF-8 bytes, measured over the full request
    content: instructions, tool definitions, conversation, and tool results.
    When the next request would exceed it, the run stops with
    `generation_failed` and no request is sent.
- The byte limit bounds tokens because the model's byte-level tokenizer maps
  every token to at least one byte, so a request's content cannot contain more
  tokens than bytes. OpenAI adds formatting tokens for messages and tool
  definitions that the application cannot count in advance. The cost bound
  therefore adds a fixed allowance of 1,000 tokens per request for that
  formatting. The server logs `usage.input_tokens` for every request; this log
  verifies the allowance and does not act as the limit.
- Cost bound per run, valid while logged usage stays inside the allowance:
  `5 × ((10,000 + 1,000) × $0.15 + 800 × $0.60) / 1,000,000 ≈ $0.0107`.
  The public limit starts at 150 runs, about US$1.60 at this bound, inside the
  US$2 allocation. Typical runs cost less, because most runs use fewer than
  five requests and less than the full input limit.
- Before the public demo opens, a verification run uses the longest allowed
  input and five tool-calling rounds, then compares each request's logged
  input tokens with its byte count plus the allowance. If the allowance is
  insufficient, the public demo stays closed until the limits and run count
  are adjusted, this record is updated, and the verification passes again.
- In `PORTFOLIO_DEMO_MODE`, a persistent counter in PostgreSQL enforces a
  cumulative run limit set by environment variable. The server increments it
  with one conditional `UPDATE ... WHERE used_runs < :limit` and commits that
  transaction before calling the model, so a later failure cannot roll the
  increment back. Failed runs are not refunded. The limit does not reset
  daily.
- In `PORTFOLIO_DEMO_MODE`, the server reads a fixed copy of the built-in demo
  garden instead of the stored workspace. The request supplies only the crop
  selection and preference. Data sent to OpenAI is therefore always generic,
  and its size matches the cost estimate. The panel shows the demo garden the
  run used. One run executes at a time.
- The public demo keeps every other AI and photo workflow disabled, as
  ADR-0040 decided.

### Fallback and replay

When the run limit is used up, no API key is configured, or a run ends in
`generation_failed`, the panel explains why and offers **View example run**.
The example is one real recorded run against the demo garden, stored as a
repository fixture with its input, tool results, allocation, model, and run
date. The page labels it as an example run so it is never mistaken for the
gardener's own result.

### Evaluation

A deterministic baseline enumerates every assignment and picks one with the
fewest rotation warnings. The evaluation cases compare the agent with this
baseline on rotation warnings and on whether the allocation follows the stated
preference.

Each case is written before any run and states its pass condition in terms the
code can check, for example "`lettuce` is assigned to `demo-container-group`"
or "no more rotation warnings than the baseline". A case without a checkable
condition is not counted. The results decide whether the agent stays in the
product.

## Why This Option

- The agent demonstrates tool selection, reading tool feedback, and revising a
  candidate, and it can apply a free-text preference that the deterministic
  baseline cannot read. Whether this beats the baseline is an evaluation
  question, answered by the evaluation cases above.
- Both tools wrap deterministic code that already exists and has tests. The
  agent adds orchestration, not new horticultural claims to verify.
- Recomputing warnings on the server keeps rotation rules deterministic, as
  ADR-0004 and ADR-0025 require.
- Confirming through the existing season-plan state and sync adds no new write
  path and inherits optimistic locking.
- Comparing rotation summaries invalidates stale drafts precisely. Comparing
  workspace revisions would also reject drafts after unrelated edits, such as a
  new care task.
- A hand-written loop keeps every paid request under one counter and lets
  tests replace the model with a scripted fake.
- A cumulative run counter caps public spend inside the application. A daily
  limit would keep spending as long as the demo stays online.
- A replay keeps the feature visible after the budget runs out, at zero cost.

## Alternatives Considered

### Deterministic search only

Enumerate the 243 or fewer assignments and return the one with the fewest
warnings. It is free, exact for rotation, and simple. It cannot read a
free-text preference and does not demonstrate tool calling. It is kept as the
evaluation baseline.

### Fixed pipeline with one structured-output call

Load history, run rotation checks for every crop-area pair, and ask the model
once for an allocation. It is cheaper and simpler but cannot react to a
warning. It remains the fallback design if the agent does not beat it in
evaluation.

### Broader agent with knowledge search and plan tools

The original proposal added a RAG `search_knowledge` tool and a `propose_plan`
tool. Plant Knowledge retrieval depends on local Ollama embeddings, so hosting
it would need an embedding migration and more advice validation. Plant
Knowledge stays a separate local capability.

### Local Ollama model for the agent

Free to run, but it cannot run on the free public API host. Its multi-step
tool-calling quality with the current `qwen3:4b` model is unmeasured and can be
added to the evaluation later.

### Agent framework such as LangChain

Adds dependencies, adds retry layers outside the request counter, and hides the
loop that this feature exists to show. A hand-written loop of this size is
easier to test and explain.

### Daily or per-IP limits only

Daily limits never cap total spend. Per-IP limits can be added later; the
cumulative limit and single concurrent run control the main cost.

### Invalidate drafts by workspace revision

Simple to implement, but any workspace edit changes the revision, and the
public demo reads a server copy that has no workspace revision.

## Consequences

- A new Alembic migration adds the run-counter table.
- New environment variables: OpenAI key, agent model, and public run limit.
- A fixed server-side copy of the demo garden must stay in step with the
  frontend demo garden; a test compares the two.
- New backend module for the agent loop and tools, with pytest coverage using a
  scripted fake model: tool sequence to draft, five-request stop, unknown tool
  rejection, invalid argument rejection, area outside the selected set,
  output-limit stop, a byte-limit stop that sends no request, `needs_input`
  before any model call, no
  database writes during a run, and a PostgreSQL race for the last run.
- The Season Planner gains an Allocation Assistant panel, a trace list, a
  stale-draft check, a confirm action that appends to the season plan, and an
  example-run view, with Vitest coverage for append, skip, and stale drafts.
- `docs/agent.md` explains the tools, loop, guardrails, and evaluation.
- After release, the strategy table marks tool calling as in use and the
  README describes the public demo's limited live AI.
- The public demo sends the fixed demo garden's data to OpenAI. The garden is
  generic and contains no personal data.

## Revisit When

- The agent does not beat the deterministic baseline or the fixed pipeline in
  evaluation.
- The pinned model is retired.
- Logged input tokens for any request exceed its byte count plus the
  formatting allowance, or real runs routinely hit the byte limit.
- The product adds accounts, which would allow per-user limits and private
  gardens in the public demo.
- The crop list or area limit becomes the main user complaint.
