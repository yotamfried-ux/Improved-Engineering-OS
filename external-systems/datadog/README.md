# Datadog

## Overview
Datadog is an enterprise-grade observability and security platform that unifies metrics, traces, logs, synthetics, and alerts in a single product. Built by Datadog, Inc., it is the industry standard for observability in cloud-native production environments, covering infrastructure monitoring, APM distributed tracing, real-user monitoring (RUM), and security threat detection across any cloud or on-premise stack.

## Capabilities
- APM (Application Performance Monitoring): distributed tracing with flame graphs, service maps, and latency percentile tracking
- Infrastructure metrics: system-level dashboards for every major cloud (AWS, GCP, Azure), Kubernetes, and custom hosts via the Datadog Agent
- Log management: ingest, parse, index, and alert on logs from any source with live tail and archive support
- Synthetic monitoring: scheduled uptime checks (API, browser-level Selenium-style) from 50+ global locations
- Real User Monitoring (RUM): browser and mobile session tracking with Core Web Vitals, error tracking, and session replay
- Alerting with anomaly detection, forecasting, and composite monitors across metrics/logs/traces
- Service Catalog and SLO tracking for reliability engineering workflows
- Database Monitoring (DBM): query-level performance for Postgres, MySQL, MongoDB, Redis
- Cloud Security Posture Management (CSPM) and SIEM for threat detection
- 700+ integrations including Kubernetes, Docker, AWS services, and all major databases and frameworks

## When to Use
- Production system requiring full-stack observability (infra + APM + logs + synthetics) in one platform
- Kubernetes or containerized environments where distributed tracing and service maps are essential
- Team already on AWS/GCP/Azure and wants cloud-native metric integrations out of the box
- Need compliance-grade audit trails, SLO dashboards, and on-call alerting with PagerDuty/OpsGenie integration

## Limitations
- Expensive at scale: log ingestion and retention costs can grow rapidly; pricing is complex and requires careful capacity planning
- Learning curve for dashboard and monitor configuration — powerful but verbose query language (DDSQL / PromQL-like metrics queries)
- Data retention defaults are short (15 months for metrics, less for logs at standard tier) — longer retention requires expensive archive tiers
- Agent-based installation required on each host; Kubernetes DaemonSet deployment is standard but adds operational overhead
- Not suitable for very small projects or early prototypes — PostHog or Grafana Cloud are more appropriate at low scale

## Integration Guide
1. Install the Datadog Agent on your servers or via Kubernetes DaemonSet:
   ```bash
   DD_API_KEY=<KEY> DD_SITE="datadoghq.com" bash -c "$(curl -L https://install.datadoghq.com/scripts/install_script_agent7.sh)"
   ```
2. Instrument your application with a Datadog APM tracer: `npm install dd-trace` or `pip install ddtrace`
3. Initialize the tracer at application startup (before any imports):
   ```javascript
   // Node.js — must be first line
   const tracer = require("dd-trace").init({ service: "my-service", env: "production" });
   ```
4. Ship logs to Datadog by configuring your logger to output JSON and pointing the Agent log collector at your log file, or use the Datadog HTTP log intake directly
5. Set up monitors in the Datadog UI or via Terraform (`datadog_monitor` resource) to alert on P95 latency, error rate, or log patterns
6. Use the Datadog API or Terraform provider to manage dashboards, monitors, and SLOs as code

## Setup
```bash
# Install Datadog Agent (Linux)
DD_API_KEY=<YOUR_API_KEY> DD_SITE="datadoghq.com" \
  bash -c "$(curl -L https://install.datadoghq.com/scripts/install_script_agent7.sh)"

# Node.js APM tracer
npm install dd-trace

# Python APM tracer
pip install ddtrace
ddtrace-run python my_app.py

# Kubernetes DaemonSet (via Helm)
helm repo add datadog https://helm.datadoghq.com
helm install datadog-agent datadog/datadog \
  --set datadog.apiKey=<YOUR_API_KEY> \
  --set datadog.site="datadoghq.com"

# Environment variables
export DD_API_KEY=your_api_key
export DD_APP_KEY=your_app_key  # for management API calls
export DD_SERVICE=my-service
export DD_ENV=production
```

## Pricing Notes
- **Infrastructure:** ~$15-23/host/month depending on tier (Pro vs. Enterprise)
- **APM:** Included with Infrastructure; additional cost for APM + Continuous Profiler
- **Log Management:** ~$0.10/GB ingested + $0.05/GB/month retained (15-day default retention); costs escalate fast at high log volume
- **Synthetics:** ~$5/1K API test runs, ~$12/1K browser test runs
- **RUM:** ~$1.50/1K sessions
- Watch for: log retention costs are the most common bill shock — set retention policies aggressively and archive to S3 for long-term storage; negotiate an enterprise deal above ~$100K/year spend

## Reference Repositories
- [DataDog/datadog-agent](https://github.com/DataDog/datadog-agent) — open-source Datadog Agent source code
- [DataDog/dd-trace-js](https://github.com/DataDog/dd-trace-js) — official Node.js APM tracer
- [DataDog/dd-trace-py](https://github.com/DataDog/dd-trace-py) — official Python APM tracer

## Official Documentation
- [Datadog Docs](https://docs.datadoghq.com/) — complete platform documentation
- [APM Setup](https://docs.datadoghq.com/tracing/setup_overview/) — language-specific tracer installation guides
- [Log Management](https://docs.datadoghq.com/logs/) — ingestion, parsing, and alerting on logs
- [Monitors & Alerting](https://docs.datadoghq.com/monitors/) — creating and managing alerts

## Examples
1. **Kubernetes APM:** Deploy Datadog Agent as a DaemonSet → inject `DD_AGENT_HOST` env var into pods → initialize `dd-trace` at app startup → distributed traces automatically propagate across microservices via HTTP headers → service map shows latency and error rates per service with click-through to individual traces.
2. **SLO tracking:** Define a SLO monitor on P95 API latency < 200ms with a 99.9% 30-day target → Datadog tracks the error budget burn rate → alert fires when the budget is 50% consumed, giving the team time to react before the SLO is breached.
3. **Log-based alerting:** Parse JSON application logs with a Datadog pipeline → create a monitor on `service:payments error_rate > 5 per 5min` → PagerDuty integration pages on-call within 1 minute of error spike, with a direct link to the log search filtered to the incident time window.
