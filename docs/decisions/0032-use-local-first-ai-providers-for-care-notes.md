# ADR-0032: Use Local-First AI Providers for Care Notes

- Status: Accepted; provider configuration amended by
  [ADR-0058](0058-classify-care-notes-before-filling-a-draft.md)
- Date: 2026-09-01
- Supersedes: [ADR-0031](0031-use-review-first-ai-care-note-extraction.md)

## Context

The AI Garden Note workflow turns Chinese or English free-text notes into a
reviewable watering or fertilizing draft. The first implementation selected an
OpenAI API call. Local development should provide a zero-cost path while the
product remains a private, Mac-local portfolio project.

The feature also needs a future cloud path for public use. A provider boundary
keeps the garden workflow, validation, and persistence independent from the
model host.

## Decision

Use Ollama as the default local provider and keep OpenAI as a configurable
future provider.

- FastAPI selects a provider through `AI_PROVIDER`.
- The default `ollama` provider calls the Mac-hosted Ollama API from Docker
  through `host.docker.internal`.
- The default local model is `qwen3:4b` for compact bilingual extraction.
- Ollama receives a JSON Schema and returns a non-streaming structured draft.
- `openai` remains available through `OPENAI_API_KEY` and `OPENAI_MODEL` for a
  future cloud deployment.
- Both providers produce the same Pydantic-validated extraction model.
- The existing review screen remains the only path to create Care History.

## Why This Option

- Local development has no per-request API cost.
- Garden notes can remain on the developer's machine during the portfolio
  phase.
- The provider contract makes OpenAI, a self-hosted service, or another cloud
  provider a configuration and adapter change.
- Shared validation, target resolution, review, and persistence avoid provider
  specific product behavior.

## Alternatives Considered

### OpenAI as the Default Provider

OpenAI offers a managed cloud path, but it requires separate billing for every
developer environment.

### One Fixed Local Model

A fixed model would complicate later deployment and hide the provider boundary
that a production system needs.

### Simulated AI Extraction

Static parsing fixtures support tests, while a local model supplies a real
runtime AI workflow for demonstrations.

## Consequences

- Developers install Ollama and download one local model before using AI
  Garden Note.
- The first local request can take longer while the model loads into memory.
- Local model quality can vary by hardware and model version, so the review
  screen remains mandatory.
- A public deployment will need cloud inference, authentication, usage limits,
  and cost controls.

## Revisit When

Revisit when the project deploys beyond a local Mac, introduces authenticated
users, adds source-grounded care questions, or collects quality measurements
that support a different default model.
