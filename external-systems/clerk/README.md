# Clerk

## Overview
Clerk is a complete authentication and user management platform built for modern web applications. It provides drop-in React/Next.js components, hosted UI flows, and backend SDKs that handle sign-up, sign-in, MFA, session management, and organizations out of the box.

## Capabilities
- Pre-built, customizable UI components: `<SignIn>`, `<SignUp>`, `<UserButton>`, `<UserProfile>`, `<OrganizationSwitcher>`
- Social OAuth providers (Google, GitHub, Apple, etc.) and passwordless (email/SMS magic links, OTP)
- Multi-factor authentication (TOTP, SMS, backup codes) without custom backend code
- Organizations and teams with roles, permissions, and invitations
- Session management with short-lived JWTs and automatic token refresh
- Webhooks for user lifecycle events (user.created, session.ended, organization.membership.created)
- Backend middleware for Next.js App Router, Remix, Express, and other frameworks
- B2B multi-tenancy with per-organization branding and SSO (SAML/OIDC) on enterprise plans

## When to Use
- Building a Next.js, React, or Remix app that needs auth without rolling your own
- Need organizations/teams with RBAC as a first-class feature
- Want polished, accessible auth UI without design/styling overhead
- Prototype to production with minimal auth infrastructure management

## Limitations
- Vendor lock-in: user data (passwords, sessions) lives in Clerk's cloud; migration out requires data export and re-hashing
- SAML/SSO and advanced organization features require paid plans (Enterprise)
- Less control over token claims and session storage compared to self-hosted solutions like Auth.js or Supabase Auth
- React/Next.js-first; other framework support (Vue, SvelteKit) is less mature

## Integration Guide
1. Install SDK: `npm install @clerk/nextjs`
2. Wrap the app in `<ClerkProvider publishableKey={...}>` in `layout.tsx`
3. Add `authMiddleware()` to `middleware.ts` to protect routes
4. Use `auth()` (server components) or `useAuth()` (client) to get `userId` and `sessionClaims`
5. Call `currentUser()` server-side for full user object; use `useUser()` client-side
6. Set up webhooks in the Clerk Dashboard → point to `/api/webhooks/clerk` → verify with `svix` package
7. For organizations: use `useOrganization()` hook and `auth().orgId` / `auth().orgRole` for RBAC checks

Key environment variables:
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard
```

## Setup Guide
```bash
# Install for Next.js
npm install @clerk/nextjs

# Install webhook verification
npm install svix

# Install for backend-only (Node)
npm install @clerk/clerk-sdk-node
```

Configuration notes:
- All redirect URLs must be whitelisted in the Clerk Dashboard under "Paths"
- For production, set `CLERK_SECRET_KEY` as a server-side-only secret — never expose it client-side
- Use `clerkMiddleware()` (Clerk v5+) rather than the deprecated `authMiddleware()`
- JWT templates allow injecting custom claims (e.g., Supabase RLS user ID) into session tokens

## Pricing Notes
- **Free tier:** Up to 10,000 monthly active users (MAUs), all core auth features, basic organizations
- **Pro:** $25/month base + $0.02/MAU above 10,000; includes advanced MFA, webhooks, custom JWT templates
- **Enterprise:** Custom pricing; adds SAML SSO, SCIM provisioning, SLA, advanced org features
- Watch for: MAU counting (each unique active user per calendar month), organization member seats on Pro

## Reference Repositories
- [clerkinc/clerk-nextjs-app-quickstart](https://github.com/clerk/clerk-nextjs-app-quickstart) — Next.js App Router starter
- [clerkinc/clerk-expo-quickstart](https://github.com/clerk/clerk-expo-quickstart) — React Native / Expo auth flow
- [clerk/clerk-docs](https://github.com/clerk/clerk-docs) — source for official docs examples

## Official Documentation
- [Clerk Docs](https://clerk.com/docs) — full SDK reference and integration guides
- [Next.js Quickstart](https://clerk.com/docs/quickstarts/nextjs) — fastest path from zero to auth
- [Organizations](https://clerk.com/docs/organizations/overview) — multi-tenant RBAC setup
- [Webhooks](https://clerk.com/docs/integrations/webhooks) — user event handling

## Examples
1. **Protected dashboard:** Wrap `app/dashboard/layout.tsx` with server-side `auth()` check; redirect unauthenticated users to `/sign-in` via middleware matcher.
2. **Organization-scoped data:** On API routes, read `auth().orgId` to scope database queries to the correct tenant — no manual tenant ID management needed.
3. **Supabase integration:** Use a Clerk JWT template that injects `sub` as the Supabase user ID, enabling RLS policies to match `auth.uid()` to Clerk's user ID.
