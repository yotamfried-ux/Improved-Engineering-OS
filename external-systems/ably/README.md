# Ably

## Overview
Ably is a realtime messaging platform providing pub/sub channels, presence (who's online), message history, and push notifications over WebSockets with automatic fallback to HTTP long-polling. It guarantees message delivery with ordering and operates a global edge network (300+ Points of Presence) ensuring <65ms P99 latency worldwide. Used by HubSpot, Toyota, and thousands of real-time apps. Differs from Pusher by guaranteeing message ordering and offering message replay; differs from self-hosted Socket.io by handling scaling, failover, and global delivery automatically.

## Capabilities
- Pub/sub channels: publish from server or client, subscribe from any connected client
- Presence: track who is currently connected to a channel (join/leave events, member list)
- Message history and replay: retrieve past messages per channel; new subscribers can catch up on missed messages
- Push notifications via APNs (iOS) and FCM (Android) — server-to-device without a WebSocket connection
- Channel rules and access control via capability tokens (per-channel publish/subscribe permissions)
- End-to-end encryption at the channel level
- SDKs for JavaScript, React, Python, Go, Java, iOS (Swift/Obj-C), Android; REST API for server-side publishing
- Ably Spaces: higher-level collaborative primitives (live cursors, member awareness, live locations)
- Connection state recovery: automatic reconnect with resume token to avoid missing messages during disconnects

## When to Use
- Chat systems where message ordering and guaranteed delivery matter
- Collaborative editing or live cursors (use Ably Spaces for pre-built primitives)
- Live dashboards, trading tickers, or scoreboards requiring low-latency global delivery
- Multiplayer games needing presence and pub/sub without managing WebSocket servers
- Live auction, bidding, or waitlist systems where ordering and exactly-once semantics are critical
- Real-time notifications when push to device (APNs/FCM) is needed alongside WebSocket delivery

## Limitations
- Pricing is per-message, not per-connection — high-frequency telemetry or typing indicators can generate unexpected costs; debounce or throttle high-frequency events
- More complex than Pusher for simple one-directional server→client notification use cases
- Ably Spaces (collaborative layer) is a newer product with less documentation and community examples than the core pub/sub API
- No self-hosted option on free or Plus tiers — all traffic routes through Ably's infrastructure
- Message persistence has a configurable retention period; long-term message storage requires an external database

## Integration Guide
1. Sign up at https://ably.com and create an app; copy the API Key from the dashboard
2. Install the SDK: `npm install ably`
3. Set `ABLY_API_KEY` as a server-side environment variable; never expose the root key client-side
4. Issue capability-scoped tokens from your server for each client (see token authentication pattern below)
5. Subscribe to channels client-side; publish from server or from authenticated clients
6. Configure channel rules in the Ably dashboard for message history retention and push rules

## Setup
```bash
npm install ably

# Environment variable (server-side only — never expose root API key to browser)
ABLY_API_KEY=your_app_id.your_key_id:your_key_secret
```

```typescript
// Server: issue a capability-scoped token for the client
import Ably from 'ably';

const ably = new Ably.Rest({ key: process.env.ABLY_API_KEY });
const tokenRequest = await ably.auth.createTokenRequest({
  capability: { 'chat:*': ['subscribe', 'publish', 'presence'] },
  clientId: userId,
});
// Return tokenRequest JSON to the browser

// Client: connect using a token URL endpoint (never the raw API key)
const client = new Ably.Realtime({ authUrl: '/api/ably-token' });
const channel = client.channels.get('chat:room-1');

// Subscribe
await channel.subscribe('message', (msg) => {
  console.log(msg.data); // { text: 'Hello!', userId: '123' }
});

// Publish
await channel.publish('message', { text: 'Hello!', userId: '123' });

// Presence
await channel.presence.enter({ username: 'Yotam' });
const members = await channel.presence.get();
```

## Pricing Notes
- **Free:** 6M messages/month, 200 concurrent connections — adequate for development and low-traffic apps
- **Scale:** Pay-per-message after free tier; pricing varies by message volume and features (history, push)
- **Enterprise:** Custom SLA with volume discounts
- Watch for: presence enter/leave events and heartbeats count as messages; a channel with 100 connected members generates 100 presence messages on each join/leave event

## Reference Repositories
- [ably/ably-js](https://github.com/ably/ably-js) — official JavaScript/TypeScript SDK for browser and Node.js
- [ably-labs](https://github.com/ably-labs) — official Ably example apps covering chat, collaborative features, and live updates

## Official Documentation
- [Ably Docs](https://ably.com/docs) — full API reference, concepts, and integration guides
- [Ably Pub/Sub Guide](https://ably.com/docs/pub-sub) — channels, messages, and delivery guarantees explained
- [Ably Token Authentication](https://ably.com/docs/auth/token) — required reading before any client-side integration

## Common Pitfalls
- **Never use the root API key client-side** — the root key has full publish/subscribe/admin permissions; always issue capability-scoped tokens from your server and authenticate clients via `authUrl` or `authCallback`; leaking the root key allows anyone to publish to any channel.
- **Presence messages count toward billing** — a channel with many members generates a presence message per join/leave per subscriber; for large rooms, consider disabling presence or using a separate metadata channel instead of per-member presence.
- **Handle connection state explicitly** — Ably clients transition through `connecting`, `connected`, `disconnected`, `suspended`, and `closed` states; always listen to `client.connection.on('failed', ...)` to surface connectivity errors to users rather than silently dropping messages.
- **Message history is not enabled by default** — channel history must be enabled via channel rules in the dashboard; without it, `channel.history()` returns an empty result even though messages were published.

## Examples
1. **Live chat room:** Server issues a token with `capability: { 'chat:ROOM_ID': ['publish', 'subscribe', 'presence'] }` → client connects via token → subscribes to the channel → enters presence with username → messages published by any member are received by all subscribers with ordering guaranteed.
2. **Real-time dashboard:** Server publishes metric updates to `metrics:dashboard` every second using the REST API (no persistent connection needed server-side) → browser clients subscribe and update a chart on each message → new tab subscribers call `channel.history({ limit: 1 })` to get the last known value immediately on connect.
3. **Collaborative cursors with Ably Spaces:** Initialize `Spaces` client → join a space → call `space.cursors.set({ position: { x, y } })` on `mousemove` (throttled to 16ms) → other members receive cursor positions via `space.cursors.subscribe()` and render remote cursors on the canvas.
