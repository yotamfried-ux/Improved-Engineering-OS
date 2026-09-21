# Mux

## Overview
Mux is a developer-first video infrastructure platform. It handles video upload, encoding, adaptive streaming (HLS), thumbnail generation, and real-time live streaming via a clean REST API — removing the need to manage FFmpeg, Elemental, or S3-based encoding pipelines. Core products: Mux Video (on-demand), Mux Live (live streams), Mux Data (video performance analytics), and Mux Player (React/Web Component). Used by Coursera, Khan Academy, Loom, and Linear for production video features.

## Capabilities
- Video upload via URL ingest or direct browser upload (signed upload URLs)
- Automatic HLS encoding with adaptive bitrate (multiple quality renditions)
- Signed and public playback URLs with per-asset access control
- Thumbnail and animated GIF generation at any timestamp via URL
- Live streaming with RTMP ingest, DVR, and simulcast to multiple destinations
- Video intelligence: automatic captions, chapters, content moderation
- Mux Player: React component and Web Component with built-in controls, captions, and analytics
- Real-time video performance metrics: playback error rate, rebuffer ratio, viewer engagement
- Webhooks for encoding state changes (`video.asset.ready`, `video.live_stream.active`, etc.)
- Storyboards (sprite sheets) for timeline hover previews

## When to Use
- Products with user video upload and playback: online courses, social platforms, content tools
- Live streaming features where you need RTMP ingest without running media servers
- When you want adaptive bitrate streaming without managing encoding infrastructure (FFmpeg/Elemental/Wowza)
- Replacing expensive self-hosted Kaltura or Wowza setups with a pay-per-minute API
- Apps that need video performance analytics alongside delivery (Mux Data is tightly integrated)

## Limitations
- Pay-per-minute pricing (storage + delivery) can become expensive for large long-form video libraries
- Mux manages the CDN origin — you cannot use your own CDN origin or cache layer
- Not optimal for very short clips (<30s) where converting to GIF or image-based formats is simpler
- Mux Data analytics require the Mux Player or manual SDK integration — third-party players need extra instrumentation
- No built-in DRM (Widevine/FairPlay) on base plans — enterprise feature only

## Integration Guide
1. Sign up at https://dashboard.mux.com and generate a Token ID + Token Secret under Settings → API Access Tokens
2. Install the SDK: `npm install @mux/mux-node`
3. Set `MUX_TOKEN_ID` and `MUX_TOKEN_SECRET` environment variables
4. Create an asset by ingesting a video URL (or generate a direct upload URL for browser uploads)
5. Poll for `status === 'ready'` or receive the `video.asset.ready` webhook before exposing the playback ID
6. Add Mux Player to your frontend: `npm install @mux/mux-player-react`

## Setup
```bash
npm install @mux/mux-node @mux/mux-player-react

# Environment variables
MUX_TOKEN_ID=your_token_id
MUX_TOKEN_SECRET=your_token_secret
```

```typescript
import Mux from '@mux/mux-node';

const mux = new Mux({
  tokenId: process.env.MUX_TOKEN_ID,
  tokenSecret: process.env.MUX_TOKEN_SECRET,
});

// Ingest from URL
const asset = await mux.video.assets.create({
  input: [{ url: 'https://example.com/video.mp4' }],
  playback_policy: ['public'],
});

// Direct browser upload
const upload = await mux.video.uploads.create({
  cors_origin: 'https://your-app.com',
  new_asset_settings: { playback_policy: ['public'] },
});
// Send upload.url to browser for direct PUT upload
```

```tsx
// React playback
import MuxPlayer from '@mux/mux-player-react';

<MuxPlayer
  playbackId={asset.playback_ids![0].id}
  metadata={{ video_title: 'My Video' }}
/>
```

## Pricing Notes
- **Developer:** Free trial with limited minutes — for development and testing only
- **Pay-as-you-go:** ~$0.015/min stored, ~$0.016/min delivered; Live streaming ~$0.060/min
- **Volume discounts:** Available at scale via Mux sales
- Watch for: storage costs accumulate even for dormant assets; implement asset deletion for unused uploads or failed processing runs

## Reference Repositories
- [muxinc/mux-node-sdk](https://github.com/muxinc/mux-node-sdk) — official Node.js/TypeScript SDK covering Video, Live, and Data APIs
- [muxinc/elements](https://github.com/muxinc/elements) — Mux Player Web Components and React wrapper with built-in Mux Data integration

## Official Documentation
- [Mux Docs](https://docs.mux.com) — full API reference, guides, and webhook event catalog
- [Mux Player Docs](https://docs.mux.com/guides/mux-player) — React and Web Component configuration options
- [Direct Upload Guide](https://docs.mux.com/guides/direct-upload) — browser-to-Mux upload flow without proxying through your server

## Common Pitfalls
- **Never expose Token Secret client-side** — generate direct upload URLs server-side; the browser only receives the signed upload URL, never the API credentials.
- **Wait for `video.asset.ready` before showing the player** — assets in `preparing` state have no valid HLS manifest; attempting to play them results in a 404; use webhooks or poll `asset.status` before surfacing the playback ID to users.
- **Signed playback URLs expire** — if using signed (`signed`) playback policy, tokens have a TTL; generate them server-side per-request, never cache them in the browser for longer than the TTL.
- **Delete failed uploads** — direct uploads that are abandoned or fail leave orphaned upload records; clean up with `mux.video.uploads.cancel(uploadId)` or via the dashboard to avoid stale state.

## Examples
1. **Course video upload:** Instructor uploads video → browser POSTs to a direct upload URL generated server-side → Mux sends `video.asset.ready` webhook → server marks video as available in the database → student's player renders `<MuxPlayer playbackId={id} />` with adaptive HLS.
2. **Live stream:** Create a live stream resource → store the RTMP stream key → broadcaster connects OBS to `rtmp://global-live.mux.com/app/{STREAM_KEY}` → Mux sends `video.live_stream.active` webhook → frontend renders the live playback ID in the player.
3. **Video thumbnail on hover:** Generate storyboard sprite via Mux's thumbnail URL API (`image.mux.com/{playbackId}/storyboard.vtt`) → Mux Player renders timeline previews automatically when storyboard VTT is provided.
