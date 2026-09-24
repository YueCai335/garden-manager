# Portfolio Demo Deployment

This guide publishes the current Garden Operations workflow as a personal
portfolio demo. It uses generic data and keeps AI and photo uploads in the
local application.

## Before You Start

- The GitHub repository must contain the approved deployment configuration.
- Create free accounts for [Supabase](https://supabase.com/),
  [Render](https://render.com/), and [Vercel](https://vercel.com/).
- Keep database passwords in provider dashboards. Do not place them in Git,
  screenshots, or chat messages.

## 1. Create the Supabase Database

1. Create a new free Supabase project in a nearby region.
2. In **Database > Extensions**, enable `vector`.
3. Open **Connect** and copy the **Session pooler** connection string.
4. Add `?sslmode=require` when it is absent from the copied string.

Use the session pooler because the Render API is a persistent service running
from an IPv4 environment. The application accepts Supabase connection strings
that begin with either `postgresql://` or `postgres://`.

## 2. Create the Render API

1. In Render, choose **New > Blueprint** and select this GitHub repository.
2. Render reads `render.yaml` and proposes the FastAPI web service.
3. Enter the Supabase connection string as `DATABASE_URL`.
4. Set `FRONTEND_ORIGINS` after the Vercel project has its `vercel.app` URL.
5. Leave `OPENAI_API_KEY` empty and `AGENT_PUBLIC_RUN_LIMIT` at `0`. Live
   Allocation Assistant runs stay closed in the public demo (ADR-0057).
6. Create the service and open `https://your-render-service.onrender.com/health`.

The API runs Alembic migrations during startup. A successful health response
contains `{ "status": "ok" }`.

## 3. Create the Vercel Frontend

1. In Vercel, import the same GitHub repository.
2. Keep the detected Next.js preset and root directory.
3. Add `NEXT_PUBLIC_API_BASE_URL` with the Render API URL, such as
   `https://your-render-service.onrender.com`.
4. Deploy and copy the resulting `https://your-project.vercel.app` URL.
5. Return to Render, set `FRONTEND_ORIGINS` to that exact Vercel URL, and
   redeploy the API.

## 4. Verify the Public Demo

1. Open the Vercel URL in a private browser window.
2. Select **Load demo garden**.
3. Add a care event and a next-season plan item.
4. Refresh the page and confirm the browser keeps the demonstration workspace.
5. Open the three local AI feature previews and inspect their sample review states.

The first API request after Render idles can take about a minute. Wait for the
page request to finish, then refresh once when necessary.

## Demo Boundaries

- AI Garden Note, Plant Health assessment, Plant Knowledge, and photo uploads
  show a clear local feature preview in the public demo. The working AI and
  photo workflows run in the local app.
- The Allocation Assistant does not run live in the public demo
  (ADR-0057). The API answers `provider_unavailable`, and the panel offers a
  labelled recording of one real evaluation run. The public-run machinery from
  ADR-0056 stays in place with the limit at `0`: the fixed demo garden, one
  run at a time, a cumulative limit that never resets, and one API worker.

## Allocation Assistant Status

The cost verification from ADR-0056 has passed, but ADR-0057 keeps live public
runs closed because the evaluation found misleading explanations. The results
are in [docs/agent.md](agent.md). Reopening requires:

1. A new decision record that replaces ADR-0057, based on a new measurement
   of explanation accuracy.
2. A new paid budget. The current evaluation ledger is used up.
3. Then, and only then, `OPENAI_API_KEY` and a non-zero
   `AGENT_PUBLIC_RUN_LIMIT` in Render.

Every public run would increment one database row, `agent_run_budgets`. Check
it with `SELECT used_runs FROM agent_run_budgets;` in Supabase.

## Local AI Demonstration

Use the local Docker Compose setup when demonstrating AI or photo workflows.
It runs Ollama on the Mac and keeps photo evidence in the local Docker volume.
