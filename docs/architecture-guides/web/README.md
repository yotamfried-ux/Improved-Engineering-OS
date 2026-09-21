# Web Architecture Guides

> Navigation index for web application architecture patterns.

## Architectures

| Architecture | Complexity | Scalability | Best For |
|---|---|---|---|
| [Monolith](./monolith.md) | Low | Medium | Small teams, early-stage, fast iteration |
| [Modular Monolith](./modular-monolith.md) | Medium | Medium-High | Growing teams wanting monolith simplicity + modularity |
| [Microservices](./microservices.md) | High | Very High | Large orgs, independent deploy cadences, diverse tech stacks |
| [Serverless](./serverless.md) | Medium | Very High | Event-driven workloads, variable traffic, low ops overhead |
| [Multi-Tenant SaaS](./multi-tenant-saas.md) | High | High | B2B SaaS with org-level isolation, per-tenant billing |

## Decision Guide

```
Is this a new project with < 3 engineers?
  → Monolith or Modular Monolith

Does the product have clear domain boundaries that scale independently?
  → Microservices (only if team size justifies the overhead)

Is the workload event-driven or bursty?
  → Serverless

Is this a B2B product with per-tenant data isolation and billing?
  → Multi-Tenant SaaS (built on any of the above)
```

## Related

- [API Architecture Guides](../api/README.md)
- [templates/web-application](../../../templates/web-application/README.md)
- [templates/saas-platform](../../../templates/saas-platform/README.md)
