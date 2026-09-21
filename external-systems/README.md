# external-systems

Inventory of third-party services and connectors known to Engineering OS.

This README is index-only. Selection policy, task routing, capability vocabulary, and global workflow rules belong in `../core/`.

Canonical owners:

| Question | Source of truth |
|---|---|
| Which service or connector exists? | This README |
| Connector selection and fallback | `../core/connector-policy.md` |
| Task class capability vocabulary | `../core/capability-registry.yaml` |
| Task routing before work starts | `../core/task-router.md` |
| One connector practical usage | `connectors/<name>/README.md` |

## LLM Providers & AI APIs

| Service | Path | Notes |
|---|---|---|
| Anthropic (Claude) | `anthropic/` | Claude API |
| OpenAI | `openai/` | GPT and embeddings |
| Google Gemini | `google-gemini/` | Gemini models |
| Mistral | `mistral/` | Mistral models |
| Cohere | `cohere/` | Reranking and embeddings |
| NVIDIA NIM | `nvidia/` | Inference API |

## AI Agent Frameworks

| Service | Path | Notes |
|---|---|---|
| LangGraph | `langgraph/` | Stateful agent graphs |
| CrewAI | `crewai/` | Role-based agent crews |
| AutoGen | `autogen/` | Conversational agents |
| Pydantic AI | `pydantic-ai/` | Type-safe agents |
| MCP SDK | `mcp-sdk/` | MCP servers |

## Computer Vision & Media AI

| Service | Path | Notes |
|---|---|---|
| Supervision | `supervision/` | Python CV toolkit for detections, annotations, datasets, and video/image review overlays |

## Vector Databases & Search

| Service | Path | Notes |
|---|---|---|
| Pinecone | `pinecone/` | Vector DB |
| Weaviate | `weaviate/` | Vector DB |
| Qdrant | `qdrant/` | Vector DB |
| Chroma | `chroma/` | Local vector store |
| Meilisearch | `meilisearch/` | Search |
| Typesense | `typesense/` | Search |
| Algolia | `algolia/` | Managed search |

## Databases & Data Pipelines

| Service | Path | Notes |
|---|---|---|
| Supabase | `supabase/` | Postgres, Auth, Storage |
| dlt | `dlt/` | Data loading |
| Meltano | `meltano/` | ELT platform |

## Authentication & Identity

| Service | Path | Notes |
|---|---|---|
| Auth0 | `auth0/` | Auth and SSO |
| Clerk | `clerk/` | App auth |
| Firebase Auth | `firebase-auth/` | Firebase auth |

## Payments & Commerce

| Service | Path | Notes |
|---|---|---|
| Stripe | `stripe/` | Billing and webhooks |
| Paddle | `paddle/` | SaaS billing |
| LemonSqueezy | `lemonsqueezy/` | SaaS billing |

## Observability & Analytics

| Service | Path | Notes |
|---|---|---|
| Datadog | `datadog/` | APM and logs |
| Grafana | `grafana/` | Observability |
| LangSmith | `langsmith/` | LLM tracing |
| DeepEval | `deepeval/` | LLM evaluation |
| PostHog | `posthog/` | Product analytics |
| Amplitude | `amplitude/` | Product analytics |
| Mixpanel | `mixpanel/` | Product analytics |

## Feature Flags & Experimentation

| Service | Path | Notes |
|---|---|---|
| GrowthBook | `growthbook/` | Feature flags |
| LaunchDarkly | `launchdarkly/` | Feature flags |
| Unleash | `unleash/` | Feature flags |

## Communication & Media

| Service | Path | Notes |
|---|---|---|
| Resend | `resend/` | Email API |
| Ably | `ably/` | Realtime messaging |
| Cloudinary | `cloudinary/` | Media CDN |
| Mux | `mux/` | Video hosting |
| Mapbox | `mapbox/` | Maps |

## Scheduling & Events

| Service | Path | Notes |
|---|---|---|
| Cal.com | `cal-com/` | Scheduling |
| Inngest | `inngest/` | Durable functions |
| Liveblocks | `liveblocks/` | Collaboration |

## CRM

| Service | Path | Notes |
|---|---|---|
| Twenty CRM | `twenty-crm/` | CRM |

## MCP Connectors

| Connector | Path |
|---|---|
| GitHub | `connectors/github/` |
| Notion | `connectors/notion/` |
| Slack | `connectors/slack/` |
| Linear | `connectors/linear/` |
| Jira | `connectors/jira/` |
| Stripe | `connectors/stripe/` |
| Supabase | `connectors/supabase/` |
| Postgres | `connectors/postgres/` |
| Google Drive | `connectors/google-drive/` |
| Google Sheets | `connectors/google-sheets/` |
| Figma | `connectors/figma/` |
| Discord | `connectors/discord/` |
