# Google Gemini

## Overview
Google Gemini is Google's multimodal large language model family, spanning Gemini 2.0 Flash (fast/cheap), Gemini 2.5 Pro (frontier reasoning), and specialized variants. Available via Google AI Studio (direct API, developer-friendly) and Vertex AI (enterprise, GCP-integrated). Gemini models natively process text, images, audio, video, and documents in a single context window.

## Capabilities
- Text generation, instruction following, and multi-turn chat across Gemini 1.5, 2.0, and 2.5 model families
- Native multimodal input: send images, PDFs, audio files, and video clips alongside text in one API call
- Up to 1M token context window (Gemini 1.5 Pro / 2.5 Pro) — suitable for full codebase or book-length documents
- Function/tool calling for agentic workflows with structured JSON outputs
- Live API (Gemini 2.0 Flash Live) for low-latency real-time audio/video streaming interactions
- Code execution tool: Gemini can run Python code in a sandboxed environment and return results
- Grounding with Google Search: answers backed by real-time search results
- Embeddings API (`text-embedding-004`) for semantic search and RAG
- Available in 200+ countries via Google AI Studio; Vertex AI provides VPC-SC, audit logging, and GCP IAM

## When to Use
- Need the longest context window available (1M tokens) for processing large documents or codebases
- Building multimodal pipelines that mix text, images, and audio without preprocessing or splitting modalities
- Already on GCP and want tight integration with Vertex AI, Cloud Storage, BigQuery, and GCP IAM
- Need grounding with live Google Search results in responses

## Limitations
- Rate limits are more restrictive than OpenAI on lower tiers — plan for exponential backoff
- Vertex AI setup is significantly more complex than Google AI Studio (IAM, service accounts, regional endpoints)
- Gemini 2.5 Pro output quality leads the field on reasoning, but latency and cost are high — use Flash for most tasks
- Structured outputs / JSON mode is less mature than OpenAI's Structured Outputs with guaranteed schema compliance
- Google AI Studio is not suitable for production at scale — use Vertex AI for SLAs and enterprise controls

## Integration Guide
1. Get an API key from https://aistudio.google.com/app/apikey (Google AI Studio) or set up a GCP service account for Vertex AI
2. Install the SDK: `npm install @google/generative-ai` (JS) or `pip install google-generativeai` (Python)
3. Basic generation:
   ```python
   import google.generativeai as genai
   genai.configure(api_key="YOUR_API_KEY")
   model = genai.GenerativeModel("gemini-2.0-flash")
   response = model.generate_content("Explain transformers in one paragraph")
   print(response.text)
   ```
4. For multimodal: pass `PIL.Image` objects or file URIs alongside text in the `contents` list
5. For long documents: upload files via `genai.upload_file()` to get a `File` object; include it in the prompt — avoids token limits on direct embedding
6. For Vertex AI: use `vertexai` Python SDK with `PROJECT_ID` and `LOCATION`; authenticate via `gcloud auth application-default login` or a service account key

## Setup
```bash
# Python SDK (Google AI Studio)
pip install google-generativeai

# Vertex AI Python SDK
pip install google-cloud-aiplatform

# Node.js SDK
npm install @google/generative-ai

# Vertex AI Node SDK
npm install @google-cloud/vertexai

# Set API key (Google AI Studio)
export GOOGLE_API_KEY=your_api_key

# Vertex AI — authenticate via ADC
gcloud auth application-default login
export GOOGLE_CLOUD_PROJECT=your_project_id
export GOOGLE_CLOUD_LOCATION=us-central1
```

## Pricing Notes
- **Gemini 2.0 Flash:** ~$0.075/1M input tokens, $0.30/1M output tokens (text); very competitive for high-volume tasks
- **Gemini 2.5 Pro:** ~$1.25/1M input tokens (≤200K context), $10/1M output tokens; higher for longer contexts
- **Free tier (AI Studio):** Generous RPM limits for development; not for production SLAs
- **Embeddings:** `text-embedding-004` is free up to 1500 RPD on AI Studio; paid on Vertex AI
- Watch for: 1M context window usage can generate very large token bills; always set `max_output_tokens`; video/audio tokens are counted at image-frame rates

## Reference Repositories
- [google-gemini/cookbook](https://github.com/google-gemini/cookbook) — official Jupyter notebooks for every Gemini capability
- [google-gemini/generative-ai-python](https://github.com/google-gemini/generative-ai-python) — official Python SDK source
- [google-gemini/generative-ai-js](https://github.com/google-gemini/generative-ai-js) — official JavaScript/TypeScript SDK

## Official Documentation
- [Gemini API Docs](https://ai.google.dev/gemini-api/docs) — complete API reference and capability guides
- [Google AI Studio](https://aistudio.google.com) — interactive playground and API key management
- [Vertex AI Gemini](https://cloud.google.com/vertex-ai/generative-ai/docs/learn/overview) — enterprise GCP integration guide
- [Models Overview](https://ai.google.dev/gemini-api/docs/models/gemini) — current model list with context windows and pricing

## Common Pitfalls
- **AI Studio vs. Vertex AI are different products** — AI Studio API keys do not work with the Vertex AI SDK and vice versa; choose one path and stick with it for a given project.
- **File uploads are temporary** — files uploaded via `genai.upload_file()` expire after 48 hours; do not rely on file URIs across long-running pipelines without re-uploading.
- **Token counting for multimodal input** — images, audio, and video count as tokens at rates that differ from text (e.g., one image frame at 258 tokens); always call `model.count_tokens()` on a sample before scaling a multimodal pipeline to avoid bill surprises.

## Examples
1. **Full-codebase Q&A:** Upload entire repository as a ZIP via `genai.upload_file()` → pass the file reference to Gemini 2.5 Pro with a question about architecture → 1M context window ingests the whole codebase in one shot without chunking.
2. **PDF document extraction:** Send a multi-page PDF invoice directly in the prompt → Gemini extracts structured fields (vendor, amounts, line items) and returns them as JSON — no OCR preprocessing needed.
3. **Grounded research assistant:** Enable Google Search grounding in the model config → user asks about recent news → Gemini retrieves current information from the web and includes citations in the response, avoiding knowledge cutoff issues.
