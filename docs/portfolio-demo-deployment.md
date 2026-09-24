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
5. Leave `OPENAI_API_KEY` empty and `AGENT_PUBLIC_RUN_LIMIT` at `0` until the
   Allocation Assistant cost verification passes (see below).
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
- The Allocation Assistant is the one AI workflow that can run publicly
  (ADR-0056). It plans the fixed demo garden only, runs one request at a time,
  and stops at the cumulative `AGENT_PUBLIC_RUN_LIMIT`. The limit does not
  reset. The start command keeps one API worker so the one-at-a-time lock
  holds.

## Opening the Allocation Assistant

Keep `AGENT_PUBLIC_RUN_LIMIT` at `0` until all of these are done:

1. In OpenAI, create a dedicated project and key, prepay US$5, and turn
   auto-recharge off.
2. Run the verification from ADR-0056 locally: the longest allowed input and
   five tool-calling rounds. Compare each logged `input_tokens` with its
   request `bytes` plus the 1,000-token allowance.
3. If the allowance holds, set `OPENAI_API_KEY` and `AGENT_PUBLIC_RUN_LIMIT`
   (150 in ADR-0056) in Render and redeploy. If it does not, keep the limit at
   `0`, adjust the limits, and update ADR-0056 first.

Every public run increments one database row, `agent_run_budgets`. Check it
with `SELECT used_runs FROM agent_run_budgets;` in Supabase.
- The public demo has no account login. Use generic demonstration data only.
- Supabase and Render free tiers can pause inactive services. Reopen the
  health URL before sharing the demo link for an interview.

## Local AI Demonstration

Use the local Docker Compose setup when demonstrating AI or photo workflows.
It runs Ollama on the Mac and keeps photo evidence in the local Docker volume.
