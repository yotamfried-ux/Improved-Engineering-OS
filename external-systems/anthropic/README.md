# Anthropic (Claude)

## Overview
Anthropic is an AI safety company that develops the Claude family of models. Claude models are known for long context windows, strong instruction following, safety, and nuanced reasoning. The API covers text, vision, tool use, prompt caching, computer use, and MCP (Model Context Protocol) for agent integrations.

## Capabilities
- Chat and completion with Claude 3.5 Sonnet, Claude 3.5 Haiku, Claude 3 Opus across text and vision
- Tool use (function calling) with parallel tool calls and multi-step agentic workflows
- Prompt caching: cache large system prompts or document blocks to reduce latency and cost by up to 90%
- Vision: analyze images passed as base64 or URL in the messages array
- Extended thinking: Claude 3.7 Sonnet supports visible reasoning traces with configurable `thinking` budget
- Computer use (beta): Claude can control a virtual desktop (screenshot → action loop) for GUI automation
- Model Context Protocol (MCP): open standard for connecting Claude to external tools and data sources
- 200K token context window on Claude 3.5 Sonnet and Opus; ideal for large document analysis
- Streaming responses via SSE with fine-grained event types (content_block_delta, tool_use, etc.)

## When to Use
- Need the longest reliable context window (200K tokens) for large codebase or document tasks
- Building safety-sensitive applications where refusal calibration and alignment matter
- Agentic workflows requiring complex tool orchestration across many steps
- Integrating with MCP servers for structured, auditable tool access
- Prompt caching significantly reduces cost for repeated large system prompts (e.g., large codebases)

## Limitations
- No image generation (text and vision input only, no DALL-E equivalent)
- Computer use is in beta — reliability varies by UI complexity; not production-ready for all tasks
- Slightly smaller ecosystem of third-party integrations compared to OpenAI (though LangChain, LlamaIndex, Vercel AI SDK all support Anthropic)
- Rate limits on new accounts; production workloads may need to request limit increases
- Extended thinking tokens are billed at output token rates and can increase costs significantly

## Integration Guide
1. Install: `pip install anthropic` or `npm install @anthropic-ai/sdk`
2. Authenticate via `ANTHROPIC_API_KEY` — never hardcode
3. Basic message:
   ```python
   import anthropic
   client = anthropic.Anthropic()
   message = client.messages.create(
       model="claude-opus-4-5",
       max_tokens=1024,
       messages=[{"role": "user", "content": "Hello"}]
   )
   ```
4. **Tool use:** Define tools with JSON Schema in `tools` parameter; when `stop_reason == "tool_use"`, extract `tool_use` blocks, run them, return results as `tool_result` content blocks in a new user message
5. **Prompt caching:** Add `{"type": "text", "text": "...", "cache_control": {"type": "ephemeral"}}` to the last block of a large system prompt or document; cache persists for 5 minutes (TTL refreshed on each hit)
6. **Vision:** Pass images as `{"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": "..."}}` in the messages content array
7. **MCP:** Use `anthropic.beta.messages.create` with `mcp_servers` parameter, or integrate via Claude Desktop / Claude Code with `claude mcp add`
8. **Streaming:** Use `client.messages.stream()` context manager and handle `text`, `tool_use`, and `message_delta` events

## Setup Guide
```bash
# Python SDK
pip install anthropic

# Node.js SDK
npm install @anthropic-ai/sdk

# Set API key
export ANTHROPIC_API_KEY=sk-ant-...

# Quick test
python -c "import anthropic; print(anthropic.Anthropic().models.list())"
```

Key configuration:
- Always set `max_tokens` — there is no default; the API will error without it
- Use `system` parameter (top-level string or array) for system prompts, not a system role message
- For extended thinking: set `thinking={"type": "enabled", "budget_tokens": 10000}` (Claude 3.7 Sonnet only)
- Check `stop_reason` on every response: `"end_turn"` | `"max_tokens"` | `"tool_use"` | `"stop_sequence"`

## Pricing Notes
- **Claude 3.5 Sonnet:** $3/1M input tokens, $15/1M output tokens
- **Claude 3.5 Haiku:** $0.80/1M input, $4/1M output — best cost/speed balance
- **Claude 3 Opus:** $15/1M input, $75/1M output — highest capability
- **Prompt caching:** Cache write +25% on input cost; cache read -90% on input cost (5-min TTL)
- **Extended thinking:** Thinking tokens billed at output token rate
- Check https://anthropic.com/pricing for current rates — these change as new models release
- Watch for: large context usage (200K context at Sonnet rates can be expensive per call)

## Reference Repositories
- [anthropics/anthropic-cookbook](https://github.com/anthropics/anthropic-cookbook) — official examples: tool use, RAG, vision, caching, agents
- [anthropics/anthropic-sdk-python](https://github.com/anthropics/anthropic-sdk-python) — Python SDK with full type annotations
- [anthropics/anthropic-sdk-typescript](https://github.com/anthropics/anthropic-sdk-typescript) — TypeScript SDK

## Official Documentation
- [Anthropic Docs](https://docs.anthropic.com) — complete API and model reference
- [Tool Use Guide](https://docs.anthropic.com/en/docs/build-with-claude/tool-use) — agentic tool calling patterns
- [Prompt Caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching) — caching setup and cost impact
- [Model Context Protocol](https://docs.anthropic.com/en/docs/mcp) — MCP server integration
- [Computer Use](https://docs.anthropic.com/en/docs/build-with-claude/computer-use) — GUI automation beta

## Examples
1. **Large document QA with caching:** Load a 150-page legal contract as a cached system prompt block → user asks multiple questions in the same session → 90% token cost reduction on subsequent queries vs. re-sending the document.
2. **Multi-step code agent:** Claude receives a bug report → uses a `read_file` tool → `run_tests` tool → `edit_file` tool → iterates until tests pass → returns a summary with the diff applied.
3. **Vision-based data extraction:** Send scanned invoice images as base64 → Claude extracts structured fields (vendor, amount, line items) → tool call formats output as JSON → downstream system ingests the structured data.
