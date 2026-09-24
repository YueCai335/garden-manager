# ADR-0057: Keep Live Allocation Runs Closed in the Public Demo After Evaluation

- Status: Accepted
- Date: 2026-09-24
- Amends: [ADR-0056](0056-use-a-budgeted-tool-calling-agent-for-season-allocation.md)
  (public run limit)
- Related: [ADR-0040](0040-use-vercel-render-and-supabase-for-the-portfolio-demo.md)

## Context

ADR-0056 planned to open the public Allocation Assistant with a cumulative
limit of 150 runs once the pre-release cost verification passed. The paid
evaluation is now complete; the records are in `backend/evaluation/`:

- The cost verification passed. The longest constructed request, 9,762 bytes,
  used 2,190 input tokens. The cost bound holds with a wide margin.
- All ten evaluation runs returned a valid draft. The pre-written automatic
  checks passed in 7 of 10 cases.
- Preference checks passed in 5 of 5 cases. The enumerating baseline, which
  does not read natural language, passed them in 1 of 5.
- Rotation checks passed in 5 of 8 cases. In the three failures, the agent
  accepted warnings that a different assignment avoids.
- A manual review found that 3 of the 10 explanations contain wrong or
  misleading statements. Examples: one claims the allocation followed
  preferences that the gardener never gave, and one misnames the
  rotation-friendly groups. A fourth answered a Chinese preference in English.

Server-computed warnings stay correct in every run, but the model's
explanation sits next to them and can mislead a visitor.

## Decision

- `AGENT_PUBLIC_RUN_LIMIT` stays `0`. The public demo does not run the agent
  live.
- The public demo shows the labelled example run recorded from the
  `demo-tomato-bean` evaluation case. The panel offers the example run after
  `provider_unavailable`, which is what the public API returns.
- The full evaluation results, including failures, are published in
  `docs/agent.md` next to the example, so the example is not read as typical.
- The Allocation Assistant runs live only in the local app with a key.

## Why This Option

- The cost risk is solved, but the quality risk is not: a live visitor would
  see explanations that are wrong about 30% of the time in this small sample.
- A labelled real recording shows the tool-calling loop working without
  presenting unreviewed model text as advice.
- The paid budget for this batch is used up (13 of 13 units), so opening the
  demo would also need a new budget decision.

## Alternatives Considered

### Open the public demo with 150 runs as planned

The cost limit makes this affordable, but it would put misleading
explanations in front of visitors, including recruiters, with no review.

### Hide the model's explanation and show only the allocation and warnings

This removes the misleading text, but also most of what the agent adds for a
visitor. It remains a candidate if the demo reopens.

### Change the prompt and run another paid batch

This could raise the scores, but it needs a new budget and batch. For the
portfolio, the documented success path, failures, and launch trade-off are
more useful than a better score.

## Consequences

- Visitors see the recorded example and the published evaluation, not a live
  run.
- `docs/portfolio-demo-deployment.md` no longer describes opening the public
  limit as the next step.
- The OpenAI key stays out of Render.

## Revisit When

- Explanation accuracy is measured again on a larger fixed case set and the
  misleading statements are gone, or the explanation is hidden or
  constrained.
- A new paid budget is approved for that measurement.
