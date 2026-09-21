# Algolia

## Overview
Algolia is a hosted search-as-a-service platform that delivers sub-100ms search experiences via a global edge network. Built by Algolia, Inc., it provides typo-tolerant, relevance-tuned search with faceting, filtering, and analytics out of the box — without managing Elasticsearch or any search infrastructure.

## Capabilities
- Full-text search with typo tolerance, prefix matching, and multi-language support
- Faceted search and filtering (category, price range, attributes) with real-time counts
- Relevance tuning via custom ranking, business metrics (click-through, conversions), and A/B testing
- InstantSearch UI libraries for React, Vue, Angular, iOS, and Android — wire up search UI in minutes
- Geo-search for location-aware queries (nearest stores, events within radius)
- Query Suggestions (autocomplete from real search queries) and AI-powered personalization
- Analytics dashboard: top queries, zero-result queries, click-through rates, conversion tracking
- NeuralSearch (vector search + keyword hybrid) for semantic/intent-aware results
- Rules engine to pin, hide, or promote results based on business logic without code

## When to Use
- App requires instant, typo-tolerant search and you want to avoid infrastructure management
- E-commerce catalog search with facets, filters, and relevance tuning tied to business metrics
- Developer documentation search or knowledge base with fast, accurate results
- Need search analytics and A/B testing baked in from day one

## Limitations
- Pricing scales steeply with record count and search operations — costs can be significant for large catalogs or high-traffic apps
- Record size limit of 10KB per object; large documents must be split before indexing
- Not designed for full-document storage or complex relational queries — Algolia is a search layer, not a primary DB
- NeuralSearch (hybrid vector) is available on higher-tier plans only
- Algolia manages the index infrastructure; you cannot self-host

## Integration Guide
1. Create an Algolia account at https://www.algolia.com and note your `Application ID`, `Search-Only API Key` (public), and `Admin API Key` (server-side only)
2. Install the SDK: `npm install algoliasearch` or `pip install algoliasearch`
3. Index your data server-side using the Admin API Key:
   ```javascript
   import algoliasearch from "algoliasearch";
   const client = algoliasearch("APP_ID", "ADMIN_API_KEY");
   const index = client.initIndex("products");
   await index.saveObjects(records, { autoGenerateObjectIDIfNotExist: true });
   ```
4. Configure index settings: `searchableAttributes`, `attributesForFaceting`, `customRanking`, and `attributesToRetrieve`
5. On the client, use only the Search-Only API Key — never expose the Admin API Key in browser or mobile code
6. Integrate InstantSearch.js or React InstantSearch for the UI; connect `<SearchBox>`, `<Hits>`, and `<RefinementList>` components to the index

## Setup
```bash
# JavaScript / Node.js
npm install algoliasearch

# React InstantSearch
npm install react-instantsearch

# Python
pip install algoliasearch

# Environment variables (server-side)
export ALGOLIA_APP_ID=your_app_id
export ALGOLIA_ADMIN_API_KEY=your_admin_key  # never expose client-side

# Client-safe (public)
export NEXT_PUBLIC_ALGOLIA_SEARCH_KEY=your_search_only_key
export NEXT_PUBLIC_ALGOLIA_APP_ID=your_app_id
```

## Pricing Notes
- **Free tier:** 10K records, 10K search requests/month — suitable for prototypes and small projects
- **Grow plan:** ~$0.50/1K search requests and $0.40/1K records/month above free tier
- **Premium / Enterprise:** Custom pricing; includes NeuralSearch, advanced analytics, SLAs
- Watch for: record count is the primary cost driver for large catalogs; NeuralSearch (hybrid) requires an Enterprise plan upgrade; recommend auditing record counts and query volume before launch

## Reference Repositories
- [algolia/algoliasearch-client-javascript](https://github.com/algolia/algoliasearch-client-javascript) — official JS/TS client used for indexing and querying
- [algolia/instantsearch](https://github.com/algolia/instantsearch) — React, Vue, Angular, and vanilla InstantSearch UI components
- [algolia/algoliasearch-client-python](https://github.com/algolia/algoliasearch-client-python) — official Python client

## Official Documentation
- [Algolia Docs](https://www.algolia.com/doc/) — complete guides and API reference
- [Getting Started](https://www.algolia.com/doc/guides/getting-started/quick-start/) — index records and run first search in 5 minutes
- [InstantSearch React](https://www.algolia.com/doc/guides/building-search-ui/what-is-instantsearch/react/) — UI component library guide
- [Relevance Tuning](https://www.algolia.com/doc/guides/managing-results/relevance-overview/) — custom ranking and business metrics

## Common Pitfalls
- **Never expose the Admin API Key client-side** — it has write access to your entire application; only the Search-Only API Key should appear in browser/mobile code.
- **Index settings changes are not retroactive** — changing `searchableAttributes` or `attributesForFaceting` after indexing requires a full re-index to take effect on existing records.
- **Record size limit is 10KB** — large documents (e.g., full article content) must be split into chunks before indexing; store the full document elsewhere and only index searchable fields + a reference ID.
- **Facet counts are approximate on large result sets** — for exact facet counts, use `exhaustiveFacetsCount` mode (slower); understand this trade-off when displaying counts to users.
- **Free tier operations reset monthly** — operations include both searches and record updates; heavy re-indexing (e.g., nightly full re-index) can burn through the free quota before the month ends.

## Examples
1. **E-commerce product search:** Index product catalog with attributes `name`, `brand`, `price`, `category` → configure `attributesForFaceting` for brand and category → use React InstantSearch with `<RefinementList>` for sidebar filters and `<SortBy>` for price/popularity — all updates reflect in under 100ms.
2. **Documentation search:** Crawl docs pages with Algolia Crawler → results appear in a `<SearchBox>` modal triggered by `Cmd+K` → queries resolve in ~20ms including network round-trip to the nearest edge PoP.
3. **Query Suggestions autocomplete:** Enable the Query Suggestions feature on an existing index → Algolia generates a suggestions index from real search query logs → wire up `<Autocomplete>` component to surface trending queries as users type.
