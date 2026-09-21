# Object Detection

## Description
Object detection simultaneously locates and classifies multiple objects within an image or video frame, producing bounding boxes (x, y, w, h), class labels, and confidence scores per detected instance. It is the foundational CV task for any system that must answer "what is where" in an image.

## When to Use
- Counting objects in images or video frames (people, vehicles, products)
- Triggering downstream tracking or segmentation pipelines
- Safety and compliance monitoring (PPE detection, restricted-zone entry)
- Retail shelf analysis, defect detection in manufacturing
- Any task requiring localization, not just image-level labeling

## When NOT to Use
- You only need a single image-level label (use Image Classification — simpler, faster)
- You need pixel-level masks (use Segmentation — detection gives boxes, not masks)
- Objects are too small relative to image resolution for bounding boxes to be meaningful
- Latency budget is < 5 ms (no current detector reliably hits this on CPU)

## Advantages
- Rich output: location + class + confidence in one forward pass
- YOLO family delivers real-time inference (30–200 FPS on GPU)
- Pre-trained weights on COCO (80 classes) provide a strong starting point
- Anchor-free models (YOLOv8, DETR) simplify hyperparameter tuning
- Active ecosystem: Ultralytics, Hugging Face, and ONNX export for deployment

## Disadvantages
- More complex to train and evaluate than classification (mAP, IoU thresholds)
- Small object detection remains challenging (requires high-res input or FPN)
- Transformer-based detectors (DETR) need more data and compute than CNN-based
- NMS (non-maximum suppression) can merge nearby detections incorrectly
- Annotation cost: bounding box labeling is ~10× more expensive than class labels

## Complexity
Medium — training requires labeled boxes, IoU-based matching, and mAP evaluation. Inference deployment is well-supported via ONNX, TensorRT, and CoreML export.

## Scalability
Single-GPU inference handles 50–200 FPS at 640 px (YOLOv8n/s). Multi-camera systems scale horizontally with one worker per stream. Batch inference on GPU is efficient for offline workloads. Edge deployment via ONNX or TFLite on Jetson/Coral.

## Key Components
- **Backbone** — feature extractor (CSPDarknet for YOLO, ResNet/ViT for DETR)
- **Neck** — feature pyramid network (FPN/PAN) to detect multi-scale objects
- **Detection head** — predicts class + box per grid cell or query (anchor-free in YOLOv8+)
- **NMS** — post-processing to remove duplicate detections (IoU threshold tuning)
- **Evaluation** — mAP@0.5 and mAP@0.5:0.95 on held-out validation set
- **Data augmentation** — mosaic, mixup, random crop, color jitter for robust training
- **Export** — ONNX → TensorRT (NVIDIA) or CoreML (Apple) for production inference

## Reference Implementations
- [Ultralytics YOLOv8](https://github.com/ultralytics/ultralytics) — state-of-the-art real-time detection; clean Python API, ONNX export, active maintenance
- [DETR (Facebook Research)](https://github.com/facebookresearch/detr) — end-to-end transformer detector; no NMS, strong accuracy, higher compute cost
- [mmdetection](https://github.com/open-mmlab/mmdetection) — model zoo with 40+ detectors; good for benchmarking and research

## Official Sources
- [Ultralytics Docs](https://docs.ultralytics.com/) — training, validation, prediction, and export workflows
- [COCO Benchmark](https://cocodataset.org/#detection-eval) — standard evaluation protocol and mAP definition
- [Papers With Code — Object Detection](https://paperswithcode.com/task/object-detection) — leaderboard and SOTA model comparison

## Related Architectures
- See also: [Object Tracking](./tracking.md)
- See also: [Image Segmentation](./segmentation.md)
- See also: [Video Analytics](./video-analytics.md)
- See also: [Image Classification](./classification.md)
- See also: [CV README](./README.md)
