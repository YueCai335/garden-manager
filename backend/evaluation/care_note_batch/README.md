# Batch Garden Note evaluation corpus

Superseded on 2026-11-20 by [`care_note/batch-3`](../care_note/batch-3/README.md), which covers ADR-0085's contract (five care types, up to 12 drafts, questions, and planned task suggestions). This corpus stays as ADR-0068's record and was never run.

`cases.json` freezes 16 bilingual notes and review criteria for ADR-0068. It is
**unrun**: these are expected outcomes, not provider results or measured scores.
Omitted expected fields are still reviewed against the original note; they are
not permission to invent values. Use its frozen today and garden directory, not
a user's workspace. Tests in `tests/test_care_note_batch.py` exercise scripted
outputs and deterministic controls; they do not measure real extraction quality.

The corpus covers single actions, same-garden and cross-garden events, selected
versus all gardens, repeated area/plant names, a unique target without a garden,
missing targets/dates, mixed completed/planned/negated actions, two dates, a
shared fertilizer total, decimal quantities, and prompt injection.

Before claiming provider compatibility or quality, run each note once against
the configured local model (or an explicitly authorized paid evaluation). Keep
the exact model/version, request schema/prompt, raw response, deterministic draft
response and latency. Record failures and truncation; do not silently retry.
Record per-case and aggregate:

- Expected and actual completed-draft count.
- Correct target/owner or correctly empty ambiguous target.
- False completed events, especially planned and negated actions.
- Incorrect expansion to a whole garden or all gardens.
- Date errors and unsupported/invented quantities.
- Provider/schema failures and missing events.

Review every extra or missing row. A source quote does not prove classification
or target attribution. Keep new scores separate from ADR-0058/0060's historical
single-event evaluations. This corpus opens no public capability or budget and
contains no script that sends a paid request.
