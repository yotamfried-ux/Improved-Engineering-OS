# Inngest

## Overview
Inngest is a developer platform for background jobs, scheduled functions, and durable workflows in modern SaaS applications. Functions run as serverless HTTP endpoints — no separate queue infrastructure, no Redis, no worker processes to manage. You write functions in TypeScript or Python, deploy them alongside your app, and Inngest handles event routing, retries, delays, fan-out, and step-level durability. The SDK integrates natively with Next.js API routes, Express, FastAPI, and any HTTP server. The key differentiator: zero infrastructure setup — works out of the box on Vercel, Railway, Render, and Fly.io.

## Capabilities
- Event-driven background functions triggered by named events sent from anywhere in your app
- Scheduled cron jobs with standard cron syntax — no separate scheduler infrastructure
- Durable multi-step workflows using `step.run()`, `step.sleep()`, and `step.waitForEvent()` — each step is checkpointed so failures resume from the last completed step, not from scratch
- Automatic retries with configurable backoff; failed steps do not re-run successful ones
- Flow control: throttle, debounce, rate limiting, and concurrency limits per function
- Inngest Dev Server for local development — a local UI to inspect events, function runs, step outputs, and replay failures
- TypeScript-first SDK with full type inference from event payloads
- Python SDK for Django/FastAPI/Flask apps
- Supports Next.js, Express, Hono, Remix, SvelteKit, and more via serve adapters

## When to Use
- SaaS apps on Vercel, Railway, or Render that need background jobs without managing Redis/BullMQ infrastructure
- Durable workflows where steps must survive function timeouts — e.g., send an onboarding email 3 days after signup only if the user hasn't completed setup
- Fan-out patterns: one inbound event spawns multiple parallel functions (e.g., new order triggers inventory update, email, and analytics functions simultaneously)
- Serverless background processing where a traditional worker process is not viable
- Replacing brittle cron jobs with observable, retryable, and inspectable scheduled functions

## Limitations
- Production requires Inngest Cloud (managed) or self-hosted Inngest (more complex to operate); adds an external dependency on a critical infrastructure path
- Cold start latency applies if the host function hasn't been invoked recently on serverless platforms
- Not designed for extreme high-throughput workloads (tens of millions of jobs/day) — BullMQ with Redis or Kafka is more appropriate at that scale
- `step.sleep()` durations are limited by Inngest Cloud plan; very long sleeps (weeks/months) require testing on the correct tier

## Integration Guide
1. Sign up at https://www.inngest.com and create an event key and signing key
2. Install the SDK: `npm install inngest`
3. Create an Inngest client and define functions (see example below)
4. Add a serve route at `/api/inngest` to expose functions to Inngest Cloud
5. Run the Inngest Dev Server locally: `npx inngest-cli@latest dev`
6. Send events from anywhere in your app using `inngest.send()`

## Setup
```bash
npm install inngest

# Environment variables
INNGEST_EVENT_KEY=your_event_key
INNGEST_SIGNING_KEY=your_signing_key
```

```typescript
import { inngest } from './client';

// Define a durable background function
export const sendWelcomeEmail = inngest.createFunction(
  { id: 'send-welcome-email' },
  { event: 'user/signed-up' },
  async ({ event, step }) => {
    await step.sleep('wait-a-moment', '1s');
    await step.run('send-email', async () => {
      await resend.emails.send({ to: event.data.email, subject: 'Welcome!' });
    });
  }
);

// Trigger from anywhere in your app
await inngest.send({ name: 'user/signed-up', data: { email: 'user@example.com' } });
```

## Pricing Notes
- **Free:** 50,000 function runs/month, 3-day log history — sufficient for early-stage products
- **Team:** $75/month for 1,000,000 function runs/month; 7-day log history
- **Pro/Enterprise:** Volume pricing above 1M runs/month; longer log retention and priority support
- Watch for: each `step.run()` call counts as a separate function run against your quota; complex multi-step workflows consume quota faster than single-step functions

## Reference Repositories
- [inngest/inngest-js](https://github.com/inngest/inngest-js) — official TypeScript/JavaScript SDK with serve adapters for all major frameworks
- [inngest/inngest-py](https://github.com/inngest/inngest-py) — official Python SDK for Django, FastAPI, and Flask
- [inngest/inngest-js examples](https://github.com/inngest/inngest-js/tree/main/examples) — example apps for Next.js, Express, Hono, and more

## Official Documentation
- [Inngest Docs](https://www.inngest.com/docs) — complete guide to functions, events, steps, and deployment
- [Background Jobs Guide](https://www.inngest.com/docs/guides/background-jobs) — patterns for durable workflows and step functions
- [Inngest Dev Server](https://www.inngest.com/docs/local-development) — local development and event replay guide

## Common Pitfalls
- **Functions must be served via HTTP** — Inngest calls your function via HTTP when an event fires; your app must be publicly accessible in production (Inngest Cloud) or use the dev server tunnel locally.
- **`step.run()` callbacks must be deterministic** — Inngest replays the function from the start on resume; code outside `step.run()` runs on every replay, so do not perform side effects (DB writes, API calls) outside of step boundaries.
- **Event payloads are limited in size** — keep event data small (IDs and metadata only); fetch full records inside `step.run()` rather than embedding large objects in the event payload.
- **Local dev requires the Inngest Dev Server** — without `npx inngest-cli dev` running, events sent locally are dropped silently; always start the dev server before testing background functions.

## Examples
1. **User onboarding drip:** `user/signed-up` event triggers a function → `step.sleep('3 days')` → `step.run` checks if onboarding is complete → if not, sends a follow-up email → another `step.sleep('4 days')` → final check and optional churn-risk alert to Slack.
2. **Order processing fan-out:** `order/created` event → three parallel functions triggered: one updates inventory, one sends confirmation email, one fires an analytics event — all independently retryable, all visible in the Inngest dashboard.
3. **Scheduled report:** `inngest.createFunction({ id: 'weekly-report' }, { cron: '0 9 * * MON' }, ...)` → every Monday at 09:00 UTC, query DB for weekly metrics → send summary email to team → no cron infrastructure required beyond the Inngest serve route.
