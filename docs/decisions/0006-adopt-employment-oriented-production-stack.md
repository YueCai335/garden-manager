# ADR-0006: Adopt an Employment-Oriented Production Stack

- Status: Accepted
- Date: 2026-08-28

## Context

Garden Manager is the primary portfolio project for a new-graduate
software engineering search in North America, with Greater Montreal as the
initial market. The project needs broad relevance to full-stack, backend,
cloud-application, and applied-AI roles while remaining coherent, usable, and
explainable in interviews.

The selected technologies must support real product requirements. A technology
is considered implemented only when the repository contains working code,
tests, and appropriate deployment or operational evidence.

## Decision

Position the project as:

> Production-grade full-stack and applied AI platform, with TypeScript/React,
> Python/FastAPI, PostgreSQL, and AWS as the core stack.

Use this production baseline:

- Next.js, React, and TypeScript for the web application.
- Python, FastAPI, and Pydantic for the application backend.
- REST and OpenAPI for the frontend-backend contract.
- PostgreSQL with PostGIS for product and geospatial data.
- pgvector for retrieval during the RAG phase.
- OpenAI API with structured outputs, retrieval, tool calling, evaluations,
  citations, fallbacks, and guardrails for applied-AI features.
- Amazon S3, RDS, ECS Fargate, and CloudWatch for backend production
  infrastructure.
- Vercel for Next.js preview and production web deployments.
- Docker and Docker Compose for reproducible local environments.
- GitHub Actions for CI/CD and Terraform for AWS infrastructure.
- Vitest, React Testing Library, Playwright, and pytest for automated tests.
- Structured logs and request tracing for operational evidence.

Redis remains conditional until caching or background work has a measured use.
Kubernetes, Kafka, and independently deployed microservices require future
scale, reliability, or ownership evidence before adoption.

## Why This Option

- TypeScript and React provide broad frontend and full-stack relevance.
- Python and FastAPI fit geometry, scientific computing, image processing, and
  applied-AI workloads while providing typed API contracts.
- PostgreSQL supports transactional product data; PostGIS and pgvector extend
  the same data platform for geospatial and retrieval requirements.
- AWS provides practical cloud experience across compute, storage, databases,
  monitoring, security, and deployment.
- Docker, CI/CD, infrastructure as code, automated tests, and observability
  demonstrate production engineering throughout the software lifecycle.
- RAG, tool calling, and evaluations create a credible applied-AI story tied to
  product features and measurable quality.

## Alternatives Considered

### Next.js as the Entire Application Backend

A single TypeScript deployment would reduce local setup. Python provides
stronger support for the planned solar, geometry, computer-vision, and AI work,
and creates clearer backend engineering evidence.

### Multiple Backend Languages in This Project

Adding Java, C#, or a second production backend would increase keyword coverage
while creating duplicate infrastructure and unclear ownership. Additional
language evidence can come from a separate focused project.

### Managed Platforms Without AWS Infrastructure

Vercel, Supabase, Render, or Fly.io can shorten initial deployment. The project
keeps Vercel for the Next.js application and adopts AWS for backend production
experience, image storage, PostgreSQL, and operations.

### Early Kubernetes, Kafka, and Microservices

These technologies add meaningful operational costs. The current product has
no traffic, team structure, or independent scaling requirement that supports
them.

## Consequences

- The repository will contain TypeScript and Python and requires an explicit
  REST contract.
- Cloud deployment has more setup and cost controls than a fully managed
  student hosting platform.
- Each phase must deliver a working vertical slice before expanding the stack.
- AI features require evaluation and failure handling alongside the user-facing
  capability.
- The project can support several job families while retaining one coherent
  architecture and product story.

## Revisit When

Reconsider this baseline when production measurements, operating cost, security
requirements, external service constraints, or target-job evidence show that a
different technology would materially improve the product or portfolio value.
