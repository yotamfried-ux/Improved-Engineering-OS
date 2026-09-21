# Event-Driven Web Architecture

## Description
Event-Driven Web Architecture describes how the frontend layer subscribes to and reacts to server-emitted domain events in real time. The server pushes events over persistent connections (WebSockets or Server-Sent Events), and the UI updates reactively without polling. This is a web-layer concern distinct from the API-layer Event-Driven Architecture — the focus here is the client transport and state-update lifecycle, not the backend broker topology.

## When to Use
- The UI must reflect state changes that originate on the server (notifications, live feeds, collaboration cursors)
- Multiple browser tabs or devices must stay in sync without page refresh
- Latency of round-trip polling is unacceptable for the UX (chat, live auctions, stock tickers, dashboards)
- Backend already emits domain events — the web layer subscribes to those same events rather than polling REST endpoints

## When NOT to Use
- The UI only needs data on explicit user action — a standard REST fetch is simpler and sufficient
- Server push infrastructure (WebSocket gateway, SSE endpoint) adds cost that the use case does not justify
- The client is behind restrictive proxies or firewalls that strip long-lived connections (use polling or HTTP/2 push instead)
- Real-time volume is low enough that a 5-second poll is indistinguishable to the user

## Advantages
- Sub-second UI updates without client-initiated polling
- Reduced unnecessary HTTP traffic — events are pushed only when state changes
- Natural fit for collaborative or multi-session features (one user's action reflects instantly for all)
- Decouples backend from frontend update cadence — server emits once, N clients receive

## Disadvantages
- Long-lived connections consume server resources (file descriptors, memory per connection)
- Reconnection logic, missed-event recovery, and sequence numbering must be handled explicitly
- Horizontal scaling requires sticky sessions or a shared pub/sub layer (Redis Pub/Sub, Kafka consumer)
- Browser support and proxy behavior differ between WebSockets and SSE; SSE is more firewall-friendly but unidirectional
- State reconciliation on reconnect is non-trivial — clients may have missed events during the gap

## Complexity
Medium — SSE is straightforward to implement; WebSockets add bidirectionality complexity. The hard part is reconnection, missed-event replay, and scaling the connection layer horizontally.

## Scalability
Connection count is the primary constraint. A single Node.js or Go server handles tens of thousands of WebSocket connections; beyond that, a connection gateway (socket.io with Redis adapter, Ably, Pusher) fans out to many nodes. The backend event source (Kafka, Redis Streams) scales independently of the connection layer.

## Key Components
- Persistent connection transport: WebSockets (bidirectional) or Server-Sent Events (server → client only)
- Server-side event emitter tied to domain event bus (Kafka consumer, Redis Pub/Sub subscriber)
- Client-side event dispatcher (event emitter or state-management store integration)
- Reconnection manager with exponential backoff and last-event-id tracking (SSE built-in; manual for WebSockets)
- Sequence / cursor tracking so clients can request missed events on reconnect
- Connection gateway for horizontal scaling (Redis adapter, dedicated WebSocket service)
- Authentication on upgrade handshake (JWT in header or cookie; query-param token for SSE)

## Reference Implementations
- [socketio/socket.io](https://github.com/socketio/socket.io) — battle-tested WebSocket library with rooms, namespaces, and Redis adapter for multi-node scaling
- [EventSource API (MDN)](https://github.com/whatwg/html) — SSE is part of the HTML living standard; trivial to consume natively in browsers
- [supabase/realtime](https://github.com/supabase/realtime) — Elixir WebSocket server that broadcasts Postgres changes to clients; good reference for DB-to-client event pipeline
- [posthog/posthog](https://github.com/PostHog/posthog) — open-source product analytics that uses SSE for live event streaming to the dashboard
- [dotnet-architecture/eShopOnContainers](https://github.com/dotnet-architecture/eShopOnContainers) — event-driven microservices reference with event bus integration and pub/sub patterns

## Official Sources
- [MDN — Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events) — authoritative browser API reference with reconnection and last-event-id semantics
- [MDN — WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket) — full browser WebSocket interface documentation
- [WHATWG HTML Living Standard — EventSource](https://html.spec.whatwg.org/multipage/server-sent-events.html) — the canonical SSE specification
- [Martin Fowler — Event-Driven Architecture](https://martinfowler.com/articles/201701-event-driven.html) — taxonomy of event notification, event-carried state transfer, and event sourcing
- [Kafka Documentation](https://kafka.apache.org/documentation/) — distributed event streaming platform underpinning most backend event buses

## Related Architectures
- See also: [Event-Driven Architecture (API layer)](../api/event-driven.md) — backend broker pattern that produces the events this layer consumes
- See also: [Webhook-Driven Architecture](../api/webhook-driven.md) — server-to-server push; analogous concern at the API boundary
- See also: [Microservices](./microservices.md) — event gateway is often a dedicated microservice in larger systems
