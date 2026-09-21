# Meltano

## Overview
Meltano is an open-source DataOps platform built around the Singer tap/target ecosystem for ELT pipelines. Created by GitLab, it provides a CLI + YAML config-driven approach to building, orchestrating, and testing data pipelines. Best positioned as the "starter architecture" for ELT: install Singer taps/targets for your sources and destinations, manage versions in `meltano.yml`, run pipelines via CLI or in any CI/CD pipeline. Backed by a large Singer ecosystem with 300+ connectors.

## Capabilities
- CLI-driven ELT pipeline management with `meltano run`, `meltano invoke`, and `meltano test`
- Singer tap/target integration — CSV, PostgreSQL, Snowflake, BigQuery, Salesforce, HubSpot, and 300+ sources via MeltanoHub
- dbt integration for transformations within the same pipeline tool
- Airflow and Dagster orchestration plugins for production scheduling
- Pipeline testing via `meltano test` with built-in tap stream validation
- Environment management (dev / staging / prod) via `meltano.yml` profiles
- Docker support for containerized pipeline execution
- Pipeline state management with pluggable backends (local file, S3, GCS)

## When to Use
- Small to mid-size data engineering teams who want ELT without managing a full Airbyte deployment
- GitLab-style config-as-code pipelines where all connector versions and settings live in version control
- Teams already using the Singer tap ecosystem who want a unified management layer
- When you need dbt-native transformations in the same pipeline tool without a separate orchestrator
- Open-source-first data stacks where avoiding SaaS vendor lock-in is a priority

## Limitations
- Singer ecosystem quality varies — some community taps are unmaintained or have schema inconsistencies; always validate before loading to a warehouse
- No built-in UI for monitoring pipelines (Airbyte Cloud and Fivetran both have one)
- Steeper learning curve than Fivetran or Airbyte Cloud; requires familiarity with YAML config and the Singer spec
- State management for large incremental syncs requires configuring a backend (default is local file, which breaks in distributed deployments)

## Integration Guide
1. Install Meltano and initialize a project: `pip install meltano && meltano init my-project`
2. Add a Singer extractor (tap) for your source and a loader (target) for your destination
3. Configure credentials via environment variables or `meltano config <plugin> set`
4. Run the pipeline: `meltano run tap-<source> target-<destination>`
5. Add dbt for transformations: `meltano add transformer dbt-postgres`
6. Schedule via cron or add an orchestrator plugin (Airflow, Dagster) for production

For incremental loads, set the `start_date` config and ensure the tap supports the `INCREMENTAL` replication method. Check `meltano.yml` for the `select` filter to include/exclude streams.

## Setup Guide
```bash
pip install meltano
meltano init my-project && cd my-project

# Add extractor and loader
meltano add extractor tap-github
meltano add loader target-postgres

# Configure credentials
meltano config tap-github set auth_token $GITHUB_TOKEN
meltano config target-postgres set host $PG_HOST

# Run the pipeline
meltano run tap-github target-postgres

# Add dbt for transformations
meltano add transformer dbt-postgres
meltano run tap-github target-postgres dbt-postgres:run
```

## Pricing Notes
- **Core platform:** Free, open-source (MIT license)
- **Meltano Cloud (managed hosting):** Freemium — free tier available; paid tiers for additional pipeline runs and support
- Self-hosted deployments have no licensing costs; infrastructure (compute, storage) is the primary cost

## Reference Repositories
- [meltano/meltano](https://github.com/meltano/meltano) — core platform; reference for CLI architecture, plugin system, and state management
- [meltano/sdk](https://github.com/meltano/sdk) — Singer tap/target SDK for building custom connectors; use when a community tap doesn't exist for your source

## Official Documentation
- [Meltano Docs](https://docs.meltano.com) — CLI reference, plugin management, environment configuration, orchestration
- [Singer Specification](https://hub.meltano.com/singer/spec) — tap/target protocol standard; required reading before building a custom connector
- [MeltanoHub](https://hub.meltano.com) — searchable catalog of 300+ Singer taps and targets with compatibility ratings

## Common Pitfalls
- Singer taps have inconsistent schema handling — some emit schemas with `null` types that cause type conflicts in strict warehouses like BigQuery; always validate tap output with `meltano invoke tap-<name>` before connecting a loader
- Set `--full-refresh` on the first run or after schema changes; incremental state from a previous schema will cause errors or missed rows
- Large incremental syncs need proper state management — the default local-file state backend breaks in Docker or distributed CI environments; configure an S3 or GCS state backend for production

## Examples
1. **GitHub → PostgreSQL pipeline:** `meltano add extractor tap-github && meltano add loader target-postgres` → configure repo list and PG credentials → `meltano run tap-github target-postgres` → schedule with cron for nightly syncs.
2. **Salesforce → Snowflake with dbt:** Add `tap-salesforce`, `target-snowflake`, and `dbt-snowflake` → run `meltano run tap-salesforce target-snowflake dbt-snowflake:run` → dbt models transform raw Salesforce data into CRM analytics marts.
3. **CI/CD pipeline:** Check `meltano.yml` into Git → add a GitHub Actions step that runs `meltano run` on schedule → state stored in S3 so each CI run resumes from last watermark.
