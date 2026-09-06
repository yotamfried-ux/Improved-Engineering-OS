## Pattern: Contract Testing

**Problem:** Integration between services breaks silently when a provider changes its API response shape without updating consumers.

**Solution:** Define a consumer-driven contract that describes the subset of the provider's API the consumer depends on; verify the contract against the real provider in CI.

**Implementation Notes:**

- Use Pact (JavaScript/Python/Go/Java) or a compatible library. The consumer publishes a pact file; the provider verifies it.
- Contracts are not schema validators — they capture only what the consumer actually uses. A provider can add fields freely; removing or renaming fields breaks the contract.
- Publish pact files to a Pact Broker so provider teams can run verification without access to consumer code.
- Run consumer tests on every commit; run provider verification on every provider deploy.

**Example:**

```typescript
// Consumer side — defines what it expects from the Orders API
import { PactV3, MatchersV3 } from '@pact-foundation/pact';

const provider = new PactV3({ consumer: 'WebApp', provider: 'OrdersAPI' });

describe('OrdersAPI contract', () => {
  it('returns order summary for a valid order ID', async () => {
    await provider
      .given('order 42 exists')
      .uponReceiving('a request for order 42')
      .withRequest({ method: 'GET', path: '/orders/42' })
      .willRespondWith({
        status: 200,
        body: {
          id: MatchersV3.integer(42),
          status: MatchersV3.string('shipped'),
          total: MatchersV3.decimal(99.99),
        },
      })
      .executeTest(async (mockServer) => {
        const client = new OrdersClient(mockServer.url);
        const order = await client.getOrder(42);
        expect(order.status).toBe('shipped');
      });
  });
});
```

**Common Mistakes:**

- Writing provider-driven contracts (the provider decides what the consumer gets) — this defeats the purpose.
- Including every field in the contract, not just what the consumer uses — makes contracts fragile to innocent provider additions.
- Skipping broker publication and verifying only locally — provider teams cannot know when they break a contract.

**Security Considerations:**

- Pact files may reveal internal API shapes — treat the broker as an internal tool; do not expose it publicly.

**Testing:**
The contract test must fail when you remove a field from a mock response that the consumer accesses. Confirm provider verification fails against a deliberately broken provider response.
