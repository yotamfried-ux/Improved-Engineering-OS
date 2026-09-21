# gRPC

## Description
gRPC is a high-performance, contract-first RPC framework developed by Google that uses Protocol Buffers (protobuf) as both the interface definition language and the binary serialization format. Services and message types are defined in `.proto` files; client and server code is generated automatically. It runs over HTTP/2, enabling multiplexed streams, bidirectional streaming, and header compression by default.

## When to Use
- Internal service-to-service communication where latency and throughput matter (microservices, backends)
- You need bidirectional streaming or server-push without polling
- Polyglot environments: proto definitions generate type-safe clients in Go, Python, Java, Node.js, C++, Rust, and more from a single source of truth
- The API contract must be strongly typed and backward-compatible (protobuf field numbering enforces this)
- Low-bandwidth environments where binary encoding is significantly more efficient than JSON

## When NOT to Use
- Browser clients are the primary consumer — grpc-web adds a translation proxy and loses some features; REST or GraphQL is simpler
- The team or API consumers are unfamiliar with protobuf toolchain; onboarding cost is real
- Ad-hoc querying or exploration by external developers — protobuf is harder to test with curl than JSON
- Simple CRUD with few endpoints where the proto + codegen setup is disproportionate overhead
- Human-readable wire format is required for debugging or audit logging

## Advantages
- Binary serialization is typically 5–10x smaller and faster to serialize/deserialize than JSON
- HTTP/2 multiplexing eliminates head-of-line blocking and enables concurrent RPC streams on a single connection
- Code generation from proto files ensures client and server are always in sync on type contracts
- Built-in support for four communication patterns: unary, server streaming, client streaming, bidirectional streaming
- Strong backward-compatibility guarantees through proto field numbering rules
- Deadlines and cancellation are first-class concepts propagated across service hops

## Disadvantages
- Not natively supported by browsers without grpc-web and a proxy (Envoy, grpc-gateway)
- Proto files and generated code add a build step and complicate local development vs. plain JSON APIs
- Human inspection of binary payloads requires tooling (grpcurl, Postman gRPC, or reflection)
- Ecosystem maturity varies by language — Node.js and Python lag behind Go and Java
- Schema evolution requires discipline: removing or renumbering fields breaks compatibility silently if not managed

## Complexity
Medium-High — the protobuf toolchain, code generation, and HTTP/2 setup are well-documented but add friction compared to a plain REST server.

## Scalability
Excellent. HTTP/2 multiplexing reduces connection overhead at high concurrency. Binary encoding reduces CPU and bandwidth. Load balancing gRPC correctly requires L7-aware balancers (not TCP) — this is a common misconfiguration in early setups.

## Key Components
- `.proto` files defining service methods and message types
- `protoc` compiler + language-specific plugins for code generation
- gRPC server and generated service stub (server side)
- Generated client stub with deadline and metadata support
- Interceptors (middleware) for auth, logging, tracing, retry
- Health checking protocol (`grpc.health.v1`) for load balancer integration
- Reflection service for tooling (grpcurl, Postman)
- TLS/mTLS for transport security (required in production)

## Reference Implementations
- [grpc/grpc-go](https://github.com/grpc/grpc-go) — the Go implementation; most production-ready and idiomatic
- [grpc/grpc](https://github.com/grpc/grpc) — core C library; underpins Python, C++, Ruby, PHP
- [grpc/grpc/examples](https://github.com/grpc/grpc/tree/master/examples) — official gRPC examples in multiple languages
- [GoogleCloudPlatform/microservices-demo](https://github.com/GoogleCloudPlatform/microservices-demo) — polyglot gRPC in production microservices
- [grpc-ecosystem/grpc-gateway](https://github.com/grpc-ecosystem/grpc-gateway) — generates a REST/JSON reverse proxy from proto annotations

## Official Sources
- [grpc.io documentation](https://grpc.io/docs/) — official guides for all supported languages
- [Protocol Buffers Language Guide](https://protobuf.dev/programming-guides/proto3/) — proto3 syntax and evolution rules
- [gRPC HTTP/2 spec](https://github.com/grpc/grpc/blob/master/doc/PROTOCOL-HTTP2.md) — wire protocol specification
- [gRPC-Web Docs](https://grpc.io/docs/platforms/web/) — gRPC for browser clients

## Related Architectures
- See also: [REST API](./rest.md) — simpler alternative for public or browser-facing APIs
- See also: [GraphQL API](./graphql.md) — better for flexible client-driven queries
- See also: [Event-Driven Architecture](./event-driven.md) — async complement to synchronous gRPC calls
- See also: [Microservices](../web/microservices.md) — gRPC is the dominant internal communication choice in microservice architectures
