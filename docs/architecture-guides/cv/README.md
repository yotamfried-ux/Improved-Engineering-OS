# Computer Vision Architecture Guides

This directory contains architecture guides for computer vision systems. Use the decision table below to select the right architecture before diving into a specific guide.

---

## Decision Guide

| Question | Architecture |
|---|---|
| "Do I need to find and locate objects in an image?" | [Object Detection](./object-detection.md) |
| "Do I need to follow objects across video frames?" | [Object Tracking](./tracking.md) |
| "Do I need pixel-level masks — which pixels belong to which class/object?" | [Segmentation](./segmentation.md) |
| "Do I need to assign a single label to the whole image?" | [Image Classification](./classification.md) |
| "Do I need to count events, detect anomalies, or extract business events from video?" | [Video Analytics](./video-analytics.md) |

---

## Architecture Summaries

### [Object Detection](./object-detection.md)
Locate and classify multiple objects within a single image or frame. Output: bounding boxes + class labels + confidence scores. Core models: YOLO family (real-time), DETR (transformer-based). Evaluate with mAP.

### [Object Tracking](./tracking.md)
Assign consistent IDs to objects across consecutive video frames. Builds on detection by associating detections over time. Core algorithms: SORT, DeepSORT, ByteTrack. Evaluate with MOTA, IDF1.

### [Segmentation](./segmentation.md)
Produce per-pixel predictions. Three variants: semantic (class per pixel), instance (mask per object), panoptic (both simultaneously). Core models: SAM, Mask R-CNN, DeepLab. Evaluate with mIoU.

### [Image Classification](./classification.md)
Assign one or more labels to the entire image. No localization. Core architectures: ResNet, EfficientNet, Vision Transformer (ViT). Transfer learning and fine-tuning are the default approach. Evaluate with top-1/top-5 accuracy, F1.

### [Video Analytics](./video-analytics.md)
End-to-end pipeline that turns raw video into business events: frame extraction → detection → tracking → event logic. Covers real-time and batch variants, edge vs cloud deployment, and counting/anomaly/dwell-time use cases.

---

## Choosing Between Similar Architectures

**Detection vs Classification**: Detection tells you *where* objects are; classification tells you *what* the whole image is. If you have one dominant subject and no localization requirement, classification is simpler.

**Detection vs Segmentation**: Detection gives bounding boxes (fast, sufficient for counting/tracking). Segmentation gives pixel masks (needed for measurement, occlusion-aware counting, or compositing). Prefer detection unless masks are explicitly required.

**Tracking vs Detection per frame**: If you need object identity over time (person re-ID, trajectory analysis), tracking is required. If you only need per-frame inventory, repeated detection suffices.

**Video Analytics vs Tracking**: Tracking is a component inside a video analytics pipeline. Video Analytics is the full system including business logic.

---

## Common Stack

```
Camera / Video Source
    └── Frame Extraction (OpenCV, ffmpeg)
        └── Detection (YOLOv8 / DETR)
            └── Tracking (ByteTrack / DeepSORT)  [optional]
                └── Segmentation (SAM / Mask R-CNN)  [optional]
                    └── Business Logic (counting, alerts, dwell time)
                        └── Output (dashboard, webhook, DB write)
```

## Related Directories
- See also: [`../ml/`](../ml/) — classical ML and tabular learning
- See also: [`../ai/`](../ai/) — LLM-based agent architectures
