## Pattern: Session-based Auth

**Problem:** Server-rendered web apps need server-controlled sessions where the server can instantly invalidate login state without waiting for a token to expire.

**Solution:** On login, create a server-side session record in Redis and send the session ID in a signed, HttpOnly cookie. Each request looks up the session in Redis.

**Architecture:**
```
POST /login   →  validate credentials  →  create session in Redis (TTL 24h)  →  Set-Cookie: sid=<signed>
GET  /page    →  server reads cookie  →  Redis lookup  →  attach user to request
DELETE /logout  →  delete Redis key  →  clear cookie
```

**Implementation Notes:**
- Use Redis as the session store for multi-instance deployments (not in-memory).
- Cookie flags: `httpOnly: true`, `secure: true`, `sameSite: 'lax'`.
- Regenerate the session ID after login to prevent session fixation attacks.

**Example Code:**
```typescript
import session from 'express-session';
import RedisStore from 'connect-redis';
import { createClient } from 'redis';

const redis = createClient({ url: process.env.REDIS_URL });
await redis.connect();

app.use(session({
  store: new RedisStore({ client: redis }),
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 86_400_000 },
}));

// After credential validation:
req.session.regenerate(() => {
  req.session.userId = user.id;
  res.redirect('/dashboard');
});
```

**Common Mistakes:**
- Not calling `regenerate()` after login — session fixation vulnerability.
- Using in-memory store in production — sessions lost on restart and not shared across instances.
- Setting `saveUninitialized: true` — creates a session for every anonymous visitor.

**Security Considerations:**
- `Secure` flag ensures the cookie is only sent over HTTPS.
- Implement idle timeout: track `lastSeen` and expire sessions inactive for more than N hours.
- Rate-limit login attempts per IP and per username.

**Testing Strategy:**
Verify login sets cookie, protected routes reject requests without valid sessions, logout deletes the Redis key, and regeneration changes the session ID while preserving user data.

**Registry:** see [`patterns/registry.yaml`](../registry.yaml) for canonical status, score, and usage.
