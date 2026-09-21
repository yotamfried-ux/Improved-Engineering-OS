# Modular Monolith

## Description
A modular monolith is a single deployable unit deliberately partitioned into cohesive, loosely-coupled modules along domain boundaries. Modules communicate through explicit public interfaces rather than direct cross-module imports; the database may be shared but schemas are namespace-separated per module. It captures most of the operational simplicity of a traditional monolith while preserving the option to extract services later.

## When to Use
- The codebase has outgrown a flat structure and cross-module coupling is slowing the team down
- You want clear domain ownership without the operational overhead of microservices
- 5–20 engineers sharing a single repository and needing deploy independence is not yet critical
- You plan to potentially extract microservices later and want clean boundaries first
- Domain boundaries are understood but not yet proven stable enough to split across network lines

## When NOT to Use
- Different modules have wildly different scaling requirements that cannot be satisfied by identical instances
- Teams are so large and autonomous that independent deployment pipelines are more valuable than shared deployability
- The domain is simple enough that internal structure overhead adds no value (use a traditional monolith instead)
- Module boundaries keep changing — imposing rigid structure too early creates churn

## Advantages
- Enforced module boundaries prevent accidental coupling better than code review alone
- Refactoring is safer: a module's internals can change without breaking others
- Single deployment pipeline; no distributed tracing or service mesh required
- Cross-module transactions remain straightforward (one database, one transaction scope)
- Path to microservices is shorter: extract a module's public interface to a service when the time comes
- Developers can run the entire system locally without orchestrating multiple services

## Disadvantages
- Requires upfront discipline to define and enforce module boundaries (linting rules, package access controls)
- Shared database can become a bottleneck; schema migrations must be coordinated across modules
- No true independent deployability — one broken module blocks the release of all others
- Boundary violations tend to creep back without automated enforcement (e.g., ArchUnit, dependency-cruiser)

## Complexity
Medium — one deployment, but enforced internal structure that needs tooling and discipline to maintain.

## Scalability
Same horizontal/vertical scaling profile as a traditional monolith. Module isolation pays off when you need to extract a high-traffic module into its own service — the interface contract is already defined.

## Key Components
- Domain modules with explicit public API surfaces (index files, package-level exports)
- Module-private directories/packages inaccessible from other modules
- Shared kernel for cross-cutting concerns (auth, logging, error types)
- Per-module database schema namespace or schema prefix
- Boundary enforcement tool (dependency-cruiser, ArchUnit, Pyflakes import rules)
- Single deployment artifact

## Reference Implementations
- [hnasr/javascript-backend](https://github.com/hnasr/javascript-backend) — Node.js modular monolith walkthrough with enforced module boundaries
- [kgrzybek/modular-monolith-with-ddd](https://github.com/kgrzybek/modular-monolith-with-ddd) — C#/.NET reference implementation with DDD and explicit module contracts
- [spree/spree](https://github.com/spree/spree) — Rails e-commerce platform with engine-based modularization

## Official Sources
- [Martin Fowler — Modular Monolith](https://martinfowler.com/bliki/MonolithFirst.html) — foundational rationale
- [Kamil Grzybek — Modular Monolith: A Primer](https://www.kamilgrzybek.com/blog/posts/modular-monolith-primer) — definitive article on modular monolith design
- [Sam Newman — Monolith to Microservices](https://samnewman.io/books/monolith-to-microservices/) — covers modular monolith as a migration step
- [dependency-cruiser docs](https://github.com/sverweij/dependency-cruiser#readme) — enforcing import rules in JS/TS monorepos

## Related Architectures
- See also: [Traditional Monolith](./monolith.md) — the starting point before imposing module structure
- See also: [Microservices](./microservices.md) — the next step after module boundaries are proven stable
