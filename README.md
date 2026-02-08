# Paywall Service

Multi-tenant paywall-as-a-service with BYOC (Bring Your Own Credentials) Stripe integration.

## Architecture

Each tenant brings their own Stripe keys. The service stores them securely in AWS Secrets Manager and instantiates per-tenant Stripe clients at runtime. Products authenticate via API keys (SHA-256 hashed, admin vs product-scoped).

```
┌─────────────────┐     ┌──────────────────────────────────┐
│  Compass         │────▶│  Paywall Service                 │
│  (tenant)        │     │                                  │
├─────────────────┤     │  Tenant Registry (DynamoDB)      │
│  Doctor Portal   │────▶│  Stripe Keys (Secrets Manager)   │
│  (tenant)        │     │  Entitlement Cache (DynamoDB)    │
├─────────────────┤     │  Per-tenant Stripe SDK            │
│  External App    │────▶│                                  │
│  (tenant)        │     └──────────────────────────────────┘
└─────────────────┘
```

## Stack

- **API:** AWS Lambda + API Gateway + DynamoDB + Secrets Manager (Serverless Framework 3)
- **Frontend:** React + Vite + Tailwind (checkout UI hosted on CloudFront + S3)
- **Runtime:** Node.js 20, TypeScript

## Project Structure

```
api/                    # Serverless backend
├── src/
│   ├── handlers/       # Lambda handlers (tenants, credentials, products,
│   │                   #   entitlements, plans, checkout, subscriptions, webhooks)
│   ├── services/       # Stripe client factory, credentials, DynamoDB, entitlements
│   ├── middleware/      # API key auth
│   ├── types/          # TypeScript interfaces
│   ├── utils/          # API key generation, response helpers
│   └── local.ts        # Local Express dev server
├── serverless.yml      # Infrastructure (Lambda, DynamoDB, S3, CloudFront, API Gateway)
└── package.json

app/                    # Checkout frontend
├── src/
│   ├── pages/          # Plans, Checkout, Success
│   ├── components/     # PlanCard, PaymentForm
│   └── services/       # API client
├── vite.config.ts
└── package.json

deploy-frontend.sh      # Build + S3 sync + CloudFront invalidation
```

## Local Development

```bash
# API (port 3001)
cd api
cp .env.example .env
npm install
npx ts-node src/local.ts

# Frontend (port 5180, proxies API to localhost:3001)
cd app
npm install
npm run dev
```

## Deployment

```bash
# API + infrastructure
cd api
npx serverless deploy --stage dev

# Frontend
./deploy-frontend.sh dev
```

## API Endpoints

### Tenant Management (admin API key)
- `POST /tenants` — Register tenant (returns admin API key)
- `GET/PUT/DELETE /tenants/{tenantId}`
- `POST /tenants/{tenantId}/credentials` — Store BYOC Stripe keys
- `POST /tenants/{tenantId}/products` — Register product (returns product API key)

### Entitlements (product API key)
- `POST /entitlements/check` — Check user access (cache + Stripe fallback)

### Checkout (public, tenant context in params/body)
- `GET /plans?tenant={id}&product={id}` — List plans from tenant's Stripe
- `POST /checkout/setup-intent` — Create Stripe SetupIntent
- `POST /subscriptions/finalize` — Create subscription (synchronous cache write)
- `POST /subscriptions/cancel` — Cancel subscription

### Webhooks
- `POST /webhooks/stripe/{tenantId}` — Per-tenant Stripe webhook

## Key Design Decisions

- **BYOC:** Tenant Stripe keys stored in Secrets Manager, never returned via API
- **Synchronous entitlement:** `/subscriptions/finalize` writes cache before returning — webhooks are backup only
- **Audience filtering:** Stripe product metadata `audience` field filters plans per product. Comma-separated values supported for bundles
- **$0 plans:** Skip payment form, finalize directly
- **Metadata passthrough:** All Stripe product metadata returned to consuming products (e.g. `kyd_required` for cerewell)

## Deployed Infrastructure

- **API:** `pay-api.agentbrigade.ai`
- **Checkout:** `pay.agentbrigade.ai`
- **Region:** us-east-1
