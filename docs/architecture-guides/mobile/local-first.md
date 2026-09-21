# Local-First Architecture (CRDTs)

## Description
Local-First architecture goes further than Offline-First by treating the local device as the definitive owner of data, not merely a cache. Sync is a peer-to-peer or server-assisted replication concern, not a primary data flow. Conflict-free Replicated Data Types (CRDTs) or Operational Transformation algorithms resolve concurrent edits automatically and mathematically, eliminating the need for a custom conflict resolver. Users own their data on-device; the server (if present) is a relay and backup, not the source of truth.

## When to Use
- Collaborative real-time editing is a core feature (shared documents, whiteboards, multiplayer design tools)
- Strong privacy or data-sovereignty requirements demand that data live on user devices, not servers
- The domain has concurrent multi-device edits that must merge without data loss and without user intervention
- Network connectivity is unreliable or deliberately absent (peer-to-peer local network, air-gapped environments)
- The product differentiates on offline capability, data portability, or user data ownership

## When NOT to Use
- The domain requires a single authoritative server state (financial ledger, inventory with hard stock limits)
- The team is not prepared for CRDT learning curve and the debugging complexity of distributed state
- Data must be centrally controlled for compliance, audit, or moderation (CRDT data on devices is not centrally revocable)
- The dataset is large, structured, and relational — CRDTs are optimized for text, counters, and sets, not complex relational schemas
- A simpler offline-first approach with last-write-wins is sufficient for the use case

## Advantages
- Zero merge conflicts: CRDTs guarantee mathematically sound automatic merge of concurrent edits
- Strongest offline guarantee: no network required for any operation, ever
- Real-time collaboration without a coordination server: peers sync directly or via a relay
- Data ownership: user data lives on their device; server is optional and replaceable
- Low latency: all writes are local and instant; replication is background

## Disadvantages
- Steep learning curve: CRDTs require understanding of distributed systems theory; most engineers are unfamiliar
- Limited data model: not all domain logic maps cleanly to CRDT types (counters, sets, sequences); complex business rules may be impossible to express
- Storage overhead: CRDT metadata (tombstones, vector clocks, operation logs) can be significantly larger than the data itself
- Garbage collection is hard: deleted items leave tombstones that grow indefinitely without a compaction protocol
- Debugging is extremely difficult: the merge semantics are deterministic but not always intuitive
- Ecosystem is still maturing: production-grade libraries exist but are younger than traditional databases

## Complexity
High — CRDTs themselves are well-specified, but integrating them into a production app (storage, network transport, GC, schema evolution, and tooling) requires deep expertise and sustained engineering investment.

## Scalability
Excellent for write throughput — every device writes locally without coordination. Replication throughput depends on the relay/server, but the relay is stateless and horizontally scalable. The main scalability concern is CRDT document size growth over time, which requires periodic compaction or snapshotting.

## Key Components
- CRDT library: Automerge (document-level CRDT, JavaScript/Rust), Yjs (high-performance text and structured data, JavaScript), or Diamond Types (Rust, optimized for text)
- Local storage backend: IndexedDB (web), SQLite, or LevelDB for persisting CRDT state
- Sync transport: WebSocket relay server (Yjs y-websocket), WebRTC for peer-to-peer, or custom HTTP delta sync
- Vector clock / Lamport timestamp for causal ordering of operations
- Awareness protocol for ephemeral state (cursor positions, presence) that does not need CRDT persistence
- Compaction / snapshot mechanism to bound document size growth
- Optional server relay (y-websocket, Automerge sync server) for persistence and bootstrapping new peers

## Reference Implementations
- [evoluhq/evolu](https://github.com/evoluhq/evolu) — Local-first platform for React Native with CRDT-based sync
- [automerge/automerge](https://github.com/automerge/automerge) — production CRDT library with Rust core and JS/Swift bindings; used in Ink & Switch research and production apps
- [yjs/yjs](https://github.com/yjs/yjs) — the most widely deployed CRDT library; powers collaborative features in many editors and tools
- [electric-sql/electric](https://github.com/electric-sql/electric) — Postgres-to-SQLite local-first sync with CRDT-like guarantees; bridges relational data and local-first principles
- [josephg/diamond-types](https://github.com/josephg/diamond-types) — high-performance CRDT for text in Rust; useful reference for CRDT internals

## Official Sources
- [Ink & Switch — Local-first software](https://www.inkandswitch.com/local-first/) — the foundational essay defining the local-first philosophy and seven ideals
- [Yjs documentation](https://docs.yjs.dev/) — authoritative guide to Yjs shared types, providers, and sync protocols
- [Automerge documentation](https://automerge.org/docs/hello/) — getting-started guide and API reference for the Automerge CRDT library
- [ElectricSQL Docs](https://electric-sql.com/docs) — local-first PostgreSQL sync
- [Martin Kleppmann — CRDTs: The Hard Parts](https://martin.kleppmann.com/2020/07/06/crdt-hard-parts-hydra.html) — essential talk on practical CRDT failure modes (anomalies, interleaving, intent preservation)

## Related Architectures
- See also: [Offline-First](./offline-first.md) — simpler alternative with manual conflict resolution; lower complexity for most apps
- See also: [Online-First](./online-first.md) — network-dependent baseline; appropriate when strong server authority is required
- See also: [Mobile Architecture Index](./README.md) — decision guide for choosing between mobile data strategies
- See also: [Event-Driven Architecture (API layer)](../api/event-driven.md) — the operation log in CRDTs is structurally similar to an event stream
