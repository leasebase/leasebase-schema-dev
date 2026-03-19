# Runtime contract for `leasebase-web`

This document describes what the containerized `leasebase-web` app expects from its runtime environment (ECS, k8s, etc.).

## Container image

- Built from the `Dockerfile` at the repo root.
- Exposes HTTP on port `3000` by default.
- Runs `npm run start` (Next.js production server) as a non-root user (`nextjs`).

## Required environment

### Network

- Outbound HTTP/HTTPS connectivity to the Leasebase API at `NEXT_PUBLIC_API_BASE_URL`.
- (Optional) Access to external services referenced by the backend microservices.

### Environment variables

The following env vars **must** be provided at runtime:

- `NEXT_PUBLIC_API_BASE_URL` – base URL of the Leasebase API.
- `NEXT_PUBLIC_COGNITO_USER_POOL_ID` – Cognito User Pool ID.
- `NEXT_PUBLIC_COGNITO_CLIENT_ID` – Cognito app client ID.
- `NEXT_PUBLIC_COGNITO_DOMAIN` – Cognito Hosted UI domain.

Optional:

- `DEV_ONLY_MOCK_AUTH` – dev-only flag, **should not be enabled in production**.

### Filesystem

- The container is stateless; no persistent local storage is required.
- Any uploads (documents, images) should go through the backend/API and be handled via S3 or similar; this repo does not manage persistent storage.

## Health checks

A basic health endpoint is available at:

- `GET /api/health` – returns `{ "status": "ok" }` on success.

This can be used by load balancers or uptime checks for liveness.

## Logging

- The app logs to stdout/stderr via Next.js / Node.js.
- The hosting platform (ECS, k8s, etc.) should collect and ship logs (e.g. to CloudWatch, ELK, etc.).

## Out of scope

- Infrastructure as code (Terraform, CDK, etc.) and AWS account-level wiring live in the backend/IaC repos and are intentionally **not** included here.
