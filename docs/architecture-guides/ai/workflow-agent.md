# Workflow Agent

## Description
A deterministic multi-step pipeline where each step calls an LLM or an external tool in a fixed, predefined sequence. Unlike ReAct agents (which decide their next action dynamically), the workflow is authored upfront — the graph of steps is static. It trades flexibility for predictability and auditability.

## When to Use
- The process can be fully specified before runtime (no dynamic branching needed)
- Structured document processing: extract → validate → transform → output
- Report generation: gather data → outline → draft → review → format
- Multi-stage content pipelines: transcribe → summarize → translate → publish
- Compliance-sensitive workflows where every step must be logged and auditable
- Teams new to LLM orchestration who need a simple mental model

## When NOT to Use
- The agent needs to decide which tool to call next based on intermediate results (use ReAct)
- The number of steps is unknown at design time
- Error recovery requires dynamic re-planning (use Planner-Executor)
- The workflow branches heavily on user intent that cannot be pre-enumerated

## Advantages
- Fully predictable execution path — easy to test, log, and audit
- Each step is independently testable with unit tests
- Simpler to debug: failures are localized to a specific step
- No risk of the LLM choosing an unintended action sequence
- Easy to add human-in-the-loop checkpoints at fixed positions

## Disadvantages
- Rigid: changing the workflow requires code changes, not just prompt changes
- Cannot adapt to unexpected intermediate results
- Over-engineering risk: simple tasks may not need a pipeline at all
- Latency adds up across sequential LLM calls
- Prompt management complexity grows with the number of steps

## Complexity
Medium — requires designing a stable step graph, managing state passed between steps, and handling partial failures (retry, skip, abort per step).

## Scalability
Individual steps scale independently (parallelize non-dependent steps). The pipeline itself is stateless between runs, so horizontal scaling is straightforward. Bottleneck is usually the slowest LLM step.

## Key Components
- **Step definitions** — ordered list of LLM calls or tool invocations
- **State object** — data structure passed and mutated across steps
- **Step runners** — functions that execute one step and handle errors
- **Branching logic** — optional conditional edges based on step output
- **Retry / fallback policy** — per-step error handling
- **Observability hooks** — logging step input/output for debugging

## Reference Implementations
- [LangGraph](https://github.com/langchain-ai/langgraph) — graph-based orchestration; model workflow nodes as a directed graph with typed state
- [Prefect](https://github.com/PrefectHQ/prefect) — general-purpose workflow engine usable for LLM pipelines with retry and observability built in
- [langchain-ai/langgraph/examples](https://github.com/langchain-ai/langgraph/tree/main/examples) — LangGraph workflow examples: sequential, parallel, branching

## Official Sources
- [LangGraph Conceptual Guide](https://langchain-ai.github.io/langgraph/concepts/) — nodes, edges, state, and checkpointing
- [Anthropic: Building Effective Agents — Workflows](https://www.anthropic.com/research/building-effective-agents) — when to prefer fixed pipelines over dynamic agents

## Related Architectures
- See also: [Single Agent](./single-agent.md)
- See also: [ReAct Agent](./react-agent.md)
- See also: [Planner-Executor](./planner-executor.md)
- See also: [Human-in-the-Loop](./human-in-the-loop.md)
