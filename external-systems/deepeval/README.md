# DeepEval

## Overview
DeepEval is an open-source LLM evaluation framework for Python. Provides 14+ built-in evaluation metrics (correctness, faithfulness, hallucination, answer relevancy, context precision/recall, bias, toxicity) with LLM-as-judge scoring. Works with any LLM output — Claude, GPT-4, Llama — and integrates with pytest for CI/CD regression testing of AI pipelines. Used by teams at KPMG, Visa, and hundreds of AI startups building RAG systems and conversational agents.

## Capabilities
- 14+ built-in metrics: G-Eval (custom LLM-judge), Hallucination, Answer Relevancy, Faithfulness, Context Recall, Context Precision, RAGAS compatibility, Bias, Toxicity, Summarization, JSON Correctness, Conversation Completeness
- pytest integration — write LLM test cases like unit tests; set thresholds to fail CI automatically on metric regression
- Dataset management — create and version test case datasets for reproducible benchmarking
- Confident AI cloud platform — hosted dashboard for online evaluation, A/B prompt comparisons, and production monitoring
- Supports Anthropic Claude, OpenAI, Azure OpenAI, Ollama, and any OpenAI-compatible endpoint as the judge model
- Async batch evaluation for running large test suites efficiently
- Red-teaming module — adversarial attack generation and jailbreak safety evaluation
- Conversation-level metrics for multi-turn chatbot evaluation beyond single-turn Q&A

## When to Use
- RAG pipeline quality measurement before shipping — score faithfulness and relevancy against a ground-truth dataset
- Regression testing prompts in CI/CD — fail the build if hallucination or answer relevancy drops below an acceptable threshold
- A/B testing two prompt versions with a quantitative score rather than manual review
- Red-teaming to find jailbreaks, safety gaps, and bias issues before a model goes to production
- When you need LangSmith-style evaluation but prefer an open-source solution with no SaaS dependency

## Limitations
- LLM-as-judge metrics cost API credits on every evaluation call — evaluation itself is not free when using GPT-4 or Claude as judge
- Metric quality depends heavily on the judge model — use GPT-4o or Claude 3.5 Sonnet for production benchmarks; GPT-4o-mini introduces noise
- Open-source version has no UI — use Confident AI cloud platform for a hosted evaluation dashboard
- Custom metric development via G-Eval requires understanding few-shot prompting and metric prompt engineering
- Hallucination metric requires both the LLM output and the source context — cannot detect hallucinations without the retrieval context

## Integration Guide
1. Install via pip: `pip install deepeval`
2. Set the judge model API key in environment: `OPENAI_API_KEY` (default judge) or configure Anthropic/Ollama
3. Define `LLMTestCase` objects with `input`, `actual_output`, and optionally `expected_output` and `retrieval_context`
4. Choose metrics appropriate to your pipeline: RAG pipelines → Faithfulness + Context Recall + Answer Relevancy; chatbots → Conversation Completeness + Bias
5. Run `deepeval test run` or `pytest` to execute the evaluation suite
6. Set `threshold` on each metric to auto-fail tests when scores fall below acceptable levels

## Setup
```bash
pip install deepeval

# Environment variables
OPENAI_API_KEY=sk-xxx          # default judge model
ANTHROPIC_API_KEY=sk-ant-xxx   # if using Claude as judge
```

```python
from deepeval import evaluate
from deepeval.metrics import AnswerRelevancyMetric, FaithfulnessMetric
from deepeval.test_case import LLMTestCase

test_case = LLMTestCase(
    input="What is RAG?",
    actual_output=rag_pipeline("What is RAG?"),
    expected_output="RAG stands for Retrieval-Augmented Generation...",
    retrieval_context=["RAG is a technique that combines retrieval with generation..."]
)

evaluate(
    [test_case],
    [
        AnswerRelevancyMetric(threshold=0.7),
        FaithfulnessMetric(threshold=0.8),
    ]
)
```

## Pricing Notes
- **Open-source:** Free — all metrics, pytest integration, and CLI included with no usage limits
- **Confident AI (cloud platform):** $49/month — hosted evaluation dashboard, dataset versioning, regression tracking, and team collaboration
- **Judge model API costs:** Each metric evaluation calls the judge LLM once; a 100-test-case suite with 3 metrics = 300 API calls to the judge; budget accordingly for large evaluation runs
- Use `gpt-4o-mini` or `claude-haiku` as judge during development to reduce costs; switch to `gpt-4o` or `claude-sonnet` for final benchmark runs

## Reference Repositories
- [confident-ai/deepeval](https://github.com/confident-ai/deepeval) — core evaluation framework, 8k+ GitHub stars
- [confident-ai/deepeval/examples](https://github.com/confident-ai/deepeval/tree/main/examples) — RAG evaluation, agent evaluation, and red-teaming examples

## Official Documentation
- [DeepEval Docs](https://docs.confident-ai.com) — getting started, metric catalog, and pytest integration guide
- [DeepEval Metrics Reference](https://docs.confident-ai.com/docs/metrics-introduction) — all 14+ built-in metrics explained with scoring methodology
- [Red-Teaming Guide](https://docs.confident-ai.com/docs/red-teaming-introduction) — adversarial attack types and safety evaluation workflows

## Common Pitfalls
- **Evaluation costs double with a naïve judge choice** — using `model="gpt-4"` for both the LLM under test and the judge causes expensive cross-calls; assign a cheaper judge (`gpt-4o-mini`) during development iterations and only upgrade the judge for final benchmarks.
- **Always include `retrieval_context` for RAG metrics** — Faithfulness and Context Recall compare the output against the retrieved chunks; omitting `retrieval_context` makes these metrics compute against nothing and return meaningless scores near 1.0.
- **Set a threshold in pytest to enforce CI gates** — without a `threshold`, `deepeval` reports scores but never fails the test; add `threshold=0.7` to every metric that guards a production pipeline.
- **G-Eval requires a well-crafted criteria prompt** — vague criteria like "Is the response good?" produce scores with high variance; write criteria as specific binary or rubric statements tied to your product's definition of quality.

## Examples
1. **RAG pipeline CI gate:** Write 50 ground-truth Q&A pairs from your knowledge base → define `FaithfulnessMetric(threshold=0.8)` and `AnswerRelevancyMetric(threshold=0.75)` → run `deepeval test run` in GitHub Actions on every PR → block merges if any test case scores below threshold.
2. **Prompt A/B comparison:** Define the same 30 test cases → evaluate with `prompt_v1` and `prompt_v2` as the `actual_output` generator → compare mean scores per metric across both runs → promote the prompt with higher faithfulness and lower hallucination rate.
3. **Red-teaming before launch:** Run `deepeval red_team` with `attack_enhancements=["jailbreak", "prompt_injection"]` → review flagged responses that bypassed the system prompt → add refusal examples to the system prompt → re-run until all attacks are mitigated.
