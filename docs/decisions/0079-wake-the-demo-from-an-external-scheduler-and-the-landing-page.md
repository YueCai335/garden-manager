# ADR-0079: Wake the Demo from an External Scheduler and the Landing Page

- Status: Accepted
- Date: 2026-11-16
- Related: [ADR-0073](0073-separate-the-landing-page-and-use-a-textured-deep-green-look.md),
  [ADR-0074](0074-keep-the-portfolio-demo-awake-with-a-scheduled-check.md)
- Amends: ADR-0073 (the landing page sends one request) and ADR-0074 (the
  GitHub workflow becomes the backup scheduler)

## Context

ADR-0074 keeps the free Render service awake with a GitHub Actions schedule
every 10 minutes. On 2026-11-16 the run history showed the schedule did not
hold: the scheduled runs started at 01:16, 08:03, and 18:25 UTC, 7 to 10 hours
apart. GitHub treats schedules as best effort, and a low-traffic public
repository gets few runs. Render sleeps after about 15 idle minutes, so the
API was asleep for most of the day.

The owner saw the result directly. The landing page opened at once because it
is static. `/gardens` then waited about a minute on the first visit, and the
first request could fail: workspace loads gave up after 30 seconds, while a
cold start can take longer. The second visit was fast because the first one had
woken the server.

A first-time visitor sees the gardens page without the API, because a new
workspace lives in the browser. The AI Garden Note panel, Plant Doctor, and
Plant Guide still wait on `/runtime-config`, and any server-backed workspace
waits on the workspace load.

## Decision

1. **An external scheduler is the primary keep-alive.** The owner creates a
   free scheduled HTTP check (for example cron-job.org or UptimeRobot) that
   calls `GET /health/db` every 5 to 10 minutes. These services run on
   schedule, unlike GitHub's best-effort cron.
2. **The GitHub workflow stays as the backup.** It still touches the database
   if the external service stops, and its failure email stays the alert.
3. **The landing page wakes the API.** The marketing layout renders
   `ApiPrewarm`, which sends one `GET /health` with `mode: "no-cors"` when the
   page loads. The page never waits for it and ignores the result. A visitor
   who reads the landing page for half a minute gives the server a head start.
4. **Slow loads explain themselves.** After 5 seconds, the gardens skeleton,
   the workspace loading text, and the AI feature loading text show: "The
   garden server is starting up. The first visit can take up to a minute."
5. **Opening a workspace waits 90 seconds.** `loadServerWorkspace` uses
   `WORKSPACE_LOAD_TIMEOUT_MS` (90 s) so a cold start does not fail the first
   visit. Saves keep the 30-second timeout.

## Why This Option

- The owner chose this combination after seeing the run history.
- An external scheduler fixes the cause at no cost and needs no code.
- The landing-page request covers the case the scheduler misses. It is one
  small request, so the landing page still renders without a backend.
- `/health` stays database-free, so a visitor's request never touches
  Supabase; the scheduler handles database activity.

## Alternatives Considered

### Paid Render instance

Removes the sleep entirely for about 7 USD a month. Declined for now: the free
combination should cover nearly every visit.

### Keep only the GitHub schedule with a shorter interval

GitHub does not honor short intervals for a quiet repository, so a shorter
cron does not help.

### Prewarm only, no external scheduler

Every visitor would still see a cold start unless they stayed on the landing
page for about a minute.

## Consequences

- The keep-alive now depends on an account outside the repository. The
  schedule is documented in `docs/portfolio-demo-deployment.md`, not in Git.
- ADR-0073 said the landing page calls no API. It now sends one
  fire-and-forget request, and still renders without the backend.
- A visitor who goes straight to `/gardens` can still meet a cold start when
  the scheduler is late; the loading text now explains the wait.
- One always-on free Render service still uses about 730 of the 750 free
  instance hours per month, as ADR-0074 assumed.

## Reconsider When

- The external scheduler stops or changes its free plan.
- The demo moves to a paid Render plan or another host; then remove the
  prewarm and the longer load timeout.
- Cold starts appear again in normal use.
