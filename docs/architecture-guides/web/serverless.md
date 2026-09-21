# Serverless / Functions-as-a-Service

## Description
Serverless (FaaS) executes discrete units of code — functions — in response to events, with the cloud provider managing all infrastructure provisioning, scaling, and capacity. You pay per invocation and execution duration rather than for always-on instances. Cold starts, statelessness, and execution time limits are the core operational constraints.

## When to Use
- Workloads are event-driven, bursty, or unpredictable (webhooks, file processing, scheduled jobs)
- You want zero infrastructure management and elastic scale to zero
- Background tasks or integrations that run infrequently but must scale to handle spikes
- Startup or prototype where operational cost per idle time matters a lot
- Edge compute use cases (low-latency response close to user, e.g., Cloudflare Workers)

## When NOT to Use
- Workloads are long-running (beyond 15-minute function limits) or require persistent in-memory state
- Cold-start latency is unacceptable for the use case (user-facing APIs with strict p99 SLAs)
- Heavy inter-function communication — chatty function calls become expensive and add latency
- Local development and testing cycle is a bottleneck (emulation is imperfect and slow)
- Total invocation volume is high enough that reserved instances are cheaper

## Advantages
- No servers to provision, patch, or resize — zero operational overhead for infrastructure
- Automatic scaling from zero to thousands of concurrent executions
- Pay-per-use billing: idle capacity costs nothing
- Encourages small, focused, single-responsibility units of code
- Built-in high availability across availability zones in all major providers

## Disadvantages
- Cold start latency (100ms–2s) for infrequently invoked functions in some runtimes
- Hard execution duration limits (AWS Lambda: 15 min; Cloudflare Workers: 30s CPU)
- Stateless by design — external state stores (Redis, DynamoDB) are required for persistence
- Debugging and local emulation are significantly worse than a local server
- Vendor lock-in is real: function signatures, triggers, and bindings differ across providers

## Complexity
Medium — infrastructure is managed, but distributed state, cold starts, and event-driven wiring introduce conceptual complexity.

## Scalability
Near-unlimited horizontal scale managed by the provider. The bottleneck shifts to downstream dependencies (databases, external APIs) that cannot scale as elastically. Connection pool exhaustion on RDS is a classic failure mode when Lambda scales to thousands of concurrent executions.

## Key Components
- Function runtime (Node.js, Python, Go, Java, etc.)
- Event sources / triggers (HTTP gateway, S3, SQS, EventBridge, cron)
- API Gateway or HTTP endpoint mapping
- Managed state store (DynamoDB, Redis, S3, Aurora Serverless)
- IAM roles and least-privilege execution policies
- Infrastructure-as-code (AWS SAM, SST, Serverless Framework, Terraform)

## Reference Implementations
- [serverless/examples](https://github.com/serverless/examples) — official Serverless Framework examples across AWS, GCP, Azure
- [sst/sst](https://github.com/sst/sst) — modern full-stack serverless framework with local dev and type-safe infra
- [cloudflare/workers-sdk](https://github.com/cloudflare/workers-sdk) — Cloudflare Workers toolchain; excellent for edge use cases
- [aws-powertools/powertools-lambda-python](https://github.com/aws-powertools/powertools-lambda-python) — AWS Lambda best practices toolkit: structured logging, tracing, idempotency, and more

## Official Sources
- [AWS Lambda documentation](https://docs.aws.amazon.com/lambda/latest/dg/welcome.html) — authoritative Lambda reference
- [Cloudflare Workers docs](https://developers.cloudflare.com/workers/) — edge serverless with V8 isolates
- [SST documentation](https://sst.dev/docs/) — developer-friendly full-stack serverless on AWS
- [Vercel Functions Docs](https://vercel.com/docs/functions) — edge and serverless functions with zero-config deployment
- [Martin Fowler — Serverless Architectures](https://martinfowler.com/articles/serverless.html) — comprehensive overview of trade-offs, cold starts, and when to use FaaS

## Related Architectures
- See also: [Event-Driven Architecture](../api/event-driven.md) — serverless functions are a natural consumer of event streams
- See also: [Microservices](./microservices.md) — serverless can implement individual microservice responsibilities
- See also: [Multi-Tenant SaaS](./multi-tenant-saas.md) — serverless is a common compute choice in SaaS platforms
