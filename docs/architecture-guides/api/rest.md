# REST API

## Description
REST (Representational State Transfer) is an architectural style for distributed hypermedia systems where resources are identified by URLs, manipulated through a uniform set of HTTP methods (GET, POST, PUT, PATCH, DELETE), and representations are exchanged in a stateless request-response cycle. It is the dominant API style for web services due to its simplicity and alignment with HTTP semantics.

## When to Use
- Public or partner-facing APIs where consumers are unknown and must be able to use standard HTTP clients
- CRUD-heavy domains where resources map cleanly to URLs and HTTP verbs
- Caching at the network layer (CDN, reverse proxy) is valuable for GET-heavy endpoints
- Simple integration with browsers, mobile clients, and third-party tooling without a specialized client
- Long-lived APIs where backward compatibility and versioning must be managed explicitly

## When NOT to Use
- Clients need to fetch complex, nested, or relationship-heavy data that would require many sequential round trips (consider GraphQL)
- Real-time or streaming data is the primary use case (consider WebSockets or SSE)
- High-performance internal service-to-service communication at scale where binary encoding matters (consider gRPC)
- The domain is action-oriented (commands) rather than resource-oriented — REST verbs feel forced

## Advantages
- Universal client support: any HTTP client works without special libraries
- Statelessness enables horizontal scaling with no sticky sessions
- HTTP caching (ETag, Cache-Control) reduces server load for read-heavy APIs
- Mature tooling ecosystem: OpenAPI, Swagger UI, Postman, curl
- Discoverability through self-documenting URL structures
- CDN-friendly: GET responses can be cached at the edge

## Disadvantages
- Over-fetching or under-fetching: responses include more or fewer fields than the client needs
- Multiple round trips for related resources without careful endpoint design
- No strong standard for real-time updates; polling is inefficient
- Versioning (URL path, headers, query params) requires deliberate strategy and discipline
- HTTP/1.1 overhead per request at very high throughput (mitigated by HTTP/2)

## Complexity
Low — the HTTP protocol is universally understood, and the constraints are well-defined.

## Scalability
Scales horizontally with standard load balancing. Stateless request handling means any instance can serve any request. Bottlenecks appear at the database layer, not the API layer, for most workloads.

## Key Components
- Resource-oriented URL design (`/users/{id}/orders/{orderId}`)
- HTTP method semantics (GET=read, POST=create, PUT/PATCH=update, DELETE=remove)
- Status code conventions (200, 201, 204, 400, 401, 403, 404, 409, 422, 500)
- Request/response serialization (JSON is standard; JSON:API or HAL for hypermedia)
- OpenAPI 3.x specification for contract-first design and code generation
- Authentication (Bearer JWT, API keys, OAuth 2.0 scopes)
- Pagination (cursor-based preferred over offset for large datasets)
- Rate limiting and throttling headers (`X-RateLimit-*`, `Retry-After`)

## Reference Implementations
- [gothinkster/realworld](https://github.com/gothinkster/realworld) — same REST API spec implemented in 100+ stacks; ideal for comparing idioms
- [microsoft/api-guidelines](https://github.com/microsoft/api-guidelines) — Microsoft REST API Guidelines (production-grade)
- [github/rest-api-description](https://github.com/github/rest-api-description) — GitHub REST API as a real-world REST reference
- [encode/django-rest-framework](https://github.com/encode/django-rest-framework) — mature, well-documented REST framework for Python
- [fastapi/fastapi](https://github.com/tiangolo/fastapi) — modern Python REST with automatic OpenAPI generation

## Official Sources
- [OpenAPI Specification 3.1](https://spec.openapis.org/oas/v3.1.0) — the authoritative API contract standard
- [RFC 9110 — HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110) — canonical HTTP method and status code definitions
- [Stripe API Reference](https://stripe.com/docs/api) — industry benchmark for well-designed REST API ergonomics
- [Roy Fielding's REST Dissertation](https://ics.uci.edu/~fielding/pubs/dissertation/rest_arch_style.htm) — original REST definition
- [Microsoft REST API Guidelines](https://github.com/microsoft/api-guidelines/blob/vNext/azure/Guidelines.md) — production REST design rules
- [RFC 7231 — HTTP/1.1 Semantics](https://tools.ietf.org/html/rfc7231) — HTTP semantics standard
- [Google API Design Guide](https://cloud.google.com/apis/design) — Google's REST API patterns

## Related Architectures
- See also: [GraphQL API](./graphql.md) — better for flexible querying and relationship-heavy data
- See also: [gRPC](./grpc.md) — better for internal high-performance service-to-service APIs
- See also: [Event-Driven Architecture](./event-driven.md) — complements REST for async operations
