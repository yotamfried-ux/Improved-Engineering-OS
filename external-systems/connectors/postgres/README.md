# PostgreSQL Connector

**Purpose:** Direct read/write access to PostgreSQL databases. Used for data queries, analytics, and database management from AI agents and automation tools.

## Capabilities
- Execute SQL queries (SELECT, INSERT, UPDATE, DELETE)
- Run parameterized queries to prevent SQL injection
- Manage schema (CREATE TABLE, ALTER TABLE, migrations)
- Transaction support (BEGIN/COMMIT/ROLLBACK)
- LISTEN/NOTIFY for real-time event streaming
- Full-text search, JSONB queries, array operations
- Connection pooling with PgBouncer/Supabase Pooler

## Authentication
| Method | Details |
|---|---|
| Connection String | `postgresql://user:password@host:5432/dbname` |
| SSL/TLS | Required for cloud databases (add `?sslmode=require`) |
| pgpass file | Password file for scripts without inline credentials |

Never hardcode credentials — use environment variables or secrets manager.

## Common Workflows
1. **AI data query**: Agent receives natural language → generates SQL → executes → returns result
2. **Migration runner**: On deploy, run pending migrations from `migrations/` folder
3. **Analytics query**: Scheduled job queries aggregates → pushes to dashboard
4. **Event streaming**: LISTEN to a channel → trigger downstream workflow on database event

## Official MCP Server
[modelcontextprotocol/servers/postgres](https://github.com/modelcontextprotocol/servers/tree/main/src/postgres) — read-only query tool for safe AI access

## SDK / Client Libraries
- [brianc/node-postgres](https://github.com/brianc/node-postgres) — `pg` Node.js client
- [MagicStack/asyncpg](https://github.com/MagicStack/asyncpg) — async Python PostgreSQL client
- [prisma/prisma](https://github.com/prisma/prisma) — TypeScript ORM (recommended for applications)

## Official Docs
- [PostgreSQL Docs](https://www.postgresql.org/docs/) — complete reference
- [node-postgres Docs](https://node-postgres.com) — pg client documentation

## Limitations
- The official MCP server is read-only by design — write access requires a custom MCP server
- Connection limits per database instance — always use a connection pool (PgBouncer or Supabase Pooler) for production
- Long-running queries block the connection — set statement_timeout for AI-generated queries
