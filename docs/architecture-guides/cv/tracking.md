# Object Tracking

## Description
Object tracking assigns persistent identities (track IDs) to detected objects across consecutive video frames, enabling trajectory analysis, counting, and re-identification after occlusion. It sits on top of a frame-level detector and solves the association problem: matching new detections to existing tracks over time.

## When to Use
- People counting in a zone (entry/exit, dwell time, crowd density)
- Vehicle trajectory analysis on traffic cameras
- Sports analytics requiring player movement paths
- Re-identification after occlusion (person exits frame, re-enters later)
- Any use case requiring "object X was here at time T and there at time T+1"

## When NOT to Use
- Per-frame object inventory without identity matters (use Detection only)
- Camera is static and objects rarely overlap (simple centroid tracking may suffice)
- Objects move so fast that inter-frame displacement exceeds detector resolution
- Single-image tasks (tracking requires temporal sequence)

## Advantages
- Enables downstream analytics that per-frame detection cannot provide (trajectories, counts)
- ByteTrack achieves near-SOTA MOTA on MOT benchmarks with minimal compute overhead
- Appearance features (DeepSORT Re-ID) improve robustness through long occlusions
- Track history enables velocity estimation and motion prediction
- Works with any upstream detector (plug-and-play over YOLO or DETR output)

## Disadvantages
- ID switches on occlusion are the dominant failure mode
- Re-identification across camera views requires dedicated Re-ID model
- Tuning IoU / appearance thresholds is dataset-specific
- Performance degrades in dense crowds (MOT17 crowd scenes)
- Adds latency on top of detection (association step, Kalman filter update)

## Complexity
Medium — the tracker itself (SORT/ByteTrack) is relatively simple; complexity arises in tuning occlusion handling, managing track lifecycle (tentative → confirmed → lost → deleted), and integrating Re-ID for appearance matching.

## Scalability
Tracking is inherently per-stream and single-threaded within a stream (frame order must be preserved). Scale horizontally by assigning one tracker instance per camera. GPU is used only for the detector and Re-ID embedding model; the association step is CPU-bound.

## Key Components
- **Upstream detector** — YOLO or DETR providing per-frame bounding boxes
- **Kalman filter** — motion model predicting next-frame position for each track
- **Hungarian algorithm** — optimal bipartite matching between predictions and detections
- **IoU / appearance score** — similarity metric for matching (IoU alone for SORT; IoU + Re-ID for DeepSORT)
- **Track states** — tentative (new), confirmed (seen N times), lost (missing M frames), deleted
- **Re-ID model** — CNN embedding for appearance similarity across frames (DeepSORT, StrongSORT)
- **Evaluation** — MOTA (multi-object tracking accuracy), IDF1 (identity consistency), HOTA

## Reference Implementations
- [ByteTrack](https://github.com/ifzhang/ByteTrack) — SOTA simple tracker; uses low-confidence detections to recover occluded tracks; no Re-ID needed
- [DeepSORT](https://github.com/nwojke/deep_sort) — adds appearance Re-ID to SORT; better through long occlusions
- [Ultralytics Trackers](https://github.com/ultralytics/ultralytics) — ByteTrack and BoT-SORT integrated directly into YOLOv8 predict pipeline

## Official Sources
- [ByteTrack Paper](https://arxiv.org/abs/2110.06864) — algorithm design and MOT17/MOT20 benchmarks
- [MOT Challenge Benchmark](https://motchallenge.net/) — standard dataset and MOTA/IDF1/HOTA evaluation
- [Ultralytics Tracking Docs](https://docs.ultralytics.com/modes/track/) — one-line tracking API with YOLOv8

## Related Architectures
- See also: [Object Detection](./object-detection.md)
- See also: [Video Analytics](./video-analytics.md)
- See also: [CV README](./README.md)
