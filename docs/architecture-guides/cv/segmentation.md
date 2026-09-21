# Image Segmentation

## Description
Image segmentation produces per-pixel predictions rather than bounding boxes. Three distinct tasks: **semantic segmentation** (every pixel gets a class label, no instance distinction), **instance segmentation** (separate mask per object instance), and **panoptic segmentation** (both semantic classes and per-instance masks simultaneously). Segment Anything Model (SAM) enables prompt-driven segmentation without class-specific training.

## When to Use
- Medical imaging: organ/tumor delineation where bounding boxes are insufficient
- Autonomous driving: drivable area, lane, and obstacle masks
- Retail/fashion: product cutout or background removal
- Satellite/aerial imagery: land-use classification at pixel level
- Industrial quality control: defect boundary measurement
- Augmented reality: precise object masking for compositing

## When NOT to Use
- Bounding boxes are sufficient for the downstream task (use Detection — 10–50× faster)
- Image-level label is all that is needed (use Classification)
- Real-time latency (< 30 ms) is required on CPU — segmentation models are heavy
- Annotation budget is limited: mask labeling is 5–10× more expensive than boxes

## Advantages
- Most precise spatial representation — enables measurement, area calculation, masking
- SAM enables zero-shot segmentation from point/box/text prompts without retraining
- Instance segmentation supports occlusion-aware counting
- Panoptic output is sufficient for full scene understanding in one pass
- Strong open-source ecosystem (Detectron2, MMSegmentation, Hugging Face Transformers)

## Disadvantages
- Significantly higher compute than detection (larger models, more memory)
- Annotation cost is the primary barrier to custom training
- Fine-grained boundaries are still noisy on complex textures (hair, fur, foliage)
- SAM does not produce class labels — requires a separate classifier for semantic tasks
- Inference latency on CPU/edge devices is often prohibitive without model distillation

## Complexity
High — mask generation, RoI pooling (instance), class-agnostic vs class-specific heads, panoptic merging. SAM lowers the barrier for zero-shot use but still requires prompt engineering and a class-labeling step.

## Scalability
GPU-bound: Mask R-CNN runs at 5–15 FPS on a V100 at 1024 px. SAM ViT-H is ~2 FPS per image. Distilled variants (SAM2, MobileSAM) trade accuracy for edge deployment. Batch processing scales linearly with GPU count.

## Key Components
- **Backbone** — ResNet/ViT feature extractor shared across tasks
- **Mask head** — per-RoI binary mask prediction (Mask R-CNN) or per-query in DETR-based models
- **Semantic head** — FCN or atrous convolution decoder for per-pixel class (DeepLab)
- **Panoptic fusion** — merging instance and semantic outputs into a unified map
- **SAM prompt encoder** — converts points, boxes, or masks into embedding prompts
- **Evaluation** — mIoU (semantic), mask AP (instance), PQ panoptic quality

## Reference Implementations
- [Segment Anything Model (SAM)](https://github.com/facebookresearch/segment-anything) — Meta AI; prompt-driven, class-agnostic segmentation; ViT-H/L/B variants
- [SAM 2](https://github.com/facebookresearch/sam2) — extends SAM to video; real-time mask propagation across frames
- [Detectron2](https://github.com/facebookresearch/detectron2) — Mask R-CNN, Panoptic FPN; production-grade Pytorch framework
- [MMSegmentation](https://github.com/open-mmlab/mmsegmentation) — semantic segmentation model zoo (DeepLab, SegFormer, PSPNet)
- [ultralytics/ultralytics](https://github.com/ultralytics/ultralytics) — YOLO instance and semantic segmentation

## Official Sources
- [SAM Paper and Demo](https://segment-anything.com/) — model cards, dataset (SA-1B), and interactive demo
- [DeepLab v3+ Paper](https://arxiv.org/abs/1802.02611) — atrous convolution and ASPP for semantic segmentation
- [Papers With Code — Segmentation](https://paperswithcode.com/task/semantic-segmentation) — SOTA leaderboard and dataset links
- [Ultralytics Segmentation Docs](https://docs.ultralytics.com/tasks/segment/) — instance segmentation guide

## Related Architectures
- See also: [Object Detection](./object-detection.md)
- See also: [Object Tracking](./tracking.md)
- See also: [Video Analytics](./video-analytics.md)
- See also: [CV README](./README.md)
