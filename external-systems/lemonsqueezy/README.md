# Lemon Squeezy

## Overview
Lemon Squeezy is a Merchant of Record (MoR) payment and subscription platform built specifically for indie developers and SaaS founders. It handles global tax compliance (VAT, GST, sales tax) automatically, so sellers are never the tax collector — Lemon Squeezy is. Acquired by Stripe in 2024 but continues to operate as its own product.

## Capabilities
- One-time payments, subscriptions, and usage-based billing
- Built-in global tax handling: Lemon Squeezy collects and remits VAT/GST/sales tax in 30+ countries as the Merchant of Record
- Discount codes, volume licensing, and bundle pricing
- License key generation and validation for software products
- Customer portal for self-service subscription management (upgrade, downgrade, cancel, update payment)
- Webhook events for every billing lifecycle event (order, subscription, license)
- Embeddable checkout overlay (`LemonSqueezy.Overlay`) or hosted checkout pages — no redirect required
- Affiliate/referral tracking via LemonSqueezy Affiliates
- Multi-currency pricing with automatic localization

## When to Use
- Solo dev or small team selling a SaaS/digital product and want to avoid tax compliance complexity
- Selling to EU customers where VAT registration and remittance would otherwise be required
- Building a license-key–based software product (desktop app, VS Code extension, npm package)
- Want a simpler alternative to Stripe + tax middleware (e.g., Stripe Tax + Avalara)

## Limitations
- Higher effective fees than raw Stripe (~5% + $0.50 per transaction) — the tax-handling convenience has a cost
- Less mature ecosystem than Stripe; fewer third-party integrations and less documentation
- No native support for in-person payments or card terminals
- Subscription metering/usage-based billing is less flexible than Stripe's
- Customer portal and checkout UI are not as customizable as Stripe Elements

## Integration Guide
1. Create a store at https://app.lemonsqueezy.com and add a product (one-time or subscription)
2. Generate an API key in Settings → API and store it as `LEMONSQUEEZY_API_KEY`
3. Install the SDK: `npm install @lemonsqueezy/lemonsqueezy.js`
4. Initialize and create a checkout session server-side, passing the `variantId` (the specific product variant to sell)
5. Redirect to the checkout URL or open it in the Lemon Squeezy overlay
6. Set up a webhook endpoint to receive `order_created`, `subscription_created`, `subscription_updated`, and `license_key_created` events
7. Verify webhook signatures using the `X-Signature` header and your webhook secret

```javascript
import { lemonSqueezySetup, createCheckout } from "@lemonsqueezy/lemonsqueezy.js";

lemonSqueezySetup({ apiKey: process.env.LEMONSQUEEZY_API_KEY });

const { data } = await createCheckout(storeId, variantId, {
  checkoutData: { email: "user@example.com" },
});
// data.attributes.url → redirect user here
```

## Setup
```bash
# Install the official JS/TS SDK
npm install @lemonsqueezy/lemonsqueezy.js

# Python (unofficial but widely used)
pip install lemonsqueezy

# Set environment variables
export LEMONSQUEEZY_API_KEY=your_api_key
export LEMONSQUEEZY_WEBHOOK_SECRET=your_webhook_secret
export LEMONSQUEEZY_STORE_ID=your_store_id
```

## Pricing Notes
- **Transaction fee:** ~5% + $0.50 per transaction (exact rate shown in onboarding; no monthly fee)
- **No monthly platform fee** on the standard plan
- **Payout:** Funds paid out monthly (or more frequently at volume) after Lemon Squeezy deducts tax remittances and fees
- Watch for: the effective rate is higher than Stripe because it includes Merchant of Record tax handling — factor this into pricing
- No charge for refunds, but chargebacks incur a $15 dispute fee

## Reference Repositories
- [lmsqueezy/lemonsqueezy.js](https://github.com/lmsqueezy/lemonsqueezy.js) — official JavaScript/TypeScript SDK with full type definitions
- [lmsqueezy/nextjs-billing](https://github.com/lmsqueezy/nextjs-billing) — Next.js SaaS billing starter with subscriptions and customer portal

## Official Documentation
- [Lemon Squeezy Docs](https://docs.lemonsqueezy.com) — full API reference and product guides
- [Webhooks](https://docs.lemonsqueezy.com/help/webhooks) — event reference and signature verification
- [Checkout API](https://docs.lemonsqueezy.com/api/checkouts) — creating and customizing checkout sessions
- [License Keys](https://docs.lemonsqueezy.com/help/selling/license-keys) — software licensing workflow

## Common Pitfalls
- **Always verify webhook signatures** — do not process `order_created` events without checking the `X-Signature` header; replay attacks are easy to execute against unverified endpoints.
- **Variant IDs, not product IDs** — the checkout API takes a `variantId`, not a product ID; a product can have multiple variants (monthly vs. annual, different tiers), so map carefully in your database.
- **Refund policy is Lemon Squeezy's call** — as MoR, Lemon Squeezy can issue refunds to comply with consumer protection law regardless of your own policy; build your fulfillment system to handle `order_refunded` events.
- **Test in sandbox before going live** — Lemon Squeezy provides a test mode with test card numbers; always run a full checkout and webhook flow in test mode before switching to production keys.

## Examples
1. **SaaS subscription:** Create a monthly subscription variant in the dashboard → server generates a checkout URL with the user's email pre-filled → after `subscription_created` webhook, provision access and store `lemon_squeezy_subscription_id` in your database → handle `subscription_cancelled` to revoke access.
2. **One-time software license:** Product configured with license key generation → customer pays → `license_key_created` webhook fires → store the key → customer activates via your app calling the Lemon Squeezy License Activation API to validate and consume an activation slot.
3. **Embedded overlay checkout:** Add `<script src="https://app.lemonsqueezy.com/js/lemon.js">` to your page → call `LemonSqueezy.Url.Open(checkoutUrl)` on button click → checkout opens in an overlay without leaving the page, improving conversion.
