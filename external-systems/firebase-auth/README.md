# Firebase Authentication

## Overview
Firebase Authentication is a managed identity service by Google that handles user sign-in, token issuance, and session management without building backend auth infrastructure. It supports email/password, OAuth providers (Google, GitHub, Apple, Facebook), phone SMS, anonymous auth, and custom token flows, all backed by Google's identity infrastructure.

## Capabilities
- Email/password registration and sign-in with built-in email verification and password reset flows
- OAuth 2.0 sign-in with Google, GitHub, Apple, Microsoft, Facebook, Twitter, and Yahoo
- Phone number authentication via SMS OTP
- Anonymous authentication that can later be linked to a permanent account
- Custom token auth for integrating with existing identity systems
- Multi-factor authentication (MFA) with TOTP and SMS second factors
- Firebase Admin SDK to mint custom tokens, verify ID tokens, and manage users server-side
- Seamless integration with Firestore, Cloud Storage, and Cloud Functions security rules via `request.auth`
- Identity Platform upgrade for enterprise features (SAML, OIDC, multi-tenancy, audit logs)

## When to Use
- Building a new web or mobile app and want zero-ops auth with Google's reliability guarantees
- Need social login (Google/GitHub/Apple) without implementing OAuth flows manually
- Already using Firebase (Firestore, Storage, Hosting) and want the rules to work with `request.auth` out of the box
- Rapid prototype where auth infrastructure is not the differentiator

## Limitations
- Vendor lock-in: Firebase Auth tokens are non-portable; migrating users requires exporting hashed passwords and re-importing to another provider
- No built-in RBAC — roles and permissions must be managed in Firestore or custom claims (limited to 1000 bytes per user)
- Limited UI customization on hosted flows; Firebase UI library is functional but dated
- Phone auth costs money beyond the free tier and is unavailable in some regions
- SAML/OIDC and multi-tenancy require upgrading to Identity Platform (paid)

## Integration Guide
1. Create a Firebase project at https://console.firebase.google.com and enable Authentication with the desired sign-in methods
2. Install the SDK: `npm install firebase` (web) or use the native iOS/Android SDKs
3. Initialize Firebase in your app with your project config object (from the Console → Project Settings)
4. Call sign-in methods (`signInWithPopup`, `signInWithEmailAndPassword`, `signInWithPhoneNumber`) — they return a `UserCredential` containing a `User` and an ID token
5. On the server, install `firebase-admin` and verify the ID token passed in `Authorization: Bearer <token>` headers using `admin.auth().verifyIdToken(token)`
6. Set Firestore/Storage security rules to use `request.auth.uid` and `request.auth.token` for row-level access control

## Setup
```bash
# Install Firebase client SDK
npm install firebase

# Install Firebase Admin SDK (server-side)
npm install firebase-admin

# Install Firebase CLI for emulators and hosting
npm install -g firebase-tools
firebase login

# Initialize a project
firebase init

# Start local emulator suite (Auth + Firestore + Functions)
firebase emulators:start
```

Set environment variables:
- Client: embed Firebase config object (public, not secret) — use `NEXT_PUBLIC_FIREBASE_*` pattern
- Server: set `GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json` or use `FIREBASE_SERVICE_ACCOUNT_KEY` as a JSON string in env

## Pricing Notes
- **Free tier (Spark plan):** 10K/month phone auth verifications, unlimited email/password and social sign-ins, 10 MFA SMS verifications/month
- **Pay-as-you-go (Blaze plan):** Phone auth $0.0055/verification after free tier; Identity Platform SAML/OIDC from $0.0055/monthly active user above 49,999 MAU
- **No charge** for email/password or social OAuth sign-ins on either plan
- Watch for: Identity Platform MAU costs at scale; Blaze plan required to call external APIs from Cloud Functions

## Reference Repositories
- [firebase/quickstart-js](https://github.com/firebase/quickstart-js) — official JS quickstarts for all Firebase products including Auth
- [firebase/firebase-js-sdk](https://github.com/firebase/firebase-js-sdk) — full Firebase JS SDK source with types and examples
- [firebase/snippets-node](https://github.com/firebase/snippets-node) — Admin SDK code snippets for server-side token verification and user management

## Official Documentation
- [Firebase Auth Docs](https://firebase.google.com/docs/auth) — guides for all platforms and sign-in methods
- [Admin SDK — Verify ID Tokens](https://firebase.google.com/docs/auth/admin/verify-id-tokens) — server-side token verification
- [Security Rules](https://firebase.google.com/docs/rules) — using `request.auth` in Firestore and Storage rules
- [Identity Platform](https://cloud.google.com/identity-platform/docs) — SAML, OIDC, multi-tenancy upgrade path

## Common Pitfalls
- **Never trust the client-side `user.uid`** for access control — always verify the ID token server-side with `admin.auth().verifyIdToken()`. An attacker can forge any UID in a direct API call.
- **ID tokens expire after 1 hour** — use `user.getIdToken(/* forceRefresh */ true)` to get a fresh token if the client has been open a long time; the Firebase SDK handles silent refresh automatically for web.
- **Custom claims are cached in the token** — after setting a custom claim via Admin SDK, the client must force-refresh the token (`user.getIdToken(true)`) to pick up the new claims; the old token remains valid until expiry.
- **Firestore security rules are enforced server-side** — a mistake in your rules can expose all data; always test rules in the Firebase Emulator before deploying to production.
- **Phone auth costs money and requires Blaze plan** — do not assume phone auth is free; switch to Blaze (pay-as-you-go) before enabling it, or you will hit an error at runtime.
- **`onAuthStateChanged` fires twice on page load** — first with `null` (checking auth state) then with the user object; guard your UI against the null flash by showing a loading spinner until the first non-null callback fires.
- **Migrate passwords carefully** — if moving users from a custom auth system to Firebase, use `admin.auth().importUsers()` with the correct hash algorithm; mismatched parameters silently invalidate all imported passwords.

## Examples
1. **Next.js full-stack auth:** Client signs in with `signInWithPopup(provider)` → gets ID token via `user.getIdToken()` → sends token in `Authorization` header → Next.js API route calls `admin.auth().verifyIdToken()` → sets a secure HttpOnly session cookie for subsequent requests.
2. **Anonymous-to-permanent upgrade:** User browses app anonymously (`signInAnonymously`) → adds items to cart → at checkout links account with `linkWithCredential(emailCredential)` — cart data under the anonymous UID is preserved.
3. **Custom RBAC with custom claims:** Firebase Admin sets `{ role: "admin" }` custom claim on a user → client ID token includes the claim → Firestore rule checks `request.auth.token.role == "admin"` to gate write access to sensitive collections.
