# Multi-Agent System

## Description
A Multi-Agent System (MAS) decomposes a complex task across multiple specialized LLM agents that each handle a narrow sub-problem — one agent researches, another writes code, another reviews it — and communicate results through shared state or message passing. An orchestrator agent (or a fixed router) dispatches work and merges outputs. This mirrors how engineering teams work: specialists in parallel, with coordination at the boundary.

## When to Use
- Tasks too long or complex for a single agent's context window
- Workflows with clearly separable sub-problems that benefit from specialized system prompts
- Pipelines where parallelism across independent sub-tasks reduces total wall-clock time
- Use cases that require a critic/reviewer loop (generator + verifier pattern)
- Autonomous research, code generation, report writing, or agentic CI/CD workflows

## When NOT to Use
- Simple tasks a single competent agent can handle in one context window
- When coordination overhead exceeds the benefit of specialization
- Teams without operational maturity to monitor and debug distributed agent failures
- Latency-critical real-time systems where multi-agent round trips are too slow
- When a deterministic workflow (DAG) would work equally well without LLM orchestration

## Advantages
- Specialization: each agent's system prompt is tuned for its narrow role, improving quality
- Parallelism: independent sub-tasks run simultaneously, cutting wall-clock time
- Context isolation: each agent only sees what it needs, reducing noise and distraction
- Modularity: agents can be swapped, upgraded, or tested independently
- Fault isolation: one agent failing doesn't necessarily bring down the whole system

## Disadvantages
- Coordination complexity: shared state, message schemas, and error propagation must be designed carefully
- Higher cost: multiple LLM calls per task, plus potential re-runs on coordination failures
- Hard to debug: tracing a bug through agent boundaries requires distributed tracing
- Emergent failures: agent interactions can produce unexpected behavior not visible in unit tests
- Trust boundaries: agents can hallucinate inputs for downstream agents; validate between hops

## Complexity
High — requires designing agent roles, communication protocols, shared state, error handling, and observability across multiple LLM actors.

## Scalability
Parallelism provides the main scaling lever; independent agents can run concurrently on separate workers. Coordination state is typically kept in a shared message queue or graph state object. At large scale, use a durable workflow engine (Temporal, LangGraph Platform) to handle retries and checkpointing.

## Key Components
- **Orchestrator agent** — decomposes the task, assigns work to sub-agents, and merges results
- **Specialist agents** — each has a focused system prompt, tool set, and context; examples: researcher, coder, reviewer, critic, formatter
- **Shared state / message bus** — the medium through which agents exchange results (LangGraph state, Redis pub/sub, queue)
- **Router / dispatcher** — routes tasks to the correct agent based on type or tag
- **Validator** — checks agent outputs before passing to the next agent; rejects or retries bad outputs
- **Observability layer** — traces, spans, and logs that span agent boundaries (LangSmith, OpenTelemetry)

## Reference Implementations
- [microsoft/autogen](https://github.com/microsoft/autogen) — mature multi-agent conversation framework; study `GroupChat` for orchestrator patterns and `AssistantAgent`/`UserProxyAgent` roles
- [crewAIInc/crewAI](https://github.com/crewAIInc/crewAI) — high-level crew abstraction with role-based agents, tasks, and process types (sequential, hierarchical)
- [langchain-ai/langgraph](https://github.com/langchain-ai/langgraph) — graph-based multi-agent with typed state, conditional routing, and subgraph composition
- [langchain-ai/langgraph/examples](https://github.com/langchain-ai/langgraph/tree/main/examples) — LangGraph multi-agent: supervisor, network, handoffs
- [microsoft/autogen/python/samples](https://github.com/microsoft/autogen/tree/main/python/samples) — AutoGen multi-agent conversation samples
- [crewAIInc/crewAI-examples](https://github.com/crewAIInc/crewAI-examples) — CrewAI role-based multi-agent examples

## Official Sources
- [AutoGen documentation](https://microsoft.github.io/autogen/) — canonical reference for Microsoft's multi-agent framework including group chat patterns
- [CrewAI documentation](https://docs.crewai.com/) — role, task, and crew concepts with examples
- [LangGraph multi-agent tutorial](https://langchain-ai.github.io/langgraph/tutorials/multi_agent/multi-agent-collaboration/) — supervisor and collaboration patterns with code
- [LangGraph Multi-Agent Docs](https://langchain-ai.github.io/langgraph/concepts/multi_agent/) — patterns: supervisor, collaborative, hierarchical
- [AutoGen Docs](https://microsoft.github.io/autogen/) — Microsoft multi-agent framework documentation

## Related Architectures
- See also: [ReAct Agent](./react-agent.md)
- See also: [Planner/Executor](./planner-executor.md)
- See also: [Human-in-the-Loop](./human-in-the-loop.md)
