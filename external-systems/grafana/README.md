# Grafana

## Overview
Grafana is the leading open-source observability and data visualization platform, used to build dashboards that connect to virtually any data source — Prometheus, Loki, Tempo, InfluxDB, Elasticsearch, SQL databases, and 150+ others. Built by Grafana Labs, it is the standard UI layer for the Prometheus/Loki/Tempo observability stack (metrics, logs, and traces), available as a self-hosted binary or as Grafana Cloud (managed SaaS).

## Capabilities
- Dashboard editor with 30+ panel types: time-series, bar chart, stat, gauge, table, heatmap, geomap, and more
- Native data sources: Prometheus (metrics), Loki (logs), Tempo (distributed traces), Mimir (long-term metrics), Pyroscope (continuous profiling)
- 150+ community data source plugins including PostgreSQL, MySQL, ClickHouse, Elasticsearch, InfluxDB, BigQuery, Datadog, Splunk
- Alerting: define alert rules in Grafana or Prometheus; route via Alertmanager to PagerDuty, Slack, OpsGenie, email
- Unified data exploration via "Explore" mode — query metrics, logs, and traces side by side with trace-to-logs and logs-to-traces correlation
- Dashboard as code via JSON model, Grafonnet (Jsonnet library), or Grafana Terraform provider
- Grafana Alloy: OpenTelemetry-native agent that replaces Prometheus Agent and Promtail for data collection
- Grafana OnCall: on-call schedule management with escalation policies (integrated with Grafana Alerting)
- Annotations API to mark dashboards with deployment events, incidents, or other context

## When to Use
- Building a metrics/logs/traces observability stack and need a visualization layer — Grafana is the de facto standard
- Self-hosted Prometheus stack that needs a production-grade dashboard UI
- Team already on Kubernetes and running Prometheus Operator — the `kube-prometheus-stack` Helm chart deploys Grafana pre-wired
- Need a cost-effective, open-source alternative to Datadog's dashboard and alerting features

## Limitations
- Grafana is a visualization layer, not a data store — you still need Prometheus, Loki, or another backend for the actual data
- Complex dashboard creation has a learning curve; PromQL and LogQL are powerful but non-trivial to learn
- Self-hosted Grafana requires managing upgrades, plugins, and HA configuration separately from your data backends
- Grafana Alerting (v9+) is significantly improved but still less polished than Datadog monitors for complex multi-signal alerts
- Plugin ecosystem quality varies — community plugins may be unmaintained or have breaking changes across Grafana versions

## Integration Guide
1. Deploy Grafana:
   ```bash
   # Docker (quickest local setup)
   docker run -d -p 3000:3000 grafana/grafana-oss:latest
   # Default login: admin / admin
   ```
2. Add a data source: navigate to Connections → Data Sources → Add → select Prometheus and point to `http://prometheus:9090`
3. Import a pre-built dashboard from https://grafana.com/grafana/dashboards (e.g., dashboard ID `315` for Kubernetes cluster monitoring)
4. Build custom panels: open a dashboard → Add panel → write a PromQL query (e.g., `rate(http_requests_total[5m])`) → select visualization type → configure axes and thresholds
5. Set up alerting: Alerting → Alert Rules → New Rule → define a PromQL condition and a notification policy routing to Slack/PagerDuty
6. Manage dashboards as code using the Grafana HTTP API or Terraform `grafana` provider for GitOps workflows

## Setup
```bash
# Docker (single-node, local dev)
docker run -d --name grafana -p 3000:3000 grafana/grafana-oss:latest

# Docker Compose with Prometheus + Grafana
# (see grafana/grafana repo for full compose examples)

# Kubernetes — kube-prometheus-stack (recommended for production)
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install kube-prom-stack prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace

# Linux binary
wget https://dl.grafana.com/oss/release/grafana-11.0.0.linux-amd64.tar.gz
tar -zxvf grafana-11.0.0.linux-amd64.tar.gz

# Environment variables for Grafana server
export GF_SECURITY_ADMIN_PASSWORD=your_secure_password
export GF_SERVER_ROOT_URL=https://grafana.yourdomain.com
```

## Pricing Notes
- **Self-hosted Grafana OSS:** Free (AGPL-3.0 license); unlimited users, dashboards, and data sources
- **Grafana Cloud Free tier:** 10K active series (Prometheus), 50GB logs, 50GB traces, 3 active users, 14-day retention
- **Grafana Cloud Pro:** ~$8/user/month; additional metrics/logs at pay-as-you-go rates
- **Grafana Enterprise:** Custom pricing; adds RBAC, audit logging, SSO, and priority support
- Watch for: Grafana itself is free; costs come from the data backends — Grafana Cloud bundles Mimir/Loki/Tempo storage, while self-hosted means paying for your own compute and storage separately

## Reference Repositories
- [grafana/grafana](https://github.com/grafana/grafana) — core Grafana platform source code (Go + TypeScript/React)
- [grafana/loki](https://github.com/grafana/loki) — log aggregation system (like Prometheus but for logs)
- [grafana/tempo](https://github.com/grafana/tempo) — distributed tracing backend compatible with Jaeger/Zipkin/OTLP
- [grafana/alloy](https://github.com/grafana/alloy) — OpenTelemetry-native telemetry collector (successor to Grafana Agent)

## Official Documentation
- [Grafana Docs](https://grafana.com/docs/) — complete documentation for all Grafana products
- [Dashboard Fundamentals](https://grafana.com/docs/grafana/latest/dashboards/) — building and managing dashboards
- [Grafana Alerting](https://grafana.com/docs/grafana/latest/alerting/) — alert rules, notification policies, and contact points
- [PromQL Guide](https://prometheus.io/docs/prometheus/latest/querying/basics/) — query language for Prometheus metrics

## Common Pitfalls
- **Grafana is not a data store** — deleting a Grafana instance does not delete your metrics or logs; but losing Grafana config (dashboards, alert rules) without a backup means rebuilding from scratch; use the Terraform provider or dashboard JSON export for GitOps.
- **Panel query performance** — PromQL queries with high-cardinality label selectors (e.g., querying all pods without a service filter) can overload Prometheus; use `rate()` over `irate()` for smoother graphs and always filter by relevant labels.
- **Alert rule state is stored in Grafana** — if Grafana restarts during an alert, state may reset and re-fire; set `for` duration (e.g., `for: 5m`) on all alert rules to avoid flapping alerts from transient spikes.

## Examples
1. **Kubernetes cluster monitoring:** Install `kube-prometheus-stack` via Helm → Prometheus scrapes all pod metrics automatically → Grafana is pre-configured with node, pod, and namespace dashboards → add a custom alert on `container_memory_usage_bytes > 90%` with PagerDuty routing — full stack monitoring with no manual config.
2. **Log-based error tracking with Loki:** Application outputs JSON logs → Promtail/Alloy ships logs to Loki → Grafana Explore uses LogQL `{service="api"} |= "ERROR"` to filter → create a dashboard panel showing error rate over time with a `count_over_time` metric extracted from log lines.
3. **Trace correlation for incident investigation:** Service emits OTLP traces to Grafana Tempo → Grafana dashboard shows high P99 latency spike → click into a slow trace → Tempo links to the Loki logs for the same `trace_id` — root cause identified in seconds without switching tools.
