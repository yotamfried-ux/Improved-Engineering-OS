# Auth0

## Overview
Auth0 (by Okta) is a flexible, enterprise-grade identity platform providing authentication, authorization, and user management as a service. It supports a wide range of application types and identity protocols, making it a strong choice for teams that need deep customization or enterprise compliance requirements.

## Capabilities
- Universal Login with hosted, customizable login pages (New Universal Login is MFA-ready and WCAG-compliant)
- Social connections (50+ providers: Google, GitHub, Facebook, Apple, LinkedIn, etc.)
- Enterprise SSO via SAML 2.0, OIDC, LDAP, and Active Directory/ADFS
- MFA with TOTP, SMS, email, WebAuthn/passkeys, and push notifications (via Auth0 Guardian)
- Actions (serverless JS functions) for customizing auth pipelines: login, registration, machine-to-machine
- Organizations for B2B multi-tenancy with per-org connections, branding, and member management
- Role-Based Access Control (RBAC) with permissions added to access tokens
- Auth0 Management API for programmatic user/app/tenant management
- Attack Protection: breached password detection, brute-force protection, anomaly detection

## When to Use
- Enterprise or regulated environments requiring SAML, LDAP, or Active Directory integration
- Applications needing deep customization of auth flows via serverless Actions
- Projects with strict compliance requirements (SOC 2, ISO 27001, HIPAA, GDPR) where Auth0's certifications matter
- Migrating users from legacy systems (Auth0 supports custom password hash imports)

## Limitations
- Pricing escalates quickly with MAUs and enterprise features; can be significantly more expensive than Clerk or Supabase Auth at scale
- Universal Login customization is powerful but complex — New Universal Login has constraints vs. Classic
- Cold-start latency on Actions can affect login performance; keep Actions lightweight
- Management API rate limits require careful implementation for bulk operations
- Tenant architecture decisions (one tenant per environment vs. per customer) have long-term implications and are hard to reverse

## Integration Guide
1. Create an Application in the Auth0 Dashboard (Regular Web App, SPA, or M2M)
2. Install SDK: `npm install @auth0/nextjs-auth0` (Next.js) or `npm install auth0` (Node/generic)
3. Set callback and logout URLs in the Dashboard under Application Settings
4. For Next.js: use `handleAuth()` API route to auto-generate `/api/auth/[auth0]` routes
5. Wrap app with `<UserProvider>` and use `useUser()` client-side or `getSession()` server-side
6. For RBAC: enable "Add Permissions in the Access Token" in API settings; check `req.auth.payload.permissions` in your API
7. For Actions: write custom JS in Dashboard → Actions → Flows; use `event` and `api` objects to enrich tokens or block logins

Key environment variables:
```
AUTH0_SECRET=<32-byte random string>
AUTH0_BASE_URL=https://yourdomain.com
AUTH0_ISSUER_BASE_URL=https://YOUR_DOMAIN.auth0.com
AUTH0_CLIENT_ID=...
AUTH0_CLIENT_SECRET=...
```

## Setup Guide
```bash
# Next.js SDK
npm install @auth0/nextjs-auth0

# Node.js / Express SDK
npm install auth0

# Auth0 CLI (optional, for local development)
brew tap auth0/auth0-cli && brew install auth0
auth0 login
auth0 apps create
```

Configuration notes:
- Always use the `AUTH0_SECRET` env var (random 32-byte string) for session encryption in Next.js SDK
- Add `http://localhost:3000/api/auth/callback` to "Allowed Callback URLs" during development
- Use "Rotating Refresh Tokens" for SPAs to maintain sessions without re-login
- For APIs: create an API resource in Auth0 Dashboard and validate JWTs with `express-oauth2-jwt-bearer`

## Pricing Notes
- **Free tier:** 7,500 MAUs, unlimited social connections, basic MFA
- **Essentials:** From $23/month for 100 MAUs (scales steeply); includes custom domains
- **Professional:** From $240/month; adds Organizations, advanced MFA, enterprise connections
- **Enterprise:** Custom pricing; SOC 2 Type II, HIPAA, private cloud deployment
- Watch for: MAU overage charges, add-on costs for MFA factors beyond TOTP, Organizations seat pricing

## Reference Repositories
- [auth0-samples/auth0-nextjs-samples](https://github.com/auth0-samples/auth0-nextjs-samples) — Next.js Pages and App Router examples
- [auth0-samples/auth0-express-api-samples](https://github.com/auth0-samples/auth0-express-api-samples) — JWT validation in Express APIs
- [auth0-samples/auth0-python-web-app](https://github.com/auth0-samples/auth0-python-web-app) — Flask/Django integration

## Official Documentation
- [Auth0 Docs](https://auth0.com/docs) — full platform reference
- [Next.js SDK](https://auth0.com/docs/quickstart/webapp/nextjs) — quickstart guide
- [Actions](https://auth0.com/docs/customize/actions) — auth pipeline customization
- [Organizations](https://auth0.com/docs/manage-users/organizations) — B2B multi-tenancy

## Examples
1. **B2B SaaS with SSO:** Use Auth0 Organizations — each customer org gets its own SAML connection to their IdP; login flow auto-selects the right connection based on email domain.
2. **API protection:** Issue access tokens with audience set to your API identifier; validate with `express-oauth2-jwt-bearer`; gate endpoints by checking `permissions` claim in the token.
3. **Progressive profiling:** Use a Post-Login Action to check if required profile fields exist; if not, redirect the user to a profile-completion page before granting access.
