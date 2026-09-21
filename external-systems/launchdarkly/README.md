# LaunchDarkly

## Overview
LaunchDarkly is the industry-leading enterprise feature flag platform. Used by Atlassian, IBM, Intuit, Atlassian, and thousands of other companies. Provides real-time flag updates via streaming (sub-100ms propagation), user and organization targeting, approval workflows, audit logs, SSO/SAML, and RBAC. The de-facto standard for enterprise feature management with the most complete SDK coverage of any flag platform — 50+ SDKs spanning web, mobile, server-side, edge, and IoT. When compliance, auditability, and reliability at scale are non-negotiable requirements, LaunchDarkly is the benchmark choice.

## Capabilities
- Feature flags with real-time streaming updates — changes propagate to all SDKs in under 100ms without polling
- Percentage rollouts and user targeting by any attribute (plan, region, account ID, custom attributes)
- Multi-variate flags — flags can return strings, numbers, JSON objects, or booleans, not just on/off
- A/B testing experiments with statistical significance tracking and guardrail metrics
- Approval workflows — require a second team member to approve flag changes before they take effect
- Full audit log of every flag change with who made it, when, and what changed
- SSO/SAML and SCIM for enterprise identity management and user provisioning
- RBAC with fine-grained permissions per project, environment, and flag
- Data export to your data warehouse (BigQuery, Kinesis, mParticle) for experiment analysis
- SDKs for 50+ platforms: JavaScript, React, Node, iOS, Android, React Native, Go, Python, Ruby, Java, .NET, C/C++, Rust, Cloudflare Workers, Vercel Edge, and more

## When to Use
- Enterprise teams requiring audit trails and approval workflows for flag changes in regulated industries (finance, healthcare)
- High-traffic production systems where real-time flag propagation without polling latency is critical
- Organizations requiring SSO, SCIM, and compliance certifications (SOC 2 Type II, FedRAMP)
- Large engineering organizations needing RBAC to prevent junior engineers from accidentally modifying production flags
- Teams running large-scale A/B experiments that require statistical significance tracking with guardrail metrics

## Limitations
- Most expensive option in the feature flagging category: $10–25/seat/month plus Monthly Active User (MAU) pricing for client-side SDKs — costs scale quickly for consumer apps with large user bases
- Vendor lock-in: flag configuration and targeting rules are stored in LaunchDarkly's proprietary format with no open-source migration path
- Overkill for small teams or early-stage startups — GrowthBook or PostHog feature flags provide 80% of the value at a fraction of the cost
- Free tier is extremely limited: 1 project, capped MAUs, no experimentation — not viable for anything beyond initial evaluation

## Integration Guide
1. Sign up at https://launchdarkly.com and create a project and environment
2. Copy the SDK key for your environment (client-side key for browser, SDK key for server-side)
3. Install the SDK for your platform (see Setup below)
4. Initialize the client with the SDK key and a user context
5. Evaluate flags using `variation()` (server-side) or `useVariation()` / `useLDClient()` hooks (React)
6. Configure approval workflows and RBAC in the LaunchDarkly dashboard before onboarding your team

## Setup
```bash
# React
npm install launchdarkly-react-client-sdk

# Node.js (server-side)
npm install @launchdarkly/node-server-sdk

# Environment variables
LAUNCHDARKLY_SDK_KEY=sdk-your-server-sdk-key
NEXT_PUBLIC_LAUNCHDARKLY_CLIENT_KEY=your-client-side-key
```

```typescript
// React
import { withLDProvider, useFlags } from 'launchdarkly-react-client-sdk';

const App = () => {
  const { 'new-dashboard': isNewDashboard } = useFlags();
  return isNewDashboard ? <NewDashboard /> : <OldDashboard />;
};

export default withLDProvider({
  clientSideID: process.env.NEXT_PUBLIC_LAUNCHDARKLY_CLIENT_KEY,
  context: { kind: 'user', key: user.id, email: user.email },
})(App);

// Node.js server-side
import { init } from '@launchdarkly/node-server-sdk';

const client = init(process.env.LAUNCHDARKLY_SDK_KEY);
await client.waitForInitialization();
const value = await client.variation('feature-flag-key', { kind: 'user', key: userId }, false);
```

## Pricing Notes
- **Starter:** $10/seat/month — basic flags, rollouts, targeting; no experimentation or approval workflows
- **Pro:** $20/seat/month — adds experimentation, approval workflows, and advanced targeting
- **Enterprise:** Custom pricing — adds SSO, SCIM, FedRAMP, custom contracts, and dedicated support
- Watch for: client-side SDK pricing adds a per-MAU charge above a plan threshold; consumer apps with millions of users can see significant additional costs; evaluate GrowthBook as an alternative if MAU costs become prohibitive

## Reference Repositories
- [launchdarkly/js-core](https://github.com/launchdarkly/js-core) — JavaScript/TypeScript monorepo containing browser SDK, React SDK, and Node.js SDK
- [launchdarkly/node-server-sdk](https://github.com/launchdarkly/node-server-sdk) — dedicated Node.js server-side SDK with streaming support

## Official Documentation
- [LaunchDarkly Docs](https://docs.launchdarkly.com) — complete platform documentation including targeting, experimentation, and approvals
- [SDK Guides](https://docs.launchdarkly.com/sdk) — setup guides for all 50+ supported SDKs
- [Experimentation Guide](https://docs.launchdarkly.com/home/experimentation) — A/B testing setup, metrics, and statistical significance

## Common Pitfalls
- **Client-side vs. server-side SDK keys are different** — the client-side ID is safe to expose in the browser; the server-side SDK key must be kept secret and never sent to the client; mixing them up causes initialization failures or security exposure.
- **Always provide a fallback value to `variation()`** — if the LaunchDarkly connection is unavailable (network partition, cold start), `variation()` returns the fallback value; ensure the fallback is the safe/conservative behavior, not the experimental one.
- **Contexts replace users in SDK v6+** — the legacy `user` object was replaced by a `context` object with a `kind` field; mixing old and new SDK versions in the same project causes targeting rule mismatches.
- **Approval workflows block CI/CD if not configured carefully** — requiring approval for flag changes in production is correct; requiring it for the development environment will block automated test setups from creating flags.

## Examples
1. **Phased infrastructure migration:** Create a multi-variate string flag `database-connection` returning `"primary"` / `"replica"` / `"new-db"` → route 1% of users to `"new-db"` → monitor error rates in Datadog → increment rollout in the LaunchDarkly UI — no code deploy required at each increment.
2. **Compliance-controlled feature release:** New feature requires legal sign-off → add approval rule requiring Legal team member approval before any flag targeting change in production → audit log automatically records approval chain for compliance documentation.
3. **Instant kill switch in incident:** Production bug traced to a new feature → flag turned off in LaunchDarkly dashboard → all users globally fall back to safe behavior within 100ms via streaming — no hotfix deploy, no rollback required.
