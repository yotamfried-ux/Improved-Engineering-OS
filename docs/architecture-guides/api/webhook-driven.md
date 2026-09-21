# Webhook-Driven Architecture

## Description
Webhook-Driven Architecture inverts the typical request-response model: instead of the client polling for changes, the server pushes an HTTP POST to a client-registered URL when a relevant event occurs. The receiver is a publicly accessible endpoint that the sender calls automatically. This pattern is the standard integration primitive for SaaS platforms (Stripe, GitHub, Twilio, Shopify) and eliminates polling overhead while enabling near-real-time event delivery between systems.

## When to Use
- A third-party system (payment provider, CI platform, communication API) needs to notify your system of async events (payment succeeded, build completed, message received)
- You are building a platform and want to expose an integration surface to customers without requiring them to poll your API
- Event frequency is low enough that a persistent connection (WebSocket) is overkill — occasional async events are sufficient
- The receiver is an independent system behind its own firewall that cannot maintain a long-lived outbound connection

## When NOT to Use
- Sub-second latency is required — webhook delivery adds at least one HTTP round-trip plus retry delays
- The receiver is not publicly addressable (local development, private networks) without a tunnel (use polling or a queue instead)
- The event volume is extremely high — firing one HTTP POST per event at scale becomes its own DDoS; use a streaming broker instead
- You need guaranteed exactly-once delivery with strong ordering — webhooks provide at-least-once with best-effort ordering at best

## Advantages
- No polling: the receiver is notified immediately when an event occurs, eliminating wasted requests
- Loose coupling: sender and receiver are independent systems connected only by an HTTP contract
- Easy to expose as a platform feature: customers register their own URLs; no broker or SDK required on their side
- Works across organizational and network boundaries — any publicly reachable HTTPS endpoint qualifies
- Simple to implement on the sender side: a POST request after an internal domain event

## Disadvantages
- Delivery is not guaranteed without retry logic: transient receiver downtime causes missed events
- Idempotency is required on the receiver side — at-least-once delivery means duplicate POSTs are expected
- Signature verification must be implemented or spoofing is trivial (any party can POST to your endpoint)
- No built-in backpressure: a slow or unavailable receiver silently drops events if retries are exhausted
- Debugging is asymmetric — the sender has the delivery logs; the receiver has the processing logs; correlating them requires shared IDs
- Fan-out to many subscribers requires the sender to manage a delivery queue per subscriber URL

## Complexity
Medium — a basic webhook sender and receiver is a few dozen lines. The complexity lies in retry logic with exponential backoff, HMAC signature verification, idempotency key storage, and handling dead deliveries gracefully.

## Scalability
Webhook delivery scales by parallelizing outbound HTTP workers, not by adding brokers. At high subscriber counts (thousands of URLs), the delivery queue becomes a bottleneck and a dedicated webhook delivery service (or managed provider like Svix or Hookdeck) is warranted. The receiver endpoint scales like any other HTTP service — horizontally behind a load balancer.

## Key Components
- Webhook registration endpoint: allows subscribers to register, update, and delete their callback URLs and event subscriptions
- Event dispatcher: listens to internal domain events and enqueues outbound delivery jobs per subscriber
- Delivery worker: HTTP POST to subscriber URL with retry logic (exponential backoff, jitter, max attempts)
- HMAC signature: sender signs the payload with a shared secret (`X-Webhook-Signature` header); receiver verifies before processing
- Idempotency key: unique event ID included in each payload so receivers can deduplicate replayed deliveries
- Dead-letter store: events that exhausted retries are recorded for manual inspection or replay
- Delivery log: per-event record of attempt timestamps, HTTP status codes, and response bodies for debugging

## Reference Implementations
- [standard-webhooks/standard-webhooks](https://github.com/standard-webhooks/standard-webhooks) — open standard for webhook signatures and payload shape; SDKs in 10+ languages
- [svix/svix-webhooks](https://github.com/svix/svix-webhooks) — open-source webhook delivery service with retry, signing, and a developer portal
- [hookdeck/hookdeck](https://github.com/hookdeck/hookdeck) — webhook gateway for receiving, routing, filtering, and replaying inbound webhooks
- [stripe-samples/stripe-webhooks](https://github.com/stripe-samples/stripe-webhooks) — Stripe's official webhook verification and idempotency examples in multiple languages
- [stripe/stripe-node/examples](https://github.com/stripe/stripe-node/blob/master/examples/webhook-signing.js) — Stripe webhook signature verification

## Official Sources
- [Stripe Webhooks documentation](https://stripe.com/docs/webhooks) — the gold standard for production webhook design; covers signing, retries, idempotency, and testing
- [GitHub Webhooks documentation](https://docs.github.com/en/webhooks) — comprehensive reference for event types, payload schemas, and HMAC-SHA256 verification
- [Standard Webhooks specification](https://www.standardwebhooks.com/) — emerging interoperability standard for webhook signatures and delivery semantics
- [Svix Docs](https://docs.svix.com) — webhook delivery as a service

## Related Architectures
- See also: [Event-Driven Architecture (API layer)](./event-driven.md) — internal async event bus; webhooks are the external-facing projection of the same domain events
- See also: [Event-Driven Web Architecture](../web/event-driven.md) — browser-facing equivalent using WebSockets/SSE instead of server-to-server HTTP push
- See also: [REST](./rest.md) — webhooks are triggered by REST actions and are themselves plain HTTPS POST calls
