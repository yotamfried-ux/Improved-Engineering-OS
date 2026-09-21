# Single Agent

## Description
A single LLM instance driven by a system prompt and conversation history — no external tools, no orchestration graph, no sub-agents. The model reasons and responds entirely within the context window. It is the baseline architecture before any complexity is added.

## When to Use
- The task fits in a single context window (Q&A, summarization, classification, drafting)
- No tool calls, API lookups, or external state are required
- Latency is critical and every extra hop matters
- Prototyping: validating whether an LLM can handle the task at all before adding tooling
- Customer-facing chat with a narrow, well-defined scope

## When NOT to Use
- The task requires real-time data (use Tool-Calling Agent or RAG)
- The user expects memory across sessions (use Memory Agent)
- Multi-step reasoning with intermediate checks is needed (use ReAct or Workflow Agent)
- Output quality requires retrieval from a knowledge base
- The task involves more than one specialized domain where separate prompts would help

## Advantages
- Minimal infrastructure — one API call, no state management
- Easiest to debug: the full context is always visible
- Lowest latency (no tool round-trips)
- No orchestration bugs or inter-agent communication failures
- Cheapest to operate at low volume

## Disadvantages
- Context-window limited: long conversations degrade quality
- No access to external data or live information
- Cannot persist knowledge between sessions
- A single system prompt must cover all cases, making it brittle as scope grows
- Hallucination risk increases when factual grounding is needed

## Complexity
Low — one model, one prompt, one call. The only engineering concern is prompt design and context management.

## Scalability
Scales horizontally by stateless request parallelism. Context length is the hard ceiling; for very long conversations, sliding-window or summary compression is required. Token cost grows linearly with conversation length.

## Key Components
- **System prompt** — defines role, constraints, output format
- **Conversation history** — list of `{role, content}` turns fed as context
- **Model selection** — trade-off between capability, cost, and latency
- **Temperature / sampling params** — controls determinism vs creativity
- **Output parser** — structured extraction from free-text responses (optional)

## Reference Implementations
- [openai-cookbook](https://github.com/openai/openai-cookbook) — canonical patterns for single-turn and multi-turn prompt design
- [anthropic-cookbook](https://github.com/anthropics/anthropic-cookbook) — Anthropic-specific prompt engineering and system prompt patterns
- [anthropics/anthropic-quickstarts](https://github.com/anthropics/anthropic-quickstarts) — official Anthropic agent quickstarts (customer support, computer use)
- [openai/openai-cookbook](https://github.com/openai/openai-cookbook) — OpenAI agent patterns and examples

## Official Sources
- [Anthropic Prompt Engineering Guide](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview) — system prompts, roles, output control
- [OpenAI Chat Completions API](https://platform.openai.com/docs/guides/text-generation) — message format and conversation structure
- [Anthropic — Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents) — Anthropic's guide to agent design patterns
- [Anthropic Tool Use Docs](https://docs.anthropic.com/en/docs/build-with-claude/tool-use) — tool use API reference

## Related Architectures
- See also: [Tool-Calling Agent](./tool-calling-agent.md)
- See also: [Workflow Agent](./workflow-agent.md)
- See also: [Memory Agent](./memory-agent.md)
- See also: [RAG Agent](./rag-agent.md)
