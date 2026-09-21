# ReAct Agent (Reasoning + Acting)

## Description
ReAct (Reasoning + Acting) is an agent architecture where the LLM interleaves chain-of-thought reasoning steps with concrete tool actions, observing the result of each action before deciding what to do next. The loop continues until the agent reaches a final answer or a stopping condition. This tight feedback between thinking and doing prevents the agent from hallucinating tool results.

## When to Use
- Tasks that require multi-step decision-making where each step depends on the previous result
- Problems where the correct sequence of tool calls cannot be determined upfront
- Use cases that benefit from transparent, auditable reasoning traces (debugging, compliance)
- Research or Q&A tasks that require searching, then filtering, then synthesizing information
- Any agent workflow where you need the model to self-correct based on tool output

## When NOT to Use
- Simple single-tool lookups where no reasoning loop is needed
- Latency-critical paths where multiple round trips to the LLM are too slow
- Tasks with a fixed, deterministic workflow better handled by a DAG/pipeline
- When token cost of repeated LLM calls is prohibitive at scale

## Advantages
- Transparent: the full Thought → Action → Observation chain is inspectable
- Self-correcting: the agent can recover from bad tool results by re-reasoning
- Flexible: works across heterogeneous tool sets without task-specific tuning
- Grounded: actions are always based on observed reality, not hallucinated assumptions
- Proven pattern with broad framework support (LangChain, LangGraph, Pydantic AI)

## Disadvantages
- High latency: each Thought/Action/Observation turn requires a full LLM call
- High cost: long reasoning traces consume many tokens per task
- Can loop or get stuck if the model lacks a good stopping heuristic
- Reasoning quality is model-dependent — weaker models produce incoherent traces

## Complexity
Medium — straightforward loop to implement, but prompt engineering and stopping logic require care.

## Scalability
Scales horizontally (many independent agent instances in parallel) but does not reduce per-task latency. Token cost grows linearly with reasoning depth. Use streaming + async tools to hide latency. Add a max-turn budget to prevent runaway loops.

## Key Components
- **System prompt** — defines available tools and the Thought/Action/Observation format
- **Tool registry** — typed tool definitions with descriptions the LLM uses to select actions
- **Action parser** — extracts the intended tool call from the LLM's text output
- **Tool executor** — runs the selected tool and captures the observation
- **Loop controller** — checks stopping conditions (final answer, max turns, error threshold)
- **Memory / scratchpad** — accumulates the full trace for the next LLM call

## Reference Implementations
- [langchain-ai/langchain](https://github.com/langchain-ai/langchain) — `create_react_agent` in `langchain.agents`; study `AgentExecutor` for loop control and error handling
- [langchain-ai/langgraph](https://github.com/langchain-ai/langgraph) — graph-based ReAct with explicit state, conditional edges, and human-in-the-loop interrupts
- [pydantic/pydantic-ai](https://github.com/pydantic/pydantic-ai) — typed tool definitions and agent loop with first-class Pydantic validation of tool inputs/outputs
- [langchain-ai/langgraph/examples/react_agent](https://github.com/langchain-ai/langgraph/blob/main/examples/react_agent.ipynb) — LangGraph ReAct agent implementation
- [openai/openai-cookbook](https://github.com/openai/openai-cookbook) — OpenAI ReAct pattern examples

## Official Sources
- [ReAct: Synergizing Reasoning and Acting in Language Models (Yao et al., 2022)](https://arxiv.org/abs/2210.03629) — the original paper defining the Thought/Action/Observation loop
- [LangChain ReAct agent docs](https://python.langchain.com/docs/how_to/migrate_agent/) — migration guide and current recommended patterns
- [LangGraph agent tutorial](https://langchain-ai.github.io/langgraph/tutorials/introduction/) — building a stateful ReAct agent with LangGraph

## Related Architectures
- See also: [Tool Calling Agent](./tool-calling-agent.md)
- See also: [Planner/Executor](./planner-executor.md)
- See also: [Human-in-the-Loop](./human-in-the-loop.md)
