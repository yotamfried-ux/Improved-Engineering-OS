# API Architecture Guides

> Navigation index for API design and integration architecture patterns.

## Architectures

| Architecture | Coupling | Best For |
|---|---|---|
| [REST](./rest.md) | Loose | CRUD-heavy resources, public APIs, broad client compatibility |
| [GraphQL](./graphql.md) | Loose | Complex data graphs, frontend-driven queries, rapid product iteration |
| [gRPC](./grpc.md) | Tight | High-performance internal services, streaming, polyglot microservices |
| [Event-Driven](./event-driven.md) | Very Loose | Async workflows, decoupled services, audit logs, real-time pipelines |
| [CQRS](./cqrs.md) | Medium | High read/write asymmetry, complex domain logic, event sourcing |

## Decision Guide

```
Is this a public-facing API consumed by mobile/web?
  → REST (safe default) or GraphQL (if frontend has complex query needs)

Is this internal service-to-service communication?
  → gRPC (performance) or REST (simplicity)

Does the system need async processing or service decoupling?
  → Event-Driven (Kafka, SQS, Pub/Sub)

Is read performance critical and write logic complex?
  → CQRS (often paired with Event-Driven)
```

## Related

- [Web Architecture Guides](../web/README.md)
- [patterns/api](../../../patterns/api/README.md)
- [templates/api-service](../../../templates/api-service/README.md)
