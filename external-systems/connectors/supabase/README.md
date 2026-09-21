# Supabase Connector

**Purpose:** Access Supabase databases, auth, storage, and real-time subscriptions. Supabase is a Firebase alternative built on PostgreSQL — connect to it as a backend service or directly via the PostgreSQL connector.

## Capabilities
- CRUD operations on PostgreSQL tables via REST (PostgREST auto-API)
- Real-time subscriptions to database changes (Postgres logical replication)
- Auth: sign up, sign in, OAuth, JWT validation, user management
- Storage: upload, download, and manage files with access control
- Edge Functions: invoke serverless Deno functions
- RLS (Row Level Security): enforce data access policies at the database level
- Full SQL access via direct PostgreSQL connection

## Authentication
| Key | Use Case |
|---|---|
| `anon` key | Client-side (browser/mobile) — respects RLS policies |
| `service_role` key | Server-side only — bypasses RLS completely. NEVER expose client-side |
| User JWT | Authenticate requests as a specific user (passed in `Authorization` header) |

## Common Workflows
1. **User auth flow**: `supabase.auth.signUp()` → store session → `supabase.auth.getUser()` on API routes
2. **RLS-protected data**: Enable RLS on table → create policy `auth.uid() = user_id` → all queries auto-scoped
3. **Real-time feature**: `supabase.channel('table').on('postgres_changes', ...)` → live UI updates
4. **File upload**: `supabase.storage.from('avatars').upload(path, file)` → get public URL

## Official MCP Server
[supabase-community/supabase-mcp](https://github.com/supabase-community/supabase-mcp) — tools: `execute_sql`, `list_tables`, `apply_migration`, `get_project_url`

## SDK / Client Libraries
- [@supabase/supabase-js](https://github.com/supabase/supabase-js) — official JavaScript/TypeScript SDK
- [supabase-py](https://github.com/supabase/supabase-py) — official Python SDK

## Official Docs
- [Supabase Docs](https://supabase.com/docs) — complete platform documentation
- [Supabase RLS Guide](https://supabase.com/docs/guides/auth/row-level-security) — row-level security patterns
- [Supabase Auth Docs](https://supabase.com/docs/guides/auth) — authentication and authorization

## Limitations
- `service_role` key bypasses RLS — must NEVER be used client-side or committed to source control
- Real-time requires the table to have logical replication enabled (`supabase.replication`)
- Free tier: 500MB database, 1GB storage, 50,000 monthly active users
- Direct PostgreSQL connections require IPv4 add-on ($4/month) on Supabase Cloud
