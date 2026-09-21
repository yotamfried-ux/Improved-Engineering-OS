# Classification Systems

## Description
Systems that assign discrete labels to input examples — binary (spam/not-spam), multi-class (one label from N), or multi-label (multiple labels simultaneously). The architecture spans data preparation, model selection, evaluation, class imbalance handling, and serving, and the right model depends heavily on data size, feature type, and latency requirements.

## When to Use
- Predicting a category: content moderation, intent detection, medical diagnosis triage
- Binary risk scoring: churn prediction, fraud likelihood, lead qualification
- Multi-label tagging: document categorization, image tagging, product attribute prediction
- Any supervised learning problem where the output is a finite, discrete set

## When NOT to Use
- The output is continuous (use regression)
- Labels are unknown and must be discovered (use clustering)
- The ordering of classes matters and carries magnitude meaning (use ordinal regression)
- The class set is open-ended and grows unboundedly (use embedding-based retrieval)

## Advantages
- Well-understood problem with mature tooling (scikit-learn, XGBoost, PyTorch)
- Rich evaluation framework: precision, recall, F1, AUC-ROC, PR curves, confusion matrix
- Interpretability options at every model tier (logistic regression → SHAP for XGBoost → attention for transformers)
- Calibrated probability outputs enable downstream risk-based decisions

## Disadvantages
- Requires labeled data — labeling is expensive and error-prone
- Class imbalance (fraud: 0.1% positive) distorts training and metrics if not handled
- Distribution shift between train and production causes silent accuracy decay
- Multi-label problems are harder to evaluate and calibrate than binary/multi-class

## Complexity
Low to High — logistic regression is a one-liner; a production multi-label transformer pipeline with monitoring, retraining triggers, and calibration is a full ML platform.

## Scalability
Inference scales horizontally with stateless model serving (REST, gRPC, batch). Training scales with distributed XGBoost or PyTorch DDP. Feature computation is usually the bottleneck at scale.

## Key Components
- **Model selection ladder**: logistic regression → random forest → XGBoost/LightGBM → fine-tuned transformer
- **Class imbalance handling**: oversampling (SMOTE), undersampling, class weights, threshold tuning
- **Evaluation metrics**: precision/recall/F1 for imbalanced classes; AUC-ROC for ranking; macro vs micro averaging for multi-class
- **Calibration**: Platt scaling or isotonic regression to turn raw scores into reliable probabilities
- **Threshold selection**: optimize operating point on precision-recall curve per business cost
- **Feature engineering**: tabular (numeric scaling, encoding), text (TF-IDF, embeddings), image (CNN backbone)
- **Monitoring**: track distribution shift, accuracy, and confusion matrix in production

## Reference Implementations
- [scikit-learn examples](https://github.com/scikit-learn/scikit-learn/tree/main/examples/classification) — canonical binary and multi-class pipelines
- [XGBoost](https://github.com/dmlc/xgboost) — gradient boosting; state of the art for tabular classification
- [imbalanced-learn](https://github.com/scikit-learn-contrib/imbalanced-learn) — SMOTE, ADASYN, and other resampling strategies
- [scikit-learn/scikit-learn/examples](https://github.com/scikit-learn/scikit-learn/tree/main/examples) — official scikit-learn classification examples
- [huggingface/transformers/examples/pytorch/text-classification](https://github.com/huggingface/transformers/tree/main/examples/pytorch/text-classification) — NLP classification with transformers

## Official Sources
- [scikit-learn Classification User Guide](https://scikit-learn.org/stable/supervised_learning.html#supervised-learning) — model comparison, metrics, and pipelines
- [XGBoost Documentation](https://xgboost.readthedocs.io/) — binary/multi-class objectives, scale_pos_weight
- [imbalanced-learn Documentation](https://imbalanced-learn.org/stable/) — resampling strategies and evaluation under imbalance
- [Scikit-Learn Docs — Classification](https://scikit-learn.org/stable/supervised_learning.html) — classical ML classification algorithms
- [HuggingFace Text Classification](https://huggingface.co/docs/transformers/tasks/sequence_classification) — transformer-based classification

## Related Architectures
- See also: [Batch Training](./batch-training.md)
- See also: [Online Learning](./online-learning.md)
- See also: [Streaming ML](./streaming-ml.md)
- See also: [Image Classification](../cv/classification.md)
