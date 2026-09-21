# Tool Calling Agent

## Description
A Tool Calling Agent uses a model's native structured tool-use API (function calling) to invoke external capabilities with type-safe, schema-validated inputs instead of parsing free-text action strings. The LLM selects a tool and emits a JSON payload that matches the tool's schema; the host executes it and returns the result as a structured message. This eliminates the fragile text-parsing layer required in classic ReAct.

## When to Use
- Any agent that needs to call external APIs, databases, or system functions reliably
- Production systems where unparseable LLM output causes downstream failures
- Multi-tool agents where type safety and input validation matter
- When building on models with first-class function-calling support (GPT-4o, Claude 3+, Gemini 1.5+)
- Pipelines that need to log or audit exactly which tools were called with which arguments

## When NOT to Use
- Models that do not support native function calling (older open-source models)
- Scenarios where the tool schema is too dynamic to define upfront
- Tasks where the agent needs to construct novel tool invocations beyond what schemas allow
- Extremely latency-sensitive paths where even one LLM round trip is unacceptable

## Advantages
- Schema-validated inputs eliminate the parser layer and reduce runtime errors
- Parallel tool calls: most APIs support calling multiple tools in one LLM turn
- First-class streaming support for tool call deltas
- Easier to log, replay, and test than free-text action parsing
- Clean separation between agent logic and tool implementation
- Works natively with the Anthropic, OpenAI, and Gemini APIs

## Disadvantages
- Tied to models with function-calling support; not portable to all LLMs
- Schema design requires upfront investment — poor schemas lead to poor tool selection
- Parallel tool calls can cause ordering issues when tools have side effects
- Tool count limits apply (some APIs cap how many tools can be registered per request)

## Complexity
Low to Medium — the model handles selection and schema adherence; complexity lives in schema design and result handling.

## Scalability
Stateless per-turn; scales horizontally. Parallel tool calls reduce wall-clock latency when tools are independent. Register only the tools relevant to each request to stay within context limits.

## Key Components
- **Tool schemas** — JSON Schema or Pydantic model definitions describing each tool's name, description, and input parameters
- **Tool registry** — maps tool names to callable implementations
- **LLM client** — sends messages + tool schemas; receives either a text response or a `tool_use` block
- **Tool executor** — dispatches the tool call, handles errors, and formats the result as a `tool_result` message
- **Conversation state** — accumulates the message history including tool calls and results
- **Output parser** — extracts the final structured or text answer from the last LLM response

## Reference Implementations
- [pydantic/pydantic-ai](https://github.com/pydantic/pydantic-ai) — idiomatic Python tool definitions with full type inference; best-in-class schema generation from function signatures
- [langchain-ai/langchain](https://github.com/langchain-ai/langchain) — `bind_tools` on any ChatModel; study `ToolMessage` flow in `langchain_core`
- [langchain-ai/langgraph](https://github.com/langchain-ai/langgraph) — `ToolNode` for executing tool calls inside a stateful graph; handles parallel calls automatically
- [anthropics/anthropic-quickstarts](https://github.com/anthropics/anthropic-quickstarts) — Official Anthropic agent quickstarts with tool use
- [openai/openai-cookbook/examples/orchestrating_agents](https://github.com/openai/openai-cookbook/tree/main/examples/orchestrating_agents.ipynb) — OpenAI tool-calling orchestration patterns

## Official Sources
- [Anthropic tool use docs](https://docs.anthropic.com/en/docs/build-with-claude/tool-use) — canonical reference for Claude's tool use API including parallel calls and streaming
- [OpenAI function calling guide](https://platform.openai.com/docs/guides/function-calling) — covers schema format, parallel calls, and strict mode
- [Pydantic AI tool docs](https://ai.pydantic.dev/tools/) — typed tool registration and dependency injection patterns

## Related Architectures
- See also: [ReAct Agent](./react-agent.md)
- See also: [Planner/Executor](./planner-executor.md)
- See also: [Multi-Agent System](./multi-agent.md)
