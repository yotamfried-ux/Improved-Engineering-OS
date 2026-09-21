# Offline-First Mobile Architecture

## Description
Offline-First architecture makes the local device cache the primary source of truth for reads. The app reads from and writes to a local database (SQLite, MMKV, or a structured store) at all times; a sync engine replicates changes to and from the server whenever connectivity is available. Users experience zero loading spinners for cached data and can perform core actions without a network connection, with changes reconciled in the background.

## When to Use
- Users regularly operate in low-connectivity environments (field workers, warehouse scanners, travelers)
- Core actions (creating a record, updating a task, capturing a note) must work without network
- Perceived performance is critical — instant reads from local DB beat a network round-trip every time
- The dataset is bounded and fits on device (task lists, contacts, documents, product catalog)
- Background sync is acceptable for convergence — the app does not require real-time consistency

## When NOT to Use
- Data changes so rapidly that a local cache is always stale and misleading (live order book, real-time auction)
- The dataset is too large to store on device (full media library, petabyte data warehouse)
- Conflict resolution logic for the domain is intractably complex and business rules cannot allow any ambiguity
- Regulatory requirements prohibit persisting sensitive data on-device (some healthcare/finance contexts)
- The team has no prior experience with sync architectures — the operational complexity is significant

## Advantages
- Instant reads from local DB regardless of connectivity
- Core flows work fully offline; sync happens transparently when back online
- Resilient to network interruptions — no data loss, no broken flows
- Better battery and data efficiency: sync in batches rather than one request per user action
- Natural audit trail: local write log can serve as the sync queue

## Disadvantages
- Conflict resolution is hard: two devices editing the same record while offline need a defined merge strategy (last-write-wins, field-level merge, manual resolution prompt)
- Schema migrations must be coordinated between local DB schema and server schema — mismatches cause sync failures
- Background sync complexity: handling retries, partial sync, and ordering of dependent operations
- Testing is significantly more complex — must cover online, offline, and reconnection scenarios
- Data on-device is a security surface: encryption at rest (SQLCipher, Android Keystore, iOS Data Protection) is required for sensitive data

## Complexity
High — the local database, sync queue, conflict resolution strategy, background worker, and error recovery all need to be designed and maintained. The sync engine alone is often the most complex subsystem in a mobile codebase.

## Scalability
Scales well on the client — reads are always local and fast. Server-side, the sync endpoint must handle concurrent updates from many devices and apply conflict resolution consistently. Delta sync (syncing only changed records since a timestamp or sequence number) is essential at scale to avoid full-dataset transfers.

## Key Components
- Local database: SQLite (via Room on Android, GRDB/CoreData on iOS, expo-sqlite on React Native) or MMKV for key-value
- Sync queue: ordered log of local mutations pending upload (timestamp, entity ID, operation type, payload)
- Sync engine: background worker that flushes the write queue and pulls server changes on reconnect
- Conflict resolver: per-entity strategy (last-write-wins by `updated_at`, field-level merge, server-wins, or manual)
- Network reachability observer: triggers sync on connectivity restore
- Sync cursor / watermark: tracks the last successfully synced server sequence to enable delta pull
- Encryption at rest: SQLCipher or platform keychain integration for sensitive fields

## Reference Implementations
- [realm/realm-swift](https://github.com/realm/realm-swift) and [realm/realm-java](https://github.com/realm/realm-java) — mobile-first database with built-in sync (Atlas Device Sync); reference for offline-first patterns
- [realm/realm-js examples](https://github.com/realm/realm-js/tree/main/examples) — Realm offline-first database examples for React Native
- [powersync-open-source/powersync-service](https://github.com/powersync-open-source/powersync-service) — open-source Postgres-to-SQLite sync engine designed for offline-first mobile apps
- [WatermelonDB/WatermelonDB](https://github.com/Nozbe/WatermelonDB) — high-performance React Native database with lazy loading and sync adapter interface
- [cashapp/sqldelight](https://github.com/cashapp/sqldelight) — type-safe SQLite for Kotlin Multiplatform; widely used in offline-first Android/KMP apps

## Official Sources
- [Android developers — Save data in a local database](https://developer.android.com/training/data-storage/room) — Room (SQLite ORM) documentation; the standard Android offline-first data layer
- [Apple developer — Core Data](https://developer.apple.com/documentation/coredata) — Apple's local persistence framework with CloudKit sync integration
- [PouchDB / CouchDB sync protocol](https://pouchdb.com/guides/replication.html) — well-documented open sync protocol that inspired many offline-first sync designs

## Related Architectures
- See also: [Online-First](./online-first.md) — simpler alternative when connectivity is reliable and freshness is paramount
- See also: [Local-First (CRDTs)](./local-first.md) — extends offline-first with peer-to-peer sync and CRDT-based automatic conflict resolution
- See also: [Mobile Architecture Index](./README.md) — decision guide for choosing between mobile data strategies
