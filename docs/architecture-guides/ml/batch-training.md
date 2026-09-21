# Batch Training

## Description
Batch Training is the standard ML training paradigm where a model is trained on a complete, static dataset in a series of offline passes (epochs). The training job runs on a fixed snapshot of data, produces a versioned model artifact, and that artifact is then deployed separately. The cycle repeats on a schedule or when the data distribution shifts significantly enough to warrant retraining.

## When to Use
- The data distribution is stable and changes slowly relative to the training cycle
- Training data is large enough that incremental updates provide minimal benefit over full retraining
- Model quality requirements need rigorous offline evaluation before any deployment
- Regulated environments where model versioning, reproducibility, and sign-off are mandatory
- Deep learning tasks (vision, NLP) where full-dataset training is necessary for convergence

## When NOT to Use
- The underlying data distribution changes rapidly (e.g., real-time fraud, trending content)
- Serving latency requirements demand a freshly trained model within minutes of new data arriving
- Training data arrives as a continuous stream with no natural batch boundaries
- The retraining cost (compute, time) is prohibitive relative to how often the model needs updating

## Advantages
- Simple mental model: train → evaluate → deploy cycle is easy to reason about and audit
- Full dataset access per epoch enables stable gradient estimates and robust convergence
- Reproducible: fixed dataset snapshot + fixed seed = identical model
- Rich offline evaluation (held-out test set, cross-validation) before any user exposure
- Well-supported by all major ML frameworks and MLOps platforms
- Model versioning and rollback are straightforward

## Disadvantages
- Models can become stale between retraining cycles as data drifts
- Long retraining cycles mean the model lags reality by hours to weeks
- Requires a full data pipeline to collect, clean, and version the training dataset
- High compute cost for large models/datasets if retraining happens frequently
- Cold-start problem: a newly trained model loses all recency signal since the last training run

## Complexity
Medium — training itself is well-understood, but building a robust, automated retraining pipeline (data validation, feature engineering, evaluation, deployment, rollback) adds significant operational complexity.

## Scalability
Scales vertically (larger GPU/TPU instances) and horizontally (distributed data-parallel training with PyTorch DDP or FSDP). Data loading is often the bottleneck before model size; use `DataLoader` with multiple workers and prefetching. Feature stores (Feast, Tecton) decouple feature computation from training jobs.

## Key Components
- **Data ingestion pipeline** — collects, validates, and versions the training dataset snapshot
- **Feature engineering** — transforms raw data into model-ready features; ideally shared with the serving pipeline
- **Training job** — the script/container that runs gradient descent; parameterized by hyperparameters and dataset path
- **Experiment tracker** — logs metrics, parameters, and artifacts per run (MLflow, Weights & Biases)
- **Model registry** — stores versioned model artifacts with metadata (Accuracy, F1, training date)
- **Evaluation harness** — runs offline tests (accuracy, bias, fairness) before promotion to staging/production
- **Deployment pipeline** — packages the model and pushes it to the serving infrastructure on approval

## Reference Implementations
- [scikit-learn](https://github.com/scikit-learn/scikit-learn) — canonical batch training API (`fit`/`predict`); study `Pipeline` and `GridSearchCV` for production patterns
- [pytorch/pytorch](https://github.com/pytorch/pytorch) — `DataLoader` + training loop; see PyTorch Lightning for a production-grade structure
- [mlflow/mlflow](https://github.com/mlflow/mlflow) — experiment tracking, model registry, and deployment integration
- [huggingface/transformers/examples](https://github.com/huggingface/transformers/tree/main/examples) — HuggingFace fine-tuning and training examples
- [pytorch/examples](https://github.com/pytorch/examples) — PyTorch training examples (vision, NLP, generative)

## Official Sources
- [scikit-learn user guide](https://scikit-learn.org/stable/user_guide.html) — comprehensive reference for classical ML batch training
- [PyTorch training documentation](https://pytorch.org/tutorials/beginner/basics/optimization_tutorial.html) — gradient descent and training loop fundamentals
- [MLflow documentation](https://mlflow.org/docs/latest/index.html) — end-to-end MLOps for batch training workflows
- [HuggingFace Training Docs](https://huggingface.co/docs/transformers/training) — model training guide
- [PyTorch Training Docs](https://pytorch.org/docs/stable/optim.html) — PyTorch optimization

## Related Architectures
- See also: [Online Learning](./online-learning.md)
- See also: [Forecasting Systems](./forecasting-systems.md)
- See also: [Recommendation Systems](./recommendation-systems.md)
