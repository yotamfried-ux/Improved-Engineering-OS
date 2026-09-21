# Cal.com

## Overview
Cal.com is an open-source scheduling platform (Calendly alternative) with 35k+ GitHub stars. Provides booking pages, availability management, team scheduling, round-robin assignment, webhooks, and a full REST API v2. Available as self-hosted (Docker/Kubernetes) or Cal.com Cloud. Used as both a standalone scheduling product and as an embeddable scheduling layer within other SaaS products via the Embed SDK. The go-to reference architecture for booking and appointment systems.

## Capabilities
- Individual and team booking pages with customizable booking form questions
- Availability rules — working hours, date overrides, buffer times, and max daily bookings
- Round-robin and collective scheduling for distributing meetings across team members
- Recurring events and multi-duration booking options on a single booking page
- Webhooks for booking lifecycle events: `BOOKING_CREATED`, `BOOKING_CANCELLED`, `BOOKING_RESCHEDULED`
- REST API v2 for programmatic booking creation, slot availability queries, and booking management
- Embed SDK — popup, inline, and floating button embed modes for adding scheduling to any app
- OAuth and API key auth for integrations and white-label deployments
- Video conferencing integration — Zoom, Google Meet, Microsoft Teams, and Cal Video (built-in)
- Payment collection via Stripe before a booking is confirmed
- Multi-timezone support with automatic timezone detection for bookers

## When to Use
- Building a booking or appointment system (healthcare, consulting, sales, demo scheduling, interview scheduling)
- Adding scheduling to a SaaS product without building calendar management, availability logic, and timezone handling from scratch — use the Embed SDK
- Reference architecture for understanding how a production scheduling system handles conflicts, timezones, and calendar integrations
- Self-hosting for full data ownership in compliance-sensitive industries (healthcare HIPAA, legal, finance)

## Limitations
- Self-hosting requires managing a Next.js app + PostgreSQL + Redis + email service (Sendgrid/SMTP); the stack is non-trivial to operate
- Cal.com Cloud free plan has limited team scheduling features and branding
- Embed SDK customization is limited to CSS variables — no full React component control for deep white-labeling
- Complex multi-resource scheduling (e.g., booking a room and a staff member simultaneously) requires custom development on top of the platform
- Self-hosted upgrades require manual migration of the PostgreSQL schema between releases

## Integration Guide
1. For cloud: sign up at https://cal.com; for self-hosting: clone the repo and run `docker compose up`
2. Generate an API key in Cal.com Settings → Developer → API Keys
3. Use the Embed SDK for the simplest integration — include the script tag and call `Cal("init")`
4. For programmatic booking (e.g., internal tooling), use the REST API v2 with the `Authorization: Bearer` header
5. Register a webhook endpoint in Settings → Developer → Webhooks; validate the `X-Cal-Signature` header on every incoming event
6. Use the `organizer.timeZone` field in webhook payloads — never assume UTC for booking times

## Setup
```bash
# Self-hosted via Docker Compose
git clone https://github.com/calcom/cal.com.git
cd cal.com
cp .env.example .env
# Edit .env: DATABASE_URL, NEXTAUTH_SECRET, CALENDSO_ENCRYPTION_KEY, email SMTP settings
docker compose up -d
# Access at http://localhost:3000

# Environment variables for API integration
CAL_API_KEY=cal_live_xxx
```

```html
<!-- Embed SDK — floating button, zero React required -->
<script src="https://cal.com/embed.js"></script>
<script>
  Cal("init", { origin: "https://cal.com" });
  Cal("floatingButton", { calLink: "your-username/30min" });
</script>
```

```typescript
// REST API v2 — query available slots
const slots = await fetch(
  'https://api.cal.com/v2/slots/available?startTime=2025-01-01T00:00:00Z&endTime=2025-01-07T00:00:00Z&eventTypeId=123',
  { headers: { Authorization: `Bearer ${process.env.CAL_API_KEY}` } }
).then(r => r.json());
```

## Pricing Notes
- **Self-hosted:** Free forever — AGPL-3.0 license; all features including team scheduling and API access
- **Cal.com Cloud Free:** Unlimited bookings, 1 connected calendar, basic embedding — no team features
- **Teams:** $12/seat/month — round-robin, collective events, team analytics, and priority support
- **Enterprise:** Custom pricing — white-labeling, SSO, SLA, and dedicated infrastructure
- Self-hosting is zero license cost; operational cost is your own PostgreSQL, Redis, and compute

## Reference Repositories
- [calcom/cal.com](https://github.com/calcom/cal.com) — full platform source code, 35k+ GitHub stars; Next.js, tRPC, Prisma, PostgreSQL
- [calcom/cal.com/packages/embeds](https://github.com/calcom/cal.com/tree/main/packages/embeds) — Cal.com Embed SDK source code and React component wrapper

## Official Documentation
- [Cal.com Self-Hosting Guide](https://cal.com/docs/developing/local-development) — Docker Compose and Kubernetes deployment
- [Cal.com API v2 Reference](https://cal.com/docs/api-reference/v2/introduction) — complete REST API with slot queries, booking management, and event type configuration
- [Cal.com Embed Docs](https://cal.com/docs/embedding-cal/quick-start) — Embed SDK setup for popup, inline, and floating button modes

## Common Pitfalls
- **Always validate the webhook signature** — Cal.com signs every webhook payload with HMAC-SHA256; skip signature verification and a malicious actor can send fake booking events to your backend; validate `X-Cal-Signature` before processing any webhook.
- **`Cal("init")` must precede all other Cal calls** — the Embed SDK loads asynchronously; calling `Cal("floatingButton")` before `Cal("init")` silently fails with no visible error.
- **Redis is not optional in self-hosted production** — Cal.com uses Redis for email job queues and recurring booking state; running without Redis means reminder emails never send and recurring events break silently after the first occurrence.
- **Use API v2, not v1, for all new integrations** — API v1 is legacy and inconsistently documented; v2 has a stable schema, better error messages, and is the only version receiving new endpoints.

## Examples
1. **Embed a booking page in a SaaS onboarding flow:** Add the Embed SDK script → call `Cal("inline", { calLink: "team/demo", elementOrSelector: "#booking-container" })` → the booking UI renders inside your onboarding step without redirecting the user to cal.com.
2. **Automate CRM record creation on booking:** Register a webhook for `BOOKING_CREATED` → validate the signature → extract `attendees[0].email` and `title` → create a HubSpot deal and a Notion page for the booked meeting via their APIs.
3. **Query available slots for a custom UI:** Call `GET /v2/slots/available` with a date range and event type ID → render the returned slots as a custom calendar component in your own design system instead of using the default Cal.com embed UI.
