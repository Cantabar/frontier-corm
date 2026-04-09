# Infra

## Overview

The infra directory contains the AWS CDK stacks that provision all cloud infrastructure for Frontier Corm. A full-stack parameterized stack (`FrontierCormStack`) supports multiple game-world environments (utopia, stillness), each with isolated resources sharing the same architecture. A lightweight frontend-only stack (`FrontierCormFrontendStack`) supports environments that reuse an existing backend — deploying only S3, CloudFront, Route 53, and an ACM certificate.

## Architecture

```
Internet
    │
    ▼
Route 53 (ef-corm.com)
    ├─ {env}.ef-corm.com ──► CloudFront ──► S3 (static frontend)
    │   (stillness = apex ef-corm.com)  ├─► /sui-rpc ──► fullnode.{net}.sui.io
    │                                   ├─► /api/v1/* ──► ALB (api.{env}.ef-corm.com)
    │                                   └─► /zk/* ──► ALB (ZK circuit artifacts, cached)
    │
    ├─ api.{env}.ef-corm.com ──► ALB (HTTPS :443)
    │                               │
    │                               ▼
    │                         ECS Fargate Cluster
    │                           ├─ Indexer Service (port 3100)
    │                           └─ Continuity Engine Service (port 3300)
    │
    └─ continuity-engine.{env}.ef-corm.com ──► ALB (same, HTTPS :443)
                                                └─ Continuity Engine Service
                                    │
                                    ▼
                              RDS Postgres 16 (private subnet)
                                    │
                              Secrets Manager
                                ├─ fc-{env}/db-credentials
                                ├─ fc-{env}/sui-rpc
                                └─ fc-{env}/sui-signer

ACM Certificate: ef-corm.com + *.ef-corm.com (DNS-validated via Route 53)
```

### Domain Strategy

- **Root domain:** `ef-corm.com` (purchased in AWS Route 53)
- **Stillness (production):** apex `ef-corm.com` + `api.ef-corm.com` + `continuity-engine.ef-corm.com`
- **Other environments:** `{env}.ef-corm.com` + `api.{env}.ef-corm.com` + `continuity-engine.{env}.ef-corm.com`
- **Continuity Engine subdomain:** dedicated `continuity-engine.{env}.ef-corm.com` A record → ALB. Used by the SPA iframe, corm-brain WebSocket connections, and direct browser access. A host-header ALB rule routes all traffic on this domain to the continuity-engine target group (priority 5), so the Go service handles all paths including the root `/` redirect.
- **ACM certificate:** covers `ef-corm.com` + `*.ef-corm.com`, DNS-validated via Route 53
- **Frontend-only environments:** `post-hackathon.stillness.ef-corm.com` — S3 + CloudFront only, proxies `/api/v1/*` and `/zk/*` to `api.ef-corm.com` (Stillness ALB). Uses its own ACM cert (the wildcard `*.ef-corm.com` does not cover two-level-deep subdomains).

### Resource Naming

All resources are prefixed with `fc-{env}` (e.g. `fc-utopia`, `fc-stillness`, `fc-post-hackathon`). Full-stack CDK stack names follow `FrontierCorm{Env}` (e.g. `FrontierCormUtopia`). Frontend-only stacks use explicit names defined in `bin/app.ts` (e.g. `FrontierCormPostHackathonStack`).

### Network Layout

- **VPC** — 2 AZs, 1 NAT gateway (cost optimization)
  - Public subnets (`/24`) — ALB
  - Private subnets (`/24`, with egress) — ECS tasks, RDS
- **Security Groups:**
  - ALB SG — inbound 80/443 from anywhere
  - ECS SG — inbound all TCP from ALB SG
  - DB SG — inbound 5432 from ECS SG only

## Tech Stack

- **IaC:** AWS CDK (TypeScript)
- **Compute:** ECS Fargate (512 CPU / 1024 MB per task)
- **Database:** RDS Postgres 16 (t4g.micro, gp3 20GB, single-AZ)
- **Storage:** S3 (frontend static assets, block public access)
- **CDN:** CloudFront (SPA routing via 404 → /index.html, custom domain + ACM cert, Sui RPC reverse proxy, indexer API reverse proxy, ZK artifact reverse proxy)
- **DNS:** Route 53 (A alias records for CloudFront + ALB)
- **TLS:** ACM (ef-corm.com + *.ef-corm.com, DNS validation)
- **Registry:** ECR (`fc-{env}-indexer`, `fc-{env}-continuity-engine`)
- **Secrets:** Secrets Manager (DB credentials with auto-generated password, Sui RPC config, Sui signer keypair)
- **Logging:** CloudWatch Logs (`/ecs/fc-{env}`, 2-week retention), structured JSON (pino for indexer, slog for continuity-engine)
- **Observability:** CloudWatch Dashboard (`fc-{env}-overview`), Container Insights, CloudWatch Alarms + SNS
- **Access Logs:** ALB access logs to S3 (`fc-{env}-alb-logs-*`, 30-day lifecycle), CloudFront standard logs to S3 (`fc-{env}-cf-logs-*`, 30-day lifecycle)
- **DB Monitoring:** RDS Performance Insights (7-day free tier), slow query log (>1s) exported to CloudWatch

## Configuration

### CDK Context Parameters

- `appEnv` — environment name: `utopia` (default), `stillness`, or `post-hackathon` (frontend-only)
- `suiNetwork` — Sui network: `testnet` (default) or `mainnet`
- `cormStatePackageId` — deployed corm_state Sui package ID (default empty; when set, disables `SEED_CHAIN_DATA`)

Frontend-only stacks (`FrontierCormFrontendStack`) receive `frontendDomain` and `apiBackendDomain` as stack props from `bin/app.ts`. These values are defined in the `frontendOnlyEnvs` config map and are not passed via CLI context.

### Makefile Targets

- `make infra-init` — first-time CDK bootstrap + npm install
- `make deploy-infra ENV=utopia` — deploy CDK stack only
- `make deploy-indexer ENV=utopia` — build + push indexer image + force indexer ECS redeployment
- `make deploy-continuity ENV=utopia` — build + push continuity-engine image + force continuity-engine ECS redeployment
- `make deploy-images ENV=utopia` — build + push all Docker images (calls `deploy-indexer` + `deploy-continuity`)
- `make deploy-frontend ENV=utopia` — build frontend + S3 sync + CloudFront invalidation
- `make deploy-env ENV=utopia` — deploy everything (infra + images + frontend)
- `make teardown ENV=utopia` — destroy all AWS resources for an environment
- `make logs-indexer ENV=utopia` — tail indexer CloudWatch logs
- `make logs-continuity ENV=utopia` — tail continuity-engine CloudWatch logs
- `make dashboard ENV=utopia` — print CloudWatch dashboard URL
- `make deploy-post-hackathon` — deploy post-hackathon frontend-only (infra + frontend, no images)
- `make teardown-post-hackathon` — destroy post-hackathon AWS resources

### Stack Outputs

- `IndexerEcrUri` — ECR repository URI for the indexer image
- `ContinuityEcrUri` — ECR repository URI for the continuity-engine image
- `UiBucketName` — S3 bucket name for frontend assets
- `CloudFrontDistributionId` — CloudFront distribution ID (for cache invalidation)
- `AlbDns` — API load balancer DNS name
- `DbEndpoint` — RDS Postgres endpoint address
- `SiteUrl` — public frontend URL (e.g. `https://ef-corm.com` or `https://utopia.ef-corm.com`)
- `ApiUrl` — public API URL (e.g. `https://api.ef-corm.com` or `https://api.utopia.ef-corm.com`)
- `ContinuityEngineUrl` — continuity-engine URL (e.g. `https://continuity-engine.ef-corm.com` or `https://continuity-engine.utopia.ef-corm.com`)
- `DashboardUrl` — CloudWatch observability dashboard URL

## Data Model

No application data — this service provisions infrastructure only. Database schema is managed by the indexer and continuity-engine services at startup.

## Deployment

- **Prerequisites:** AWS CLI configured, CDK bootstrapped (`make infra-init`)
- **Per-environment:** `make deploy-env ENV=utopia` (or `make deploy-utopia` shorthand)
- **Teardown:** `make teardown ENV=utopia` (interactive confirmation required)
- **Region:** `us-east-1` (configurable via `AWS_REGION`)

## Features

- Single parameterized CDK stack supporting multiple game-world environments (utopia, stillness)
- Lightweight frontend-only CDK stack (`FrontierCormFrontendStack`) for environments that reuse an existing backend (S3, CloudFront, Route 53, ACM cert only — no VPC/ECS/RDS). Used by `post-hackathon` environment.
- VPC with 2-AZ layout, NAT gateway, public/private subnet isolation
- ECS Fargate with 512 CPU / 1024 MB per task (indexer + continuity-engine)
- RDS Postgres 16 (t4g.micro, gp3 20GB, single-AZ)
- S3 static frontend with CloudFront CDN and SPA routing
- Sui RPC reverse proxy via CloudFront (`/sui-rpc` → `fullnode.{net}.sui.io/`). Uses a CloudFront Function to rewrite the URI, `CachingDisabled` cache policy, and `AllViewerExceptHostHeader` origin request policy. Eliminates browser CORS errors by making Sui RPC calls same-origin with the SPA.
- Indexer API reverse proxy via CloudFront (`/api/v1/*` → `api.{env}.ef-corm.com`). Proxies SPA indexer calls to the ALB using the environment's API subdomain (HTTPS, ALB cert validates against `*.ef-corm.com`). Same-origin with the SPA, no CORS needed.
- ZK circuit artifact reverse proxy via CloudFront (`/zk/*` → ALB → indexer). Serves WASM and zkey files for browser-side Groth16 proof generation. Uses `CachingOptimized` cache policy (respects Express `max-age: 7d`). Same-origin with the SPA, no CORS needed. ALB rule at priority 11 routes `/zk/*` to the indexer target group.
- Custom domain (ef-corm.com) with Route 53 DNS + ACM TLS certificate
- HTTPS on both CloudFront and ALB; HTTP redirects to HTTPS
- ALB sticky sessions on continuity-engine target group (1-day TTL) — required because the service uses an in-memory session store
- ECR container registry per service per environment
- Secrets Manager for DB credentials and Sui RPC config
- CloudWatch Logs with 2-week retention, structured JSON output
- Makefile-driven deployment: infra, images, frontend, teardown
- CDK stack outputs for ECR URI, S3 bucket, CloudFront URL, ALB DNS
- CloudWatch Dashboard (`fc-{env}-overview`) with ECS CPU/memory, ALB requests/latency, RDS CPU/storage/connections, CloudFront requests/errors, healthy host counts, and Logs Insights error query widgets
- CloudWatch Alarms: indexer/continuity-engine unhealthy (no healthy ALB targets), ALB 5xx count >10 in 5min, ALB p99 latency >5s, RDS CPU >80% for 10min, RDS free storage <2GB. All alarm to SNS topic `fc-{env}-alerts`.
- ECS Container Insights for per-task CPU, memory, and network metrics
- ALB access logs to S3 with 30-day lifecycle
- CloudFront standard logging to S3 with 30-day lifecycle
- RDS Performance Insights (7-day free tier) and slow query log (queries >1s) exported to CloudWatch Logs
- RDS parameter group: `log_min_duration_statement=1000`, `log_statement=ddl`

## Open Questions / Future Work

- Auto-scaling policies for ECS services
- Multi-AZ RDS for production reliability
- WAF integration for CloudFront/ALB
- Cost optimization: review NAT gateway usage, consider VPC endpoints
- Slack/PagerDuty integration for alarm notifications (currently email-only via SNS)
