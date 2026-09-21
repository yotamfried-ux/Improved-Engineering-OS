# Recommendation Systems

## Description
Recommendation Systems predict which items (products, content, ads, connections) a user is most likely to engage with, given their history and context. The three dominant paradigms are: collaborative filtering (learns from patterns across users), content-based filtering (matches item attributes to user preferences), and hybrid approaches that combine both. Modern production systems add a multi-stage funnel: candidate retrieval, scoring/ranking, and re-ranking with business rules.

## When to Use
- Personalizing feeds, search results, or product listings for individual users
- Increasing engagement, discovery, or conversion by surfacing relevant items from a large catalog
- Any domain with users, items, and interaction history: e-commerce, media, social, ads, jobs
- When the catalog is too large for users to browse manually (100k+ items)
- Cross-sell and upsell use cases where related-item recommendations drive incremental revenue

## When NOT to Use
- The catalog is small enough that simple curation or editorial selection outperforms ML
- No user interaction history exists yet (cold-start dominates; use content-based or rules until data accumulates)
- Privacy constraints prohibit storing individual user interaction data
- The recommendation objective is ambiguous or rapidly changing and cannot be expressed as a measurable signal

## Advantages
- Directly drives measurable business metrics (CTR, conversion, watch time, retention)
- Collaborative filtering discovers non-obvious patterns without requiring item metadata
- Content-based filtering handles new items without interaction history (solves item cold-start)
- Hybrid systems are more robust across cold-start and long-tail scenarios than either alone
- Two-stage (retrieval + ranking) architecture enables sub-100 ms serving at billion-item scale

## Disadvantages
- Popularity bias: models over-recommend already-popular items, starving long-tail content
- Filter bubbles: collaborative filtering can trap users in narrow interest clusters
- Cold-start problem for new users and new items requires fallback strategies
- Feedback loops: serving recommendations that influence future interactions makes offline evaluation misleading
- Requires significant infrastructure: feature store, embedding index, online scorer, A/B testing

## Complexity
High — production recommendation systems require a multi-stage pipeline (retrieval, ranking, re-ranking), real-time feature serving, and continuous evaluation with online A/B tests to detect degradation.

## Scalability
Retrieval must be sub-10 ms for hundreds of millions of items; this requires approximate nearest-neighbor indexes (FAISS, ScaNN, Annoy) over learned item embeddings. The ranking model runs on O(hundreds) candidates, enabling richer features and deeper networks. Separate the retrieval and ranking models so each can scale and be updated independently.

## Key Components
- **Interaction store** — logs of user-item interactions (clicks, views, purchases, ratings) with timestamps
- **Feature store** — pre-computed user features and item features, served at low latency for online scoring
- **Retrieval model** — generates O(100–1000) candidates from millions of items quickly; two-tower neural network or matrix factorization (ALS)
- **Ranking model** — scores each candidate with richer user/item/context features; gradient boosted trees (LightGBM) or deep neural network
- **Re-ranker + business rules** — applies diversity, freshness, inventory, and policy constraints on top of the ranking scores
- **Embedding index** — ANN index (FAISS, ScaNN) over item embeddings for fast retrieval
- **A/B testing framework** — controls experiment assignment and measures online metrics per variant
- **Feedback pipeline** — streams interaction events back to update features and trigger model retraining

## Reference Implementations
- [microsoft/recommenders](https://github.com/microsoft/recommenders) — production-grade implementations of ALS, SAR, NCF, LightGBM rankers, and evaluation utilities; best single starting point
- [pytorch/pytorch](https://github.com/pytorch/pytorch) — used for two-tower retrieval models and deep ranking networks
- [facebookresearch/faiss](https://github.com/facebookresearch/faiss) — GPU-accelerated approximate nearest-neighbor search for embedding-based retrieval at scale
- [google-research/google-research](https://github.com/google-research/google-research) — Google research recommendation implementations

## Official Sources
- [Google ML Crash Course — Recommendations](https://developers.google.com/machine-learning/recommendation) — accessible end-to-end introduction to collaborative filtering and neural recommendations
- [Meta's TWO-TOWER model paper (Yi et al., 2019)](https://arxiv.org/abs/1906.00091) — architecture behind YouTube/Google and many production retrieval systems
- [FAISS documentation](https://faiss.ai/) — index types, GPU usage, and performance tuning for large-scale retrieval
- [Microsoft Recommenders Docs](https://microsoft-recommenders.readthedocs.io) — collaborative filtering, content-based, hybrid

## Related Architectures
- See also: [Batch Training](./batch-training.md)
- See also: [Online Learning](./online-learning.md)
- See also: [RAG Agent](../ai/rag-agent.md)
