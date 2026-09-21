# Mixpanel

## Overview
Mixpanel is a product analytics platform focused on event-based tracking of user behavior. Its core strength is funnel analysis, retention cohorts, and user flow visualization — understanding where users drop off, what drives them to convert, and who retains versus churns. Used by Uber, Twitter, Airbnb, and thousands of SaaS companies. Offers client-side and server-side SDKs, real-time event ingestion, and a SQL-like query language (JQL) for custom analysis. Best suited for understanding conversion funnels, activation metrics, and long-term retention curves.

## Capabilities
- Event-based analytics with custom event properties and user profile attributes
- Funnel analysis — define conversion steps, see drop-off rates, and filter by user cohort or property
- Retention cohort analysis — track what percentage of users return on day 1, day 7, day 30 by cohort
- User flow and Sankey diagrams — visualize the actual paths users take between any two events
- A/B test result analysis by cohort — slice experiment results by any user property
- Real-time event stream for live debugging of instrumentation
- User profiles with arbitrary properties for segmentation (plan, company, country, etc.)
- Group analytics for B2B: track behavior at the account/company level, not just individual users
- Data exports via API, S3 pipeline, or Mixpanel Warehouse Connectors
- SQL-like JQL (JavaScript Query Language) for custom metric queries beyond the built-in reports
- Slack and email automated reports on a schedule

## When to Use
- B2C products focused on activation and retention where understanding drop-off in user flows is the primary analytical need (gaming, consumer apps, marketplaces, on-demand services)
- Teams that need strong funnel visualization and cohort retention as their primary analytics primitives
- B2B SaaS needing account-level (group) analytics to track feature adoption and engagement per customer account
- When real-time event queries are needed without building and maintaining a data warehouse pipeline
- As a complement to a data warehouse for exploratory product analytics that would require complex SQL queries

## Limitations
- Pricing scales with Monthly Tracked Users (MTUs) and can become expensive at scale for consumer apps with large free-user bases
- All user event data is stored on Mixpanel's servers (EU data residency is available on Enterprise tier only) — not suitable for strict data sovereignty requirements without the Enterprise plan
- No session recording — pair with FullStory or PostHog session replay for visual context on drop-offs
- Weaker than Amplitude for complex multi-step B2B journey analytics across long time horizons; Amplitude's Data tables and advanced SQL access are more flexible
- JQL is powerful but requires JavaScript knowledge — non-technical stakeholders are limited to the built-in report builder

## Integration Guide
1. Sign up at https://mixpanel.com and create a project; note your Project Token
2. Install the SDK: `npm install mixpanel-browser` (browser) or `pip install mixpanel` (Python/backend)
3. Initialize with your project token and call `mixpanel.identify()` after user login
4. Track key events with `mixpanel.track()` — start with a minimal tracking plan (signup, onboarding steps, core action, conversion)
5. Set user properties with `mixpanel.people.set()` to enable cohort segmentation
6. For B2B apps, call `mixpanel.set_group()` to associate events with an account

## Setup
```bash
# Browser
npm install mixpanel-browser

# Node.js (server-side)
npm install mixpanel

# Python
pip install mixpanel

# Environment variables
NEXT_PUBLIC_MIXPANEL_TOKEN=your_project_token
MIXPANEL_TOKEN=your_project_token  # server-side
```

```typescript
// Browser (TypeScript)
import mixpanel from 'mixpanel-browser';

mixpanel.init(process.env.NEXT_PUBLIC_MIXPANEL_TOKEN!, { debug: false });
mixpanel.identify(user.id);
mixpanel.people.set({ $email: user.email, plan: user.plan });
mixpanel.track('checkout_completed', { revenue: 49, plan: 'pro', currency: 'USD' });

// Node.js (server-side)
import Mixpanel from 'mixpanel';
const mp = Mixpanel.init(process.env.MIXPANEL_TOKEN!);
mp.track('server_event', { distinct_id: userId, source: 'api' });
```

## Pricing Notes
- **Free:** 20,000,000 events/month — generous limit that covers most early-stage products; 90-day data history
- **Growth:** $28/month base + MTU-based pricing; unlimited data history, cohort exports, and group analytics
- **Enterprise:** Custom pricing — adds EU data residency, SSO, SCIM, Data Pipelines, and dedicated support
- Watch for: MTU pricing counts each unique user ID that sends at least one event per month; anonymous users who never log in still count as MTUs in browser SDK — use `mixpanel.init()` with `track_anonymous_users: false` to exclude pre-login traffic from MTU count if budget is a concern

## Reference Repositories
- [mixpanel/mixpanel-js](https://github.com/mixpanel/mixpanel-js) — official browser JavaScript SDK with TypeScript types
- [mixpanel/mixpanel-python](https://github.com/mixpanel/mixpanel-python) — official Python SDK for server-side event tracking and people profiles

## Official Documentation
- [Mixpanel Docs](https://docs.mixpanel.com) — complete guides for SDKs, reports, cohorts, and data governance
- [Tracking Plan Guide](https://docs.mixpanel.com/docs/data-structure/events-and-properties) — defining events and properties for consistent instrumentation
- [Group Analytics](https://docs.mixpanel.com/docs/data-structure/group-analytics) — B2B account-level tracking setup

## Common Pitfalls
- **`identify()` must be called after login, not on page load** — calling `identify()` with a user ID before the user logs in merges anonymous and identified profiles incorrectly; always call it in the login success handler and call `mixpanel.reset()` on logout.
- **Super properties persist across sessions** — `mixpanel.register()` sets properties that attach to every subsequent event including future sessions; audit registered super properties regularly to avoid stale data contaminating event schemas.
- **Track the action, not the page** — events like `page_viewed` are low signal; instrument specific user intent events (`feature_used`, `checkout_started`) that directly map to product questions you want to answer.
- **Server-side and client-side events can double-count** — if both browser and backend track the same action (e.g., `purchase_completed`), funnels will show inflated counts; decide per-event which side owns it and instrument only there.

## Examples
1. **Onboarding funnel analysis:** Instrument `signup_completed` → `profile_setup` → `first_project_created` → `invite_sent` → build a funnel in Mixpanel → identify the step with the highest drop-off → filter that step's users to a cohort → analyze their shared properties (country, plan type, referral source) to form a hypothesis for improvement.
2. **Retention cohort by acquisition channel:** Set `acquisition_source` as a user property at signup → build a retention curve in Mixpanel segmented by `acquisition_source` → discover that SEO users retain at day-30 at 2× the rate of paid users → reallocate marketing budget based on LTV data.
3. **B2B account health:** Call `mixpanel.set_group('company', account.id)` on every event → build a Group Profile report → filter to accounts that have not triggered `core_feature_used` in the last 14 days → export the list to CRM for CS outreach before the renewal date.
