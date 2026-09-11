# Technical Architecture

## Implemented System

### Frontend

- Next.js, React, and TypeScript.
- Garden Hub with multiple-garden thumbnails and global feature entry points.
- React-Konva layouts for measured growing areas, plant footprints, grid
  snapping, direct placement, and zoomed plan previews.
- Forms for current plantings, care history, care tasks, plant health, future
  season plans, and AI review.
- Vitest and React Testing Library coverage for core user workflows, plus one
  Playwright end-to-end flow against the real API and a fresh database.

### Backend

- FastAPI and Pydantic for validated workspace and AI endpoints.
- SQLAlchemy models and Alembic migrations for PostgreSQL persistence.
- A complete-workspace import endpoint followed by server-backed workspace
  updates guarded by an optimistic-locking revision (stale saves return 409).
- Deterministic crop-rotation guidance by growing area and recent calendar
  years.

### Data and AI

- PostgreSQL stores gardens, growing areas, layouts, current plantings,
  season plans, care history, tasks, plant-health records, and source cards.
- pgvector stores embeddings for Plant Knowledge retrieval.
- Local Ollama models provide care-note extraction and answer generation.
- Curated source cards retain publisher, URL, review date, and excerpt so the
  interface can show citations with each answer.

### Delivery

- Docker Compose starts PostgreSQL with pgvector and the FastAPI API.
- GitHub Actions runs frontend lint, types, tests, and build; backend tests
  on SQLite and PostgreSQL; one Playwright end-to-end flow; and API health
  through Docker Compose.

## Data Flow

1. A gardener creates or loads a local workspace.
2. Garden Hub manages multiple gardens and opens their detailed layouts.
3. Layout allocations link to current Planting Records, which provide the
   factual planting history for care and rotation.
4. The first change syncs the workspace to PostgreSQL automatically. Later
   frontend edits update the same server workspace, each carrying the revision
   the tab last read.
5. The Next season planner reads growing-area history and saves tentative
   choices to a separate Season Plan.
6. AI services return structured drafts or source-grounded answers. The user
   reviews results before saving garden records.

## Module Boundaries

`garden-operations` owns gardens, growing-area geometry, current plantings,
care events, tasks, health records, and plan placement.

`garden-planning` owns rotation summaries, next-season plans, and companion
planting notes.

`plant-knowledge` owns curated source cards, embeddings, retrieval metadata,
and displayed citations.

`ai-assistant` owns structured extraction and reviewable plant-health drafts.

## Current Boundaries

- The app runs as a local, single-user workspace. Authentication and public
  multi-user access are out of scope for the present implementation.
- The source-card corpus is intentionally small and reviewed. Broad web
  ingestion, treatment recommendations, and local regulatory guidance need a
  separate content-governance design.
- Map-backed onboarding and yard-wide sun analysis remain deferred research.
  The product currently prioritizes reliable garden operations and seasonal
  planning.

## Deployment Direction

The local Docker Compose setup is the reproducible development environment.
The portfolio demo uses Vercel for the frontend, Render for FastAPI, and
Supabase for PostgreSQL and pgvector. It presents generic garden data and
keeps local AI and photo workflows outside the public environment. The
deployment sequence is documented in
[Portfolio Demo Deployment](portfolio-demo-deployment.md).

A public multi-user release will add authentication, user authorization,
durable object storage, backups, rate limits, AI-provider budgets, and
operational monitoring.

## Decision Records

Product and architecture decisions are documented in
[Architecture Decision Records](decisions/README.md). The active product
direction is described in [Project Strategy](project-strategy.md).
