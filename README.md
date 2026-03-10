# Leasebase Backend Monorepo

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
>
> For production deployment, see the monorepo (`leasebase_all/`) and IaC (`leasebase-iac/`).

Real Estate Leasing platform for property managers, owners/landlords, and tenants.

This repository contains:
- The backend API for **local development** (NestJS + Prisma + PostgreSQL)
- Prisma schema and migrations (canonical DB schema definition)
- Seed scripts for demo and test data
- Shared backend documentation

**Frontend code (web and mobile)** lives in separate repositories:
- `leasebase-web` – standalone web client
- `leasebase-mobile` – standalone mobile client

For the **production runtime**, see:
- `leasebase_all/` – deployment monorepo with CI/CD workflows
- `leasebase-iac/` – Terraform infrastructure (v2 microservices on ECS Fargate)
- `leasebase-bff-gateway/` – API composition layer routing to domain microservices

---

## Repository layout

This repo is intentionally **backend‑only**. Frontend projects live in their own repos (`leasebase-web`, `leasebase-mobile`).

- `apps/`
  - Reserved for potential future backend apps/services (not frontends)
- `services/`
  - `services/api/` – NestJS API using Prisma and PostgreSQL (the main backend service)
- `infra/`
  - `infra/terraform/bootstrap` – Terraform for bootstrapping AWS accounts (IAM roles, OIDC for GitHub Actions, basic shared resources). Full app infrastructure (VPC, RDS, ECS/Fargate, ALB, S3/CloudFront, etc.) now lives in the separate `leasebase-iac` repo.
- `docs/`
  - `docs/architecture.md` – High-level system and domain architecture
- `multi_agent/`
  - Multi-agent orchestration engine and CLI used to coordinate work across web, mobile, and backend
- Root files
  - `package.json` – Monorepo configuration and scripts
  - `docker-compose.yml` – Local PostgreSQL database for development
  - `tsconfig.base.json` – Shared TypeScript configuration

---

## Prerequisites

To run Leasebase locally you will need:

- **Node.js** (LTS recommended, e.g. Node 18 or 20)
- **npm** (comes with Node; npm 8+ recommended)
- **Docker** + **Docker Compose** (for local PostgreSQL)
- **Git**

For AWS deployment of the backend you will additionally need:

- An **AWS account** and appropriate IAM permissions
- **AWS CLI** configured with credentials (`aws configure`)
- A basic understanding of VPCs, security groups, and RDS/EC2 (or ECS) concepts

---

## Local development setup

### 1. Clone the repo

```bash path=null start=null
git clone <your-git-url>/leasebase.git
cd leasebase
```

### 2. Install dependencies

This will install dependencies for the monorepo and all workspaces (`apps/*`, `services/*`).

```bash path=null start=null
npm install
```

### 3. Start the local PostgreSQL database

The repo includes a simple Postgres instance via Docker Compose:

```bash path=null start=null
# From the repo root
docker-compose up -d db
```

Default connection details (as defined in `docker-compose.yml`):
- Host: `localhost`
- Port: `5432`
- User: `leasebase`
- Password: `leasebase`
- Database: `leasebase`

The Prisma datasource in `services/api/prisma/schema.prisma` uses the `DATABASE_URL` environment variable; by default you should set something like:

```bash path=null start=null
export DATABASE_URL="postgresql://leasebase:leasebase@localhost:5432/leasebase?schema=public"
```

You can place this in a local `.env` file for convenience.

### 4. Run database migrations & seed data (optional but recommended)

From the monorepo root:

```bash path=null start=null
# Apply Prisma migrations
npm run migrate

# Seed initial data
npm run seed
```

These commands delegate to scripts under `services/api`.

### 5. Run the backend API locally

To start just the API in watch mode:

```bash path=null start=null
npm run dev:api
```

This runs NestJS from `services/api`, listening on:
- Port: `4000` by default (configurable via `API_PORT` env var)

Swagger API docs are exposed at:
- `http://localhost:4000/docs`

### 6. Authentication (AWS Cognito)

The backend API uses **AWS Cognito** for authentication from the start. It does **not** issue tokens or handle user registration itself; instead it validates **Cognito access tokens** sent as Bearer tokens.

#### Required environment variables

In `services/api` (or the shell where you run the API), set:

```bash path=null start=null
COGNITO_REGION=us-west-2                # or your region
COGNITO_USER_POOL_ID=us-west-2_XXXXXXX  # Cognito User Pool ID
COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxx  # App client ID for web
```

These are used to construct the expected JWT **issuer** and **JWKS** URL:

- Issuer: `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}`
- JWKS: `${issuer}/.well-known/jwks.json`

The API verifies incoming Bearer tokens against this JWKS and checks the `aud` (audience) claim matches `COGNITO_CLIENT_ID`.

#### Dev-only auth bypass (for tests only)

For certain local or test scenarios you can enable a **dev-only** auth bypass. This is **disabled by default** and must never be used in production.

```bash path=null start=null
DEV_AUTH_BYPASS=true
```

When this flag is set, you can simulate an authenticated user via headers:

- `x-dev-user-email` – user email
- `x-dev-user-role` – one of `ORG_ADMIN | PM_STAFF | OWNER | TENANT`
- `x-dev-org-id` – organization id

The backend will upsert a matching `Organization` + `User` record and treat that as the current user. When `DEV_AUTH_BYPASS` is not `true`, these headers are ignored and a real Cognito token is required.

#### Auth endpoints

- `GET /auth/me`
  - Protected endpoint (requires Bearer token).
  - Returns the normalized current user:
    - `id`, `orgId`, `email`, `name`, `role`.
  - Documented in Swagger as `CurrentUserDto` under the `auth` tag.

- `GET /auth/config`
  - **Public** endpoint (no auth required).
  - Returns the Cognito configuration the API is using:
    - `region`, `userPoolId`, `clientId`, `issuer`, `jwksUri`.
  - Useful for debugging and for verifying that the backend is pointed at the expected user pool.

To use these with Swagger:

1. Obtain an **access token** from Cognito (e.g. via the Hosted UI from the web app).
2. In Swagger (`/docs`), click **Authorize**, select the bearer scheme, and paste the token.
3. Call `GET /auth/me` to verify the token is accepted.

### 7. Frontend applications (separate repos)

This backend monorepo does **not** contain the web or mobile UI code.

Frontend projects live in their own repositories:
- `leasebase-web` – web client
- `leasebase-mobile` – mobile client

Those repos are expected to talk to this backend API over HTTP (for example, `http://localhost:4000` in local development, or an AWS host in dev/stage/prod).

### 8. Run API and frontend together locally

A typical local workflow looks like:

1. From this repo, start Postgres and the API:

   ```bash path=null start=null
   # In ../leasebase (backend monorepo)
   docker-compose up -d db
   npm install
   npm run migrate
   npm run seed
   npm run dev:api
   ```

2. From `../leasebase-web`, start the web client (once implemented):

   ```bash path=null start=null
   cd ../leasebase-web
   npm install
   npm run dev
   ```

3. From `../leasebase-mobile`, start the mobile client (once implemented):

   ```bash path=null start=null
   cd ../leasebase-mobile
   npm install
   npm start
   ```

The web and mobile apps should be configured to use the API base URL exposed by this backend (e.g., `http://localhost:4000`).

---

## Testing & linting

From the monorepo root:

```bash path=null start=null
# Run API + web tests
npm test

# API-only tests
npm run test:api

# Web-only tests (once implemented)
npm run test:web

# Lint API + web
npm run lint

# Lint API-only
npm run lint:api

# Lint web-only (once implemented)
npm run lint:web
```

---

## Production deployment (not from this repo)

> **This repository does not deploy to production.** The deploy workflow (`deploy.yml`) targets
> deprecated v1 ECS infrastructure and is disabled (`if: false`).

For production deployment, refer to:

- **Infrastructure**: `leasebase-iac/` — Terraform modules for the v2 platform (10 ECS Fargate
  microservices, Aurora PostgreSQL, API Gateway, CloudFront).
  See `leasebase-iac/docs/DEPLOYMENT_STANDARDS.md` for the canonical deployment path.
- **CI/CD**: `leasebase_all/.github/workflows/dev-deploy.yml` — monorepo workflow that builds and
  deploys individual microservices on push to `develop`.
- **Service configs**: `leasebase_all/services/<service>/service.yaml` — per-service ECR, ECS, and
  task family definitions.

The bootstrap-only Terraform in `infra/terraform/bootstrap` remains useful for initial AWS account
setup (IAM roles, OIDC provider).

---

## Multi-agent tooling

The `multi_agent/` directory contains a generic multi-agent engine plus a Leasebase-specific CLI wrapper.

From the backend monorepo root you can ask the multi-agent system to decompose and reason about tasks across backend, web, and mobile **as separate repos**:

```bash path=null start=null
npm run multi-agent -- "Design the MVP tenant onboarding flow across web, mobile, and backend" --domain all
```

Domains:
- `all` – plan work across web, mobile, and backend
- `web` – focus on the web client
- `mobile` – focus on the mobile app
- `api` – focus on the NestJS API

This is especially useful for generating implementation plans, API contracts, and step-by-step changes that touch multiple parts of the monorepo.

---

## Further reading

- `docs/architecture.md` – detailed system and domain architecture
- `services/api/prisma/schema.prisma` – source of truth for the data model
- `services/api/src` – NestJS modules, controllers, and services for the backend API
