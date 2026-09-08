## Pattern: Regression Test on Every Bug

**Problem:** Bugs that are fixed without a test tend to reappear — either because the root cause recurs or because a future refactor reintroduces the same mistake.

**Solution:** Before fixing any bug, write a test that reproduces the failure. The test must be red before the fix and green after. Ship the test alongside the fix.

**Implementation Notes:**
- The test description must include the issue/ticket reference so future developers can trace back to the original report.
- Write the test at the lowest level that can reproduce the bug: prefer a unit test if the logic is isolated, integration if it requires the DB or a network call.
- If the bug required a specific sequence of states to reproduce, encode that sequence in the test's Arrange phase.
- After the fix, run the full suite to ensure the new test does not expose hidden regressions elsewhere.

**Example:**
```typescript
// Bug: negative quantities were accepted in cart — ticket #CART-88
describe("Cart.addItem — regression #CART-88", () => {
  it("rejects items with quantity less than 1", () => {
    const cart = new Cart();
    expect(() => cart.addItem({ productId: "p1", quantity: -1 })).toThrow(
      "Quantity must be at least 1"
    );
    expect(() => cart.addItem({ productId: "p1", quantity: 0 })).toThrow(
      "Quantity must be at least 1"
    );
  });

  it("accepts items with quantity of 1 or more", () => {
    const cart = new Cart();
    expect(() => cart.addItem({ productId: "p1", quantity: 1 })).not.toThrow();
  });
});
```

**Common Mistakes:**
- Writing the test after the fix — you cannot confirm it would have caught the original bug.
- Writing a test that passes against the broken code (the test is testing the wrong thing).
- Using a test that is too high-level (e.g., full E2E) for a bug that could be reproduced at the unit level — slows the suite unnecessarily.

**Security Considerations:**
- Security bugs (injection, auth bypass) must get a regression test that proves the exploit path is closed, in addition to any broader audit.

**Testing:**
Check out the commit just before the fix and run only the new regression test — it must fail. Then check out the fix commit and verify it passes.
