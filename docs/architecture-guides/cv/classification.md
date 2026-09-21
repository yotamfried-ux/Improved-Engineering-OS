# Image Classification

## Description
Image classification assigns one or more labels to an entire image without localizing objects within it. It is the simplest and most mature computer vision task. The dominant approach is transfer learning: start from a pre-trained backbone (ResNet, EfficientNet, ViT) and fine-tune on domain-specific data, requiring far less labeled data than training from scratch.

## When to Use
- Single dominant subject per image (product photos, medical scans, document type detection)
- Content moderation: safe/unsafe, category assignment
- Quality control: pass/fail inspection on a single item per image
- Scene classification (indoor/outdoor, day/night)
- Any task where the question is "what is this image of?" with no localization needed

## When NOT to Use
- Multiple objects of interest in one image (use Object Detection)
- Pixel-level understanding required (use Segmentation)
- Fine-grained localization is part of the output (use Detection)
- The label set is open-ended and grows (use embedding-based similarity search)

## Advantages
- Simplest CV task to implement, evaluate, and deploy
- Pre-trained ImageNet weights generalize broadly; fine-tuning on hundreds of images often suffices
- Fast inference: EfficientNet-B0 runs at 200+ FPS on a single GPU
- Well-understood metrics: top-1 accuracy, F1, AUC-ROC
- Wide framework support: torchvision, timm, Keras, Hugging Face Transformers

## Disadvantages
- No spatial information — cannot answer "where" or "how many"
- Performance degrades on images with cluttered backgrounds when the subject is small
- Multi-label classification (multiple simultaneous labels) requires threshold tuning per class
- Distribution shift (train domain ≠ production domain) is the primary cause of silent failures

## Complexity
Low to Medium — fine-tuning a pre-trained model is straightforward. Complexity increases with multi-label output, custom architectures, or strict latency/size constraints requiring distillation.

## Scalability
Stateless inference scales horizontally with container replicas. For batch jobs, GPU batching (batch size 64–256) maximizes throughput. Edge deployment via ONNX/TFLite/CoreML is well-supported for EfficientNet and MobileNet variants.

## Key Components
- **Backbone** — pre-trained CNN (ResNet-50, EfficientNet-B0–B7) or ViT (ViT-B/16, DeiT)
- **Transfer learning strategy** — freeze backbone → train head → unfreeze top layers → fine-tune end-to-end
- **Classification head** — global average pooling → dropout → linear → softmax/sigmoid
- **Data augmentation** — random crop, horizontal flip, color jitter, MixUp, CutMix
- **Loss function** — cross-entropy (multi-class), binary cross-entropy (multi-label)
- **Calibration** — temperature scaling for reliable probability outputs
- **Evaluation** — top-1/top-5 accuracy, macro/weighted F1, confusion matrix, AUC per class

## Reference Implementations
- [timm (PyTorch Image Models)](https://github.com/huggingface/pytorch-image-models) — 700+ pre-trained models; the standard library for classification backbone selection
- [Ultralytics YOLOv8 Classification](https://github.com/ultralytics/ultralytics) — classification mode with the same training/export API as detection
- [torchvision](https://github.com/pytorch/vision) — canonical ResNet, EfficientNet, ViT implementations with pre-trained weights
- [pytorch/vision/references/classification](https://github.com/pytorch/vision/tree/main/references/classification) — PyTorch image classification reference
- [huggingface/transformers/examples/pytorch/image-classification](https://github.com/huggingface/transformers/tree/main/examples/pytorch/image-classification) — ViT image classification

## Official Sources
- [timm Documentation](https://huggingface.co/docs/timm/) — model list, fine-tuning guide, feature extraction
- [PyTorch Transfer Learning Tutorial](https://pytorch.org/tutorials/beginner/transfer_learning_tutorial.html) — step-by-step fine-tuning with ResNet
- [Papers With Code — Image Classification](https://paperswithcode.com/task/image-classification) — ImageNet SOTA leaderboard
- [PyTorch Vision Docs](https://pytorch.org/vision/stable/index.html) — torchvision models and transforms
- [HuggingFace Image Classification](https://huggingface.co/docs/transformers/tasks/image_classification) — transformer-based image classification

## Related Architectures
- See also: [Object Detection](./object-detection.md)
- See also: [Image Segmentation](./segmentation.md)
- See also: [Video Analytics](./video-analytics.md)
- See also: [ML Classification Systems](../ml/classification.md)
- See also: [CV README](./README.md)
