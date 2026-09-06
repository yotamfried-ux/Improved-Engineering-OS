## Pattern: JWT Authentication

**Problem:** Stateless API servers need to verify a caller's identity on every request without hitting the database each time.

**Solution:** Issue a signed JWT on login. The client sends it in the `Authorization: Bearer` header. The server verifies the signature locally — no DB lookup required.

**Architecture:**

```
POST /auth/login  →  Server signs JWT (HS256 or RS256)  →  { accessToken, refreshToken }
GET  /api/resource (Authorization: Bearer <token>)  →  Server verifies sig  →  allow/deny
POST /auth/refresh (refreshToken cookie)  →  new accessToken
```

**Implementation Notes:**

- Access token TTL: 15 minutes. Refresh token TTL: 7–30 days stored in an HttpOnly cookie.
- Store refresh tokens in the DB so they can be revoked individually.
- Include only non-sensitive claims in payload (userId, role). Never include passwords or secrets.
- Use RS256 (asymmetric) when multiple services need to verify tokens without sharing a secret.

**Example Code:**

```typescript
import jwt from 'jsonwebtoken';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET!;

export function signAccessToken(userId: string, role: string) {
  return jwt.sign({ sub: userId, role }, ACCESS_SECRET, { expiresIn: '15m' });
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, ACCESS_SECRET) as { sub: string; role: string };
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
```

**Common Mistakes:**

- Setting access token TTL to hours or days — revocation becomes impossible without a blocklist.
- Storing JWTs in localStorage — vulnerable to XSS; use HttpOnly cookies for refresh tokens.
- Not rotating refresh tokens on each use — replay attacks steal long-lived tokens.
- Trusting `alg: none` — always specify the expected algorithm explicitly on verification.

**Security Considerations:**

- Validate `exp`, `iss`, and `aud` claims on every verification.
- Rotate signing secrets on a schedule; support key IDs (`kid`) for zero-downtime rotation.
- Maintain a short-lived token blocklist (Redis) for immediate revocation when needed.

**Testing Strategy:**
Unit-test `sign` and `verify`. Integration-test middleware with expired, tampered, and missing tokens. Test refresh flow including DB revocation lookup and token rotation.

**Registry:** see [`patterns/registry.yaml`](../registry.yaml) for canonical status, score, and usage.
