# CQRS (Command Query Responsibility Segregation)

## Description
CQRS separates the model used to mutate state (Commands) from the model used to read state (Queries). Rather than a single model serving both reads and writes, you maintain distinct code paths — and optionally distinct data stores — optimized for each concern. Commands change state and return no data (or only an acknowledgment); Queries return data and change no state.

## When to Use
- Read and write workloads have very different performance, scaling, or complexity requirements
- The read model requires denormalized, pre-aggregated views that would be awkward to derive from the write model in real time
- The system already uses Event Sourcing — CQRS and Event Sourcing are natural companions
- Complex business rules around state transitions benefit from explicit Command objects and handlers
- A high-read, low-write ratio where read replicas or caches can be independently scaled

## When NOT to Use
- Simple CRUD applications where reads and writes are symmetric — CQRS adds indirection without benefit
- Small teams or early-stage products where the consistency of one model outweighs the flexibility of two
- Eventual consistency between the write and read models is unacceptable to the business (e.g., financial ledger where the user must immediately see their updated balance)
- The team is unfamiliar with the pattern — misapplied CQRS creates complexity without the benefits

## Advantages
- Independently optimize read and write paths: normalize writes for integrity, denormalize reads for speed
- Read models can be cached aggressively because they never mutate
- Clear separation of concerns: command handlers enforce business rules; query handlers focus on projections
- Enables multiple read models from the same event stream (reporting view, API view, search index)
- Write side can use strong consistency; read side can use eventual consistency and scale separately
- Commands as first-class objects are auditable and serializable

## Disadvantages
- Eventual consistency between write and read stores is a new failure mode the UI and API must handle
- Two models to maintain: schema changes may require updating both command and query sides
- Debugging requires tracing a command through its handler, event emission, projection update, and query
- Overkill for most applications — the majority of CRUD features do not benefit from the separation
- Read model rebuilds (replaying events to reconstruct a projection) can be slow and operationally complex

## Complexity
High — two models, potential dual data stores, projection infrastructure, and eventual consistency handling. Justified only when the problem explicitly demands it.

## Scalability
Excellent on the read side: query stores can be replicated, cached, or replaced with read-optimized databases (Elasticsearch, Redis, read replicas) independently of the write store. Write throughput scales separately. The projection pipeline (events → read model) becomes the throughput bottleneck at very high event rates.

## Key Components
- Command objects (DTOs representing intent: `PlaceOrderCommand`, `UpdateUserEmailCommand`)
- Command handlers (validate, apply business rules, emit domain events)
- Domain event store (the write side source of truth)
- Event projectors / read model builders (transform events into query-optimized views)
- Query store (separate DB, table, or cache optimized for read patterns)
- Query handlers (fetch directly from the read store — no business logic)
- Synchronization mechanism between write events and read projections (sync inline, async via broker, or rebuild on demand)

## Reference Implementations
- [gregoryyoung/m-r](https://github.com/gregoryyoung/m-r) — Greg Young's original minimal CQRS + Event Sourcing reference in C#
- [kgrzybek/sample-dotnet-core-cqrs-api](https://github.com/kgrzybek/sample-dotnet-core-cqrs-api) — .NET CQRS + MediatR reference implementation
- [dotnet/eShop](https://github.com/dotnet/eShop) — Microsoft's reference app using CQRS with MediatR and multiple read models
- [oskardudycz/EventSourcing.NetCore](https://github.com/oskardudycz/EventSourcing.NetCore) — comprehensive .NET examples of CQRS + Event Sourcing patterns

## Official Sources
- [Martin Fowler — CQRS](https://martinfowler.com/bliki/CQRS.html) — the canonical short introduction; also explains when NOT to use it
- [Microsoft — CQRS pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs) — Azure Architecture Center guide with diagrams and implementation notes
- [Greg Young — CQRS Documents](https://cqrs.files.wordpress.com/2010/11/cqrs_documents.pdf) — original detailed paper from the pattern's originator
- [Event Sourcing Pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing) — often paired with CQRS

## Related Architectures
- See also: [Event-Driven Architecture](./event-driven.md) — CQRS write sides typically emit events that drive projections
- See also: [GraphQL API](./graphql.md) — GraphQL queries and mutations are a natural API surface for CQRS systems
- See also: [Microservices](../web/microservices.md) — CQRS is commonly applied within individual microservices for complex domains
