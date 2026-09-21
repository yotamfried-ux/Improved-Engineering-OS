# Hybrid RAG

## Description
Hybrid RAG combines multiple retrieval strategies — typically dense vector search, sparse keyword search (BM25/TF-IDF), and optionally structured SQL/graph queries — and fuses their results before passing them to the LLM. The intuition is that dense search excels at semantic similarity while sparse search excels at exact keyword matches; combining them yields higher recall and precision than either alone.

## When to Use
- Production search over mixed corpora where both exact-match and semantic recall matter
- Documents with dense technical terminology, product codes, or proper nouns that vector search misses
- Enterprise knowledge bases where users issue both natural-language and keyword-style queries
- When a pure vector search baseline shows acceptable but not great recall
- Use cases where query types are unpredictable (some queries are semantic, some are exact)

## When NOT to Use
- Simple corpora where a single retrieval method already achieves high recall
- Latency-critical systems where running two search paths in parallel is too slow
- Teams that lack operational capacity to maintain both a vector store and a keyword index
- When structured data queries (SQL) are the dominant use case — use a text-to-SQL pattern instead

## Advantages
- Higher recall than any single retrieval method alone
- Handles vocabulary mismatch (synonyms, paraphrases) via vector search
- Handles exact-match queries (codes, names, abbreviations) via BM25
- Reciprocal Rank Fusion (RRF) provides a parameter-free, robust merge strategy
- Can incorporate structured filters (metadata, date ranges) on top of both paths
- Each retrieval path can be tuned or swapped independently

## Disadvantages
- Operationally complex: two or more indexes to maintain and keep in sync
- Higher query latency unless both paths run in parallel
- Re-ranking adds another latency + cost layer
- Fusion strategy (RRF weights, score normalization) requires offline evaluation to tune
- More failure modes — either index can be stale or degraded independently

## Complexity
High — requires orchestrating multiple retrieval systems, a fusion layer, and optionally a re-ranker.

## Scalability
Each path scales independently. Dense search scales with vector store capacity; sparse search scales with an Elasticsearch/OpenSearch cluster. The bottleneck is typically the re-ranker (cross-encoder), which runs sequentially over the merged candidate set. Batch re-ranking or limiting candidates to top-50 keeps latency manageable.

## Key Components
- **Dense retriever** — embedding model + vector store (pgvector, Pinecone, Weaviate)
- **Sparse retriever** — BM25 index (Elasticsearch, OpenSearch, or `rank-bm25` for small corpora)
- **Structured retriever (optional)** — SQL query generator or graph traversal for tabular/relational data
- **Fusion layer** — merges ranked lists; Reciprocal Rank Fusion (RRF) is the standard choice
- **Re-ranker (optional)** — cross-encoder model (Cohere Rerank, `ms-marco-MiniLM`) for final ordering
- **Metadata filter** — applies pre-filter (date, category, access control) before or after retrieval
- **LLM + prompt** — generates the final answer from the fused, re-ranked chunks

## Reference Implementations
- [langchain-ai/langchain](https://github.com/langchain-ai/langchain) — `EnsembleRetriever` combines multiple retrievers with configurable weights; simplest path to hybrid retrieval
- [langchain-ai/langgraph](https://github.com/langchain-ai/langgraph) — adaptive retrieval graphs that dynamically choose or combine retrieval strategies per query
- [microsoft/graphrag](https://github.com/microsoft/graphrag) — hybrid retrieval combining vector search with knowledge graph traversal for complex reasoning
- [qdrant/qdrant/examples](https://github.com/qdrant/qdrant/tree/master/examples) — Qdrant hybrid search (dense + sparse) examples
- [cohere-ai/notebooks](https://github.com/cohere-ai/notebooks) — Cohere Rerank with hybrid retrieval notebooks

## Official Sources
- [Reciprocal Rank Fusion (Cormack et al., 2009)](https://dl.acm.org/doi/10.1145/1571941.1572114) — original RRF paper; the canonical score fusion method
- [Cohere Rerank documentation](https://docs.cohere.com/docs/reranking) — practical guide to cross-encoder re-ranking in hybrid pipelines
- [Elasticsearch hybrid search guide](https://www.elastic.co/guide/en/elasticsearch/reference/current/knn-search.html) — combining BM25 and kNN in a single query
- [Pinecone — Hybrid Search](https://docs.pinecone.io/guides/data/understanding-hybrid-search) — hybrid search architecture guide
- [Weaviate Hybrid Search Docs](https://weaviate.io/developers/weaviate/search/hybrid) — BM25 + vector hybrid retrieval

## Related Architectures
- See also: [RAG Agent](./rag-agent.md)
- See also: [Tool Calling Agent](./tool-calling-agent.md)
- See also: [ReAct Agent](./react-agent.md)
