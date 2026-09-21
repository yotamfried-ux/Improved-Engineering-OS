# Discord Connector

**Purpose:** Send messages, manage channels, and build Discord bots. Used for community management, developer notifications, and real-time team communication.

## Capabilities
- Send messages to channels and threads
- Create and manage channels and categories
- Send rich embeds (title, description, fields, color, thumbnail)
- Respond to slash commands registered with Discord
- Listen to message events, reactions, and member joins via Gateway
- Manage roles and permissions
- Create and manage threads

## Authentication
| Method | Use Case |
|---|---|
| Bot Token | All server interactions (messages, commands, events) |
| OAuth 2.0 | Apps acting on behalf of a user |
| Webhook URL | One-way message posting without a bot (simplest) |

Get a bot token from Discord Developer Portal → Applications → Bot.

## Common Workflows
1. **Deployment notifications**: GitHub Action → Discord webhook → rich embed with commit hash, author, environment
2. **Alert routing**: Sentry/Grafana alert → format as embed → post to #alerts channel with severity color
3. **Slash command bot**: `/summarize <url>` → fetch URL → call LLM → reply in same channel
4. **Member onboarding**: New member joins → send DM with welcome guide → assign onboarding role

## Official MCP Server
Community: [v-3/discordmcp](https://github.com/v-3/discordmcp) — Discord MCP server (send messages, read channels)

## SDK / Client Libraries
- [discordjs/discord.js](https://github.com/discordjs/discord.js) — most popular Node.js Discord library (28k+ stars)
- [Rapptz/discord.py](https://github.com/Rapptz/discord.py) — Python Discord library

## Official Docs
- [Discord Developer Docs](https://discord.com/developers/docs/intro) — complete API reference
- [discord.js Guide](https://discordjs.guide) — unofficial but official-quality bot guide
- [Discord Webhooks Docs](https://discord.com/developers/docs/resources/webhook) — webhook setup and payloads

## Limitations
- Gateway (real-time events) requires a persistent WebSocket connection — not suitable for serverless
- Slash commands must be registered globally (takes 1 hour to propagate) or per-guild (instant)
- Embeds have field limits: max 25 fields, 1024 chars per field value, 6000 total chars
- Message content requires `MESSAGE_CONTENT` intent (requires bot verification at 75+ servers)
