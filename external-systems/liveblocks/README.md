# Liveblocks

## Overview
Liveblocks is a collaborative real-time infrastructure platform for building Figma-style multiplayer features in any app. Provides ready-made React hooks and components for live cursors, presence (who's online), real-time document sync (Yjs/CRDT), conflict-free text editing, comments, and notifications — without managing WebSocket servers. Used by Vercel, Framer, and Hashnode. Best-in-class for adding collaborative editing experiences to existing React applications.

## Capabilities
- Presence — live cursors, online user list, and arbitrary per-user state (scroll position, selection)
- Real-time storage — shared conflict-free CRDT state that syncs automatically across all connected clients
- Text editor collaboration — out-of-the-box integrations for Lexical, Tiptap, BlockNote, and ProseMirror
- Comments and annotation threads — attach discussion threads to any element on a shared document
- In-app notifications — notify users of comment mentions and thread activity
- AI copilot integration for collaborative documents and assistants in shared contexts
- React hooks API: `useOthers`, `useMutation`, `useStorage`, `useSelf`, `useRoom`
- REST API for server-side room operations (list rooms, get storage, broadcast events)
- Webhooks for room events: user joined, user left, storage updated, comment created
- TypeScript-first with full type inference across the shared storage schema

## When to Use
- Building collaborative document editing (like Notion, Google Docs, or Linear) in a React app
- Design tools or whiteboards with shared canvas, selection, and live cursor state
- Any product needing "see who's here" presence features (co-browsing, live dashboards)
- When you want multiplayer without managing Operational Transformation, CRDTs from scratch, or WebSocket infrastructure
- Startups wanting to ship a collaborative feature in days rather than months

## Limitations
- React-centric — Vue and vanilla JS support exists but is significantly less developed than the React SDK
- Free tier caps at 25 Monthly Active Users; pricing scales quickly for consumer apps
- CRDT storage is eventually consistent — not suitable for ACID transactions or financial operations
- Vendor lock-in on the collaboration layer; migrating away requires rewriting the real-time synchronization logic
- Large storage objects above roughly 1MB degrade sync performance — split into multiple rooms or use selective subscription

## Integration Guide
1. Sign up at https://liveblocks.io and create a project; note your public and secret keys
2. Install packages: `npm install @liveblocks/client @liveblocks/react`
3. Create a `liveblocks.config.ts` file to define your shared `Storage` and `Presence` TypeScript types
4. Wrap the collaborative section of the app in `RoomProvider` — not the entire app
5. Add an auth endpoint (`/api/liveblocks-auth`) that calls Liveblocks with your secret key and returns a token
6. Use `resolveUsers` callback to map Liveblocks user IDs back to your own auth system's user objects

## Setup
```bash
npm install @liveblocks/client @liveblocks/react

# Environment variables
NEXT_PUBLIC_LIVEBLOCKS_KEY=pk_live_xxx   # public key — safe for browser
LIVEBLOCKS_SECRET_KEY=sk_live_xxx         # secret key — server-side auth endpoint only
```

```typescript
import { createClient } from "@liveblocks/client";
import { createRoomContext } from "@liveblocks/react";

const client = createClient({ publicApiKey: process.env.NEXT_PUBLIC_LIVEBLOCKS_KEY! });

type Presence = { cursor: { x: number; y: number } | null };
type Storage = { layers: { [id: string]: { x: number; y: number } } };

const { RoomProvider, useOthers, useMutation, useStorage } =
  createRoomContext<Presence, Storage>(client);

// In component — see every other user's cursor position
const others = useOthers();
// others.map(user => user.presence.cursor) → live cursor positions
```

## Pricing Notes
- **Free (Starter):** 25 MAU, unlimited rooms, 5GB bandwidth — sufficient for demos and internal tools
- **Pro:** $99/month — 100 MAU included, then $0.99/MAU; adds webhooks and priority support
- **Business:** $399/month — 500 MAU included, then $0.69/MAU; adds SSO, SAML, and SLA
- MAU is counted per unique user ID per calendar month; anonymous guests without a user ID share a single anonymous identity and do not inflate MAU count

## Reference Repositories
- [liveblocks/liveblocks](https://github.com/liveblocks/liveblocks) — core SDK, React hooks, and Node.js client
- [liveblocks/liveblocks/examples](https://github.com/liveblocks/liveblocks/tree/main/examples) — production-ready Next.js examples: collaborative whiteboard, text editor, spreadsheet, and comments

## Official Documentation
- [Liveblocks Docs](https://liveblocks.io/docs) — complete SDK reference, room setup, and auth guide
- [Liveblocks Examples](https://liveblocks.io/examples) — live demos with source code for all major use cases
- [Liveblocks API Reference](https://liveblocks.io/docs/api-reference/liveblocks-react) — all React hooks documented with TypeScript signatures

## Common Pitfalls
- **`RoomProvider` scope matters** — wrapping the entire app causes all users to share a single room; wrap only the collaborative section (e.g., a specific document page) so room IDs map to individual documents.
- **`resolveUsers` is required for comments** — without it the comments UI cannot display user names or avatars; wire it to your own user database during setup, not as an afterthought.
- **Never put the secret key in the browser** — the secret key signs auth tokens; expose it only in the `/api/liveblocks-auth` server-side route; the public key is safe for client-side `createClient()`.
- **Room IDs are permanent** — choose a room ID scheme tied to your database entity ID (e.g., `document-${doc.id}`) from day one; changing room IDs destroys all stored collaborative state including comment history.

## Examples
1. **Live cursors on a shared canvas:** Initialize presence with `cursor: null` → update via `updateMyPresence({ cursor: { x, y } })` on `mousemove` → render each `others` user's cursor at their position with their name label.
2. **Collaborative rich text editor:** Install `@liveblocks/react-lexical` → wrap Lexical's `LexicalComposer` with `LiveblocksPlugin` → all connected users see each other's text edits and selection ranges in real time with zero custom sync code.
3. **Comment threads on a design element:** Use `useThreads()` to list threads anchored to a layer ID → render `Thread` components from `@liveblocks/react-ui` → users can comment, reply, and resolve without leaving the canvas.
