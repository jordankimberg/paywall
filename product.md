# Paywall Service — Product Overview

## What Is It?

The Paywall Service is a **multi-tenant, plug-and-play subscription management platform** that lets any software product add paid access control in minutes — without building billing infrastructure from scratch.

Think of it as **Stripe + access control as a service.** Products integrate a single API call to check if a user has paid, and the Paywall Service handles everything else: plan selection, payment collection, subscription lifecycle, and access enforcement.

---

## The Problem It Solves

Every software product that wants to charge users faces the same build-or-buy decision:

- **Stripe integration** — payment forms, webhook handlers, subscription lifecycle management
- **Entitlement logic** — "does this user have access right now?"
- **Checkout UI** — plan selection, payment collection, success/failure flows
- **Ongoing maintenance** — handling failed payments, cancellations, plan changes, edge cases

This is typically **weeks of engineering work per product**, with ongoing maintenance burden. Teams end up with bespoke billing code tightly coupled to their application.

The Paywall Service eliminates all of this. A product integrates once (a single API call + a redirect URL) and gets a fully managed subscription and access control system.

---

## How It Works

### For the Product (Your Customer)

1. **Register** — Sign up as a tenant and provide Stripe credentials
2. **Configure** — Register products, set up plans in Stripe with metadata
3. **Integrate** — Add one API call to check user entitlement
4. **Launch** — Users who haven't paid are redirected to a hosted checkout; paid users pass through seamlessly

**Paid users never see the paywall.** The experience is invisible — they log in and use the product normally. Only unpaid users encounter the checkout flow, and they're returned to the product immediately after payment.

### For End Users

1. Log into the product as usual
2. If they haven't paid, they're redirected to a branded checkout page
3. Select a plan, enter payment details
4. Redirected back to the product — now with full access
5. Access is granted instantly (no waiting for webhooks or background jobs)

---

## Key Capabilities

### Bring Your Own Credentials (BYOC)

Each tenant uses **their own Stripe account.** Revenue flows directly to the tenant — the Paywall Service never touches their money. Stripe API keys are stored in AWS Secrets Manager and never exposed via API.

This means:
- Tenants keep full control of their Stripe dashboard, reporting, and payouts
- No revenue share or payment processing middleman
- Tenants can use existing Stripe products and pricing
- Works with both Stripe test and live environments

### Multi-Product Support

A single tenant can register multiple products under one account. Each product gets its own API key, its own plan filtering, and its own checkout experience. Plans are filtered by an `audience` metadata field on Stripe products, so the same Stripe catalog can serve multiple products.

**Example:** A company with three SaaS tools registers once, stores their Stripe credentials once, and creates three products. Each product shows only its relevant plans at checkout.

### Instant Access After Payment

When a user completes checkout, access is granted **synchronously** — the entitlement cache is written before the redirect happens. There is zero delay between payment and access. Stripe webhooks serve as a backup reconciliation mechanism, not the primary write path.

### Flexible Pricing

All pricing lives in Stripe. The Paywall Service reads it dynamically:
- Monthly, annual, quarterly — any recurring interval
- $0 / free plans (payment form is skipped automatically)
- Bundled plans that grant access to multiple products
- All plan metadata (features, display order, custom fields) is passed through from Stripe

### Hosted Checkout

A hosted, responsive checkout UI is included:
- Plan selection page with feature comparison
- Stripe Elements payment form (PCI-compliant, no card data touches your servers)
- Success confirmation with automatic redirect
- Works on desktop and mobile

The checkout is accessed via URL parameters — no iframes or embedded components needed.

---

## Integration Effort

### What the Product Team Does

| Step | Effort | Details |
|------|--------|---------|
| Register as a tenant | 5 minutes | One API call with name and email |
| Store Stripe credentials | 5 minutes | Provide Stripe API keys (validated automatically) |
| Register a product | 5 minutes | One API call with product name and allowed return URLs |
| Add entitlement check | 1 API call | `POST /entitlements/check` with user email — returns access status |
| Handle "not paid" | 1 redirect | Redirect unpaid users to the checkout URL returned by the API |
| Configure Stripe plans | In Stripe | Add metadata (`audience`, `features`, `plan_code`, `display_order`) to existing or new Stripe products |

**Total integration: one API call + one redirect.** No webhooks to implement, no payment forms to build, no subscription logic to maintain.

### What the Product Team Does NOT Need to Do

- Build or maintain a checkout UI
- Handle Stripe webhooks
- Implement subscription lifecycle management (cancellations, renewals, failures)
- Build entitlement caching or access control logic
- Handle PCI compliance for payment collection
- Manage payment method storage or updates

---

## Architecture

```
┌──────────────────┐         ┌──────────────────────────────────┐
│  Product A        │────────▶│                                  │
│  (tenant)         │         │       Paywall Service            │
├──────────────────┤         │                                  │
│  Product B        │────────▶│  • Tenant registry               │
│  (tenant)         │         │  • Secure credential storage     │
├──────────────────┤         │  • Per-tenant Stripe clients     │
│  Product C        │────────▶│  • Entitlement cache + checks    │
│  (tenant)         │         │  • Hosted checkout UI            │
└──────────────────┘         │  • Webhook processing            │
                             └──────────────────────────────────┘
```

- **API:** AWS Lambda + API Gateway + DynamoDB
- **Credential Storage:** AWS Secrets Manager (encrypted at rest)
- **Checkout Frontend:** React SPA on CloudFront + S3
- **Runtime:** Node.js, TypeScript

All infrastructure is serverless — scales automatically, no servers to manage.

---

## Security

| Area | Approach |
|------|----------|
| Stripe credentials | Encrypted in AWS Secrets Manager; never returned via API |
| API authentication | SHA-256 hashed API keys; admin keys vs product-scoped keys |
| Tenant isolation | All operations scoped by tenant; no cross-tenant data access |
| Payment data | PCI-compliant via Stripe Elements; card data never touches our servers |
| Webhook integrity | Per-tenant signature verification using Stripe's signing secrets |
| Return URLs | Validated against a registered allowlist per product |

---

## Use Cases

### Internal Product Monetization
Add paid tiers to an existing product. Register as a tenant with your company's Stripe account, configure plans, and integrate the entitlement check. Your users see a seamless upgrade flow.

### Multi-Product Portfolio
A company with several products uses one tenant account. Each product has its own plans, its own checkout flow, and its own entitlement checks — but credentials and billing are managed centrally.

### Platform Monetization (Nested Tenants)
A platform lets its customers charge their own end users. Each platform customer becomes a paywall tenant with their own Stripe account (BYOC). The platform provisions tenants programmatically via the admin API. Revenue flows directly to each customer's Stripe account.

### Rapid Prototyping
Spin up a paywall for a new product in under an hour. No billing code to write, no checkout to design. Configure plans in Stripe, add one API call, ship.

---

## What It Is Not

- **Not a payment processor** — It orchestrates Stripe, not replaces it. All payments flow through the tenant's own Stripe account.
- **Not an authentication system** — Products handle their own user authentication (OAuth, Cognito, Auth0, etc.). The paywall checks entitlement based on a user identifier provided by the product.
- **Not a CRM or billing dashboard** — Tenants use the Stripe dashboard for reporting, refunds, customer management, and analytics.
- **Not a marketplace** — There is no shared catalog or discovery. Each tenant's plans are private to their products.

---

## Pricing Model (for external customers)

*To be determined by the business team.* Potential models include:

- **Per-transaction fee** — Small percentage or flat fee per successful subscription created
- **Monthly SaaS fee** — Tiered by number of active subscriptions or API calls
- **Free tier** — Limited number of subscriptions per month for small products
- **Enterprise** — Custom pricing for high-volume or white-label deployments

The Paywall Service itself generates no revenue from the tenant's Stripe transactions — all payment revenue flows directly to the tenant.

---

## Current Status

- **API:** Live at `pay-api.agentbrigade.ai`
- **Checkout UI:** Live at `pay.agentbrigade.ai`
- **First tenant:** AgentBrigade (internal), with Compass AI as the first integrated product
- **Supported:** Tenant management, BYOC credentials, product registration, entitlement checks, plan listing, checkout flow, subscription management, webhook processing

---

## Contact

For technical integration questions, API documentation, or onboarding support, refer to the [README](README.md) or contact the engineering team.
