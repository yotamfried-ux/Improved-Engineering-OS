# Mobile Architecture Guides

> Navigation index for mobile application data and sync architecture patterns.

## Architectures

| Architecture | Complexity | Offline Capability | Conflict Resolution | Best For |
|---|---|---|---|---|
| [Online-First](./online-first.md) | Low | None (graceful degradation) | N/A — server is always authoritative | Apps requiring always-fresh data; reliable connectivity assumed |
| [Offline-First](./offline-first.md) | High | Full — local DB is primary | Manual strategy per entity (LWW, field-merge, server-wins) | Field workers, travelers; core actions must work offline |
| [Local-First (CRDTs)](./local-first.md) | Very High | Full — device owns the data | Automatic via CRDT merge semantics | Collaborative editing, data-sovereignty, peer-to-peer sync |

## Decision Guide

```
Does the app's core value work without network?
  No  → Online-First (simplest; handle connection loss with a graceful banner)
  Yes → continue below

Does the app require real-time multi-user collaboration
or peer-to-peer sync without a central server?
  Yes → Local-First / CRDTs (Automerge, Yjs, Electric SQL)
  No  → Offline-First (local SQLite/Room + server sync)

Does the domain have complex concurrent edit conflicts
that cannot be resolved by last-write-wins?
  Yes → Local-First / CRDTs
  No  → Offline-First with a defined conflict strategy is sufficient

Is the team experienced with distributed systems
and willing to invest in CRDT tooling?
  No  → Offline-First (high complexity but well-understood patterns)
  Yes → Local-First is viable
```

## Sync Strategy Summary

Each architecture has a distinct sync model:

| Architecture | Write Path | Read Path | Sync Trigger |
|---|---|---|---|
| Online-First | POST/PUT to server directly | GET from server (in-memory cache optional) | Every user action |
| Offline-First | Write to local DB → queue for server | Read from local DB | On reconnect; background interval |
| Local-First | Write to local CRDT doc | Read from local CRDT doc | On peer discovery; background relay |

## Related

- [Web Architecture Guides](../web/README.md)
- [API Architecture Guides](../api/README.md)
- [AI Architecture Guides](../ai/README.md)
