# CrewAI

## Overview
CrewAI is an open-source Python framework for orchestrating role-based multi-agent AI systems. It models agent collaboration as a "crew" of agents with defined roles, goals, and tools, executing tasks sequentially or in parallel with a focus on ease of use and production deployment.

## Capabilities
- Role-based agents: each `Agent` has a `role`, `goal`, `backstory`, and optional set of tools
- Task orchestration: `Task` objects define work units with expected output, assigned agent, and optional callback
- Sequential and hierarchical process modes; hierarchical uses a manager LLM to dynamically delegate subtasks
- Built-in tool library: web search (SerperDev, Tavily), file read/write, code execution, web scraping
- Custom tool creation via `@tool` decorator or `BaseTool` subclass with Pydantic input validation
- Memory: short-term (within-run conversation), long-term (embeddings in SQLite/Chroma), entity memory, and user memory
- Knowledge sources: attach PDFs, CSVs, JSON, or text files as knowledge for the crew
- CrewAI+ Platform: managed deployment with monitoring, cron scheduling, and webhook triggers
- Flow API: event-driven state machine for complex conditional multi-crew orchestration

## When to Use
- Need a structured, readable way to define multi-agent pipelines without deep graph programming
- Building content generation, research, or data enrichment pipelines with clear role separation
- Want built-in memory and knowledge management without custom vector DB integration
- Teams prefer declarative agent configuration (roles/goals in plain English) over imperative graph construction

## Limitations
- Sequential mode has no true parallelism at the Python level; async/parallel tasks require careful configuration
- Hierarchical mode's manager LLM quality directly determines delegation accuracy — can be unpredictable
- Memory features (long-term, entity) add latency and complexity; not always needed and sometimes introduces bugs
- Less fine-grained control over execution flow compared to LangGraph; harder to implement precise branching logic
- CrewAI+ Platform is a paid managed service; self-hosting requires building your own deployment wrapper

## Integration Guide
1. Install: `pip install crewai crewai-tools`
2. Define agents:
   ```python
   from crewai import Agent, Task, Crew, Process

   researcher = Agent(role="Senior Researcher", goal="Find accurate information about {topic}",
                      backstory="You are an expert researcher...", verbose=True,
                      llm="anthropic/claude-opus-4-5")
   writer = Agent(role="Content Writer", goal="Write a compelling article", backstory="...",
                  llm="openai/gpt-4o")
   ```
3. Define tasks and assign to agents:
   ```python
   research_task = Task(description="Research {topic} and find key findings",
                        expected_output="A bullet list of 10 key findings", agent=researcher)
   write_task = Task(description="Write a 500-word article based on the research",
                     expected_output="A full article in markdown", agent=writer)
   ```
4. Create and run the crew:
   ```python
   crew = Crew(agents=[researcher, writer], tasks=[research_task, write_task],
               process=Process.sequential, verbose=True)
   result = crew.kickoff(inputs={"topic": "AI safety"})
   ```
5. For memory: add `memory=True` to `Crew()`; configure `long_term_memory=LongTermMemory(storage=LTMSQLiteStorage())`
6. For tools: `from crewai_tools import SerperDevTool, FileReadTool` → pass in `tools=[SerperDevTool()]` to the agent

## Setup Guide
```bash
# Install core + tools
pip install crewai crewai-tools

# CLI for project scaffolding
pip install crewai
crewai create crew my_project
cd my_project

# Common tool dependencies
pip install "crewai-tools[web]"  # web search tools

# Set API keys
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
export SERPER_API_KEY=...  # for web search tool
```

Configuration notes:
- LLMs are specified as `"provider/model"` strings: `"openai/gpt-4o"`, `"anthropic/claude-opus-4-5"`
- Use `{variable}` syntax in task descriptions and agent goals for runtime input via `crew.kickoff(inputs={...})`
- Set `max_iter=5` on agents to limit retry loops on failed tool calls
- `verbose=True` on Crew or Agent prints execution trace; disable in production

## Pricing Notes
- **CrewAI (library):** Free and open-source (MIT license)
- **Model costs:** Determined by your chosen LLM provider; CrewAI adds no markup
- **CrewAI+ Platform:** Managed deployment; pricing at https://crewai.com/pricing (team and enterprise tiers)
- **SerperDev tool:** 2,500 free searches/month; $50/month for 50K searches
- Watch for: verbose multi-agent runs with web search can accumulate significant LLM + search API costs quickly

## Reference Repositories
- [crewAIInc/crewAI](https://github.com/crewAIInc/crewAI) — main repo; `src/crewai/` for internals, `tests/` for patterns
- [crewAIInc/crewAI-examples](https://github.com/crewAIInc/crewAI-examples) — end-to-end use cases: stock analysis, content pipeline, trip planner

## Official Documentation
- [CrewAI Docs](https://docs.crewai.com/) — complete reference
- [Agents](https://docs.crewai.com/concepts/agents) — role configuration and tool assignment
- [Memory](https://docs.crewai.com/concepts/memory) — short/long-term memory setup
- [Flows](https://docs.crewai.com/concepts/flows) — event-driven orchestration for complex pipelines

## Examples
1. **Content marketing pipeline:** `ResearchAgent` uses SerperDev to find latest trends → `OutlineAgent` structures the article → `WriterAgent` drafts the piece → `EditorAgent` refines tone and grammar → output is a publish-ready blog post.
2. **Competitor analysis:** Crew with roles: Market Analyst, Data Gatherer, Report Writer; each assigned web search tools; hierarchical process where a Manager LLM decides which agent gets each competitor to research; final crew output is a structured comparison table.
3. **Code generation with review:** `ArchitectAgent` designs the module structure → `CoderAgent` implements each function → `QAAgent` writes unit tests → crew runs sequentially; task context passing ensures each agent builds on the previous output.
