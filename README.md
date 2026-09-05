# Sun-Aware Garden Planner

A full-stack garden operations and seasonal-planning application. It helps a
gardener organize multiple locations, visualize planting areas, record care,
plan the next season, and ask source-grounded plant questions.

**[▶ Open the live demo](https://sun-aware-garden-planner.vercel.app)** — no install, no account. Select **Demo garden** to explore a populated workspace.

`Next.js` `React` `TypeScript` `FastAPI` `Pydantic` `PostgreSQL` `SQLAlchemy` `Alembic` `pgvector` `Docker Compose` `GitHub Actions` `pytest` `Vitest`

## Screenshots

**Garden plan** — planting areas laid out on a real metric grid, with plants placed inside each area.

<img width="1000" alt="Garden plan showing measured planting areas on a metric grid" src="https://github.com/user-attachments/assets/e902503c-e6c7-4218-b96d-4651c404f2b9" />

**Next season planner** — deterministic crop-family rotation guidance derived from what each area grew last season.

<img width="1000" alt="Next season planner showing crop rotation guidance per growing area" src="https://github.com/user-attachments/assets/df76674e-1efc-4e06-aea5-19f5f995bd60" />

**Plant knowledge** — bilingual retrieval over curated source cards, with the supporting source shown next to every answer.

<img width="1000" alt="Plant knowledge answer with its cited source" src="https://github.com/user-attachments/assets/ee3b6e50-6af9-4750-9709-4be1d42dfa94" />

## What It Demonstrates

- **Garden operations:** multiple gardens, raised beds, in-ground areas, and
  container groups with measured planting layouts.
- **Current records:** plants, care history, recurring care tasks, and
  reviewable plant-health records.
- **Seasonal planning:** crop-family rotation guidance by growing area and a
  separate next-season plan with companion-planting notes.
- **Applied AI:** Chinese and English care-note extraction, local RAG-backed
  Plant Knowledge answers, visible citations, and user review before records
  are saved.
- **Full-stack delivery:** Next.js, FastAPI, PostgreSQL, Alembic, pgvector,
  Docker Compose, GitHub Actions, Vitest, and pytest.

## Five-Minute Demo

### Hosted demo (fastest)

Open the [live demo](https://sun-aware-garden-planner.vercel.app), select **Demo garden**,
then walk through steps 4-6 below. The API sleeps on the free tier, so the first request can
take about a minute.

### Local (full feature set, including AI)

1. Start the API and database with `docker compose up --build`.
2. In another terminal, start the web app with `npm run dev`.
3. Open `http://localhost:3000` and select **Load demo garden**.
4. Double-click **Demo Garden** to inspect its measured growing areas and
   plant layout.
5. Return to the dashboard and open **Plan next season**. Review crop-family
   guidance, then add a crop to a growing area's next-season plan.
6. Open **Care** to create a task or record a completed care event.
7. Open **Plant knowledge** to ask a Chinese or English question and inspect
   the cited source cards.

The demo uses generic data and can be loaded repeatedly. It replaces the
gardens saved in the current browser workspace.

## Architecture

```text
Next.js + React + TypeScript
        |
        | typed workspace requests
        v
FastAPI + Pydantic
        |
        v
PostgreSQL + SQLAlchemy + Alembic + pgvector
        |
        +-- deterministic crop-rotation service
        +-- local AI extraction and plant-knowledge retrieval
```

The frontend renders measured growing-area layouts with React-Konva. Garden
data is first created in the browser, then explicitly imported into PostgreSQL.
After import, PostgreSQL is the workspace's write source. The full data model
and trade-offs are documented in [Technical Architecture](docs/technical-architecture.md)
and the [Architecture Decision Records](docs/decisions/README.md).

## Local Setup

### Requirements

- Node.js 20 or later
- Docker Desktop
- Optional for local AI: [Ollama](https://ollama.com/)

### Start the application

```bash
docker compose up --build
```

In a separate terminal:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The API documentation is available at
`http://localhost:8000/docs`.

### Enable local AI features

The local provider uses Ollama. Download the two models once:

```bash
ollama pull qwen3:4b
ollama pull embeddinggemma
```

Restart Docker Compose after downloading the models. Care-note extraction and
Plant Knowledge remain available as ordinary forms when the AI provider cannot
respond; users can continue recording information manually.

## Verification

Frontend:

```bash
npm run typecheck
npm test
npm run build
```

Backend:

```bash
cd backend
pytest
```

GitHub Actions runs frontend checks, backend tests, and a Docker health check
on pull requests and pushes to `main`.

## Product Boundaries

- The current workspace is a local, single-user application. Authentication,
  authorization, and hosted storage remain a later release concern.
- The portfolio demo deploys Garden, Care, and Season Planner workflows on
  Vercel, Render, and Supabase. It uses generic data and keeps AI and photo
  features in the local app.
- Plant Knowledge uses a small curated source set with visible citations. It
  provides educational guidance and requests more detail when evidence is weak.
- Map-backed yard initialization and yard-wide sun analysis remain deferred
  research work. The operational garden workflow is the active product.

## Additional Documentation

- [Product Brief](docs/product-brief.md)
- [Technical Architecture](docs/technical-architecture.md)
- [Project Strategy](docs/project-strategy.md)
- [AI and RAG Design](docs/ai-rag-agent-design.md)
- [Portfolio Demo Deployment](docs/portfolio-demo-deployment.md)
- [Resume Positioning](docs/resume-positioning.md)
- [Architecture Decision Records](docs/decisions/README.md)
