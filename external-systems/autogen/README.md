# AutoGen

## Overview
AutoGen is an open-source multi-agent framework by Microsoft Research that enables building applications where multiple AI agents converse and collaborate to complete complex tasks. It focuses on flexible agent composition, human-in-the-loop patterns, and code execution capabilities.

## Capabilities
- Multi-agent conversation framework with `AssistantAgent` and `UserProxyAgent` as core primitives
- Automatic code generation and execution in sandboxed environments (Docker or local)
- GroupChat for orchestrating multiple agents with a `GroupChatManager` that routes turns
- Human-in-the-loop with configurable human input modes: ALWAYS, NEVER, TERMINATE
- Support for OpenAI, Azure OpenAI, Anthropic, and any OpenAI-compatible endpoint
- AutoGen Studio: no-code UI for building and testing multi-agent workflows visually
- AgentChat API (AutoGen v0.4+): high-level, async-first API with Teams, Selectors, and Swarms
- Code executor abstraction: local execution, Docker sandbox, or Jupyter kernel
- Teachable agents for persistent memory across sessions

## When to Use
- Complex tasks benefiting from specialization — e.g., one agent writes code, another reviews, another tests
- Automated code generation and debugging pipelines where code execution is part of the loop
- Research prototyping where rapid agent composition experimentation matters more than production hardening
- Need a visual, no-code interface (AutoGen Studio) for non-technical team members to configure agents

## Limitations
- Multi-agent conversation loops can be expensive (many LLM calls) and slow without careful turn limits
- Code execution in local mode (not Docker) is a security risk — always use Docker in untrusted environments
- Agent termination conditions can be tricky; infinite loops are possible without proper `max_turns` or termination messages
- AutoGen v0.4 AgentChat API is a significant breaking change from v0.2; ecosystem tutorials vary between versions
- Less explicit state management than LangGraph — state is implicit in conversation history

## Integration Guide
1. Install: `pip install pyautogen` (v0.2) or `pip install autogen-agentchat autogen-ext[openai]` (v0.4+)
2. Configure an LLM config with model and API key:
   ```python
   llm_config = {"model": "gpt-4o", "api_key": os.environ["OPENAI_API_KEY"]}
   ```
3. Create agents:
   ```python
   assistant = AssistantAgent(name="assistant", llm_config=llm_config)
   user_proxy = UserProxyAgent(name="user_proxy", human_input_mode="NEVER",
                                code_execution_config={"use_docker": True})
   ```
4. Initiate a conversation: `user_proxy.initiate_chat(assistant, message="Write a Python script to...")`
5. For GroupChat: create multiple `AssistantAgent` instances → `GroupChat(agents=[...], messages=[], max_round=10)` → `GroupChatManager(groupchat=gc, llm_config=...)`
6. Set `is_termination_msg=lambda x: "TERMINATE" in x.get("content", "")` on agents to define exit conditions
7. For v0.4 AgentChat: use `RoundRobinGroupChat` or `SelectorGroupChat` from `autogen_agentchat.teams`

## Setup Guide
```bash
# AutoGen v0.4 (recommended for new projects)
pip install autogen-agentchat autogen-ext[openai]

# AutoGen v0.2 (legacy, many tutorials use this)
pip install pyautogen

# Docker (required for safe code execution)
docker pull python:3.11-slim

# AutoGen Studio (visual UI)
pip install autogenstudio
autogenstudio ui --port 8081

# Set model API keys
export OPENAI_API_KEY=sk-...
export AZURE_OPENAI_API_KEY=...  # if using Azure
```

Configuration notes:
- Always set `max_turns` or `max_round` to prevent infinite loops
- Use `code_execution_config={"use_docker": True}` for any code execution in production/staging
- For Azure OpenAI, add `base_url`, `api_type: "azure"`, and `api_version` to `llm_config`
- Cache LLM responses during development with `cache_seed` in `llm_config` to save API costs

## Pricing Notes
- **AutoGen (library):** Free and open-source (MIT license)
- **Model costs:** Entirely dependent on which LLM provider you use; AutoGen adds no markup
- **AutoGen Studio:** Free and open-source
- Watch for: multi-agent loops can easily generate 10-50x more LLM calls than a single-agent approach; set explicit call budgets

## Reference Repositories
- [microsoft/autogen](https://github.com/microsoft/autogen) — main repository; `python/samples/` for working examples
- [microsoft/autogen/tree/main/python/samples](https://github.com/microsoft/autogen/tree/main/python/samples) — coding, web browsing, finance agent examples

## Official Documentation
- [AutoGen Docs](https://microsoft.github.io/autogen/) — v0.4 documentation hub
- [AgentChat Guide](https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/) — high-level API
- [AutoGen Studio](https://microsoft.github.io/autogen/stable/user-guide/autogenstudio-user-guide/) — no-code interface guide
- [Code Execution](https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/code-execution.html) — safe sandboxing

## Examples
1. **Automated data analysis:** User proxy sends a CSV path and question → AssistantAgent writes Pandas/Matplotlib code → UserProxyAgent executes in Docker → AssistantAgent interprets the output → produces a written summary report.
2. **Software development team:** Three agents: `Planner` (breaks task into subtasks), `Coder` (writes code), `Reviewer` (checks correctness and style) → GroupChat routes turns among them → Planner signals TERMINATE when all subtasks are verified.
3. **Research summarizer:** `SearchAgent` retrieves papers (via tool calls) → `SummaryAgent` condenses findings → `CriticAgent` challenges conclusions → final output is a structured research brief agreed upon by all three agents.
