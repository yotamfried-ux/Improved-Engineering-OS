# Online-First Mobile Architecture

## Description
Online-First mobile architecture treats network connectivity as a prerequisite for normal operation. Data is fetched from the server on every access (network-first caching policy), local state is minimal and ephemeral, and the app gracefully degrades to a limited or read-only experience when the connection is lost. This is the simplest mobile data architecture and the right default when users are reliably on Wi-Fi or LTE and the cost of showing stale data is high.

## When to Use
- The app requires fresh data on every screen visit (financial balances, live inventory, booking availability)
- Stale data causes user-facing errors or incorrect decisions — freshness trumps availability
- The team is small and wants to avoid the complexity of local databases and sync logic
- The target audience uses the app primarily in connected environments (office workers on Wi-Fi, urban users with reliable LTE)
- The domain has no meaningful "offline" state — a banking app with no connectivity is simply unavailable, and that is acceptable

## When NOT to Use
- Users frequently operate in low-connectivity or no-connectivity environments (field workers, travelers, rural users)
- The app's core value must be accessible offline (note-taking, navigation, inventory scanning)
- Network latency significantly degrades UX for frequently accessed screens — cache-first would be faster
- Background sync or background notifications are required, which demand local state

## Advantages
- Simplest data layer: no local database, no sync engine, no conflict resolution
- Data is always current — no staleness concerns
- Smaller app footprint: no embedded database or large local cache
- Easier to reason about: what you see is what the server has
- Security: sensitive data is not persisted on-device

## Disadvantages
- Fully dependent on network quality — slow connections degrade the entire UX
- No offline capability: any network interruption breaks core flows
- Higher latency on every interaction versus cache-first approaches
- Battery and data usage are higher when every action triggers a network call
- Poor experience in elevators, tunnels, airplane mode, or flaky hotel Wi-Fi

## Complexity
Low — standard HTTP client with loading states and error handling. Graceful degradation (showing a "no connection" banner, disabling actions) is the only additional concern beyond a basic REST client.

## Scalability
Scales with the backend. Client-side, there is no local state to manage across releases. Caching layers (CDN, HTTP cache headers, short-lived in-memory cache) can be added incrementally to reduce server load without changing the architecture.

## Key Components
- HTTP client with timeout, retry, and error classification (network error vs. server error vs. auth error)
- Loading / skeleton state on every data-dependent screen
- Network reachability monitor to show offline banners and disable destructive actions
- In-memory response cache with short TTL (seconds to minutes) for within-session deduplication
- Pull-to-refresh and stale-while-revalidate patterns for perceived performance
- Optimistic UI for write operations (show success immediately, revert on failure)

## Reference Implementations
- [square/retrofit](https://github.com/square/retrofit) — type-safe Android HTTP client; standard building block for online-first Android apps
- [Alamofire/Alamofire](https://github.com/Alamofire/Alamofire) — Swift HTTP networking library for iOS; standard choice for online-first iOS apps
- [TanStack/query](https://github.com/TanStack/query) — React Native data-fetching library with built-in loading, error, and refetch states; implements network-first caching out of the box
- [expo/expo examples](https://github.com/expo/expo/tree/main/examples) — official Expo examples demonstrating online-first data fetching patterns in React Native

## Official Sources
- [Android developers — Network overview](https://developer.android.com/training/basics/network-ops/overview) — authoritative guide to connectivity checks, HTTP clients, and background fetching on Android
- [Apple developer — URL Loading System](https://developer.apple.com/documentation/foundation/url_loading_system) — iOS/macOS networking foundation; covers URLSession, caching policies, and background transfers
- [React Native — Networking](https://reactnative.dev/docs/network) — official guide for Fetch and WebSocket usage in React Native
- [Expo Docs — Development Builds](https://docs.expo.dev/develop/development-builds/introduction/) — Expo development workflow for online-first React Native apps
- [TanStack Query — React Native Guides](https://tanstack.com/query/latest/docs/framework/react/guides/queries) — server state management and online-first caching strategies

## Related Architectures
- See also: [Offline-First](./offline-first.md) — adds a local cache as the primary source of truth with server sync
- See also: [Local-First (CRDTs)](./local-first.md) — strongest offline guarantee; data lives entirely on device
- See also: [Mobile Architecture Index](./README.md) — decision guide for choosing between mobile data strategies
