# Multi-Tenant SaaS

## Description
Multi-tenant SaaS serves multiple customer organizations (tenants) from a single shared infrastructure, with strict data isolation between tenants. The core design challenge is balancing isolation (security, compliance) against efficiency (shared resources lower cost). Tenancy strategy — shared schema, schema-per-tenant, or database-per-tenant — is the most consequential early decision.

## When to Use
- Building a B2B or B2B2C product where customers are organizations, not individuals
- Cost efficiency requires sharing compute and infrastructure across customers
- You need centralized operations (one deployment to update all tenants simultaneously)
- Customers have different tiers or feature sets that must be controlled centrally
- Compliance requirements (SOC 2, GDPR) apply uniformly across all tenants

## When NOT to Use
- Customers require physical data isolation in their own cloud account (move to single-tenant or BYOC)
- Each tenant's workload is so different that shared infrastructure creates noisy-neighbor problems that cannot be mitigated
- A simple single-user SaaS where tenant isolation adds complexity with no benefit
- Regulatory requirements mandate that no data ever co-resides with data from other organizations

## Advantages
- Lower cost per tenant: shared compute, database, and ops overhead
- Single deployment updates all tenants simultaneously — no version fragmentation
- Centralized monitoring and incident response
- Easier to cross-sell and upsell with feature flags per tenant tier
- Simpler infrastructure to manage than one stack per customer

## Disadvantages
- Tenant isolation bugs are catastrophic — a data leak between tenants is a critical security incident
- "Noisy neighbor" risk: one high-traffic tenant can degrade performance for others
- Schema migrations must be backward compatible and applied carefully across all tenants
- Compliance certifications (SOC 2, HIPAA) require audit controls for cross-tenant data access
- Onboarding and offboarding (data export, deletion) must be tenant-scoped throughout the system

## Complexity
High — tenant context must be threaded through every layer: routing, auth, database queries, background jobs, file storage, caching, and observability.

## Scalability
Scales well horizontally as long as tenant data is properly partitioned. Schema-per-tenant or database-per-tenant models scale more easily but cost more. Shared-schema models are cheaper but require row-level security and careful index design (always include `tenant_id` as the leading column).

## Key Components
- Tenant identifier propagation (JWT claim, subdomain, header) throughout the request lifecycle
- Row-Level Security (RLS) or query middleware to enforce data isolation at the database layer
- Tenant provisioning and onboarding workflow
- Feature flags / plan enforcement per tenant
- Tenant-scoped rate limiting and quota enforcement
- Tenant-aware background job queue (jobs must not leak context across tenants)
- Audit log of cross-tenant administrative actions
- Tenant-scoped observability (logs, metrics labeled with tenant ID)

## Reference Implementations
- [supabase/supabase](https://github.com/supabase/supabase) — uses Postgres RLS for tenant isolation; excellent reference for shared-schema multi-tenancy
- [maybe-finance/maybe](https://github.com/maybe-finance/maybe) — open-source Rails SaaS with multi-tenant patterns
- [calcom/cal.com](https://github.com/calcom/cal.com) — large open-source SaaS with organization-level multi-tenancy on Next.js + Prisma
- [boxyhq/saas-starter-kit](https://github.com/boxyhq/saas-starter-kit) — multi-tenant SaaS with team workspaces, SAML SSO, and audit logs
- [vercel/nextjs-subscription-payments](https://github.com/vercel/nextjs-subscription-payments) — Stripe subscriptions + Supabase multi-tenant reference on Next.js

## Official Sources
- [Postgres Row Level Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) — the primary enforcement mechanism for shared-schema multi-tenancy
- [AWS SaaS Factory Patterns](https://docs.aws.amazon.com/whitepapers/latest/saas-architecture-fundamentals/multi-tenancy-models.html) — AWS-opinionated guide to tenancy models
- [Stripe — Building SaaS products](https://stripe.com/docs/billing/subscriptions/overview) — subscription and entitlement management for SaaS billing

## Related Architectures
- See also: [Modular Monolith](./modular-monolith.md) — a common internal structure for early-stage SaaS backends
- See also: [Microservices](./microservices.md) — large SaaS platforms often decompose into services per product area
- See also: [REST API](../api/rest.md) — the typical interface layer for SaaS products
