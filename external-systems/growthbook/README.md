# GrowthBook

## Overview
GrowthBook is an open-source feature flagging and A/B testing platform. Self-host for free or use GrowthBook Cloud. Supports gradual feature rollouts, multivariate A/B tests, and statistical experiment analysis with Bayesian or Frequentist engines. SDKs are available for JavaScript, React, Python, Go, Ruby, PHP, and more. A key differentiator is that GrowthBook connects to your own data warehouse (BigQuery, Redshift, Snowflake, Postgres) for experiment analysis — no user event data leaves your infrastructure. This makes it the preferred choice for teams with data sovereignty or compliance requirements.

## Capabilities
- Feature flags with targeting rules: user attributes, percentage rollouts, environment separation (dev/staging/prod)
- A/B and multivariate experiments with Bayesian or Frequentist statistical significance engines
- Feature flag overrides for QA and manual testing without touching production flags
- Visual editor for no-code experiments (CSS/text changes without deploying code)
- Statistical analysis dashboard connected to your own data warehouse — GrowthBook does not collect your event data
- Slack and email notifications for experiment results and significance thresholds
- REST API for server-side flag evaluation and flag management
- Edge flag evaluation at CDN level (Cloudflare Workers, Fastly) for zero-latency flag reads
- SDKs for 10+ languages and platforms including iOS, Android, React Native

## When to Use
- Product teams wanting A/B testing without sending user data to a third-party SaaS platform
- Open-source-first or compliance-driven companies (SOC 2, HIPAA, GDPR) that require data residency
- Teams with an existing data warehouse who want to run experiments against their own analytics pipeline
- Gradual feature rollouts with percentage targeting and instant kill-switch capability
- Replacing LaunchDarkly or Optimizely to reduce cost while retaining A/B testing capability

## Limitations
- Self-hosted deployment requires maintaining a MongoDB database and a Node.js application — non-trivial ops overhead for small teams
- Smaller community and ecosystem compared to LaunchDarkly; fewer third-party integrations
- A/B test analysis requires manually connecting a data warehouse — there is no built-in automatic event collection like Amplitude or Mixpanel; you must instrument events yourself and pipe them to a warehouse
- Visual editor is less polished than Optimizely's — better suited for simple text/copy experiments than complex layout changes

## Integration Guide
1. Sign up at https://app.growthbook.io or deploy self-hosted via Docker: `docker pull growthbook/growthbook`
2. Create a project and note your SDK Connection client key
3. Install the SDK: `npm install @growthbook/growthbook-react` (React) or `npm install @growthbook/growthbook` (vanilla JS)
4. Initialize the GrowthBook instance with your client key and user attributes
5. Use `useFeatureIsOn()` hook (React) or `gb.isOn()` (vanilla) to gate features
6. Connect your data warehouse in the GrowthBook dashboard under Data Sources to enable experiment analysis

## Setup
```bash
# React / Next.js
npm install @growthbook/growthbook-react

# Vanilla JS / Node
npm install @growthbook/growthbook

# Self-hosted (Docker)
docker pull growthbook/growthbook && docker run -p 3100:3100 growthbook/growthbook

# Environment variables
NEXT_PUBLIC_GROWTHBOOK_KEY=sdk-your_client_key
```

```typescript
import { GrowthBook, GrowthBookProvider, useFeatureIsOn } from '@growthbook/growthbook-react';

const gb = new GrowthBook({
  apiHost: 'https://cdn.growthbook.io',
  clientKey: process.env.NEXT_PUBLIC_GROWTHBOOK_KEY,
});

// Wrap your app
<GrowthBookProvider growthbook={gb}>
  <App />
</GrowthBookProvider>

// In any component
const isNewDashboard = useFeatureIsOn('new-dashboard');
```

## Pricing Notes
- **Open-source (self-hosted):** Free forever; no seat limits, no feature limits — pay only for your hosting infrastructure
- **Cloud Free:** 3 seats, unlimited feature flags, unlimited experiments, community support
- **Cloud Pro:** $20/seat/month — adds SSO, advanced permissions, priority support, and higher API rate limits
- Watch for: self-hosted MongoDB must be sized appropriately for your flag volume; the all-in-one Docker image is suitable for low-volume setups only

## Reference Repositories
- [growthbook/growthbook](https://github.com/growthbook/growthbook) — core platform source (50k+ GitHub stars); Python/Django backend and React frontend
- [growthbook/growthbook-sdk-javascript](https://github.com/growthbook/growthbook-sdk-javascript) — JavaScript and React SDK with TypeScript types

## Official Documentation
- [GrowthBook Docs](https://docs.growthbook.io) — complete platform guide including self-hosting, data sources, and experiment setup
- [GrowthBook React SDK](https://docs.growthbook.io/lib/react) — hooks, context provider, and SSR patterns for Next.js
- [Feature Flags Guide](https://docs.growthbook.io/features/basics) — targeting rules, environments, and overrides

## Common Pitfalls
- **Client key vs. secret key:** The client key (`sdk-xxx`) is public and safe for browser use; the secret key is for server-side SDK calls and admin API access — never expose the secret key in client-side code.
- **Streaming vs. polling:** By default, the SDK polls for flag updates every 60 seconds; enable streaming mode for real-time flag propagation in long-lived server processes.
- **Data source connection is required for experiment analysis:** Defining an experiment in GrowthBook does not automatically collect metric data — you must send events to your warehouse and configure the data source connection before significance results appear in the dashboard.
- **Self-hosted MongoDB backup:** GrowthBook stores all flag and experiment configuration in MongoDB; without a backup strategy, a DB failure loses all configuration — set up automated backups before going to production.

## Examples
1. **Gradual feature rollout:** Create a boolean flag `new-checkout` → set rollout to 5% of users → deploy code behind `if (gb.isOn('new-checkout'))` → monitor error rates in Datadog → increment rollout to 25%, 50%, 100% — flag archived after full rollout.
2. **A/B test on pricing page:** Create an experiment with two variations of the pricing page copy → connect BigQuery data source → instrument `purchase_completed` events sent to BigQuery → GrowthBook computes Bayesian significance against a revenue-per-visitor metric → winning variation shipped after p(best) > 95%.
3. **Kill switch for broken feature:** New feature flag deployed to 100% of users → bug reported in production → flag turned off in GrowthBook dashboard → all users immediately fall back to old behavior without a code deploy.
