# Figma Connector

**Purpose:** Read design files, extract components, and sync design tokens programmatically. Used for design-to-code workflows, asset extraction, and design system automation.

## Capabilities
- Read file structure (pages, frames, components)
- Extract component properties, variants, and styles
- Download renderings of nodes as PNG/SVG/PDF
- Get design tokens (colors, typography, spacing)
- List comments on a file
- Access component libraries and their metadata
- Webhooks for file update events

## Authentication
| Method | Use Case |
|---|---|
| Personal Access Token | Personal scripts, local tools |
| OAuth 2.0 | Multi-user apps, plugins distributed to teams |

Generate PAT: Figma Settings → Security → Personal Access Tokens

## Common Workflows
1. **Design token sync**: Extract color/typography tokens from Figma → generate CSS variables or Tailwind config
2. **Asset pipeline**: Extract icons as SVG → optimize with SVGO → commit to repo
3. **Design-to-code**: Read component structure → generate React component stubs
4. **Stale design check**: Compare Figma last-modified with code component last-modified → flag drifted components

## Official MCP Server
[GLips/Figma-Context-MCP](https://github.com/GLips/Figma-Context-MCP) — provides design context (frame layouts, component properties, styles) for AI code generation

## SDK / Client Libraries
- [figma-api (TypeScript)](https://github.com/didoo/figma-api) — community TypeScript client
- [figma-js](https://github.com/jemgold/figma-js) — lightweight Figma REST API client

## Official Docs
- [Figma REST API Docs](https://www.figma.com/developers/api) — complete API reference
- [Figma Plugin API](https://www.figma.com/plugin-docs/) — for Figma plugin development
- [Figma Webhooks](https://www.figma.com/developers/api#webhooks_v2) — file change notifications

## Limitations
- REST API is read-only — cannot create or edit design elements (only Plugins can write)
- Rendering nodes (GET /images) is rate-limited and can be slow for large files
- Component library metadata requires the file to be a published library
- Webhook payloads only indicate that a file changed — you must re-fetch to see what changed
