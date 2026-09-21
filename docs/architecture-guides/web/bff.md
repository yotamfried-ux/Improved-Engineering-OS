# Backend for Frontend (BFF)

## Description
The Backend for Frontend (BFF) pattern introduces a dedicated server-side layer for each distinct client type — typically one BFF for the web app, one for mobile, and one for third-party API consumers. Each BFF aggregates calls to shared downstream microservices, transforms the response into a shape optimized for its specific client, and handles client-specific auth concerns. This eliminates the "one generic API serves all" problem where every client is forced to over-fetch, under-fetch, or reshape data on the device.

## When to Use
- Multiple client types (web, iOS/Android, partner API) have meaningfully different data-shape, performance, or auth requirements
- Clients currently over-fetch because a shared API is designed for the most demanding consumer
- Mobile clients need aggregated, pre-composed responses to minimize round trips over high-latency connections
- Auth flows differ per client (web uses sessions/cookies; mobile uses JWT; partners use API keys with rate-limit tiers)
- Frontend teams want autonomy to evolve their own API contract without coordinating with every other consumer

## When NOT to Use
- There is only one client type — a BFF adds an extra network hop with no benefit
- The team is small and cannot afford to maintain multiple server processes
- The downstream services are already a single monolith with a well-shaped API — adding a BFF is pure overhead
- The main need is API versioning, not client-specific shaping — versioning in the upstream API is simpler

## Advantages
- Client-optimized payloads: each BFF returns exactly what its client needs, reducing over-fetching
- Independent deployability: the web BFF and mobile BFF can evolve and deploy on separate schedules
- Encapsulates client-specific auth: session management, token refresh, and device-specific flows stay in the BFF
- Simplifies the downstream services: they expose generic capabilities; the BFF handles composition
- Frontend teams own their BFF end-to-end, reducing cross-team coordination

## Disadvantages
- Code duplication risk: common logic (auth middleware, error formatting, logging) can drift across BFFs if not extracted into shared libraries
- Operational overhead: one more service per client type to deploy, monitor, and scale
- Potential for business logic leakage into the BFF — aggregation logic can become a shadow service layer
- Adds a network hop: every client request passes through an extra layer; latency budget must account for it
- Requires disciplined team ownership — a BFF with no clear owner becomes a dump for miscellaneous logic

## Complexity
Medium — each individual BFF is straightforward (thin aggregation layer). The complexity lies in maintaining consistency of shared concerns (auth, logging, error shapes) across multiple BFFs and avoiding logic drift.

## Scalability
Each BFF scales independently based on its client's traffic profile. A mobile BFF serving millions of app users scales differently from a partner API BFF with controlled traffic. The downstream microservices remain the shared scalability concern and are unaffected by the number of BFFs in front of them.

## Key Components
- One BFF service per client type (web, mobile, 3rd-party)
- Aggregation layer: fans out to multiple downstream services and composes a single response
- Client-specific auth adapter (cookie/session for web, JWT for mobile, API key + rate limit for partners)
- Response transformer: maps generic downstream shapes to client-optimized DTOs
- Shared internal library for cross-cutting concerns (logging, tracing, error normalization)
- API gateway upstream of all BFFs for TLS termination, routing, and DDoS protection
- Circuit breaker / timeout per downstream dependency to prevent cascading failures

## Reference Implementations
- [nickmackenzie/bff-example](https://github.com/nickmackenzie/bff-example) — minimal Node.js BFF demonstrating aggregation and transformation for web vs. mobile clients
- [dotnet/eShop](https://github.com/dotnet/eShop) — Microsoft's reference e-commerce app implements a BFF for its web client alongside microservices
- [ThoughtWorks/bff-examples](https://github.com/ThoughtWorks/bff-examples) — collection of BFF examples in multiple languages from the pattern's originators

## Official Sources
- [Sam Newman — Backends for Frontends](https://samnewman.io/patterns/architectural/bff/) — original pattern write-up by the author; authoritative definition and rationale
- [Martin Fowler — BFF pattern](https://martinfowler.com/articles/micro-frontends.html) — covered in the context of micro-frontends; explains client-ownership model
- [Microsoft Azure Architecture — BFF pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/backends-for-frontends) — production-grade guidance with diagrams and considerations
- [Netflix Tech Blog — API Gateway](https://netflixtechblog.com/tagged/api) — Netflix's experience with per-client BFF layers and API aggregation at scale

## Related Architectures
- See also: [Microservices](./microservices.md) — BFF is the standard API entry point pattern when downstream services are microservices
- See also: [Multi-Tenant SaaS](./multi-tenant-saas.md) — BFF can enforce tenant isolation and per-tenant auth at the edge
- See also: [REST](../api/rest.md) — the BFF typically exposes a REST or GraphQL interface to its specific client
- See also: [GraphQL](../api/graphql.md) — GraphQL-based BFF (schema-stitching or federation) is a common alternative to per-client REST BFFs
