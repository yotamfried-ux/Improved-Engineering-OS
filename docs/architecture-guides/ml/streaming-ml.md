# Streaming ML

## Description
A machine learning architecture where models ingest data records from a stream (Kafka, Kinesis, Pulsar) and update their parameters or produce predictions in real-time — one record or micro-batch at a time. Combines stream processing frameworks (Faust, Kafka Streams) with online learning libraries (River) or stateless inference on a pre-trained model.

## When to Use
- Fraud detection on payment transaction streams (decision needed in < 100 ms)
- Real-time anomaly detection on IoT sensor data or log streams
- Dynamic pricing or recommendation updates triggered by user events
- Click-through-rate prediction on live ad inventory
- Any use case where model staleness (hours or days) causes business harm

## When NOT to Use
- Training data is only available in batch (nightly ETL dumps)
- The model requires global statistics that cannot be maintained incrementally
- Latency tolerance is hours or days (use Batch Training)
- Team lacks Kafka/stream infrastructure; setup cost exceeds benefit
- Model complexity (large neural nets) makes true online learning impractical

## Advantages
- Sub-second decision latency on live data
- Model drift is detected and corrected continuously rather than at next batch cycle
- No need to store and replay large historical datasets for retraining
- Naturally handles concept drift in non-stationary distributions
- Enables event-driven architectures where predictions trigger downstream actions

## Disadvantages
- Online learning algorithms (Hoeffding trees, ADWIN) are less accurate than batch-trained counterparts on the same data
- Exactly-once semantics are hard to achieve; duplicate records can corrupt model state
- Debugging is harder: no single dataset to reproduce a prediction
- Feature engineering is constrained by what can be computed per-record or with small windows
- Infrastructure complexity: Kafka + stream processor + model service + monitoring

## Complexity
High — requires stream broker, consumer framework, stateful feature computation, online learning library or low-latency inference service, and robust offset/checkpoint management.

## Scalability
Partitioned Kafka topics allow horizontal scaling of consumers. Stateful aggregations (windowed features) must be co-partitioned. Online model state can be sharded per partition but must be reconciled for global models. Throughput of millions of events/second is achievable with proper partitioning.

## Key Components
- **Stream broker** — Kafka, Kinesis, or Pulsar as the data backbone
- **Stream processor** — Faust (Python, async) or Kafka Streams (JVM) for stateful windowed features
- **Online learning model** — River (Python) for incremental classifiers/regressors, or a stateless model served via low-latency API
- **Feature store** — Redis or RocksDB for low-latency feature retrieval
- **Offset management** — checkpoint model state and stream offsets atomically to avoid drift on restart
- **Monitoring** — track accuracy metrics (prequential evaluation) and data drift in real-time

## Reference Implementations
- [River](https://github.com/online-ml/river) — Python library for online machine learning; incremental classifiers, regressors, drift detectors
- [Faust](https://github.com/robinhood/faust) — Python stream processing library built on asyncio and Kafka; good for feature engineering pipelines
- [bytewax](https://github.com/bytewax/bytewax) — Rust-backed Python stream processing with ML integration examples
- [apache/flink-ml](https://github.com/apache/flink-ml) — Apache Flink ML for streaming machine learning

## Official Sources
- [River Documentation](https://riverml.xyz/) — API reference, online learning concepts, and benchmarks
- [Apache Kafka Documentation](https://kafka.apache.org/documentation/) — consumer groups, offsets, exactly-once semantics
- [Faust Documentation](https://faust-streaming.github.io/faust/) — agents, tables, windowing
- [Apache Flink ML Docs](https://nightlies.apache.org/flink/flink-ml-docs-stable/) — streaming ML documentation
- [Kafka Streams Docs](https://kafka.apache.org/documentation/streams/) — stream processing for feature engineering

## Related Architectures
- See also: [Online Learning](./online-learning.md)
- See also: [Batch Training](./batch-training.md)
- See also: [Forecasting Systems](./forecasting-systems.md)
