# dlt (data load tool)

## Overview
dlt is a Python library for building data pipelines as code. Unlike Airbyte or Meltano, dlt runs as a Python library inside your application — no separate infrastructure required. You define sources and destinations in Python, and dlt handles schema inference, incremental loading, data type normalization, and state management automatically. Built for developers who want ELT in their Python codebase without a separate orchestration platform. Particularly strong for loading REST APIs and nested JSON into structured warehouse tables with minimal boilerplate.

## Capabilities
- REST API source with auto-generation from OpenAPI spec (`rest_api` source)
- SQL database source with automatic incremental loading by cursor field
- File source — CSV, JSON, Parquet — with schema inference
- 20+ destinations: BigQuery, Snowflake, Redshift, DuckDB, PostgreSQL, ClickHouse, Databricks, and more
- Automatic schema inference and migration — new columns are added without manual ALTER TABLE
- Incremental loading with cursor fields (`last_value`) and merge keys for upserts
- Nested JSON flattening and normalization into relational tables
- dlt Hub — 50+ pre-built, maintained source templates (GitHub, Salesforce, HubSpot, Slack, etc.)
- Native integration with Airflow, Dagster, and Prefect for orchestration

## When to Use
- Python-first teams who want ELT without running a separate service (no Airbyte deployment, no Meltano project)
- Loading REST APIs into a warehouse with minimal code — the `rest_api` source handles pagination and auth automatically
- Quick prototypes that may grow into production pipelines; same code works in a Jupyter notebook and a Dagster job
- When you need data ingestion inside a serverless function, a Celery task, or a FastAPI endpoint
- Local analytics with DuckDB — `dlt` + DuckDB is the fastest path from a CSV or API to a queryable dataset

## Limitations
- Python-only — no JavaScript/TypeScript support; use Airbyte or Meltano if your team works outside Python
- Newer library (2023) with a smaller pre-built connector ecosystem than Airbyte (300+ connectors) or Meltano/Singer
- Limited built-in monitoring UI — rely on Dagster, Airflow, or Prefect for pipeline observability in production
- Some community sources in dlt Hub are incomplete or not production-hardened; prefer `verified-sources` over community ones

## Integration Guide
1. Install dlt with your destination extra: `pip install "dlt[bigquery]"` or `dlt[snowflake]`, `dlt[duckdb]`, etc.
2. Define a source using the `@dlt.source` and `@dlt.resource` decorators, or use a pre-built source from dlt Hub
3. Create a pipeline with `dlt.pipeline(destination="bigquery", dataset_name="my_dataset")`
4. Call `pipeline.run(my_source())` — dlt infers schema, creates tables, and loads data
5. For incremental loading: add `write_disposition="merge"` and a `primary_key` to your resource; dlt tracks the last loaded value
6. Store secrets in `secrets.toml` or environment variables — dlt resolves `dlt.secrets.value` automatically

Use `pipeline.last_trace` to inspect load stats and `dlt.cli` for schema inspection on the command line.

## Setup Guide
```python
import dlt
import requests

@dlt.source
def github_source(token: str = dlt.secrets.value):
    @dlt.resource(write_disposition="append")
    def issues(repo: str = "dlt-hub/dlt"):
        yield from requests.get(
            f"https://api.github.com/repos/{repo}/issues",
            headers={"Authorization": f"token {token}"}
        ).json()
    return issues

pipeline = dlt.pipeline(destination="bigquery", dataset_name="github")
load_info = pipeline.run(github_source())
print(load_info)
```

```bash
pip install "dlt[bigquery]"
# Store secrets
echo '[sources.github_source]\ntoken="ghp_..."' >> secrets.toml
python pipeline.py
```

## Pricing Notes
- **Core library:** Free, open-source (Apache 2.0)
- **dlt Cloud (managed hosting):** In development as of 2025 — no generally available paid tier yet
- Destination costs (BigQuery, Snowflake, etc.) are your primary operational expense; dlt itself adds no overhead

## Reference Repositories
- [dlt-hub/dlt](https://github.com/dlt-hub/dlt) — core library; reference for pipeline internals, destination adapters, and incremental loading implementation
- [dlt-hub/verified-sources](https://github.com/dlt-hub/verified-sources) — 50+ maintained source templates; start here before writing a custom source

## Official Documentation
- [dlt Docs](https://dlthub.com/docs) — pipeline API, destinations, incremental loading, schema management, secrets
- [dlt REST API Source](https://dlthub.com/docs/dlt-ecosystem/verified-sources/rest_api) — auto-generate a source from any REST API or OpenAPI spec
- [dlt Hub](https://hub.dlthub.com) — searchable catalog of pre-built sources

## Common Pitfalls
- Schema inference works well on first run but may create unexpected column splits on nested JSON — review the inferred schema with `dlt pipeline <name> show` after the first load and adjust field selectors if needed
- Use `replace` write disposition for full refreshes, `append` for append-only event data, and `merge` with a `primary_key` for upserts — choosing the wrong disposition causes duplicates or data loss
- Avoid loading deeply nested JSON without testing first; dlt flattens nested objects into `parent__child` column names, which can produce very wide tables in the warehouse

## Examples
1. **REST API → DuckDB (local analytics):** `pipeline = dlt.pipeline(destination="duckdb")` → define a resource that paginates a REST API → `pipeline.run(my_source())` → query with DuckDB SQL in a Jupyter notebook.
2. **HubSpot → BigQuery (CRM analytics):** Use `dlt-hub/verified-sources` HubSpot source → configure API key in `secrets.toml` → `pipeline.run(hubspot_source(), write_disposition="merge")` → dbt models on top for reporting.
3. **Incremental GitHub issues → Snowflake:** Add `@dlt.resource(primary_key="id", write_disposition="merge")` with `updated_at` as cursor → dlt tracks `last_value` in its state store → each run loads only issues updated since last run.
