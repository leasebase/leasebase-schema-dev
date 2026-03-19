# Leasebase Architecture (LEGACY — Historical Reference Only)

> **⚠️ This document describes the original monorepo architecture which has been superseded by the v2 microservices architecture.** For the current architecture, see `leasebase_all/ARCHITECTURE.md`.

Leasebase is a multi-tenant, cloud-native property management SaaS. This document describes the original TypeScript monorepo layout.

## High-level system architecture

```mermaid
flowchart LR
  subgraph Clients
    Web[Web App (Next.js)]
    Mobile[Mobile App (React Native / Expo)]
  end

  subgraph AWS[Leasebase AWS Account]
    CF[CloudFront]
    ALB[Application Load Balancer]
    ECS_API[ECS Fargate Service - API]
    ECS_WEB[ECS Fargate Service - Web]
    RDS[(RDS PostgreSQL)]
    S3[(S3 Buckets)]
    Cognito[Cognito User Pool]
    SES[SES]
    CW[CloudWatch Logs/Metrics]
  end

  Clients --> CF --> ALB
  ALB --> ECS_WEB
  ALB --> ECS_API
  ECS_API --> RDS
  ECS_API --> S3
  ECS_API --> SES
  Web --> Cognito
  Mobile --> Cognito
  ECS_API --> Cognito
  ECS_API --> CW
```

Each environment (dev, qa, uat, prod) is deployed into its own AWS account with its own VPC, ECS cluster, RDS instance, S3 buckets, Cognito user pool, and supporting resources. There are **no cross-account runtime dependencies**.

## Monorepo layout

- `apps/web` – Next.js + Tailwind web application for managers, landlords, and tenants.
- `apps/mobile` – Expo React Native app for tenants.
- `services/api` – NestJS API (REST + OpenAPI) with Prisma ORM and Stripe integration.
- `infra/terraform` – Infrastructure-as-Code for all environments using Terraform.
- `docs` – Architecture and other high-level documentation.
- `.github/workflows` – CI/CD pipelines.

## Backend domain model

Prisma models (implemented in `services/api/prisma/schema.prisma`) capture the core Leasebase domain:

```mermaid
classDiagram
  class Organization {
    +String id
    +String name
    +String subdomain
    +String stripeCustomerId
  }
  class User {
    +String id
    +String organizationId
    +String email
    +String role
  }
  class Property {
    +String id
    +String organizationId
    +String name
  }
  class Unit {
    +String id
    +String propertyId
    +String unitNumber
  }
  class Lease {
    +String id
    +String organizationId
    +String unitId
    +DateTime startDate
    +DateTime endDate
    +Int rentAmount
  }
  class TenantProfile {
    +String id
    +String userId
    +String leaseId
  }
  class LedgerEntry {
    +String id
    +String organizationId
    +String leaseId
    +Int amount
    +String type
  }
  class Payment {
    +String id
    +String organizationId
    +String leaseId
    +String stripePaymentIntentId
    +Int amount
  }
  class WorkOrder {
    +String id
    +String organizationId
    +String unitId
    +String status
  }
  class WorkOrderComment {
    +String id
    +String workOrderId
    +String authorId
    +String body
  }
  class Document {
    +String id
    +String organizationId
    +String s3Key
    +String entityType
    +String entityId
  }
  class AuditLog {
    +String id
    +String organizationId
    +String actorId
    +String action
  }
  class Subscription {
    +String id
    +String organizationId
    +String stripeSubscriptionId
  }

  Organization "1" -- "many" User
  Organization "1" -- "many" Property
  Property "1" -- "many" Unit
  Organization "1" -- "many" Lease
  Unit "1" -- "many" Lease
  Lease "1" -- "many" TenantProfile
  Lease "1" -- "many" LedgerEntry
  Lease "1" -- "many" Payment
  Organization "1" -- "many" WorkOrder
  WorkOrder "1" -- "many" WorkOrderComment
  Organization "1" -- "many" Document
  Organization "1" -- "many" AuditLog
  Organization "1" -- "1" Subscription
```

All tenant data is scoped by `organizationId` to enforce strong tenant isolation.

## Environments and AWS accounts

```mermaid
flowchart TB
  Dev[leasebase-dev AWS account\n dev.leasebase.io]
  QA[leasebase-qa AWS account\n qa.leasebase.io]
  UAT[leasebase-uat AWS account\n uat.leasebase.io]
  Prod[leasebase-prod AWS account\n leasebase.io]

  Dev --- QA --- UAT --- Prod
```

Each account has its own:
- VPC and ECS cluster
- RDS PostgreSQL instance
- S3 buckets for documents and assets
- Cognito user pools and app clients
- SES configuration
- CloudWatch logs and metrics
- IAM roles for ECS tasks and CI/CD
- Route53 records and ACM certificates for its domain

Terraform uses **separate state backends per account** under `infra/terraform/envs/{dev,qa,uat,prod}` and account-specific providers. CI/CD pipelines assume roles into these accounts to perform deployments and run migrations.

## Observability and security

- Application logs and basic metrics are emitted from the API and collected by CloudWatch.
- Authentication is handled by Cognito; the API enforces RBAC and per-organization scoping.
- Sensitive operations and configuration changes are recorded in `AuditLog`.
- S3 buckets are private and accessed via signed URLs.
- All public endpoints are served over HTTPS via CloudFront and ALB.
