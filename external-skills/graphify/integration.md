# Graphify — Integration Guide

## Functional Role

Graphify maps your entire repository into a persistent knowledge graph and then serves **selective subgraph retrieval** in response to queries.

**Why this matters for Claude:** Instead of reading whole files (or grepping through many files) to understand a codebase, Claude can query the graph and receive only the nodes and edges relevant to the current task — the function being called, the module being changed, the PR being reviewed. This keeps per-turn token usage low, which matters most on large or multi-language repositories where even a single file read can be expensive.

The architectural statement in the project's own ARCHITECTURE.md: *"graphify is a Claude Code skill backed by a Python library."* The graph is built locally with tree-sitter (parsing ~30 languages) and NetworkX (nodes = symbols/files/docs; edges = calls/imports/uses). Leiden community detection clusters the graph into logical communities that can be retrieved as a unit.

---

## When to Use

- **Large or multi-language repositories** — where reading files one by one quickly exhausts context.
- **Unfamiliar codebases** — use `query_graph` or `/graphify .` to locate the relevant cluster of code before opening any file.
- **PR impact and triage** — use `list_prs`, `get_pr_impact`, `triage_prs` to understand what a change touches without reading every affected file.
- **Call-path tracing** — use `shortest_path` or `graphify path` to find how A calls B.
- **Mixed corpora** — repositories containing code, docs, PDFs, images, and videos: Graphify ingests all of them into the same graph (non-code extraction requires a provider API key — see `activation.md`).
- **Repeated work on the same repo** — the graph is persistent on disk (`graphify-out/graph.json`); subsequent queries are fast and cheap.

---

## When NOT to Use

- **Tiny projects** — Graphify enforces a node-count threshold before it considers the graph meaningful. You can override with `--force`, but there is little benefit and some overhead on small repos.
- **When you need exact current file contents** — the graph reflects the state of the code at build time. If files have changed since the last `graphify extract` run and the post-commit hook was not installed (or missed a commit), the graph can be stale. For questions about exact current content, read the file directly.
- **Air-gapped environments with non-code content** — semantic extraction of documents, images, or videos requires an outbound API call to an LLM provider. Code-only extraction is entirely local and needs no key or network access.

---

## How It Affects Claude's Workflow

Graphify is a **context-optimization layer** that runs **first and cross-cutting**:

1. **Build or refresh the graph** at the start of a work session or after a gap (run `graphify extract .` or `/graphify .`).
2. **Query the subgraph** throughout the session — before opening files, before writing code, before reviewing a PR.
3. **Read files selectively** based on what the subgraph surfaces, rather than reading broadly.
4. The post-commit hook (`graphify hook install`) keeps the graph incrementally fresh so graph queries remain trustworthy across commits.

The net effect: Claude spends fewer tokens on exploration and more tokens on the actual task.

---

## Concrete Artifacts You Invoke

### Claude Code Skill (primary entry point)

| Command | What it does |
|---|---|
| `/graphify .` | Build or refresh the graph for the current repo and make it available for the session |

### MCP Tools (when MCP server is connected)

| Tool | Purpose |
|---|---|
| `query_graph` | Retrieve a relevant subgraph for a natural-language or symbol query |
| `get_node` | Fetch a single node by ID (symbol, file, doc) |
| `get_neighbors` | Get the immediate neighbors of a node (callers, callees, imports) |
| `get_community` | Retrieve an entire Leiden community (logical cluster of related code) |
| `god_nodes` | List the highest-centrality nodes — the ones everything depends on |
| `graph_stats` | Summary statistics: node count, edge count, community count |
| `shortest_path` | Find the call/import path between two nodes |
| `list_prs` | List pull requests tracked in the graph |
| `get_pr_impact` | Subgraph of everything a specific PR touches |
| `triage_prs` | Rank open PRs by impact / risk based on graph centrality |

### MCP Resources (when MCP server is connected)

| Resource URI | What it provides |
|---|---|
| `graphify://report` | Full graph analysis report |
| `graphify://stats` | Node/edge/community statistics |
| `graphify://god-nodes` | High-centrality node list |
| `graphify://surprises` | Unexpected dependency patterns |
| `graphify://audit` | Dependency audit findings |
| `graphify://questions` | Suggested questions to explore the graph |

### CLI Commands

| Command | Purpose |
|---|---|
| `graphify install` | Install the `/graphify` skill into Claude Code |
| `graphify extract [path]` | Parse and build the graph from source |
| `graphify query <query>` | Query the graph from the terminal |
| `graphify explain <symbol>` | Explain a symbol in graph context |
| `graphify path <from> <to>` | Trace the call/import path between two symbols |
| `graphify prs` | List and triage PRs |
| `graphify hook install` | Install the post-commit hook for incremental graph updates |
| `graphify serve` | Start the MCP server process |

---

## Composition

Graphify occupies the **context-optimization** role in the skill composition stack:

- **Runs first** — build or verify the graph before starting planning, coding, or review.
- **Cross-cutting** — informs every subsequent phase; not limited to a single stage.
- **Feeds planning** — use `query_graph` and `god_nodes` to understand the landscape before writing a plan.
- **Feeds coding** — use `get_neighbors` and `shortest_path` to locate the right insertion points.
- **Feeds review** — use `get_pr_impact` and `triage_prs` to assess what a change touches.
- **Does not replace file reads** — it narrows which files to read. Once the relevant nodes are identified, reading those specific files is still necessary for exact current content.
