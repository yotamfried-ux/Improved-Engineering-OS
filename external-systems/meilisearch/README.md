# Meilisearch

## Overview
Meilisearch is an open-source, developer-friendly search engine built for speed and simplicity. Created by Meilisearch SAS (France), it delivers typo-tolerant, instant search with a minimal-configuration philosophy — getting a working search in under 15 minutes is the design goal. Available as a self-hosted binary or via Meilisearch Cloud (managed).

## Capabilities
- Typo-tolerant full-text search with prefix matching and highlighting out of the box
- Faceted search and filtering with exact and range filter operators
- Geo-search with radius and bounding-box filtering
- Vector search (semantic search) with built-in embedder support (OpenAI, HuggingFace, Ollama, custom REST)
- Hybrid search combining keyword and semantic scores with a configurable balance
- Multi-search: run multiple queries in one HTTP call
- Tenant tokens (JWT-based) for per-user query scoping without a backend proxy
- Index swapping for zero-downtime re-indexing
- Multilingual support with language-specific tokenizers

## When to Use
- Prioritize developer simplicity and fast time-to-search over advanced relevance tuning
- Self-hosted search stack on EU servers (GDPR-friendly, data never leaves your infra)
- Adding search to a content site, blog, or documentation portal
- Open-source project where licensing a hosted search service is not an option

## Limitations
- Less mature relevance tuning than Algolia (no A/B testing, no click-through ranking out of the box)
- Index size is bounded by available RAM — all data must fit in memory for peak performance (disk-based mode exists but is slower)
- Cluster mode and high-availability are available but require more operational knowledge than a fully managed service
- Meilisearch Cloud is smaller and younger than Algolia/Elasticsearch managed offerings

## Integration Guide
1. Start Meilisearch (Docker):
   ```bash
   docker run -p 7700:7700 -v $(pwd)/meili-data:/meili_data \
     getmeili/meilisearch:v1.9 \
     meilisearch --master-key="your_master_key"
   ```
2. Install the client: `npm install meilisearch` or `pip install meilisearch`
3. Create an index and add documents:
   ```javascript
   import { MeiliSearch } from "meilisearch";
   const client = new MeiliSearch({ host: "http://localhost:7700", apiKey: "your_master_key" });
   const index = client.index("movies");
   await index.addDocuments(documents); // returns a task; await task.waitForTask()
   ```
4. Configure index settings: `filterableAttributes`, `sortableAttributes`, `searchableAttributes`, and `rankingRules` via `index.updateSettings()`
5. Search: `await index.search("batman", { filter: "year > 2010", limit: 10 })`
6. For production, generate API keys scoped to specific indexes and actions — never expose the master key client-side

## Setup
```bash
# Docker (recommended for local dev)
docker run -it --rm -p 7700:7700 getmeili/meilisearch:v1.9

# Binary (Linux)
curl -L https://install.meilisearch.com | sh
./meilisearch --master-key="your_master_key"

# Node.js client
npm install meilisearch

# Python client
pip install meilisearch

# Environment variables
export MEILI_MASTER_KEY=your_master_key
export MEILI_HOST=http://localhost:7700
```

## Pricing Notes
- **Self-hosted:** Free and open-source (MIT license); only pay for your compute
- **Meilisearch Cloud:** Free tier includes 100K documents and 10K searches/month; Pro from ~$30/month; pricing at https://www.meilisearch.com/pricing
- Watch for: RAM usage grows linearly with index size — check memory headroom before scaling; cloud plan limits on document count can be hit faster than expected for content-heavy sites

## Reference Repositories
- [meilisearch/meilisearch](https://github.com/meilisearch/meilisearch) — core engine source (Rust)
- [meilisearch/meilisearch-js](https://github.com/meilisearch/meilisearch-js) — official JavaScript client with TypeScript types
- [meilisearch/meilisearch-python](https://github.com/meilisearch/meilisearch-python) — official Python client
- [meilisearch/docs-scraper](https://github.com/meilisearch/docs-scraper) — crawl and index documentation sites automatically

## Official Documentation
- [Meilisearch Docs](https://www.meilisearch.com/docs) — guides, API reference, and configuration options
- [Getting Started](https://www.meilisearch.com/docs/learn/getting_started/quick_start) — index documents and search in under 10 minutes
- [Vector Search](https://www.meilisearch.com/docs/learn/ai_powered_search/getting_started_with_ai_search) — hybrid semantic + keyword search setup
- [API Keys](https://www.meilisearch.com/docs/reference/api/keys) — scoped key management for production

## Common Pitfalls
- **Master key vs. API keys** — never expose the master key client-side; generate scoped API keys with specific actions (`search`, `addDocuments`) and target index names for use in browser and mobile code.
- **Indexing is asynchronous** — `addDocuments()` returns a task object; documents are not immediately searchable. Await `task.waitForTask()` in tests, or poll the task status endpoint in production workflows.
- **RAM is the primary scaling constraint** — Meilisearch loads its index into memory for fast search; monitor RAM usage as document count grows and size your instance accordingly.

## Examples
1. **Documentation site search:** Run docs-scraper to crawl Markdown/HTML pages → documents land in Meilisearch → add a `<SearchModal>` triggered by `Cmd+K` using the JS client → search feels instant because queries resolve locally or at a PoP in ~5ms.
2. **Blog/content search:** Index posts with `title`, `content`, `tags`, and `publishedAt` fields → set `filterableAttributes: ["tags"]` → users can search by keyword and filter by tag in a single query with no additional backend logic.
3. **Hybrid AI-powered search:** Configure an OpenAI embedder in index settings → Meilisearch auto-generates vectors on document ingest → at query time, set `hybrid: { embedder: "openai", semanticRatio: 0.5 }` to blend BM25 and cosine similarity — no separate vector DB needed.
