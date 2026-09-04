# Resume Positioning

## Project Title

**Sun-Aware Garden Planner**

## Resume One-Liner

Built a full-stack garden operations and seasonal-planning application with a
Next.js frontend, FastAPI service, PostgreSQL persistence, deterministic crop
rotation guidance, and citation-backed local AI assistance.

## Resume Bullets

- Built a React and TypeScript interface for managing multiple gardens,
  measured growing areas, plant layouts, care tasks, and historical care
  records.
- Designed a PostgreSQL workspace model with FastAPI, SQLAlchemy, Alembic, and
  explicit browser-to-server import before PostgreSQL becomes the write source.
- Implemented crop-family rotation guidance by growing area and calendar year,
  plus independent next-season plans that keep future choices separate from
  current planting records.
- Added local AI workflows for Chinese and English care-note extraction and
  pgvector retrieval over curated horticultural source cards with visible
  citations and user review.
- Added Docker Compose, frontend and backend automated tests, and GitHub
  Actions checks for repeatable local delivery.

Use only bullets that match the reviewed version of the repository and that
you can explain, run, and debug during an interview.

## Interview Story

### User Problem

Gardeners need one place to remember what they planted, what care they
completed, and what growing areas should avoid or consider in the next season.

### System Design

The product separates operational facts from future intent. Current Planting
Records support care, health, and rotation history. Season Plans contain
tentative future crop choices by growing area. This keeps daily garden records
clear while retaining enough history for deterministic rotation guidance.

### Technical Trade-off

The initial application uses a complete-workspace API for a local single-user
workflow. It makes import, validation, persistence, and test scenarios easy to
inspect. Authentication, user-level authorization, and hosted collaboration
are deliberate future work because they require a separate security and
deployment design.

### AI Safety and Quality

The AI features create reviewable drafts or grounded answers. Plant Knowledge
retrieves a small curated set of source cards from pgvector and displays the
underlying citations. The user reviews extracted care and health information
before it becomes a garden record.

## Demonstration Route

1. Load the generic demo garden.
2. Open the garden layout and show measured growing areas with plant
   footprints.
3. Record a care event or create a repeating care task.
4. Open Next season planner, explain the rotation summary, and add a planned
   crop.
5. Ask Plant Knowledge a Chinese or English question and inspect the cited
   sources.

## Questions To Prepare

- Why are current plantings and next-season plans separate models?
- How does explicit import establish PostgreSQL as the write source?
- How does the rotation service decide whether a crop family should be avoided?
- How do citations and user review constrain the AI workflows?
- What changes would authentication and public deployment require?
