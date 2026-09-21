# Planner/Executor

## Description
The Planner/Executor architecture separates the task of deciding what to do (planning) from actually doing it (execution). A Planner LLM call produces a structured plan — a list of steps, sub-goals, or a DAG — before any tools are invoked. A separate Executor then carries out each step, often with its own tool-calling loop. This prevents the model from interleaving high-level strategy with low-level execution, which reduces errors in complex, multi-step tasks.

## When to Use
- Tasks with 5+ sequential or dependent steps where ad-hoc ReAct gets lost mid-execution
- Use cases that benefit from plan review before execution (cost savings, safety)
- Workflows where a human must approve the plan before any side-effecting action occurs
- Long-horizon tasks (software project scaffolding, research reports, multi-file code changes)
- When you need to parallelize independent plan steps across multiple executor workers

## When NOT to Use
- Short tasks where planning overhead exceeds the benefit (1–2 tool calls)
- Highly dynamic environments where the plan becomes obsolete after the first observation
- When the problem is exploratory and the correct path cannot be known in advance
- If the Planner consistently produces poor plans — fall back to ReAct with tighter prompts

## Advantages
- Plans can be reviewed, validated, and edited before any side-effecting execution
- Parallel execution of independent steps reduces total wall-clock time
- Errors in execution can be isolated to a specific step and retried without replanning
- Cleaner separation of concerns: improve the planner and executor independently
- Plans serve as audit trails and can be stored for replay or explanation

## Disadvantages
- Two-phase design adds latency (plan LLM call + execution LLM calls)
- Plan quality is the system's ceiling — a bad plan cannot be rescued by good execution
- Plans can become stale if the environment changes between planning and execution
- Requires a structured plan format that both the planner and executor agree on
- More complex than a single-agent loop to implement and debug

## Complexity
High — designing a robust plan schema, handling plan failures gracefully, and managing state across the plan/execute boundary requires significant engineering.

## Scalability
The planning phase is a single serial call; the execution phase can be parallelized across independent steps. Use a workflow engine (LangGraph, Temporal) for durability: checkpoint the plan, mark steps as done, and resume after failures without re-planning from scratch.

## Key Components
- **Planner LLM** — takes the high-level goal and produces a structured plan (JSON list of steps with dependencies)
- **Plan schema** — the agreed data structure: step ID, description, dependencies, assigned tool(s), success criteria
- **Plan validator** — checks the plan for completeness, cycles in dependencies, and feasibility before execution
- **Executor LLM / tool runner** — executes each step; may itself run a mini ReAct loop per step
- **Step tracker** — records which steps are pending, in-progress, done, or failed
- **Re-planner (optional)** — invoked when execution hits an unrecoverable error; may revise remaining steps
- **Output aggregator** — merges step results into a final deliverable

## Reference Implementations
- [langchain-ai/langgraph](https://github.com/langchain-ai/langgraph) — `plan-and-execute` example in the LangGraph tutorials; uses graph nodes for plan, execute, and replan phases
- [microsoft/autogen](https://github.com/microsoft/autogen) — planner-style patterns using `AssistantAgent` for planning and `UserProxyAgent` for execution
- [crewAIInc/crewAI](https://github.com/crewAIInc/crewAI) — hierarchical process type implements a manager agent that plans and delegates to crew members
- [langchain-ai/langgraph/examples/plan-and-execute](https://github.com/langchain-ai/langgraph/blob/main/examples/plan-and-execute/plan-and-execute.ipynb) — LangGraph plan-and-execute pattern

## Official Sources
- [Plan-and-Solve Prompting (Wang et al., 2023)](https://arxiv.org/abs/2305.04091) — empirical study showing plan-first prompting outperforms CoT on multi-step reasoning
- [LangGraph plan-and-execute tutorial](https://langchain-ai.github.io/langgraph/tutorials/plan-and-execute/plan-and-execute/) — step-by-step implementation guide
- [LLM Compiler (Kim et al., 2023)](https://arxiv.org/abs/2312.04511) — parallel plan execution with DAG dependency tracking
- [Plan-and-Solve Paper](https://arxiv.org/abs/2305.04091) — "Plan-and-Solve Prompting: Improving Zero-Shot Chain-of-Thought Reasoning"
- [LangGraph How-Tos](https://langchain-ai.github.io/langgraph/how-tos/) — planning agent implementation guides

## Related Architectures
- See also: [ReAct Agent](./react-agent.md)
- See also: [Multi-Agent System](./multi-agent.md)
- See also: [Human-in-the-Loop](./human-in-the-loop.md)
