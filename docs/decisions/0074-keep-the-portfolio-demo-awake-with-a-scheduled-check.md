# ADR-0074: Keep the Portfolio Demo Awake with a Scheduled Check

- Status: Accepted
- Date: 2026-11-15
- Related: [ADR-0040](0040-use-vercel-render-and-supabase-for-the-portfolio-demo.md)

## Context

The public demo from ADR-0040 runs on free tiers. Two of their idle rules made
the demo unreliable for a recruiter who opens the link without warning:

- Render's free web service sleeps after about 15 minutes without traffic. The
  next request waits about a minute while the service starts.
- Supabase pauses a free project after about 7 days without database activity.
  A paused database breaks the API: the start command runs Alembic migrations
  first, so a restart fails, and workspace requests fail too.

The owner received failure emails from both Render and Supabase. `/health`
never touched the database, so even traffic to it did not count as Supabase
activity.

## Decision

- Add `GET /health/db`. It runs `SELECT 1` through the normal database session
  and answers `{ "status": "ok" }`, or `503` when the database is unreachable.
  It reads nothing and writes nothing.
- Keep `/health` database-free. Render's health check uses it, and a database
  outage should not make Render restart the API in a loop.
- Add `.github/workflows/demo-keepalive.yml`. Every 10 minutes, and on manual
  `workflow_dispatch`, it calls `/health/db` with retries long enough to cover
  a cold start.
- The Render URL comes from the `DEMO_API_URL` repository variable. It is
  public information, not a secret, and no credential is needed.

## Why This Option

- One request both keeps Render awake and gives Supabase database activity.
- It costs nothing. GitHub-hosted runner minutes are free for public
  repositories. One always-on Render service uses about 730 of the 750 free
  instance hours per month.
- Failures surface where the owner already looks: a failed run sends a GitHub
  Actions email, and the run log shows the HTTP status.
- No provider setting changes, and the workflow holds no secrets.

## Alternatives Considered

### Daily database check only

Prevents the Supabase pause with about 30 runs a month, but Render still
sleeps, so most visitors wait a minute on their first request.

### External uptime monitor (for example UptimeRobot)

Works the same way, but adds an account outside the repository, and the
schedule is not reviewable in Git.

### Paid Render instance

Removes the sleep entirely, but adds a monthly cost for a portfolio demo.

## Consequences

- The free instance-hour budget assumes this is the only free Render service
  in the workspace. A second always-on free service would exceed 750 hours and
  Render would suspend services until the month resets.
- GitHub may delay or skip scheduled runs under load, so an occasional cold
  start can still happen.
- GitHub disables scheduled workflows in a public repository after 60 days
  without repository activity. The owner then re-enables the workflow in the
  Actions tab (GitHub sends an email before it does this).
- Each run adds one access-log line in Render.

## Reconsider When

- The demo moves to a paid Render plan or a different host.
- The Render workspace adds another free web service.
- Supabase or Render change their idle rules.
