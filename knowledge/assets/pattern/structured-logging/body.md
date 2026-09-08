## Pattern: Structured Logging

**Problem:** Free-form log strings require fragile regex parsing to extract fields, making log queries slow and inconsistent across services.

**Solution:** Emit logs as JSON objects with a fixed set of mandatory fields on every line: `timestamp`, `severity`, `service`, `trace_id`, `user_id`, and `message`. Consumers (log aggregators, dashboards) can then filter and correlate without parsing.

**Implementation Notes:**
- Never interpolate variables directly into the message string; put them in dedicated fields so they are indexable.
- Propagate `trace_id` from the incoming request context; generate one at the entry point if absent.
- Use standard severity levels (`DEBUG`, `INFO`, `WARN`, `ERROR`) and never invent custom levels.
- Redact secrets and PII before logging — scrub authorization headers, passwords, and SSNs at the logger level.

**Example:**
```typescript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  formatters: {
    level: (label) => ({ severity: label.toUpperCase() }),
  },
  base: { service: process.env.SERVICE_NAME ?? 'unknown' },
});

// Bind request-scoped fields once; reuse the child logger throughout the request
export function createRequestLogger(traceId: string, userId?: string) {
  return logger.child({ trace_id: traceId, user_id: userId ?? 'anonymous' });
}

// Usage inside a route handler:
// req.log.info({ order_id: order.id, amount_cents: order.total }, 'order.created');
// → {"severity":"INFO","service":"billing","trace_id":"abc","user_id":"u1","order_id":42,"amount_cents":1999,"msg":"order.created"}
```

**Common Mistakes:**
- Logging inside tight loops — use sampling or aggregate counters instead.
- Emitting different field names for the same concept across services (`userId` vs `user_id` vs `uid`).
- Logging sensitive values such as tokens, passwords, or full request bodies without scrubbing.

**Security Considerations:**
- Treat log output as a potential data leak vector; enforce a scrubber middleware that strips known sensitive field names.
- Restrict log access to appropriate roles — logs often contain internal IDs, email addresses, and behavioral data.

**Testing:**
Capture logger output in tests (redirect to a string buffer) and assert the emitted JSON contains the required fields. Assert that a request containing an `Authorization` header does not appear in the log output.

**Registry:** see [`patterns/registry.yaml`](../registry.yaml) for canonical status, score, and usage.
