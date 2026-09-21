# Mistral AI

## Overview
Mistral AI is a French AI company offering both open-weight models (freely downloadable) and a commercial API with proprietary frontier models. Its open-weight models (Mistral 7B, Mixtral 8x7B, Mixtral 8x22B) set the efficiency-per-parameter benchmark when released, and its commercial models (Mistral Large, Mistral Medium) are competitive with GPT-4 class on code, reasoning, and multilingual tasks — with strong EU data-residency compliance posture.

## Capabilities
- Commercial API with Mistral Large 2, Mistral Medium, and Mistral Small models
- Open-weight models: Mistral 7B Instruct, Mixtral 8x7B, Mixtral 8x22B — runnable locally via Ollama, vLLM, or Hugging Face
- Function/tool calling with JSON-mode structured outputs
- Codestral: specialized code generation and completion model (fill-in-the-middle for IDE integration)
- Mistral Embed: text embeddings for semantic search and RAG
- JSON mode (`response_format: { type: "json_object" }`) for reliable structured output
- Context windows up to 128K tokens (Mistral Large 2)
- La Plateforme API is OpenAI-compatible — swap base URL to migrate existing code
- European data centers (France) — useful for GDPR and EU data residency requirements

## When to Use
- Need a capable LLM API with a European data-residency guarantee (GDPR, data sovereignty)
- Evaluating cost-efficiency: Mistral Small and Medium are significantly cheaper than GPT-4o for similar quality on many tasks
- Running open-weight models locally for privacy, offline use, or cost elimination
- Code generation at scale: Codestral is purpose-built and competitive with Copilot-class models for fill-in-the-middle
- Multilingual applications: Mistral models have strong non-English language performance

## Limitations
- Mistral Large 2 is competitive but not consistently ahead of GPT-4o or Claude Sonnet on complex reasoning benchmarks
- Smaller ecosystem than OpenAI — fewer LangChain/LlamaIndex integrations are tested against Mistral by default
- Open-weight models require non-trivial infra to serve at scale (GPU servers, vLLM, quantization tuning)
- Rate limits on La Plateforme are lower than OpenAI at equivalent spend — plan for this in burst scenarios
- Codestral is available separately and has its own API key/terms of service

## Integration Guide
1. Get an API key from https://console.mistral.ai and set it as `MISTRAL_API_KEY`
2. Install the client: `npm install @mistralai/mistralai` or `pip install mistralai`
3. Basic chat:
   ```python
   from mistralai import Mistral
   client = Mistral(api_key="MISTRAL_API_KEY")
   response = client.chat.complete(
       model="mistral-large-latest",
       messages=[{"role": "user", "content": "Explain mixture of experts"}]
   )
   print(response.choices[0].message.content)
   ```
4. La Plateforme is OpenAI-compatible — set `base_url="https://api.mistral.ai/v1"` in the OpenAI client as an alternative
5. For function calling: define tools in the same schema as OpenAI's `tools` parameter; handle `tool_calls` in the response identically
6. For JSON mode: set `response_format={"type": "json_object"}` and instruct the model in the system prompt to output JSON

## Setup
```bash
# Python SDK
pip install mistralai

# Node.js SDK
npm install @mistralai/mistralai

# Run open-weight models locally with Ollama
ollama pull mistral
ollama pull mixtral
ollama run mistral "Hello"

# Environment variables
export MISTRAL_API_KEY=your_api_key

# OpenAI-compatible usage (swap base URL)
export OPENAI_BASE_URL=https://api.mistral.ai/v1
export OPENAI_API_KEY=$MISTRAL_API_KEY
```

## Pricing Notes
- **Mistral Small:** ~$0.10/1M input, $0.30/1M output — excellent cost for high-volume classification/extraction
- **Mistral Medium:** ~$0.40/1M input, $2.00/1M output
- **Mistral Large 2:** ~$2.00/1M input, $6.00/1M output (check https://mistral.ai/technology/#pricing for current)
- **Codestral:** separate pricing via La Plateforme; free tier available for non-commercial use
- **Open-weight models:** free to run; only pay for compute
- Watch for: free tier rate limits are quite tight; upgrade to a paid tier as soon as moving beyond prototyping

## Reference Repositories
- [mistralai/mistral-src](https://github.com/mistralai/mistral-src) — reference implementation of Mistral and Mixtral model architectures
- [mistralai/client-python](https://github.com/mistralai/client-python) — official Python SDK
- [mistralai/client-js](https://github.com/mistralai/client-js) — official JavaScript/TypeScript SDK

## Official Documentation
- [Mistral Docs](https://docs.mistral.ai/) — complete API reference, model guides, and cookbook
- [La Plateforme](https://console.mistral.ai) — API key management and usage dashboard
- [Codestral](https://docs.mistral.ai/capabilities/code_generation/) — code generation and fill-in-the-middle guide
- [Function Calling](https://docs.mistral.ai/capabilities/function_calling/) — tool use patterns

## Examples
1. **Multilingual customer support classification:** Use Mistral Small with JSON mode to classify incoming support tickets by language, topic, and urgency — at ~$0.10/1M tokens, can process millions of tickets cheaply without fine-tuning.
2. **Local open-weight inference for privacy:** Pull Mixtral 8x7B via Ollama → run entirely on local GPU → customer PII never leaves the premises — suitable for legal, medical, or finance use cases with strict data-handling requirements.
3. **OpenAI migration test:** Set `OPENAI_BASE_URL=https://api.mistral.ai/v1` and `OPENAI_API_KEY` → existing OpenAI SDK code switches to Mistral Large 2 with zero code changes → run benchmark on production prompts to compare quality before fully migrating.
