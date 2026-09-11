# Project Strategy

## Purpose

Garden Manager is the primary portfolio project for a junior
backend/full-stack developer path, with applied AI as the differentiator.

The product helps gardeners maintain a reliable record of their gardens and
make season-by-season planning decisions. It should provide practical value,
demonstrate full-stack engineering, and remain explainable in interviews.

## Career Positioning

Canonical employment positioning:

> Production-grade full-stack and applied AI platform, with TypeScript/React,
> Python/FastAPI, PostgreSQL, and AWS as the core stack.

The project provides credible evidence for junior full-stack, backend, cloud
application, and applied-AI roles. Technology coverage comes from working
features, tests, deployment, and documented tradeoffs.

Target roles:

- Junior Backend Developer.
- Junior Full-stack Developer.
- Python Developer.
- Applied AI Application Developer.
- Software Developer Intern or New Grad Software Developer.

The project story is:

> I built an AI-assisted garden operations platform with a Next.js interface,
> FastAPI services, PostgreSQL persistence, deterministic crop-rotation rules,
> and reviewable AI workflows for structured garden records and planning.

## Product Direction

### 1. Garden Operations Memory

Help users maintain a durable record across a growing season.

Core capabilities:

- Create, switch, rename, and manage separate gardens, such as a home garden
  and a community plot. Each garden contains named planting areas, such as an
  in-ground zone, raised bed, container group, or greenhouse shelf.
- Record seed starting, planting, transplanting, watering, fertilizing,
  pruning, harvests, pests, and diseases.
- Store fertilizer type, amount, application area, and photos where useful.
- Track current plants and year-by-year crop history by growing area, with
  separate next-season plans for upcoming choices.
- Maintain planned care tasks and completed care history.
- Show an at-a-glance garden plan with growing areas arranged at relative
  metric scale.
- Visualize measured growing-area layouts and planned plant spacing.

### 2. Garden Planning and Applied AI

Help users turn reliable garden data into explainable planning support.

Core capabilities:

- Apply deterministic crop-family and rotation constraints to historic plant
  records.
- Generate task suggestions from known dates, user preferences, and garden
  state.
- Convert free-text notes into a structured draft for user review.
- Answer plant and care questions with retrieved sources, citations, and clear
  uncertainty handling.
- Explain recommendations using stored garden facts and explicit constraints.

### 3. Local Garden Community

Support neighborhood-level exchange and local discovery after the operations
foundation is stable.

Possible future capabilities:

- Listings for seedlings, seeds, cuttings, tools, and compost.
- Group-buy interest tracking for fertilizer and soil amendments.
- Local nursery, garden-supply, and flower-shop discount discovery.
- Search and filters by region, category, availability, and pickup distance.
- Listing moderation, reports, and safety controls.

### 4. Deferred Sun Intelligence Research

The project retains a future sun-analysis direction. Yard-wide heatmaps require
licensed map or image inputs, confirmed geometry, obstacle heights,
deterministic simulation, and tested accuracy boundaries. The current roadmap
defers this work until the garden operations platform is stable.

React-Konva supports metric planting layouts in the Garden Operations workflow
and remains available for later map-backed garden layout and sun-analysis
exploration. Address-first parcel candidates, point sky capture, image
understanding, and heatmap rendering belong to this future module.

## Target Technology Stack and Project Use

Status as of commit review 2026-09-11: **In use** is present in the repository and exercised by the app, tests, or CI; **Partial** has some of the listed pieces in use and the rest planned; **Planned** is a target that no code depends on yet; **Retired** was prototyped and removed from active source (kept in Git history).

| Layer | Selected technology | Status | Actual project use |
| --- | --- | --- | --- |
| Web frontend | Next.js, React, TypeScript | In use | Garden dashboard, journals, planning workflows, AI review screens, and accessible responsive UI |
| UI system | Tailwind CSS, shadcn/ui | Planned | Reusable forms, dialogs, navigation, tables, and consistent visual states |
| Spatial layout editor | React-Konva | In use | Metric growing-area layouts, grid snapping, and plant-allocation placement circles |
| Application backend | Python, FastAPI, Pydantic | In use | REST APIs, validation, garden operations, planning orchestration, and AI integration |
| API contract | REST, OpenAPI | In use | Typed frontend-backend communication, generated documentation, and integration testing |
| Primary database | PostgreSQL, SQLAlchemy, Alembic | In use | Workspaces (with an optimistic-locking revision), gardens, growing areas, plants, events, tasks, crop history, and schema migrations |
| Geospatial data | PostGIS | Planned | Garden locations and future regional community search; deferred map and yard geometry support |
| Maps and place search | Mapbox GL JS, Mapbox Search JS | Retired | Address-map prototype removed 2026-09-11 (ADR-0013 deprioritized it); reintroduce only with a map-backed layout requirement |
| Vector search | pgvector | In use | Retrieval over plant, climate, and horticultural knowledge for grounded AI responses |
| Cache and background work | Redis, added when a measured workflow requires it | Planned | Cached retrieval, scheduled task generation, and long-running AI job status |
| AI application layer | Ollama, OpenAI API, RAG, structured outputs, tool calling | Partial | In use: Ollama as the default provider and OpenAI as a configurable alternative (`AI_PROVIDER`), pgvector retrieval for grounded plant questions, JSON-schema structured outputs for care-note and plant-health drafts. Planned: tool calling |
| AI quality | Evaluation datasets, citations, fallbacks, guardrails | Partial | In use: source citations, deterministic fallbacks for clear care notes, schema validation of model output, and a 3-case retrieval evaluation fixture (`backend/tests/fixtures/plant_knowledge_evaluations.json`, expected source per question). Planned: model-output quality datasets and guardrails beyond schema validation |
| Image storage | Amazon S3 | Planned | Garden photos and future authorized map or calibration assets |
| Cloud backend | AWS ECS Fargate, RDS, CloudWatch | Planned | Container hosting, managed PostgreSQL, logs, metrics, and production operations |
| Web deployment | Vercel | In use | Next.js preview deployments and the public web application |
| Local environment | Docker, Docker Compose | In use | Reproducible frontend, backend, PostgreSQL, and optional Redis environments |
| CI/CD | GitHub Actions | Partial | In use: lint, type checks, frontend tests, build, backend tests on SQLite and PostgreSQL, container health check. Planned: security scanning and deployment gates (Vercel and Render currently deploy on every push to `main`) |
| Infrastructure | Terraform | Planned | Version-controlled AWS resources once cloud deployment begins |
| Frontend tests | Vitest, React Testing Library, Playwright | Partial | Vitest and React Testing Library are in use; Playwright end-to-end journeys are planned |
| Backend tests | pytest | In use | Domain rules, APIs, persistence, crop rotation, and AI integration boundaries |
| Observability | Structured logging, OpenTelemetry, CloudWatch | Planned | Error diagnosis, request tracing, performance evidence, and production monitoring |
| Security | OAuth, authorization, rate limiting, secret management | Planned | Account access, private garden data, public-community controls, and protected external APIs |

### Adoption Rules

- Add a technology when the current phase contains a working feature that uses
  it.
- Require code, tests, and operational evidence before listing a technology as
  implemented.
- Introduce PostgreSQL with the first persisted garden workflow.
- Introduce PostGIS with location-aware persistence or regional search.
- pgvector powers the curated Plant Knowledge retrieval path; extend the fixed evaluation dataset as the source corpus grows.
- Keep Redis conditional until caching, scheduled processing, or background
  task measurements justify it.
- Introduce Terraform with AWS deployment so the infrastructure it manages is
  real and reviewable.
- Keep Kubernetes, Kafka, and independently deployed microservices outside the
  roadmap until scale or reliability evidence creates a concrete requirement.
- Keep crop-rotation constraints and other explicit garden rules deterministic.
- Defer yard-wide sun physics until its data sources and accuracy boundary have
  a dedicated, tested implementation plan.

This stack baseline is recorded in
[ADR-0006](decisions/0006-adopt-employment-oriented-production-stack.md).

## Architecture Principle

Use a modular monolith first. Internal modules will include:

- `garden-operations`
- `garden-planning`
- `crop-rotation`
- `plant-knowledge`
- `ai-assistant`
- `local-community`
- `sun-analysis` as a deferred module

## AI Principle

AI augments user workflows that benefit from language understanding,
retrieval, and explanation. Users review AI-created structured records before
persistence.

Use deterministic code for:

- Crop-family classification and rotation rules.
- Date and interval calculations for scheduled tasks.
- Explicit plant filtering constraints.
- Authorization, validation, and persistence rules.

Use AI for:

- Extracting structured fields from a garden note.
- Explaining source-grounded recommendations.
- Suggesting care tasks from known garden state.
- Answering horticultural questions with retrieved evidence.
- Summarizing history for seasonal planning.

## Execution and Acceptance Standard

Every feature task must define user value, scope, exclusions, acceptance
criteria, and verification before implementation begins. A feature is complete
when the agreed workflow works end to end, relevant tests pass, applicable
build and type checks pass, and the handoff explains limitations.

An implementation claim requires working code and evidence. Planned
technologies and future capabilities remain documented as planned until that
evidence exists.

## Roadmap

### Phase 1: Garden Operations MVP

Goal: a recruiter can open the app and complete a credible seasonal record
workflow.

Required:

- Create and switch between gardens, then manage named planting areas within
  each garden.
- Open a multi-garden dashboard, browse garden-plan thumbnails, select a
  garden, create a garden through a guided setup flow, and enter detailed
  garden editing directly from its card.
- Use a dedicated management workspace to change garden dimensions, garden
  names, planting-area names, planting-area types, and layouts.
- Define measured growing-area layouts and place planned plant allocations on a
  metric grid.
- Add current plants with plant name, crop family, and planting date.
- Record garden-wide, planting-area, or plant-group watering and fertilizing
  events with dates, notes, and fertilizer details when applicable.
- Create, complete, and view upcoming care tasks.
- Preserve browser state through refreshes.
- Include an understandable empty state and one built-in demo garden.
- Test the core operations and task interactions.

#### Phase 1 Acceptance Scenario

1. Open the built-in garden or create a garden, browse its garden-plan
   thumbnail, select it from the dashboard, and open one planting area from
   Garden Management.
2. Set that growing area's dimensions, place a labelled allocation circle, and
   observe its snapped metric position.
3. Add a plant and record a fertilizing event for the whole garden, one
   planting area, or one plant group with optional details and a date.
4. Create a future care task and mark a completed task as done.
5. Refresh the browser and recover the saved garden state and layout.
6. Clear a demo or create a new garden and receive an understandable empty
   state.

### Phase 2: Backend and Persistence

Goal: prove backend, database, API, and testing ability.

Required:

- FastAPI backend and OpenAPI contract.
- PostgreSQL with migrations for users, gardens, areas, plants, events, and
  tasks.
- Validated APIs with clear error responses.
- Backend tests, Docker Compose, and GitHub Actions.

### Phase 3: Crop Rotation and Garden Planning

Goal: provide deterministic, explainable multi-season planning value.

Required:

- Crop-family history by growing area and season.
- Rotation warnings and suggested alternatives.
- Planting-plan draft with explicit constraints and user edits.
- Tests for rotation rules and date-based planning logic.

### Phase 4: Applied AI Assistant

Goal: add AI workflows with reviewable and measurable quality.

Required:

- Structured extraction from a free-text garden note into a reviewable draft.
- RAG-grounded plant and care answers with source citations.
- Evaluation dataset with fixed extraction and recommendation cases.
- Fallback behavior, user review, structured logs, and error states.

### Phase 5: Local Garden Community

Goal: extend a trusted garden account into regional discovery and exchange.

Possible scope:

- Seedling, seed, cutting, supply, and local-deal listings.
- Region-based search and availability tracking.
- Listing creation, moderation, reporting, and safety controls.

### Phase 6: Deferred Sun Intelligence Research

Goal: evaluate a bounded sun-analysis workflow after core operations are
stable.

Candidate scope:

- Confirmed yard geometry and obstacle inputs.
- Licensed map or authorized image inputs.
- Deterministic solar and shadow model with explicit accuracy boundaries.
- Point-level observation and calibration before a yard-wide heatmap claim.

### Phase 7: Public App Readiness

Goal: prepare for real users.

Required before public use:

- Authentication and authorization.
- Privacy policy and basic safety rules.
- Image storage and deletion controls.
- Rate limiting, monitoring, logs, and backups.
- Production deployment documentation.

## What Counts as Portfolio Ready

The project is resume-ready when:

- A user can complete a real workflow.
- Input changes produce meaningful output changes.
- Core logic has tests.
- The app has a deployed demo.
- README explains setup, architecture, and limitations.
- The user can explain the data flow and debug a common failure.

Until then, resume bullets should describe only completed functionality.

## Current Priority

Complete the first end-to-end next-season planning workflow, then prepare a
portfolio-ready release:

1. Show planting-area rotation summaries and support adopted next-season plant
   records with evidence-labeled pairing notes.
2. Expand Plant Knowledge only through reviewed source cards and evaluation
   cases.
3. Add a focused end-to-end test for the core planning workflow.
4. Prepare a demo dataset, architecture explanation, screenshots, and a
   deployment decision for job applications.

The current priority is recorded in
[ADR-0013](decisions/0013-prioritize-garden-operations-and-ai-planning.md),
[ADR-0025](decisions/0025-use-three-season-crop-rotation-warnings.md),
[ADR-0026](decisions/0026-use-a-next-season-planning-workspace.md), and
[ADR-0037](decisions/0037-use-area-summary-and-pairing-notes-for-season-planning.md).
