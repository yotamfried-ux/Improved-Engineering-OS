# Graphify — Activation Guide

## Prerequisites

| Requirement | Notes |
|---|---|
| **Python >= 3.10** | Required by the package; check with `python3 --version` |
| **uv** (recommended) or **pipx** | Used to install the tool in an isolated environment |
| **`graphifyy[mcp]` extra** | Required only if connecting via MCP; not needed for the CLI skill alone |

---

## Install

### Step 1 — Install the CLI and skill

```bash
# Preferred (uv)
uv tool install graphifyy

# Alternative (pipx)
pipx install graphifyy
```

### Step 2 — Install the Claude Code skill

```bash
graphify install
```

This registers the `/graphify` slash command in Claude Code.

### Step 3 (optional) — Add MCP server support

If you want to use the MCP tools (`query_graph`, `get_pr_impact`, etc.) directly from Claude:

```bash
# Install with the MCP extra
uv tool install "graphifyy[mcp]"

# Register the MCP server in Claude Code (stdio transport — local, no token needed)
claude mcp add --transport stdio graphify -- python -m graphify.serve graphify-out/graph.json
```

### Step 4 — Install the post-commit hook (strongly recommended)

```bash
graphify hook install
```

This keeps the graph incrementally updated after each commit so graph queries stay fresh.

### Step 5 — Build the initial graph

```bash
# From the repo root
graphify extract .

# Or via the Claude Code skill
/graphify .
```

---

## Verify Presence

Run these checks after installation to confirm everything is wired correctly:

| Check | Command | Expected outcome |
|---|---|---|
| CLI on PATH | `graphify --version` | Prints version (e.g. `0.8.40`) |
| Graph built | `ls graphify-out/graph.json` | File exists and is non-empty |
| MCP server connected | In Claude Code: check MCP server list | `graphify` appears as connected |
| Skill available | In Claude Code chat: type `/graphify` | Autocomplete shows the command |

---

## Configuration and Secrets

**IMPORTANT — read this section before setting any environment variables.**

### Code-only extraction — no key needed

If your repository contains only code (no docs, PDFs, images, or videos), Graphify runs entirely locally using tree-sitter. No API key and no network access are required.

### Semantic extraction of non-code content

To extract meaning from documents, images, or videos, Graphify needs to call an external LLM provider. Set exactly ONE of the following environment variables to the corresponding API key for your chosen provider:

| Environment variable | Provider |
|---|---|
| `Nemotron_api_key` | NVIDIA Nemotron **(recommended — Engineering OS default)** |
| `ANTHROPIC_API_KEY` | Anthropic (Claude) |
| `GEMINI_API_KEY` or `GOOGLE_API_KEY` | Google Gemini |
| `OPENAI_API_KEY` | OpenAI |
| `MOONSHOT_API_KEY` | Moonshot AI |
| `DEEPSEEK_API_KEY` | DeepSeek |

> **Engineering OS note:** `session-setup.sh` automatically exports `Nemotron_api_key` as `OPENAI_API_KEY` (NVIDIA uses an OpenAI-compatible API). No extra setup needed — setting `Nemotron_api_key` in Claude Code secrets is sufficient.

Azure OpenAI and Amazon Bedrock are also supported; consult the upstream documentation for the corresponding variable names.

Set these as local environment variables (e.g. in your shell profile or a `.env` file that is gitignored). Never commit API keys to the repository.

### MCP HTTP transport (optional)

When running the MCP server over HTTP (rather than stdio), you can require callers to authenticate with a bearer token. Set:

```
GRAPHIFY_API_KEY=<your-chosen-secret>
```

The server will then require `Authorization: Bearer <key>` or `X-API-Key: <key>` on incoming requests.

When using the **stdio transport** (the `claude mcp add` command above), the server runs on loopback with no network exposure, and no authentication token is needed or used.

### Tuning variables

| Variable | Purpose |
|---|---|
| `GRAPHIFY_MAX_OUTPUT_TOKENS` | Cap on tokens returned per graph query |
| `GRAPHIFY_MAX_WORKERS` | Parallelism for extraction |
| `GRAPHIFY_QUERY_LOG` (and `GRAPHIFY_QUERY_LOG_*`) | Query logging configuration |

---

## SECURITY WARNING — Share URL Tokens

> **If you received a share link to this project (or to any Graphify setup guide) that contains an `mcp_token=...` query parameter in the URL, treat that token as a personal secret.**
>
> - It is a per-user credential tied to your identity. It is NOT part of the Graphify project itself.
> - **Never write it into any file** — not `activation.md`, not `.env`, not `CLAUDE.md`, not any config file that could be committed.
> - **Never paste it into a chat or a shared document.**
> - If you need to use it, set it as a local environment variable in your shell session only, and do not persist it to disk in any tracked location.
>
> The real Graphify authentication mechanisms are described above: `GRAPHIFY_API_KEY` for HTTP transport, and no token at all for stdio transport.

---

## Disable / Uninstall

```bash
# Remove the CLI and skill
uv tool uninstall graphifyy
# (or: pipx uninstall graphifyy)

# Remove the MCP server entry from Claude Code
claude mcp remove graphify

# Remove the post-commit hook (run from the repo root)
# Edit .git/hooks/post-commit and remove the graphify line, or delete the hook if graphify added it entirely
```

The `graphify-out/` directory (containing the graph JSON) can be deleted manually once the tool is uninstalled.

---

## Reference

For bootstrapping Graphify as part of a new project setup, see `scripts/skill-bootstrap.sh` in this Engineering OS repository.
