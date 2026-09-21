# Stripe Connector

**Purpose:** Process payments, manage subscriptions, handle billing events, and run marketplace payment splits. The industry standard for developer-friendly payment infrastructure.

## Capabilities
- One-time payments via Payment Intents / Checkout Sessions
- Subscriptions and recurring billing with Billing portal
- Marketplace payments with Connect (splitting revenue between platform and sellers)
- Webhooks for payment events (charge.succeeded, invoice.paid, customer.subscription.*)
- Customer and payment method management
- Refunds, disputes, and fraud prevention (Radar)
- Tax calculation (Stripe Tax)

## Authentication
| Key | Use Case |
|---|---|
| `sk_live_` / `sk_test_` Secret Key | Server-side API calls (never expose client-side) |
| `pk_live_` / `pk_test_` Publishable Key | Client-side Stripe.js / Elements |
| Webhook Signing Secret | Verify webhook payloads |

## Common Workflows
1. **SaaS subscription**: Create customer → attach payment method → create subscription → handle `invoice.payment_failed` webhook
2. **One-time purchase**: Checkout Session → redirect to success URL → fulfill on `checkout.session.completed`
3. **Marketplace payout**: Create Connect account for seller → PaymentIntent with `transfer_data` → Stripe splits automatically
4. **Customer billing portal**: `stripe.billingPortal.sessions.create()` → redirect → customer self-manages subscription

## Official MCP Server
[stripe/agent-toolkit](https://github.com/stripe/agent-toolkit) — Stripe's official AI agent toolkit with MCP support

## SDK / Client Libraries
- [stripe/stripe-node](https://github.com/stripe/stripe-node) — official Node.js SDK
- [stripe/stripe-python](https://github.com/stripe/stripe-python) — official Python SDK

## Official Docs
- [Stripe Docs](https://stripe.com/docs) — complete documentation
- [Stripe Webhooks](https://stripe.com/docs/webhooks) — event handling guide

## Limitations
- Test vs live keys must be consistent (don't mix environments)
- Webhooks must be verified using the signing secret — never trust unverified payloads
- Disputes freeze funds immediately — implement Radar rules for fraud prevention
