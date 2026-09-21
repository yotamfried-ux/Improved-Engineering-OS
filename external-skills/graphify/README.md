# Graphify — Code Knowledge Graph for Token-Efficient Retrieval

**One-line summary:** Maps your entire repository into a queryable knowledge graph so Claude retrieves a relevant subgraph instead of reading whole files — cutting context cost on large codebases.

---

## Source

- **Repository:** https://github.com/safishamsi/graphify
- **License:** MIT (Safi Shamsi)
- **PyPI package name:** `graphifyy`

---

## What It Ships

Graphify is a combination of four things in one package:

| Component | Description |
|---|---|
| **Python library** | Core graph-building and query engine |
| **CLI** | `graphify` command for extraction, querying, path tracing, PR triage |
| **Claude Code skill** | `/graphify .` slash command installed directly into Claude Code |
| **Optional MCP server** | `graphify-mcp` process exposing graph tools over the MCP protocol (requires the `[mcp]` extra) |

**Underlying technology:**
- **Parsing:** tree-sitter (~30 languages) — fully local, no API key required for code
- **Graph:** NetworkX (nodes = symbols/files/docs; edges = calls/imports/uses)
- **Clustering:** Leiden community detection

---

## Status

| Field | Value |
|---|---|
| **Wrapper status** | Active |
| **Type tags** | `context-optimization`, `code-intelligence` |
| **Execution Level** | **Level 1 — Recommended default-on** for non-trivial and large repos |

**Cost-saving purpose:** Instead of passing entire files into context, Graphify returns a selective subgraph of only the nodes and edges relevant to a query. On large or multi-language repositories this meaningfully reduces token usage per turn.

---

## Install Summary

```bash
# Install the CLI and skill
uv tool install graphifyy
graphify install          # installs the /graphify skill into Claude Code

# Optional: MCP server support
uv tool install "graphifyy[mcp]"
```

Full prerequisites, MCP wiring, and verification steps are in [`activation.md`](./activation.md).

---

## Files in This Wrapper

| File | Purpose |
|---|---|
| [`README.md`](./README.md) | This file — overview and orientation |
| [`integration.md`](./integration.md) | Functional role, when to use/avoid, workflow impact, concrete artifacts |
| [`policy.md`](./policy.md) | Classification, execution level, composition rules, graph-freshness policy |
| [`activation.md`](./activation.md) | Installation, verification, secrets config, disable/uninstall |
