# Chroma

## Overview
Chroma is an open-source embedding database designed for AI applications, making it easy to store, query, and manage vector embeddings alongside their metadata and source documents. Built by Chroma, Inc., its core value proposition is developer simplicity: no infra required for local development — embeddings persist to disk with a single Python call, and the same API works in production via Chroma Cloud or a self-hosted server.

## Capabilities
- Store embeddings with metadata and raw document text in a single `Collection`
- Query by semantic similarity (cosine, L2, or inner product distance) with optional metadata pre-filtering
- Auto-embedding: pass raw text and Chroma calls an embedding function (OpenAI, Cohere, HuggingFace, sentence-transformers) on your behalf
- Persistent local storage (DuckDB + Parquet) with zero configuration for development
- Client-server mode via `chromadb` server for multi-process or remote access
- Multi-tenant support via `tenant` and `database` namespaces
- LangChain and LlamaIndex native integration — `Chroma` is the default vector store in both frameworks
- `where` metadata filters using MongoDB-style operators (`$eq`, `$in`, `$gte`, etc.) combinable with vector search

## When to Use
- Local development or prototyping of RAG pipelines — zero setup, zero infra
- LangChain or LlamaIndex project that needs a vector store and you want the path of least resistance
- Small-to-medium production workloads where a single-node deployment is acceptable
- Experimenting with embeddings before committing to a more complex vector DB (Pinecone, Qdrant, Weaviate)

## Limitations
- Not designed for billion-scale vector workloads — at very large scale, Pinecone, Qdrant, or Weaviate are more appropriate
- Single-node server mode lacks built-in clustering, replication, or HA — not suitable for high-availability production without Chroma Cloud
- Metadata filtering performance degrades on very large collections without careful indexing strategy
- The persistent local backend (DuckDB) is not safe for concurrent multi-writer access — use server mode for multi-process apps
- Chroma Cloud is newer and less battle-tested than managed alternatives like Pinecone

## Integration Guide
1. Install: `pip install chromadb`
2. In-memory or persistent local usage:
   ```python
   import chromadb

   # Ephemeral (in-memory, for testing)
   client = chromadb.EphemeralClient()

   # Persistent (survives restarts)
   client = chromadb.PersistentClient(path="./chroma_data")

   collection = client.get_or_create_collection("my_docs")
   collection.add(
       documents=["text chunk 1", "text chunk 2"],
       metadatas=[{"source": "doc1"}, {"source": "doc1"}],
       ids=["id1", "id2"],
   )
   results = collection.query(query_texts=["my question"], n_results=5)
   ```
3. For remote/server mode: run `chroma run --path /db` and connect via `chromadb.HttpClient(host="...", port=8000)`
4. For auto-embedding with OpenAI: `chromadb.utils.embedding_functions.OpenAIEmbeddingFunction(api_key=..., model_name="text-embedding-3-small")`
5. With LangChain: `from langchain_chroma import Chroma; vectorstore = Chroma(collection_name="docs", embedding_function=embeddings)`

## Setup
```bash
# Install the Python library
pip install chromadb

# Optional: install with server extras for running the HTTP server
pip install "chromadb[server]"

# Run Chroma as an HTTP server
chroma run --path ./chroma-data --port 8000

# Docker
docker pull chromadb/chroma
docker run -p 8000:8000 -v $(pwd)/chroma-data:/chroma/chroma chromadb/chroma

# Environment variables for HTTP client
export CHROMA_HOST=http://localhost
export CHROMA_PORT=8000

# LangChain integration
pip install langchain-chroma
```

## Pricing Notes
- **Self-hosted:** Free and open-source (Apache 2.0); only pay for compute
- **Chroma Cloud:** Pricing at https://trychroma.com; free tier available; paid tiers based on storage and query volume
- Watch for: persistent local mode stores data as files on disk — back up the `chroma_data` directory; in-memory client loses all data on process restart; for production, prefer server mode or Chroma Cloud

## Reference Repositories
- [chroma-core/chroma](https://github.com/chroma-core/chroma) — core Chroma source code (Python + Rust backend)
- [chroma-core/chroma-cookbook](https://github.com/chroma-core/chroma) — example notebooks and integration patterns (found under the `/docs` and `/examples` folders)

## Official Documentation
- [Chroma Docs](https://docs.trychroma.com/) — complete API reference, getting started, and deployment guides
- [Usage Guide](https://docs.trychroma.com/docs/overview/usage-guide) — collections, add, query, and update operations
- [Embedding Functions](https://docs.trychroma.com/docs/embeddings/embedding-functions) — built-in integrations with OpenAI, Cohere, HuggingFace, and others
- [Running Chroma in Client-Server Mode](https://docs.trychroma.com/production/chroma-server/client-server-mode) — deployment for production

## Examples
1. **Local RAG prototype in 10 lines:** Load PDF → chunk text → `collection.add(documents=chunks, ids=ids)` → `collection.query(query_texts=[question])` → pass top-K results to LLM — no Docker, no API key for the vector store, no infra setup needed.
2. **LangChain document QA:** `from langchain_chroma import Chroma` → `vectorstore = Chroma.from_documents(docs, OpenAIEmbeddings())` → `retriever = vectorstore.as_retriever()` → wire into `RetrievalQA` chain — Chroma is the default vector store in LangChain's quickstart guides.
3. **Metadata-filtered search:** Index news articles with `{"date": "2025-06-15", "category": "tech"}` metadata → query with `where={"$and": [{"category": {"$eq": "tech"}}, {"date": {"$gte": "2025-01-01"}}]}` — returns only semantically relevant recent tech articles, combining vector similarity with structured filtering.
