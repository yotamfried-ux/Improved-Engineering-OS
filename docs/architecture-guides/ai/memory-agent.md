# Memory Agent

## Description
An agent augmented with persistent memory that survives beyond a single conversation. Memory operates at multiple layers: short-term (in-context), long-term (vector DB retrieval), episodic (summaries of past sessions), and semantic (extracted entities and facts). The agent reads relevant memories before responding and writes new memories after meaningful interactions.

## When to Use
- Personal assistants that must remember user preferences, history, and context
- Customer support bots that need continuity across tickets and sessions
- Research assistants accumulating knowledge across many documents over time
- Coaching or tutoring applications where progress must be tracked
- Any application where "the agent forgot what we discussed last week" is unacceptable

## When NOT to Use
- Single-session, stateless tasks (use Single Agent)
- The conversation history always fits in one context window and privacy concerns prohibit external storage
- GDPR / data-residency requirements make persisting user data complex
- Retrieval latency is unacceptable for the use case

## Advantages
- Continuity across sessions without requiring the user to repeat context
- Can accumulate knowledge over time (grows more useful with use)
- Long-term personalization without bloating context window
- Episodic memory can surface "you tried this approach before and it failed"

## Disadvantages
- Complex retrieval pipeline: embedding, indexing, similarity search, relevance ranking
- Risk of surfacing stale or incorrect memories (requires memory invalidation strategy)
- Privacy and compliance burden: memory = personal data storage
- Retrieval adds latency and cost on every turn
- Memory write conflicts when multiple sessions run concurrently

## Complexity
High — requires vector database, embedding model, retrieval logic, memory consolidation (when to write, update, or delete), and privacy controls. Each memory type (short/long/episodic/semantic) adds its own management layer.

## Scalability
Vector DB (Pinecone, Weaviate, pgvector) scales reads well. Write contention is low if sessions are per-user. Embedding generation can be batched. Main scaling concern is memory graph consistency across distributed writes.

## Key Components
- **Short-term memory** — conversation history in the active context window
- **Long-term memory store** — vector database indexed by semantic similarity
- **Episodic memory** — LLM-generated summaries of past conversations stored as retrievable chunks
- **Semantic memory** — extracted entities, facts, and user preferences stored as structured records
- **Memory retrieval** — embedding-based similarity search run before each response
- **Memory writer** — post-response hook that decides what to persist and how
- **Embedding model** — converts text to vectors (e.g., `text-embedding-3-small`)

## Reference Implementations
- [Mem0](https://github.com/mem0ai/mem0) — drop-in memory layer for AI agents; handles all four memory types with a unified API
- [LangGraph Memory Checkpointing](https://github.com/langchain-ai/langgraph) — built-in checkpointer for persisting graph state across runs; supports SQLite and PostgreSQL backends
- [MemGPT / Letta](https://github.com/cpacker/MemGPT) — OS-inspired memory management with paging (active context ↔ archival storage)
- [langchain-ai/langmem](https://github.com/langchain-ai/langmem) — LangMem: memory management SDK for AI agents
- [mem0ai/mem0](https://github.com/mem0ai/mem0) — Mem0: persistent memory layer for AI apps

## Official Sources
- [LangGraph Persistence Docs](https://langchain-ai.github.io/langgraph/concepts/persistence/) — checkpointers, thread state, memory stores
- [Mem0 Documentation](https://docs.mem0.ai/) — memory add/search/update API and supported vector backends
- [Anthropic: Memory in AI Systems](https://www.anthropic.com/research/building-effective-agents) — classification of memory types and design trade-offs

## Related Architectures
- See also: [Single Agent](./single-agent.md)
- See also: [RAG Agent](./rag-agent.md)
- See also: [Hybrid RAG](./hybrid-rag.md)
- See also: [Multi-Agent](./multi-agent.md)
