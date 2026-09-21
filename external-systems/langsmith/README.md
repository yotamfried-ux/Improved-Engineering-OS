# LangSmith

## Overview
LangSmith is LangChain's production observability and evaluation platform for LLM applications. It traces every LLM call, tool use, and chain execution — capturing inputs, outputs, latency, token counts, and cost — and surfaces them in a searchable dashboard. Beyond tracing, it enables dataset management, automated evaluation (LLM-as-judge, custom evaluators), regression testing against golden sets, and human annotation queues. It is the primary tool for moving an LLM application from prototype to a production system with measurable quality.

## Capabilities
- Automatic tracing of LangChain and LangGraph runs with zero code changes (env var only)
- Manual SDK tracing via `@traceable` decorator for any LLM framework (Anthropic, OpenAI, custom)
- Run filtering and comparison by metadata, tags, latency, cost, or token count
- Evaluation datasets: curate golden input/output pairs for regression testing
- LLM-as-judge evaluators: correctness, helpfulness, hallucination, custom criteria scored by an LLM
- Human annotation queues: route specific runs to reviewers for labeling
- Regression testing: run evaluations against a dataset before deploying a prompt change
- Monitoring dashboards: aggregate latency, error rate, cost-per-run, and feedback scores over time
- Prompt versioning via LangSmith Hub: publish, version, and pull prompts as code
- Feedback API: collect explicit user feedback (thumbs up/down) and link it to traced runs

## When to Use
- Any LLM application moving to production that needs to answer "why did it give that answer?" without guessing
- Debugging RAG pipelines where retrieval quality, prompt formatting, or LLM output are all potential failure points
- Building regression test suites before deploying prompt changes — catch regressions quantitatively
- Tracking cost and latency per user, per feature, or per model to make data-driven optimization decisions
- A/B testing prompt variants: run both against the same dataset and compare evaluation scores before shipping

## Limitations
- Free tier is limited: 5,000 traces/month — exhausted quickly in even light production traffic
- Tightly integrated with LangChain ecosystem; auto-tracing only works for LangChain/LangGraph; non-LangChain apps require manual `@traceable` instrumentation on every function
- Hosted on LangChain's infrastructure — no self-hosted option on free or Plus tiers (Enterprise only)
- LLM-as-judge evaluators add latency and cost to evaluation runs; not suitable as a real-time quality gate per inference
- Prompt Hub versioning is useful but not a replacement for proper version control; treat it as a publishing layer, not a source of truth

## Integration Guide
1. Sign up at https://smith.langchain.com and create a project; copy the API key from Settings
2. Set the four environment variables (see Setup below) — this is sufficient for LangChain auto-tracing
3. For non-LangChain code, wrap functions with `@traceable` from `langsmith` (Python) or `traceable` (JS)
4. Configure a dataset: upload golden input/output pairs via the UI or SDK
5. Write an evaluator and run `evaluate()` against the dataset to get a baseline score
6. Add the evaluation run to CI to catch regressions before deploying prompt changes

## Setup
```bash
pip install langsmith  # Python
npm install langsmith  # JavaScript/TypeScript

# Environment variables — auto-enables tracing for all LangChain calls
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=ls__your_api_key
LANGCHAIN_PROJECT=my-project-name   # organizes traces by project
LANGCHAIN_ENDPOINT=https://api.smith.langchain.com  # default; can omit
```

```python
# LangChain/LangGraph — no code changes needed; env vars are sufficient

# Manual tracing for any framework (Anthropic, OpenAI, custom):
from langsmith import traceable
import anthropic

client = anthropic.Anthropic()

@traceable(name="rag-answer", metadata={"version": "v2"})
def answer_question(question: str, context: str) -> str:
    response = client.messages.create(
        model="claude-opus-4-5",
        max_tokens=1024,
        messages=[{"role": "user", "content": f"Context: {context}\n\nQuestion: {question}"}],
    )
    return response.content[0].text

# Evaluation against a dataset
from langsmith.evaluation import evaluate

def correctness_evaluator(run, example):
    # LLM-as-judge or exact match
    return {"key": "correctness", "score": 1 if run.outputs["answer"] == example.outputs["answer"] else 0}

evaluate(
    answer_question,
    data="my-golden-dataset",
    evaluators=[correctness_evaluator],
    experiment_prefix="claude-opus-v2",
)
```

## Pricing Notes
- **Developer:** Free — 5,000 traces/month; suitable for development and small-scale testing
- **Plus:** $39/month for 50,000 traces/month; add-on packs for higher volume
- **Enterprise:** Custom pricing with self-hosted deployment option and SSO
- Watch for: every LLM call within a chain counts as a child run under the parent trace; a single user request through a RAG pipeline may generate 5–10 child runs against the monthly limit

## Reference Repositories
- [langchain-ai/langsmith-sdk](https://github.com/langchain-ai/langsmith-sdk) — official Python and JavaScript SDK for tracing, datasets, and evaluation
- [langchain-ai/langsmith-cookbook](https://github.com/langchain-ai/langsmith-cookbook) — evaluation recipes, custom evaluator examples, and integration patterns

## Official Documentation
- [LangSmith Docs](https://docs.smith.langchain.com) — tracing setup, evaluation API, dataset management, and monitoring guides
- [LangSmith Evaluation Guide](https://docs.smith.langchain.com/evaluation) — evaluator types, `evaluate()` API, and CI integration patterns
- [LangSmith Hub](https://smith.langchain.com/hub) — versioned prompt registry; pull prompts via `hub.pull("username/prompt-name")`

## Common Pitfalls
- **Traces appear under the wrong project** — `LANGCHAIN_PROJECT` must be set before the SDK initializes; setting it after the first import has no effect; set it at the top of your entrypoint or in the process environment, not mid-script.
- **Nested `@traceable` functions create deep trace trees** — every `@traceable` call creates a child span under the current root; deep nesting is expected and useful, but avoid wrapping utility functions that are called thousands of times per request (e.g., tokenizers, formatters) as each generates a trace record against the monthly limit.
- **LLM-as-judge evaluators need a stable prompt** — the evaluator itself is an LLM call; non-determinism means scores vary between runs; pin the evaluator model and temperature, and average over multiple runs for statistical stability.
- **Free tier 5k limit resets monthly, not daily** — a single evaluation run over a large dataset can consume the entire monthly free allocation; use the `num_repetitions` parameter carefully and run large evaluations on paid plans.

## Examples
1. **RAG pipeline debugging:** Enable `LANGCHAIN_TRACING_V2=true` → user reports a wrong answer → find the run in LangSmith by user ID tag → inspect the retrieval step to see which documents were fetched → inspect the prompt to see if context was truncated → identify root cause without reproducing locally.
2. **Prompt regression test in CI:** Curate 50 golden question/answer pairs as a LangSmith dataset → write a correctness evaluator → add `pytest` test that calls `evaluate()` and asserts `mean_score > 0.85` → CI blocks the PR if the new prompt scores below threshold.
3. **User feedback loop:** After each LLM response, render a thumbs up/down widget → on click, call `langsmith_client.create_feedback(run_id, key="user_rating", score=1)` → filter LangSmith runs by `feedback.user_rating < 1` to find systematically bad responses for dataset augmentation.
