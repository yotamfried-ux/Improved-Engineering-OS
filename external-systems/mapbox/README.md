# Mapbox

## Overview
Mapbox is a developer platform for interactive maps, location search, and navigation. It provides vector maps with full custom styling via Mapbox Studio, geocoding (address ↔ coordinates), directions/routing API, isochrone (reachability) API, and the GL JS library for browser-based maps. Used by Snapchat, The New York Times, and Foursquare. A strong alternative to Google Maps when customization, data visualization layers, or developer-friendly pricing are priorities.

## Capabilities
- Interactive vector maps rendered via WebGL (Mapbox GL JS / React Map GL)
- Custom map styling via Mapbox Studio — full control over colors, fonts, layers, and icons
- Forward and reverse geocoding (address → coordinates and coordinates → address)
- Directions and routing: driving, walking, cycling, with turn-by-turn instructions
- Isochrone API — generate reachability areas (e.g., "10-minute walk from point X")
- Places search and autocomplete for address input fields
- Static map image API for generating map thumbnails without a browser
- Mapbox GL Native for offline maps on iOS and Android
- Satellite imagery and terrain layers
- Data layers: GeoJSON, vector tiles, custom tileset upload

## When to Use
- Apps requiring heavy map customization: branded maps, custom icons, data visualization overlays (heatmaps, choropleth, point clusters)
- Location-based search features: store locator, address autocomplete, delivery address entry
- Routing and navigation features where directions API is needed alongside the map
- When Google Maps pricing or terms (no caching, no offline, attribution requirements) are prohibitive
- Data journalism or analytics dashboards overlaying datasets on maps

## Limitations
- Vector maps require WebGL — will not render in older browsers or server-side without a headless renderer
- Pricing changed in 2019 to per-map-load model; at consumer scale (millions of MAU) costs can exceed Google Maps
- Google Maps has richer POI data, real-time traffic, and Street View — Mapbox does not include these out of the box
- Custom map styles require learning Mapbox Studio; non-trivial for complex multi-layer styling
- Mapbox GL JS is MPL-licensed — check license compatibility for proprietary products vs. the older v1 BSD license

## Integration Guide
1. Sign up at https://mapbox.com and generate a public access token from Account → Tokens
2. Install the React wrapper: `npm install react-map-gl mapbox-gl`
3. Set `NEXT_PUBLIC_MAPBOX_TOKEN` (or equivalent public env var) in your environment
4. Add a `<Map>` component to your page (see Setup below)
5. For geocoding/directions, use the `@mapbox/search-js-react` package or call the REST API directly
6. Set up a custom Mapbox Studio style if you need branded maps; copy the style URL for use in `mapStyle`

## Setup
```bash
npm install react-map-gl mapbox-gl

# For geocoding/search autocomplete
npm install @mapbox/search-js-react

# Environment variable (public — safe for browser)
NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ1...
```

```tsx
import Map, { Marker, NavigationControl } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

<Map
  mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
  initialViewState={{ longitude: 35.2, latitude: 31.7, zoom: 10 }}
  mapStyle="mapbox://styles/mapbox/streets-v12"
  style={{ width: '100%', height: 400 }}
>
  <Marker longitude={35.2} latitude={31.7} />
  <NavigationControl />
</Map>
```

```typescript
// Geocoding REST call
const res = await fetch(
  `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json` +
  `?access_token=${process.env.MAPBOX_SECRET_TOKEN}&limit=1`
);
const { features } = await res.json();
const [lng, lat] = features[0].center;
```

## Pricing Notes
- **Free:** 50,000 map loads/month, 100,000 geocoding requests/month — sufficient for most early-stage apps
- **Pay-as-you-go:** Map loads ~$5/1,000 after free tier; Geocoding ~$0.75/1,000 requests
- **Enterprise:** Volume discounts with SLA — negotiate if >1M map loads/month
- Watch for: every `<Map>` mount counts as a map load; avoid mounting/unmounting the map component on route changes unnecessarily

## Reference Repositories
- [visgl/react-map-gl](https://github.com/visgl/react-map-gl) — recommended React wrapper for Mapbox GL JS with hooks and TypeScript support
- [mapbox/mapbox-gl-js](https://github.com/mapbox/mapbox-gl-js) — core GL JS library; reference for low-level layer and source manipulation

## Official Documentation
- [Mapbox Docs](https://docs.mapbox.com) — full API reference for all Mapbox services
- [React Map GL Docs](https://visgl.github.io/react-map-gl/) — component API, examples, and migration guides
- [Mapbox Studio Manual](https://docs.mapbox.com/studio-manual/) — custom style creation guide

## Common Pitfalls
- **Import the CSS** — `mapbox-gl/dist/mapbox-gl.css` must be imported or the map will render without controls and with broken UI; common cause of "why does my map look broken" issues.
- **Do not use secret tokens client-side** — Mapbox tokens have two types: public (`pk.*`) and secret (`sk.*`); only public tokens belong in browser code; secret tokens should only be used server-side for style management APIs.
- **SSR / Next.js hydration errors** — Mapbox GL JS uses `window` directly; wrap the `<Map>` component in a dynamic import with `ssr: false` in Next.js to avoid server-side render errors.
- **Peer dependency mismatch** — `react-map-gl` v7+ requires `mapbox-gl` v2+; pin both together and check the compatibility table in the react-map-gl README before upgrading either.

## Examples
1. **Store locator:** Geocode user's input address server-side → return coordinates and nearby store locations as GeoJSON → render `<Map>` with a GeoJSON `<Source>` and `<Layer>` showing clustered pins → clicking a cluster zooms in, clicking a store shows a popup with hours and address.
2. **Delivery address autocomplete:** Use `@mapbox/search-js-react`'s `<SearchBox>` component → user types an address → component returns a `MapboxFeature` with coordinates → store the `[lng, lat]` alongside the formatted address string in your order record.
3. **Isochrone visualization:** POST to Mapbox Isochrone API with origin coordinates and travel time (e.g., 15 min walking) → receive GeoJSON polygon → add as a `fill` layer on the map to show reachable area for a delivery or service zone.
