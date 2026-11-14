# ADR-0040: Use Vercel, Render, and Supabase for the Portfolio Demo

- Status: Accepted; amended by [ADR-0060](0060-offer-assisted-care-note-drafting-in-the-portfolio-demo.md)
  (AI Garden Note drafts may run in the hosted demo behind its switch and quotas)
- Date: 2026-09-02
- Related: [ADR-0002](0002-use-fastapi-python-backend.md), [ADR-0024](0024-use-explicit-local-garden-import-for-postgresql.md), and [ADR-0036](0036-use-curated-local-rag-for-plant-knowledge.md)

## Context

The project has a working local Next.js frontend, FastAPI API, PostgreSQL
workspace, Docker Compose environment, and local Ollama-based AI workflows. A
portfolio release needs a public URL that a recruiter can open without running
Docker or downloading models.

The application currently has no authentication, hosted image storage, or
managed AI budget. A public deployment must avoid presenting shared records,
ephemeral uploads, or unavailable local models as durable end-user services.

## Decision

Deploy the portfolio demonstration with:

- Vercel for the Next.js frontend.
- Render Free Web Service for the FastAPI API.
- Supabase Free PostgreSQL with the `vector` extension for relational data and
  pgvector retrieval.

The Render API runs in `PORTFOLIO_DEMO_MODE`. Garden management, care, crop
rotation, and next-season planning remain available. AI endpoints and photo
uploads return an explicit local-app message. The public link is presented as
a portfolio demonstration with generic data.

## Why This Option

- The selected services match the existing Next.js, FastAPI, PostgreSQL, and
  pgvector boundaries without replacing the application backend.
- Vercel supports the current Next.js frontend and Git-based preview workflow.
- Render runs the existing Python API with a small deployment configuration.
- Supabase provides managed PostgreSQL, a free starter tier, and a future path
  to authentication and object storage.
- The deployment keeps the local Ollama workflow free during the portfolio
  phase and preserves visible operational boundaries.

## Alternatives Considered

### Vercel and Supabase Only

This common setup fits applications whose server logic runs in Next.js routes.
It would bypass the existing FastAPI API and reduce the value of the backend
architecture already implemented.

### Vercel, Render, and Neon

Neon supports PostgreSQL and pgvector. Supabase gives this project a clearer
future path to user authentication and persistent photo storage while retaining
the standard PostgreSQL connection used by FastAPI.

### Hosted AI and Persistent Image Storage Now

Hosted model usage, object storage, and public uploads introduce ongoing cost,
secret management, content controls, and authentication work. They are not
required for an interview-ready demonstration.

## Consequences

- The repository includes a Render Blueprint and documents the external
  environment variables.
- The public demo requires a Supabase connection string and explicit CORS
  origin before it accepts browser workspace requests.
- Render Free may sleep after idle time, and Supabase Free may pause after a
  long inactive period.
- AI and photo workflows remain fully demonstrable in the local environment.

## Revisit When

Revisit when the app supports authenticated users, object storage, a hosted AI
provider with an explicit budget, or a paid production deployment.
