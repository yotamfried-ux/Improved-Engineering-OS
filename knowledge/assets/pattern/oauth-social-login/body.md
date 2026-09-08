## Pattern: OAuth 2.0 / Social Login

**Problem:** Users want to sign in with an existing identity provider (Google, GitHub) without creating another password.

**Solution:** Implement the OAuth 2.0 Authorization Code flow with PKCE. Redirect to the provider, exchange the code server-side, and upsert the user record.

**Architecture:**
```
Browser  →  GET /auth/google  →  redirect to Google (state, code_challenge)
Google   →  redirect /auth/callback?code=...&state=...
Server   →  verify state  →  exchange code → id_token  →  upsert user  →  issue session/JWT
```

**Implementation Notes:**
- Always use PKCE, even for server-side flows — defends against authorization code interception.
- Validate the `state` parameter to prevent CSRF on the callback.
- Upsert users by `provider:subject` (`google:1234567`) — allows one account to link multiple providers.
- Store `providerAccountId`, not the provider's access token, unless you need to call provider APIs.

**Example Code:**
```typescript
import { google } from 'googleapis';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.APP_URL}/auth/google/callback`
);

export function getAuthUrl(state: string) {
  return oauth2Client.generateAuthUrl({
    scope: ['openid', 'email', 'profile'],
    state,
    access_type: 'offline',
  });
}

export async function handleCallback(code: string) {
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  const { data } = await google.oauth2({ version: 'v2', auth: oauth2Client }).userinfo.get();
  return { email: data.email!, name: data.name!, googleId: data.id! };
}
```

**Common Mistakes:**
- Skipping `state` validation — opens CSRF attack on the callback endpoint.
- Trusting a client-supplied email without checking `email_verified` from the provider.
- Using the implicit flow — deprecated; Authorization Code + PKCE is the current standard.

**Security Considerations:**
- `state` values must be short-lived (store in session, expire in 10 minutes).
- Never log authorization codes or access tokens.
- Verify the ID token signature if you parse it directly rather than calling the userinfo endpoint.

**Testing Strategy:**
Mock the OAuth provider. Test state mismatch rejection, successful user upsert, duplicate-email handling when provider differs, and token exchange failure paths.

**Registry:** see [`patterns/registry.yaml`](../registry.yaml) for canonical status, score, and usage.
