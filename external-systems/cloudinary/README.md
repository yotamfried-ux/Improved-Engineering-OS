# Cloudinary

## Overview
Cloudinary is a cloud-based media management platform for image and video upload, storage, transformation, optimization, and CDN delivery. The key feature is on-the-fly transformation via URL parameters: resize, crop, format-convert, and apply AI effects (background removal, object detection) all by changing the URL — no pre-generating variants. Used by Reddit, Fiverr, Grindr, and thousands of web apps that handle user-generated media.

## Capabilities
- Image upload and storage with folder organization and tagging
- On-the-fly transformations via URL parameters: resize, crop, format conversion, quality, blur, watermark, overlays
- Video upload, transcoding, and adaptive streaming (HLS)
- AI-powered features: background removal, object-aware cropping, generative fill, face detection
- CDN delivery via Cloudinary's own CDN or Fastly integration
- Responsive breakpoints generation — auto-generate srcset-ready image variants
- Media library management with DAM (Digital Asset Management) features
- Upload presets: server-side rules for file type, size limits, and transformations without code
- Signed uploads for secure client-side uploads with server-generated signatures
- Webhooks for async upload notifications and moderation results

## When to Use
- User-generated content platforms (avatars, photos, product images) where image variants are unpredictable
- E-commerce product image optimization needing consistent dimensions, format, and quality across SKUs
- Apps serving images to multiple device sizes without pre-generating every variant at upload time
- Video upload and playback features without managing FFmpeg or encoding infrastructure (small/medium scale)
- Teams wanting a managed media pipeline without building a custom upload → store → serve stack

## Limitations
- Transformation credits add up quickly at scale — each unique transformation URL consumes credits on paid plans
- Vendor lock-in on transformation URL format makes migration to another CDN non-trivial
- Free tier is restrictive: 25 credits/month (1 credit ≈ 1 transformation + delivery unit)
- Not ideal for video at very high scale — Mux is better for adaptive streaming, chapters, and live
- Pricing can be opaque; "credits" bundle storage, transformations, and bandwidth in non-obvious ways

## Integration Guide
1. Sign up at https://cloudinary.com and note your Cloud Name, API Key, and API Secret from the dashboard
2. Set the `CLOUDINARY_URL` environment variable: `cloudinary://API_KEY:API_SECRET@CLOUD_NAME`
3. Install the SDK: `npm install cloudinary`
4. Configure the SDK and test with a sample upload (see Setup below)
5. Use upload presets for any client-side (browser) uploads — never expose API Secret client-side

## Setup
```bash
npm install cloudinary

# Environment variable (covers all SDK config in one string)
CLOUDINARY_URL=cloudinary://123456789:abc123@your-cloud-name
```

```typescript
import { v2 as cloudinary } from 'cloudinary';
// SDK auto-reads CLOUDINARY_URL from environment

// Upload a file
const result = await cloudinary.uploader.upload(filePath, {
  folder: 'avatars',
  upload_preset: 'user_avatars', // enforces size/type limits
});

// On-the-fly transformation URL: resize to 400px wide, fill crop, WebP, auto quality
const url = cloudinary.url('sample.jpg', {
  width: 400,
  crop: 'fill',
  format: 'webp',
  quality: 'auto',
});

// Background removal (AI add-on)
const bgRemoved = cloudinary.url('product.jpg', {
  effect: 'background_removal',
});
```

## Pricing Notes
- **Free:** 25 credits/month — adequate for development and very low-traffic apps
- **Plus:** $89/month for 225 credits/month — suited for small production apps
- **Scale:** Custom pricing for high-volume usage
- Watch for: each *unique* transformation URL is a new transformation; cache bust patterns (timestamp in URL) will consume credits at an extreme rate — never append unique tokens to Cloudinary transformation URLs

## Reference Repositories
- [cloudinary/cloudinary_npm](https://github.com/cloudinary/cloudinary_npm) — official Node.js SDK with full upload and transformation API coverage
- [cloudinary/cloudinary-react](https://github.com/cloudinary/cloudinary-react) — React component library with `<AdvancedImage>` and lazy loading support

## Official Documentation
- [Cloudinary Docs](https://cloudinary.com/documentation) — full SDK reference, upload API, and admin API
- [Transformation URL API](https://cloudinary.com/documentation/transformation_reference) — complete reference for all URL transformation parameters
- [Upload Presets Guide](https://cloudinary.com/documentation/upload_presets) — server-side validation rules for client uploads

## Common Pitfalls
- **Never generate unique transformation URLs per-request** — each unique URL is a fresh transformation consuming credits; build a fixed set of named transformations and reuse them across all renders.
- **Always use upload presets for client-side uploads** — exposing API Secret in the browser is a critical security vulnerability; use signed upload presets instead, generated server-side.
- **Always include `q_auto,f_auto`** — omitting these results in serving oversized JPEGs when WebP/AVIF would suffice; `quality: 'auto', fetch_format: 'auto'` optimizes both quality and format per browser.
- **Folder paths in public IDs are permanent** — Cloudinary public IDs include the folder path; renaming folders requires updating all stored public IDs or using derived URLs with mapping.

## Examples
1. **User avatar upload:** Browser requests signed upload URL from your server → server generates signature with `cloudinary.utils.api_sign_request()` → browser POSTs directly to Cloudinary → Cloudinary calls your webhook on completion → server stores the returned `public_id` in the user record.
2. **Responsive product image:** Store a single high-res upload, then render with `srcset` by generating URLs with `width: [400, 800, 1200]` breakpoints and `crop: 'fill', format: 'webp', quality: 'auto'` — no re-uploads needed when design changes.
3. **Background removal pipeline:** Upload product image with `eager: [{ effect: 'background_removal' }]` to trigger async AI processing → poll the eager transformation status via webhook → serve the `background_removal` transformation URL once ready for e-commerce product display.
