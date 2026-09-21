# Amplitude

## Overview
Amplitude is a product analytics platform designed for enterprise digital products, strongest in behavioral cohort analysis, user journey mapping, and data governance. Widely used by Atlassian, Dropbox, and Twitter. Differentiates from Mixpanel with SQL-native access (Amplitude SQL), predictive analytics (propensity to convert), and deeper B2B account-level analytics. Also offers session replay and feature flags as add-ons.

## Capabilities
- Event-based analytics with custom event and user properties
- Behavioral cohort analysis — users who did X then Y within a time window
- User journey visualization (Journeys) — see every path between two product moments
- Funnel and retention analysis with breakdown by user segment or property
- Revenue analytics — LTV, ARPU, and subscription MRR tracking
- A/B test analysis — slice experiment results by any behavioral cohort
- Session replay as a paid add-on for visual context alongside quantitative charts
- Feature flags and experiments via Amplitude Experiment (integrated with analytics)
- SQL access via Amplitude SQL / Snowflake export for raw event data queries
- Data Catalog for taxonomy governance — owners, descriptions, event schema enforcement
- Team dashboards with drag-and-drop chart layout and scheduled Slack digests
- SDKs for browser, iOS, Android, React Native, Node.js, Python, Go, and Java

## When to Use
- B2B SaaS or complex multi-step products with deep funnel analysis needs across long time horizons
- Enterprise teams that need data governance, taxonomy enforcement, and Data Catalog ownership
- When you need SQL access to raw event data alongside the point-and-click analytics UI
- Products using Amplitude Experiment for feature flag management and analytics in a single platform
- Organizations requiring predictive propensity scoring (convert, churn, purchase) from behavioral data

## Limitations
- More expensive than Mixpanel at scale — pricing based on Monthly Tracked Users can spike with anonymous traffic
- Session replay is a paid add-on, not included in base plans
- Free tier is limited to 10M events/month with a 1-year data history cap
- Amplitude SQL requires a separate data connection setup (Snowflake or Amplitude-managed warehouse)
- Steeper initial setup for taxonomy governance versus out-of-the-box Mixpanel simplicity

## Integration Guide
1. Sign up at https://amplitude.com and create a project; note your API key
2. Install the SDK: `npm install @amplitude/analytics-browser` (browser) or `pip install amplitude-analytics` (Python)
3. Call `amplitude.init()` with your API key before any other calls
4. Call `amplitude.setUserId()` immediately after user authentication — events before this attribute to an anonymous ID
5. Set user properties with `amplitude.setUserProperties()` to enable segmentation by plan, company, or role
6. Track key events with `amplitude.track()` — define a minimal taxonomy before shipping to prevent schema drift

## Setup
```bash
# Browser / Next.js
npm install @amplitude/analytics-browser

# Python (server-side)
pip install amplitude-analytics

# Environment variables
NEXT_PUBLIC_AMPLITUDE_KEY=your_api_key
AMPLITUDE_API_KEY=your_api_key  # server-side
```

```typescript
import * as amplitude from '@amplitude/analytics-browser';

amplitude.init(process.env.NEXT_PUBLIC_AMPLITUDE_KEY!);
amplitude.setUserId('user_123');
amplitude.setUserProperties({ plan: 'pro', company: 'Acme' });
amplitude.track('Button Clicked', { button_name: 'sign_up', page: '/landing' });
```

## Pricing Notes
- **Free:** 10M events/month, 1-year data history, unlimited seats
- **Growth:** $49/month base — unlimited data history, cohort exports, behavioral targeting
- **Enterprise:** Custom pricing — includes Amplitude SQL, SSO/SCIM, Data Catalog, and dedicated support
- Monthly Tracked User pricing counts every unique user who sends at least one event per month; anonymous pre-login traffic inflates MTU count — initialize the SDK with `defaultTracking: false` and instrument only post-login events to control costs

## Reference Repositories
- [amplitude/Amplitude-TypeScript](https://github.com/amplitude/Amplitude-TypeScript) — official JavaScript/TypeScript SDK for browser and Node.js
- [amplitude/Amplitude-Python](https://github.com/amplitude/Amplitude-Python) — Python server-side SDK for backend event ingestion

## Official Documentation
- [Amplitude Developer Docs](https://www.docs.developers.amplitude.com) — SDK reference, API endpoints, and data pipeline guides
- [Amplitude Analytics Help](https://help.amplitude.com/hc/en-us/categories/5078631395227-Analytics) — product analytics setup, charts, and cohort guide
- [Amplitude Data Catalog](https://help.amplitude.com/hc/en-us/categories/5078631395227) — taxonomy governance and schema enforcement

## Common Pitfalls
- **Call `setUserId()` immediately after authentication** — events sent before this call are attributed to an anonymous device ID that Amplitude will not automatically merge with the identified user; always call `setUserId()` in the login success handler and `amplitude.reset()` on logout.
- **Use `identify()` for user properties, not event properties** — attaching plan or role as event properties instead of user properties means you cannot segment retained cohorts by those attributes retroactively.
- **Schema drift causes "event not found" in dashboards** — define a naming convention and event taxonomy in Data Catalog before instrumenting; undisciplined event naming (e.g., `ButtonClick` vs `button_clicked` vs `button_click`) fragments analysis across chart types.
- **Amplitude Experiment requires analytics SDK initialization** — the Experiment SDK piggybacks on the Analytics SDK for exposure tracking; initializing them out of order drops experiment impressions.

## Examples
1. **B2B account journey analysis:** Instrument `trial_started` → `feature_activated` → `invite_sent` → `upgrade_completed` → build a Journeys chart → identify the longest time-gap step → filter to accounts stuck at that step → export cohort for CS outreach.
2. **Predictive churn intervention:** Enable Amplitude's Predictions model for "likely to churn" → build a behavioral cohort of users with high churn propensity → trigger an in-app nudge via Braze or Intercom targeted at that cohort before day 14.
3. **Taxonomy governance with Data Catalog:** Assign event owners in Data Catalog → mark deprecated event names as "Unexpected" → use schema validation in CI to block new events not in the approved taxonomy before they reach production.
