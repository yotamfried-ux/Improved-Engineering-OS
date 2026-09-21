# ML Architecture Guides

> Navigation index for machine learning system architectures.

## Architectures

| Architecture | Data Pattern | Latency | Best For |
|---|---|---|---|
| [Batch Training](./batch-training.md) | Static snapshots | Offline | Classification, regression, periodic retraining |
| [Online Learning](./online-learning.md) | Streaming | Real-time | Fraud detection, personalization, volatile distributions |
| [Recommendation Systems](./recommendation-systems.md) | User×Item interactions | Near real-time | Product/content/ad recommendations |
| [Forecasting Systems](./forecasting-systems.md) | Time series | Periodic | Demand forecasting, capacity planning, anomaly detection |

## Decision Guide

```
Is training data static and collected in batches?
  → Batch Training

Does the model need to adapt to new data continuously?
  → Online Learning

Are you predicting what a user wants next?
  → Recommendation Systems

Are you predicting future values of a time series?
  → Forecasting Systems
```

## MLOps Stack

| Concern | Tools |
|---|---|
| Experiment tracking | MLflow, W&B, Neptune |
| Feature store | Feast, Tecton, Hopsworks |
| Model registry | MLflow, Vertex AI |
| Serving | TorchServe, Triton, BentoML, Ray Serve |
| Monitoring | Evidently AI, Arize, WhyLabs |

## Related

- [AI Architecture Guides](../ai/README.md)
- [patterns/machine-learning](../../../patterns/machine-learning/README.md)
- [templates/machine-learning](../../../templates/machine-learning/README.md)
