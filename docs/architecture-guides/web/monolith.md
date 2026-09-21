# Traditional Monolith

## Description
A monolith is a single deployable unit where all application logic — UI, business rules, and data access — is bundled and deployed together. Every feature lives in the same process and shares a single database. It is the simplest architectural starting point and the right default for most new projects.

## When to Use
- Starting a new product and the domain is not yet fully understood
- Team is small (1–5 engineers) and the overhead of distributed systems would slow delivery
- Rapid iteration and short feedback loops matter more than long-term scale concerns
- Operational simplicity is a priority (one thing to deploy, monitor, and roll back)
- The problem domain is narrow enough that a single deployment boundary makes sense

## When NOT to Use
- Different subsystems have radically different scaling requirements (e.g., a CPU-heavy batch job alongside a low-latency API)
- Multiple autonomous teams need to deploy independently without coordinating releases
- The codebase already has thousands of files with tangled cross-module dependencies and no clear internal structure
- Regulatory or security requirements mandate hard isolation between data domains

## Advantages
- Simplest possible developer experience — clone, run, done
- No network hops between components; in-process calls are fast and debuggable
- Single deployment pipeline and a single observability target
- Transactions are easy: one database, standard ACID guarantees
- No service discovery, no API versioning contracts between internal components
- Easiest to refactor early when requirements are still fluid

## Disadvantages
- One component's memory leak or CPU spike can take down the whole app
- Deployment of any change requires redeploying the whole system
- Technology lock-in: hard to introduce a different language or runtime for a specific concern
- As the team grows, merge conflicts and coupling tend to increase without strong discipline
- Long-running tasks (e.g., report generation) can block request threads unless carefully managed

## Complexity
Low — one codebase, one database, one deployment unit.

## Scalability
Scales vertically (bigger machines) and horizontally (multiple identical instances behind a load balancer) until a single bottleneck dominates — typically the database or a CPU-heavy path. Most products never hit the ceiling before team/domain complexity forces a split.

## Key Components
- Single application process (web server + business logic + background jobs)
- One relational database (shared schema)
- Optional job queue within the same process (e.g., Sidekiq, Celery, BullMQ)
- Single deployment artifact (container image, JAR, binary)
- Reverse proxy / load balancer in front

## Reference Implementations
- [basecamp/the-one-person-framework](https://github.com/basecamp/omakase) — Rails-idiomatic monolith conventions from Basecamp
- [gothinkster/realworld](https://github.com/gothinkster/realworld) — reference app implemented as a monolith in many languages; good baseline
- [django/django](https://github.com/django/django) — the framework itself demonstrates monolith-first design philosophy
- [rails/rails](https://github.com/rails/rails) — Ruby on Rails: convention-over-configuration monolith framework

## Official Sources
- [Martin Fowler — Monolith First](https://martinfowler.com/bliki/MonolithFirst.html) — argues why starting with a monolith is almost always right
- [Ruby on Rails Guides](https://guides.rubyonrails.org/) — the canonical opinionated monolith framework guide
- [Django documentation](https://docs.djangoproject.com/en/stable/) — batteries-included monolith conventions

## Related Architectures
- See also: [Modular Monolith](./modular-monolith.md) — the natural next step when a traditional monolith grows too coupled
- See also: [Microservices](./microservices.md) — the split-out alternative once domain boundaries are proven
