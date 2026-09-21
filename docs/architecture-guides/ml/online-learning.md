# Online Learning (Incremental / Continuous Learning)

## Description
Online Learning updates a model continuously or in small mini-batches as new data arrives, instead of waiting for a full retraining cycle. The model's parameters are adjusted with each new observation or micro-batch, allowing it to adapt to distribution shifts in near-real-time. This contrasts with batch training where the model is static between periodic retraining jobs.

## When to Use
- Data distributions shift rapidly and stale models cause measurable degradation (fraud detection, ad CTR, dynamic pricing)
- Training data arrives as a continuous stream with no natural batch boundary
- Retraining a full model from scratch is too slow or expensive relative to the update cadence needed
- Systems where personalization must adapt immediately to recent user behavior
- Edge/embedded deployments where sending data to a central trainer and deploying back is impractical

## When NOT to Use
- The training data distribution is stable — batch training with periodic retraining is simpler and more reliable
- The model is a large deep learning model where online gradient updates are unstable or memory-prohibitive
- Regulatory requirements demand reproducible, versioned, auditable model snapshots (batch is safer)
- Data arrives with significant label delay (labels won't be available until long after the feature event)

## Advantages
- Models remain fresh and adapt to distribution shift without manual retraining triggers
- Lower per-update compute cost than full batch retraining
- Enables real-time personalization at scale
- Naturally handles concept drift without needing explicit drift detection as a trigger
- Small memory footprint for some algorithms (passive-aggressive, SGD, Hoeffding trees)

## Disadvantages
- Catastrophic forgetting: updates on new data can degrade performance on older patterns
- Noisy updates: a single bad sample can corrupt the model if not guarded against
- Label latency: many real-world tasks have delayed ground truth, complicating immediate updates
- Harder to evaluate: no clean train/test split; requires prequential (test-then-train) evaluation
- Debugging and rollback are complex — there is no single "model version" to revert to

## Complexity
High — requires stream processing infrastructure, careful learning rate scheduling, drift detection, model health monitoring, and a rollback strategy for corrupted model state.

## Scalability
Horizontally challenging: parallel online learners need parameter server or federated aggregation to merge updates. River and Vowpal Wabbit handle single-node high-throughput streams well. For large-scale deep learning, use streaming SGD with gradient accumulation via Kafka + PyTorch Streaming.

## Key Components
- **Stream source** — Kafka, Kinesis, or Pub/Sub delivering new observations
- **Feature pipeline (real-time)** — computes features from streaming events; must match the serving feature pipeline exactly
- **Online learner** — algorithm that accepts incremental updates: SGD variants, Hoeffding trees, Kalman filters, passive-aggressive classifiers
- **Label store** — matches delayed labels to earlier feature vectors for deferred updates
- **Drift detector** — monitors input/output distribution shifts (ADWIN, Page-Hinkley) and triggers model resets or full retraining
- **Model health monitor** — tracks live prediction quality metrics (precision, loss, PSI) in production
- **Checkpoint manager** — periodically saves model state so rollback is possible if quality degrades

## Reference Implementations
- [online-ml/river](https://github.com/online-ml/river) — the definitive Python library for online machine learning; study `learn_one` / `predict_one` pattern and `TimeRolling` evaluation
- [JohnLangford/vowpal_wabbit](https://github.com/JohnLangford/vowpal_wabbit) — high-throughput online learning at industrial scale; powers many production ad systems
- [scikit-learn `partial_fit`](https://scikit-learn.org/stable/modules/computing.html#incremental-learning) — incremental learning for selected sklearn estimators (SGDClassifier, MiniBatchKMeans)

## Official Sources
- [River documentation](https://riverml.xyz/latest/) — complete guide to online learning algorithms, evaluation, and streaming pipelines
- [Vowpal Wabbit tutorial](https://vowpalwabbit.org/docs/vowpal_wabbit/python/latest/tutorials/python_first_steps.html) — practical start for high-throughput online learning
- [Concept drift survey (Gama et al., 2014)](https://dl.acm.org/doi/10.1145/2523813) — foundational survey on detecting and adapting to distribution shift

## Related Architectures
- See also: [Batch Training](./batch-training.md)
- See also: [Recommendation Systems](./recommendation-systems.md)
- See also: [Forecasting Systems](./forecasting-systems.md)
