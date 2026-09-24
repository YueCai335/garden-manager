# Backend Foundation

The FastAPI service stores a complete Garden Operations workspace in PostgreSQL.
Its OpenAPI documentation is available at `http://localhost:8000/docs` while
the service is running.

## Run Locally

Start PostgreSQL, apply the Alembic migration, and run the API:

```bash
docker compose up --build
```

Verify the service:

```bash
curl http://localhost:8000/health
```

The local database is bound to `127.0.0.1:5433`. The Compose environment uses
local-only trust authentication and has no production credentials.

To run the API and tests outside Docker Compose, create a virtual environment
in `backend/`, install the development dependencies, and point `DATABASE_URL`
at a PostgreSQL database:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
alembic upgrade head
pytest
```

## REST Contract

`PUT /workspaces/{workspaceId}/import` accepts a complete version-10 browser
workspace plus the stable `workspaceId` field. The path value and field must
match. The request persists gardens, growing areas, layouts, plantings, care
history, and open care tasks in one transaction.

Sending the identical import again returns the already stored workspace. A
different payload for the same workspace returns `409`, preserving the
explicit-import boundary before the later server-backed frontend workflow.

`GET /workspaces/{workspaceId}` returns the imported garden data.

`PUT /workspaces/{workspaceId}` validates and saves a complete workspace after
an import. It replaces the workspace's relational garden records in one
transaction, keeping the database as the single write source.

`POST /workspaces/{workspaceId}/gardens/{gardenId}/rotation-guidance` evaluates
a planting's crop family and planting date against the same growing area's
three preceding calendar years. It returns history, any raised-bed or
in-ground repeat warning, and family-level rotation candidates. The endpoint
does not change stored planting records.

`POST /workspaces/{workspaceId}/gardens/{gardenId}/ai/care-note-draft` sends
one Chinese or English care note to the configured AI provider and returns a
validated draft for user review. The default provider is local Ollama with
`qwen3:4b`. Install Ollama on the Mac host, run `ollama pull qwen3:4b`, then
rebuild the API container. Set `AI_PROVIDER=openai` plus `OPENAI_API_KEY` to
use OpenAI later. The endpoint returns a draft; the frontend saves a reviewed
draft with the existing workspace update endpoint.

`POST /workspaces/{workspaceId}/gardens/{gardenId}/ai/season-allocation`
runs the next-season Allocation Assistant (ADR-0056). The body contains
`crops` (keys from `tomato`, `bean`, `lettuce`, `cucumber`, `carrot`), an
optional `preference` of up to 200 characters, and optional `growingAreaIds`
(up to three). The agent calls two read-only tools, and the server re-checks
its final allocation with the crop-rotation rule. The response `status` is
`draft`, `needs_input`, `budget_exhausted`, `provider_unavailable`, or
`generation_failed`, together with the scope, rotation summary, warnings, and
a tool-call trace. The endpoint never writes garden data. It always uses
OpenAI: set `OPENAI_API_KEY`, and optionally `AGENT_OPENAI_MODEL` (default
`gpt-4o-mini-2024-07-18`). Without a key it returns `provider_unavailable`.
In `PORTFOLIO_DEMO_MODE` it plans only the fixed demo garden, allows one run
at a time, and counts each run against `AGENT_PUBLIC_RUN_LIMIT` (default 0,
which keeps public runs closed).

`POST /workspaces/{workspaceId}/gardens/{gardenId}/plant-health/photos`
stores one JPEG, PNG, or WebP photo in the local Docker photo volume and
returns its upload path. The request accepts files up to 10 MB.

`POST /workspaces/{workspaceId}/gardens/{gardenId}/ai/plant-health-assessment`
uses the configured provider to create a cautious structured assessment from
the written symptoms, concern level, photo count, and garden context. The
local `qwen3:4b` model currently uses the written observation only. The
frontend presents the assessment for editing before it is saved in the
garden's health history.

`POST /workspaces/{workspaceId}/plant-knowledge/answer` accepts a Chinese or
English plant-care question plus an optional garden context. It retrieves
curated knowledge cards from PostgreSQL with pgvector, asks the local model to
answer from that evidence, and returns the answer with visible source
citations. Before using this endpoint on the Mac host, install the free local
embedding model:

```bash
ollama pull embeddinggemma
```

The seed cards are short project-authored summaries linked to the original
University of Minnesota Extension and Canadian Food Inspection Agency pages.
They are defined in `app/knowledge.py` and stored with their publisher, URL,
and review date. The first corpus is intentionally small and covers common
care, prevention, and observation questions. It asks follow-up questions when
retrieval is weak and leaves diagnoses, chemical treatment, and local
regulatory guidance to appropriate expert resources.

The request body preserves the existing browser naming convention. A compact
example is:

```json
{
  "workspaceId": "local-workspace-1",
  "version": 10,
  "selectedGardenId": "garden-1",
  "gardens": [
    {
      "id": "garden-1",
      "name": "Home garden",
      "plan": { "widthMeters": 8, "depthMeters": 5 },
      "growingAreas": [],
      "plantings": [],
      "careEvents": [],
      "careTasks": [],
      "healthRecords": []
    }
  ]
}
```

The backend does not read or modify browser storage. Frontend integration owns
the future user-triggered import action and subsequent switch to server data.
