# Event-Driven Architecture

## Description
Event-Driven Architecture (EDA) structures a system around the production, detection, and consumption of events — immutable records of something that happened. Producers emit events to a broker without knowing who will consume them; consumers subscribe and react independently. This decouples services in time and space, enabling async workflows, audit trails, and reactive processing pipelines.

## When to Use
- Decoupling services that should not block each other (order placed → inventory reserved → email sent)
- Building reliable, retryable workflows where partial failure must not lose work
- High-volume data pipelines where consumers process at their own pace
- Fan-out patterns: one event must trigger multiple independent reactions
- Audit logging and event sourcing, where the history of state changes is as important as current state
- Integrating systems with different availability profiles (one system is occasionally down)

## When NOT to Use
- The calling code needs an immediate, synchronous response to continue (use REST or gRPC)
- The domain is simple with few integrations — a queue adds operational overhead without value
- Event ordering and exactly-once semantics are required but the broker cannot guarantee them
- The team lacks operational experience with message brokers — debugging async failures is significantly harder
- Transactions must span multiple services atomically (EDA favors eventual consistency, not ACID across services)

## Advantages
- Temporal decoupling: producer and consumer do not need to be available simultaneously
- Independent scalability: consumers scale independently based on queue depth
- Natural audit trail: the event log is an immutable history of system activity
- Resilience: events are persisted in the broker; if a consumer crashes, it replays from last offset
- Easy fan-out: add a new consumer without modifying the producer
- Supports event sourcing and CQRS patterns naturally

## Disadvantages
- Eventual consistency: the system may be in an inconsistent state between event emission and consumption
- Debugging distributed async flows requires distributed tracing and correlation IDs
- Idempotency must be implemented by every consumer — duplicate delivery is the norm, not the exception
- Ordering guarantees vary by broker and partition scheme; out-of-order events require careful handling
- Dead-letter queues, poison messages, and replay strategies add operational complexity

## Complexity
Medium-High — the broker setup is manageable, but designing idempotent consumers, handling failures, and reasoning about eventual consistency requires discipline.

## Scalability
Excellent. Kafka partitions enable linear throughput scaling. Consumer groups allow horizontal fan-out. The broker itself becomes the scaling bottleneck only at very high cardinality (millions of topics) — partition-based parallelism handles most real-world volumes.

## Key Components
- Message broker / event streaming platform (Kafka, RabbitMQ, AWS SQS/SNS, NATS, Google Pub/Sub)
- Event schema registry (Confluent Schema Registry, AWS Glue) for schema evolution governance
- Producers with at-least-once delivery guarantees
- Idempotent consumers with deduplication logic
- Dead-letter queue (DLQ) for poison messages
- Correlation IDs and causation IDs in event headers for distributed tracing
- Consumer group offset management (Kafka) or message acknowledgment (AMQP)
- Outbox pattern for transactionally consistent event emission from a database

## Reference Implementations
- [apache/kafka](https://github.com/apache/kafka) — the dominant event streaming platform for high-throughput pipelines
- [confluentinc/examples](https://github.com/confluentinc/examples) — Confluent/Kafka event-driven architecture examples
- [microsoft/eShopOnContainers](https://github.com/dotnet-architecture/eShopOnContainers) — event-driven microservices with event bus
- [cloudevents/spec](https://github.com/cloudevents/spec) — CNCF standard envelope for events; ensures interoperability across brokers
- [ThreeDotsLabs/watermill](https://github.com/ThreeDotsLabs/watermill) — Go library abstracting Kafka, RabbitMQ, SQL, and more behind one interface
- [eventstore/EventStore](https://github.com/EventStore/EventStore) — purpose-built event store for event sourcing

## Official Sources
- [Apache Kafka documentation](https://kafka.apache.org/documentation/) — authoritative guide to the most widely deployed event broker
- [CloudEvents specification](https://cloudevents.io/) — event envelope standard endorsed by CNCF
- [Martin Fowler — Event-Driven Architecture](https://martinfowler.com/articles/201701-event-driven.html) — nuanced taxonomy (event notification vs. event-carried state transfer vs. event sourcing)

## Related Architectures
- See also: [CQRS](./cqrs.md) — naturally pairs with EDA for separating read and write models
- See also: [Microservices](../web/microservices.md) — EDA is the primary async communication pattern between microservices
- See also: [Serverless](../web/serverless.md) — FaaS functions are commonly triggered by events from a broker
