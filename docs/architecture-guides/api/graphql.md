# GraphQL API

## Description
GraphQL is a query language and runtime for APIs where the client specifies exactly the data it needs in a single request. A single endpoint accepts typed queries and mutations; the server resolves each field through a resolver function. This eliminates over-fetching and under-fetching and makes the API schema the single source of truth for client-server contracts.

## When to Use
- Frontend clients (web, mobile) need different data shapes for different views and round-trip cost matters
- The data model is graph-like with many relationships that would require multiple REST calls to traverse
- Multiple client types (web app, mobile app, partner portal) consume the same API and have different data needs
- Rapid frontend iteration where adding a new field should not require a backend deploy
- You want a strongly typed schema as a documented, explorable contract

## When NOT to Use
- Simple CRUD APIs where REST maps cleanly and the flexibility of GraphQL adds overhead without value
- Public APIs consumed by unknown third-party developers unfamiliar with GraphQL clients
- File upload or binary transfer is a primary concern (awkward in GraphQL)
- The team is small and the learning curve of schema design, resolvers, and N+1 problems would slow delivery
- Aggressive server-side caching is required — GET-based HTTP cache is not straightforwardly applicable

## Advantages
- Client-driven queries eliminate over-fetching and under-fetching in a single round trip
- Strongly typed schema serves as living documentation and enables tooling (code generation, IDE autocomplete)
- Schema introspection allows clients to discover capabilities without reading docs
- Schema stitching and federation enable composing multiple services behind a single GraphQL gateway
- Deprecation of individual fields without versioning the whole API

## Disadvantages
- N+1 query problem: naive resolver implementations cause one DB query per related object (requires DataLoader or batching)
- Query complexity and depth attacks require explicit rate limiting or query cost analysis
- Caching is harder than REST: POST requests and dynamic queries don't fit standard HTTP cache semantics
- Error handling is non-standard: HTTP 200 with `errors` in the body confuses standard monitoring tools
- Schema design is a significant upfront investment; a poor schema is expensive to migrate

## Complexity
Medium-High — the client query model is simple, but server-side resolver efficiency, schema design, authorization per field, and N+1 mitigation all require careful engineering.

## Scalability
Scales horizontally like REST. The hidden scaling challenge is database load: complex client queries can generate unexpectedly large DB query sets. Query depth limits, complexity budgets, and persisted queries (in production) are standard mitigations.

## Key Components
- Schema Definition Language (SDL) describing types, queries, mutations, subscriptions
- Resolvers mapping schema fields to data sources
- DataLoader for batching and caching per-request to solve N+1
- Query depth and complexity limits (graphql-depth-limit, graphql-query-complexity)
- Authentication middleware (JWT verification before resolver execution)
- Field-level authorization (schema directives or resolver guards)
- Persisted queries for production (improves performance, prevents arbitrary query execution)
- Apollo Studio or GraphiQL for schema exploration and monitoring

## Reference Implementations
- [apollographql/apollo-server](https://github.com/apollographql/apollo-server) — the most widely deployed GraphQL server for Node.js
- [graphql-python/graphene](https://github.com/graphql-python/graphene) — Python GraphQL framework with Django/SQLAlchemy integration
- [chillicream/hotchocolate](https://github.com/ChilliCream/hotchocolate) — .NET GraphQL server with strong typing and federation support
- [graphql/graphql-js](https://github.com/graphql/graphql-js) — the reference implementation of GraphQL in JavaScript

## Official Sources
- [GraphQL specification](https://spec.graphql.org/) — the official language specification
- [Apollo GraphQL documentation](https://www.apollographql.com/docs/) — the most comprehensive practical guide
- [graphql.org/learn](https://graphql.org/learn/) — official introductory documentation
- [Apollo Federation Docs](https://www.apollographql.com/docs/federation/) — schema composition for microservices

## Related Architectures
- See also: [REST API](./rest.md) — simpler alternative for resource-oriented, public APIs
- See also: [gRPC](./grpc.md) — better for internal high-throughput binary service communication
- See also: [CQRS](./cqrs.md) — GraphQL queries and mutations map naturally to CQRS read/write separation
