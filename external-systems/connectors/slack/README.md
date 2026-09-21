# Slack Connector

**Purpose:** Send messages, manage channels, and respond to events in Slack workspaces. Used for notifications, bots, and workflow automation.

## Capabilities
- Send messages to channels and users (DMs)
- Post rich messages with Block Kit UI (buttons, forms, modals)
- Respond to slash commands and interactive components
- Listen to message events via Event API or Socket Mode
- Read channel history and user info
- Manage channel membership

## Authentication
| Method | Use Case |
|---|---|
| Bot Token (`xoxb-`) | App posting messages, reading channels |
| User Token (`xoxp-`) | Acting as a specific user (rare — use bot tokens) |
| OAuth 2.0 | Installing app to workspaces (multi-workspace distribution) |

Required scopes: `chat:write`, `channels:read`, `channels:history`

## Common Workflows
1. **Deployment notifications**: GitHub Action posts to #deployments channel on release
2. **Incident alerts**: PagerDuty/Sentry webhook → format → Slack message with action buttons
3. **Slack bot**: Respond to `/command` or `@mention` → process with LLM → reply in thread
4. **Approval flows**: Post message with Approve/Reject buttons → handle interactive payload

## Official MCP Server
[modelcontextprotocol/servers/slack](https://github.com/modelcontextprotocol/servers/tree/main/src/slack) — tools: `slack_post_message`, `slack_list_channels`, `slack_get_channel_history`

## SDK / Client Libraries
- [@slack/web-api](https://github.com/slackapi/node-slack-sdk) — official Node.js SDK
- [@slack/bolt](https://github.com/slackapi/bolt-js) — Bolt framework for Slack apps (recommended)
- [slack-sdk (Python)](https://github.com/slackapi/python-slack-sdk) — official Python SDK

## Official Docs
- [Slack API Docs](https://api.slack.com/docs) — complete reference
- [Block Kit Builder](https://app.slack.com/block-kit-builder) — visual message composer
- [Bolt Framework Docs](https://slack.dev/bolt-js/) — Slack app framework

## Limitations
- Webhooks (Incoming Webhooks) are one-way only — use Events API for bidirectional
- Rate limits: 1 request/second per method by default (Tier 3); burst allowed
- Free workspaces limit message history to 90 days
