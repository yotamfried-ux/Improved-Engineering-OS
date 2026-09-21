# RAG Agent (Retrieval-Augmented Generation)

## Description
A RAG Agent combines a retrieval system with a generative LLM: at query time it fetches relevant documents or chunks from an external knowledge store and injects them into the LLM's context window before generating an answer. This grounds the model's output in up-to-date, domain-specific information without fine-tuning. The "agent" variant extends basic RAG by allowing the model to issue multiple retrieval calls, reformulate queries, and reason over the retrieved content.

## When to Use
- Q&A over proprietary or frequently updated document corpora (internal wikis, legal docs, product manuals)
- When fine-tuning is too costly or the knowledge changes faster than a training cycle
- Use cases that require citations or source attribution to be trustworthy
- Domain-specific tasks where the base LLM lacks sufficient specialized knowledge
- Reducing hallucinations by anchoring generation to retrieved evidence

## When NOT to Use
- Tasks that require deep numerical reasoning over retrieved data (use a structured DB + code interpreter instead)
- Real-time data with sub-second freshness requirements (retrieval latency may be too high)
- When the corpus is small enough to fit entirely in the context window (just inject it directly)
- Highly adversarial retrieval environments where injected content could jailbreak the model

## Advantages
- Knowledge can be updated by re-indexing without retraining the model
- Supports source attribution and citation out of the box
- Reduces hallucinations compared to closed-book generation
- Works with any LLM that supports long enough context
- Scales knowledge independently of model size

## Disadvantages
- Retrieval quality bottlenecks answer quality — garbage in, garbage out
- Chunking strategy significantly affects recall; poor chunking loses context
- Adds retrieval latency (vector search + embedding) on top of LLM latency
- Context window limits how many retrieved chunks can be used simultaneously
- Requires infrastructure: vector store, embedding pipeline, ingestion jobs

## Complexity
Medium — the retrieval pipeline (chunking, embedding, indexing, re-ranking) requires significant design effort beyond the LLM call itself.

## Scalability
Vector search (HNSW, IVF) scales to hundreds of millions of vectors with systems like Pinecone, Weaviate, or pgvector. Embedding generation is the main throughput bottleneck at ingestion time. Query-time latency is typically 20–200 ms for retrieval + LLM inference.

## Key Components
- **Document ingester** — loads, splits into chunks, and embeds documents; writes to the vector store
- **Embedding model** — converts text to dense vectors (e.g., `text-embedding-3-small`, `bge-m3`)
- **Vector store** — stores and searches embeddings (pgvector, Pinecone, Weaviate, Chroma)
- **Retriever** — takes a query, embeds it, and returns top-k similar chunks
- **Re-ranker (optional)** — cross-encoder that reorders retrieved chunks by relevance (e.g., Cohere Rerank)
- **LLM** — generates the final answer given the query + retrieved context
- **Prompt template** — formats retrieved chunks and the question for the LLM
- **Citation extractor** — maps generated claims back to source documents

## Reference Implementations
- [langchain-ai/langchain](https://github.com/langchain-ai/langchain) — `create_retrieval_chain`, `RAGChain`, and vector store integrations; best starting point for standard RAG
- [langchain-ai/langgraph](https://github.com/langchain-ai/langgraph) — adaptive RAG and corrective RAG patterns with graph-based control flow
- [pydantic/pydantic-ai](https://github.com/pydantic/pydantic-ai) — typed RAG pattern with structured retrieval results
- [langchain-ai/rag-from-scratch](https://github.com/langchain-ai/rag-from-scratch) — step-by-step RAG notebooks from naive to advanced
- [anthropics/anthropic-cookbook](https://github.com/anthropics/anthropic-cookbook) — Anthropic RAG and embeddings cookbook

## Official Sources
- [Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks (Lewis et al., 2020)](https://arxiv.org/abs/2005.11401) — original RAG paper
- [LangChain RAG tutorial](https://python.langchain.com/docs/tutorials/rag/) — end-to-end implementation with vector stores and retrievers
- [pgvector README](https://github.com/pgvector/pgvector) — Postgres-native vector storage; good for teams already on Postgres
- [Anthropic Embeddings Docs](https://docs.anthropic.com/en/docs/build-with-claude/embeddings) — using embeddings with Claude
- [RAG Survey Paper](https://arxiv.org/abs/2312.10997) — "RAG for Large Language Models: A Survey"

## Related Architectures
- See also: [Hybrid RAG](./hybrid-rag.md)
- See also: [ReAct Agent](./react-agent.md)
- See also: [Tool Calling Agent](./tool-calling-agent.md)
