# AI Agent Architecture Guides

> Navigation index for AI agent and LLM-powered system architectures.

## Architectures

| Architecture | Autonomy | Complexity | Best For |
|---|---|---|---|
| [Tool Calling Agent](./tool-calling-agent.md) | Medium | Low | Structured task completion with predefined tools |
| [ReAct Agent](./react-agent.md) | High | Medium | Open-ended reasoning with dynamic tool selection |
| [RAG Agent](./rag-agent.md) | Medium | Medium | Knowledge-grounded Q&A over private/large document sets |
| [Hybrid RAG](./hybrid-rag.md) | Medium | Medium-High | High-accuracy retrieval combining vector + keyword search |
| [Multi-Agent](./multi-agent.md) | Very High | High | Complex tasks requiring specialized parallel sub-agents |
| [Planner/Executor](./planner-executor.md) | High | High | Long-horizon tasks requiring structured upfront planning |
| [Human-in-the-Loop](./human-in-the-loop.md) | Low-Medium | Medium | High-stakes actions requiring human approval gates |

## Decision Guide

```
Does the agent need to call APIs / run code / search the web?
  → Tool Calling Agent (start here, simplest)

Does the agent need to reason step-by-step before deciding?
  → ReAct Agent

Does the agent need to answer questions over a private knowledge base?
  → RAG Agent (or Hybrid RAG for higher accuracy)

Does the task require multiple specialized roles working together?
  → Multi-Agent

Does the task span many steps requiring upfront planning?
  → Planner/Executor

Are actions irreversible (send email, deploy code, charge card)?
  → Human-in-the-Loop (wrap any of the above)
```

## Frameworks

| Framework | Strengths |
|---|---|
| [LangGraph](../../../external-systems/langgraph/README.md) | Stateful graphs, checkpointing, HITL |
| [Pydantic AI](../../../external-systems/pydantic-ai/README.md) | Type-safe, structured outputs, Python-native |
| [AutoGen](../../../external-systems/autogen/README.md) | Multi-agent conversations |
| [CrewAI](../../../external-systems/crewai/README.md) | Role-based crew composition |

## Related

- [ML Architecture Guides](../ml/README.md)
- [patterns/ai](../../../patterns/ai/README.md)
- [templates/ai-agent](../../../templates/ai-agent/README.md)
- [external-systems/anthropic](../../../external-systems/anthropic/README.md)
- [external-systems/openai](../../../external-systems/openai/README.md)
