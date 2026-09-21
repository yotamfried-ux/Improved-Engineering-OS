# Human-in-the-Loop (HITL) Agent

## Description
A Human-in-the-Loop agent pauses execution at designated checkpoints and requests human review or approval before proceeding. The agent runs autonomously between checkpoints but cannot take irreversible or high-risk actions without explicit human sign-off. This balances automation efficiency with human oversight, making autonomous systems safe to deploy in production where mistakes have real consequences.

## When to Use
- Actions that are irreversible or have significant real-world consequences (sending emails, database writes, financial transactions, deployments)
- Regulated domains (healthcare, finance, legal) where human accountability is mandatory
- Early-stage agent deployment where trust in the agent's judgment has not yet been established
- Tasks where the agent frequently encounters ambiguous situations that require human judgment
- Agentic workflows where the cost of a wrong action greatly exceeds the cost of human review

## When NOT to Use
- High-volume, low-stakes automation where human review creates a bottleneck (e.g., routine data transforms)
- Real-time pipelines where approval latency is incompatible with SLA requirements
- Well-validated, narrow agents with a long track record of correct behavior in production
- Fully offline batch processing with no side effects where review can happen post-hoc

## Advantages
- Dramatically reduces the blast radius of agent mistakes
- Builds trust progressively: start with approval gates everywhere, remove them as confidence grows
- Human reviewers can provide corrections that improve future agent behavior (RLHF loop)
- Supports regulatory compliance and audit requirements natively
- Allows graceful handling of edge cases the agent was not trained for

## Disadvantages
- Human review creates latency and throughput ceilings
- Reviewer fatigue: too many approval requests leads to rubber-stamping
- Requires a UI or notification channel for reviewers (adds engineering surface area)
- Asynchronous approval gates complicate state management (the agent must be resumable)
- Misplaced gates (too early or too late) undermine the safety benefit

## Complexity
High — requires durable, resumable agent state, an approval notification system, a reviewer interface, and timeout/fallback logic for unreviewed requests.

## Scalability
The human is the bottleneck. Mitigate by: (1) routing only genuinely risky actions to humans, (2) batching related decisions, (3) using risk-scoring to auto-approve low-risk actions. LangGraph's `interrupt` primitive is designed for this pattern and integrates with LangGraph Platform's async persistence.

## Key Components
- **Interrupt points** — explicit markers in the agent graph where execution pauses and human input is requested
- **State checkpoint** — serialized agent state (plan, tool history, partial results) that allows resumption after approval
- **Approval interface** — the channel through which humans review and respond (Slack bot, web UI, email, CLI prompt)
- **Action classifier** — determines whether a pending action requires approval based on risk rules or model confidence
- **Timeout handler** — defines what happens if no human responds within a deadline (escalate, skip, abort)
- **Audit log** — immutable record of what was approved, by whom, and when
- **Resume mechanism** — injects the human's decision back into the agent state and continues execution

## Reference Implementations
- [langchain-ai/langgraph](https://github.com/langchain-ai/langgraph) — `interrupt()` primitive and `Command(resume=...)` for suspending and resuming agent graphs; the canonical HITL implementation for Python agents
- [microsoft/autogen](https://github.com/microsoft/autogen) — `UserProxyAgent` with `human_input_mode="ALWAYS"` or `"TERMINATE"` for configurable human gating
- [pydantic/pydantic-ai](https://github.com/pydantic/pydantic-ai) — agent run with `allow_ui_requests=True` for interactive confirmation flows
- [langchain-ai/langgraph/examples/human_in_the_loop](https://github.com/langchain-ai/langgraph/blob/main/examples/human_in_the_loop/breakpoints.ipynb) — LangGraph HITL with breakpoints and human approval

## Official Sources
- [LangGraph human-in-the-loop guide](https://langchain-ai.github.io/langgraph/concepts/human_in_the_loop/) — comprehensive reference covering interrupt, approve/reject, edit, and multi-turn review patterns
- [LangGraph persistence and checkpointing](https://langchain-ai.github.io/langgraph/concepts/persistence/) — how state is saved and restored across the human approval gap
- [Anthropic responsible scaling policy](https://www.anthropic.com/responsible-scaling-policy) — context on why HITL is essential at higher capability levels
- [Anthropic — Agentic Safety](https://docs.anthropic.com/en/docs/build-with-claude/agentic-and-tool-use/orchestration-and-parallelization) — safety in agentic systems

## Related Architectures
- See also: [Planner/Executor](./planner-executor.md)
- See also: [Multi-Agent System](./multi-agent.md)
- See also: [ReAct Agent](./react-agent.md)
