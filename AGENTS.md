# AGENTS.md

This file provides guidance to AI agents (Warp, Cursor, Copilot, etc.) when working with code in this repository.

> **⚠️ This repository is NOT the production backend.**
>
> Production API traffic is served by the **v2 microservices platform**:
> Web → CloudFront → API Gateway → BFF → domain microservices.
>
> This repository exists for:
> - **Prisma schema & migrations** — canonical DB schema definition
> - **Seed scripts** — demo/test data population
> - **Local development API** — NestJS on port 4000, used by `leasebase-web` during local dev
>
> The deploy workflow (`deploy.yml`) targets deprecated v1 infrastructure and is **disabled**.

## Repository scope

- This repo is the **backend monorepo** for local development and schema management.
- The NestJS API in `services/api` runs on port 4000 and serves `leasebase-web` during local dev.
- **Production traffic does NOT flow through this repo.** Production is served by 10 ECS Fargate
  microservices deployed from `leasebase_all/`.

### What belongs here

- Prisma schema changes and migrations (`services/api/prisma/`)
- Seed scripts for demo and test data (`services/api/prisma/seed-*.ts`)
- NestJS controllers and services for **local development use**
- Documentation about the data model and local dev workflow

### What does NOT belong here

- **New production API endpoints** — these go in the appropriate `leasebase-*-service` repo
- Infrastructure code — lives in `leasebase-iac/`
- Deployment workflows — live in `leasebase_all/.github/workflows/`
- Frontend code — lives in `leasebase-web/` and `leasebase-mobile/`

## Related repositories

- `leasebase_all/` — deployment monorepo (CI/CD, service.yaml configs)
- `leasebase-iac/` — Terraform infrastructure (v2 microservices platform)
- `leasebase-bff-gateway/` — API composition layer (BFF pattern)
- `leasebase-web/` — Next.js web frontend
- `leasebase-*-service/` — domain microservices (auth, property, lease, tenant, maintenance, payments, notification, document, reporting)

For system architecture, see `leasebase_all/ARCHITECTURE.md`.

## Local development workflow

A full local environment uses this repo for the API + DB:

```bash
docker-compose up -d db
npm install
npm run migrate
npm run seed
npm run dev:api    # API on http://localhost:4000
```

Then start the web frontend from `../leasebase-web`:

```bash
cd ../leasebase-web
npm install
npm run dev        # Web on http://localhost:3000, talks to localhost:4000
```

## Build, test, and lint commands

Authoritative scripts live in `package.json`:

```bash
npm run dev:api     # Start NestJS API in watch mode (port 4000)
npm test            # Run tests
npm run test:api    # Run API-only tests
npm run lint        # Lint
npm run lint:api    # Lint API-only
npm run migrate     # Apply Prisma migrations
npm run seed        # Seed the database
```

## How agents should reason about changes

1. **Schema changes** (Prisma models, migrations) are appropriate here. They affect all microservices
   that query the same database.
2. **Seed scripts** for demo/test data are appropriate here.
3. **New production API endpoints** must go in the appropriate `leasebase-*-service` repo, NOT here.
4. **Local-dev-only controllers** (e.g., demo login, dev-bypass endpoints) are appropriate here.
5. When modifying the Prisma schema, ensure the change is compatible with both:
   - The NestJS monolith (uses Prisma ORM)
   - The v2 microservices (use raw SQL via `@leasebase/service-common`)
6. For infrastructure, deployment, or production API questions, consult:
   - `leasebase-iac/docs/DEPLOYMENT_STANDARDS.md`
   - `leasebase_all/ARCHITECTURE.md`
