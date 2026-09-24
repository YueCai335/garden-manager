# Evaluation Batch 1 (archived)

Batch 1 used one paid unit, the smoke test, on 2026-09-24 with
`gpt-4o-mini-2024-07-18`. The ledger and the run record are kept unchanged.

## What happened

The smoke case asked for tomato and bean on the demo garden, which has three
areas. The model read the planting history, then called `check_allocation`
four times. Every candidate assigned one crop twice, and every check returned
the duplicate-assignment error. The fifth request still asked for a tool, so
the run ended as `generation_failed` with `step_limit`.

The record shows that the model never corrected the duplicate. It does not
show why. One likely reason is that the model tried to fill every area,
because the instructions said an area may hold several crops but did not say
an area may stay empty.

## What the run established

- The Responses API accepted the request parameters, tool definitions, and
  single tool calls.
- Usage was reported for all five requests: 3,451 input and 253 output tokens,
  about US$0.000669 at the published gpt-4o-mini prices. Each request's input
  tokens stayed well inside its byte count plus the 1,000-token allowance.
- It does not verify the longest conversation, which is the purpose of the
  cost check, or a real final answer being parsed into a draft.

## Why a new batch

The fix changes the instructions and the duplicate-assignment error message.
Both belong to the request template in the batch fingerprint, so batch 1
refuses further paid runs. Batch 2 starts a new ledger. All batches together
stay within 13 units (`TOTAL_UNIT_LIMIT`), so this archive leaves 12 units,
and archiving again would not add more.
