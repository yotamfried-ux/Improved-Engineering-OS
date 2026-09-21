# Microservices

## Description
Microservices decompose an application into small, independently deployable services, each owning its data and communicating over the network (HTTP/REST, gRPC, or async messaging). Each service is scoped to a single business capability, can be deployed and scaled independently, and can use the technology stack best suited to its job.

## When to Use
- Multiple autonomous teams need to deploy features independently without blocking each other
- Subsystems have significantly different scaling, reliability, or latency requirements
- Domain boundaries are stable and well-understood — proven first in a modular monolith or through deep domain modeling
- Organization is large enough that the operational overhead (CI/CD per service, observability, service mesh) is justifiable
- Different services genuinely benefit from different technology stacks

## When NOT to Use
- Team is small or the domain is still being explored — the overhead will dominate delivery capacity
- Domain boundaries are fuzzy — wrong cuts create chatty inter-service calls worse than a monolith
- Distributed transactions are frequent — two-phase commit across services is extremely painful
- Operational maturity (Kubernetes, observability tooling, on-call culture) is not yet in place
- The monolith is not yet causing concrete, measurable pain

## Advantages
- True independent deployability: a team can ship on their schedule without coordinating
- Fine-grained scaling: scale only the service that needs it
- Fault isolation: a failing service does not necessarily take down the system
- Technology heterogeneity: choose the right tool per service
- Clear ownership: each team owns a service end-to-end

## Disadvantages
- Distributed systems complexity: network failures, latency, partial failure, eventual consistency
- Operational overhead: each service needs its own pipeline, container, monitoring, and alerting
- Distributed tracing and debugging across service boundaries is significantly harder
- Data consistency across services requires sagas or event-driven patterns instead of ACID transactions
- Service versioning and backward-compatible API contracts become a first-class concern

## Complexity
High — network boundaries, distributed data, independent deployments, and observability infrastructure all add significant operational surface area.

## Scalability
Excellent theoretical ceiling; each service scales independently. In practice, the database per service pattern eliminates the shared DB bottleneck. The constraint shifts to inter-service communication latency and the complexity of managing many data stores.

## Key Components
- Service registry / discovery (Kubernetes DNS, Consul)
- API gateway for external traffic routing and auth
- Per-service database (polyglot persistence)
- Message broker for async communication (Kafka, RabbitMQ, NATS)
- Distributed tracing (OpenTelemetry + Jaeger or Tempo)
- Centralized logging aggregation (Loki, Elasticsearch)
- Service mesh for mTLS and traffic policy (optional but common at scale: Istio, Linkerd)
- Per-service CI/CD pipeline

## Reference Implementations
- [GoogleCloudPlatform/microservices-demo](https://github.com/GoogleCloudPlatform/microservices-demo) — 11-service e-commerce app on Kubernetes; covers gRPC, tracing, and deployment
- [dotnet/eShop](https://github.com/dotnet/eShop) — Microsoft's reference microservices app with .NET, CQRS, event bus
- [open-telemetry/opentelemetry-demo](https://github.com/open-telemetry/opentelemetry-demo) — microservices demo purpose-built to show observability

## Official Sources
- [Martin Fowler — Microservices](https://martinfowler.com/articles/microservices.html) — the defining article
- [Kubernetes documentation](https://kubernetes.io/docs/home/) — the de facto orchestration platform
- [OpenTelemetry docs](https://opentelemetry.io/docs/) — observability instrumentation standard
- [microservices.io](https://microservices.io) — pattern catalog by Chris Richardson covering decomposition, data, and communication patterns

## Related Architectures
- See also: [Modular Monolith](./modular-monolith.md) — the recommended prerequisite before splitting
- See also: [Event-Driven Architecture](../api/event-driven.md) — async communication pattern used between microservices
- See also: [CQRS](../api/cqrs.md) — data access pattern commonly paired with microservices
