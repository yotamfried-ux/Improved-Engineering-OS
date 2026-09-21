# Cohere

## Overview
Cohere is an enterprise-focused LLM API provider with strong capabilities in retrieval-augmented generation (RAG), semantic search, and reranking. Founded by former Google Brain researchers, Cohere differentiates on its Rerank API (reorders search results by relevance), its Command models for instruction following, and its deployment flexibility — available on AWS, Azure, GCP, and private cloud in addition to Cohere's own hosted API.

## Capabilities
- Command R and Command R+ models for instruction following, tool use, and long-context tasks (128K tokens)
- Embed v3: state-of-the-art embeddings for semantic search with English and multilingual variants; supports `input_type` (search_query, search_document, classification, clustering)
- Rerank API: re-scores a list of candidate documents for a query without full embedding — very fast relevance improvement step for RAG
- RAG-native: Command R has built-in grounding and citation generation — returns `citations` array linking answer spans to source documents
- Tool use / function calling for agentic workflows
- Connectors API: connect Command R to external data sources (Slack, Google Drive, Confluence) for real-time RAG
- Fine-tuning for Embed and Command models on custom domain data
- Available via Cohere private deployment on VPC for data-sovereignty requirements

## When to Use
- Building a RAG pipeline where reranking retrieved documents before passing to the LLM significantly improves accuracy (Rerank is best-in-class)
- Enterprise search or knowledge base where embedding quality and multilingual support matter
- Need RAG with built-in citation grounding (Command R returns source citations natively)
- Deploying on AWS Bedrock or Azure AI without managing Cohere credentials directly

## Limitations
- Command R is not as strong as GPT-4o or Claude Sonnet on general reasoning and creative tasks — it is optimized for RAG and enterprise search, not broad capability
- Smaller developer community and ecosystem than OpenAI; fewer tutorials and open-source integrations
- Fine-tuning is available but more limited than OpenAI's fine-tuning in terms of supported data formats and flexibility
- Rate limits on trial tier are quite restrictive

## Integration Guide
1. Get an API key from https://dashboard.cohere.com and set it as `COHERE_API_KEY`
2. Install the SDK: `pip install cohere` or `npm install cohere-ai`
3. Generate embeddings for indexing:
   ```python
   import cohere
   co = cohere.Client("COHERE_API_KEY")
   response = co.embed(
       texts=["doc1 text", "doc2 text"],
       model="embed-english-v3.0",
       input_type="search_document",
   )
   # response.embeddings → list of 1024-dim vectors
   ```
4. At query time, embed the query with `input_type="search_query"`, retrieve top-K from your vector DB, then rerank:
   ```python
   results = co.rerank(
       query="user question",
       documents=[{"text": doc} for doc in retrieved_docs],
       model="rerank-english-v3.0",
       top_n=5,
   )
   ```
5. Pass reranked documents as context to `co.chat()` with Command R — the response includes a `citations` array mapping answer text to source documents

## Setup
```bash
# Python SDK
pip install cohere

# Node.js SDK
npm install cohere-ai

# Environment variable
export COHERE_API_KEY=your_api_key

# Via AWS Bedrock (no Cohere credentials needed — uses AWS auth)
pip install boto3
# Then use cohere.BedrockClient(aws_region="us-east-1")

# Via Azure AI
pip install cohere
# Use cohere.Client(api_key=AZURE_KEY, base_url=AZURE_ENDPOINT)
```

## Pricing Notes
- **Command R:** ~$0.15/1M input tokens, $0.60/1M output tokens
- **Command R+:** ~$2.50/1M input, $10/1M output
- **Embed v3:** ~$0.10/1M tokens
- **Rerank:** ~$2.00/1K queries (1K searches × returned documents); pricing per 1K queries regardless of document count
- **Free trial:** 1K API calls/month on the trial key (rate-limited)
- Watch for: Rerank cost is per query, not per document — it is cheap per query but can accumulate at scale; check https://cohere.com/pricing for current rates

## Reference Repositories
- [cohere-ai/cohere-python](https://github.com/cohere-ai/cohere-python) — official Python SDK with typed interfaces
- [cohere-ai/cohere-typescript](https://github.com/cohere-ai/cohere-typescript) — official TypeScript/Node.js SDK
- [cohere-ai/notebooks](https://github.com/cohere-ai/notebooks) — Jupyter notebooks covering RAG, Rerank, and Embed use cases

## Official Documentation
- [Cohere Docs](https://docs.cohere.com/) — complete API reference and guides
- [Embed Guide](https://docs.cohere.com/docs/embeddings) — embedding models, input types, and semantic search patterns
- [Rerank Guide](https://docs.cohere.com/docs/reranking) — how to use Rerank in a retrieval pipeline
- [RAG with Command R](https://docs.cohere.com/docs/retrieval-augmented-generation-rag) — grounded generation with citations

## Examples
1. **RAG pipeline with reranking:** Query arrives → embed with `embed-english-v3.0` → retrieve top-50 chunks from pgvector → rerank to top-5 with `rerank-english-v3.0` → pass to Command R → response includes `citations` linking each answer sentence to the source document — no post-processing needed to attribute sources.
2. **Enterprise knowledge base search:** Index internal wiki pages with Embed v3 → build a semantic search UI → Rerank re-scores keyword + semantic results in a single call → accuracy improvement of 15-20% over pure vector search on enterprise knowledge bases.
3. **Multi-cloud deployment:** Deploy Command R on AWS Bedrock via `cohere.BedrockClient` → no Cohere account or API key required for the production workload → AWS IAM controls access, VPC keeps data off the public internet, and AWS Cost Explorer tracks LLM spend alongside other cloud costs.
