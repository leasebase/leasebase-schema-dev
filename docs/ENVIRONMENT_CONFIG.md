# Environment configuration

This document describes the environment variables required by the `leasebase-web` app in different environments.

## Shared vars (all environments)

- `NEXT_PUBLIC_API_BASE_URL`  
  Base URL for the Leasebase API. Example:
  - Local: `http://localhost:4000`
  - Dev: `https://api.dev.leasebase.ai`
  - Prod: `https://api.leasebase.ai`

- `NEXT_PUBLIC_COGNITO_REGION`  
  AWS region of the Cognito User Pool (e.g. `us-west-2`).

- `NEXT_PUBLIC_COGNITO_USER_POOL_ID`  
  AWS Cognito User Pool ID used for authentication.

- `NEXT_PUBLIC_COGNITO_CLIENT_ID`  
  Cognito app client ID for the web app.

- `NEXT_PUBLIC_COGNITO_DOMAIN`  
  Cognito Hosted UI domain used for login/logout redirects (e.g. `your-domain.auth.us-west-2.amazoncognito.com`).

- `NEXT_PUBLIC_COGNITO_OAUTH_REDIRECT_SIGNIN`  
  OAuth redirect URL for sign-in (e.g. `http://localhost:3000/auth/callback`).

- `NEXT_PUBLIC_COGNITO_OAUTH_REDIRECT_SIGNOUT`  
  OAuth redirect URL for sign-out (e.g. `http://localhost:3000/login`).

- `DEV_ONLY_MOCK_AUTH`  
  Optional flag (e.g. `true` / `false`) to enable development-only auth bypass flows.  
  **Must remain `false` in production.**

## Local development

In local dev, create `.env.local` based on `.env.example`:

```bash
cp .env.example .env.local
```

Typical values:

- `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000`
- `DEV_ONLY_MOCK_AUTH=true` (optional, ONLY for local development)

## Cloud environments (staging / production)

In ECS or another container platform, these env vars should be injected via the task definition / service configuration or a secret manager, not committed to this repo.

- Never commit real secrets or production values to Git.
- Treat `NEXT_PUBLIC_*` values as part of the public web surface but still manage them via environment injection so that different stacks (staging/prod) can be configured independently.
