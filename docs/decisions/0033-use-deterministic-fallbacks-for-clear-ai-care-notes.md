# ADR-0033: Use Deterministic Fallbacks for Clear AI Care Notes

- Status: Accepted; fallback scope amended by
  [ADR-0058](0058-classify-care-notes-before-filling-a-draft.md)
- Date: 2026-09-01

## Context

AI Garden Note uses a local model to extract a reviewable watering or
fertilizing draft from Chinese or English free text. Compact local models can
return empty structured fields for simple, clearly stated notes. A gardener
should receive a useful draft for direct expressions such as a completed
watering action today.

## Decision

Keep the local model as the primary extractor and complete only missing,
unambiguous fields with deterministic multilingual checks.

- The model remains responsible for flexible language understanding and
  fertilizer details.
- The fallback recognizes clear watering and fertilizing terms in Chinese and
  English.
- The fallback resolves `today` and `今天` to the service date.
- The fallback recognizes whole-garden language and exact known planting-area
  or plant-group names.
- The review screen identifies the result as an AI extracted draft and remains
  required before Care History changes.

## Why This Option

- It produces a useful draft for routine notes even when a compact local model
  leaves every field empty.
- It keeps deterministic work small, explicit, and easy to test.
- It preserves a real local AI integration for language that does not match
  the clear patterns.

## Alternatives Considered

### Depend Only on the Local Model

Model-only extraction has inconsistent results for simple bilingual notes on
the selected compact model.

### Use Rules for Every Care Note

An all-rules solution would grow quickly as gardeners use varied language and
fertilizer descriptions. The model remains useful for flexible extraction.

### Require a Larger Local Model

A larger model may improve extraction quality while increasing download size,
memory use, and response time. The current project needs a fast local
baseline.

## Consequences

- Clear notes receive filled fields with predictable behavior.
- Ambiguous targets and unstated information remain available for user review.
- The fallback vocabulary will grow only from observed, tested inputs.
- Quality evaluation can later compare local model output and final reviewed
  records.

## Revisit When

Revisit after collecting a representative bilingual evaluation set, changing
the default local model, or adding multi-event care-note extraction.
