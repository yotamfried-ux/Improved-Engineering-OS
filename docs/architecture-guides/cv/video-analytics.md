# Video Analytics

## Description
Video analytics is an end-to-end pipeline that transforms raw video streams or files into structured business events — counts, alerts, anomalies, dwell times, and trajectories. It composes lower-level CV primitives (detection, tracking, classification) with domain-specific business logic, and must address the operational concerns of continuous 24/7 processing at the edge or in the cloud.

## When to Use
- Retail: footfall counting, queue length monitoring, heat-map generation
- Security: perimeter intrusion, unattended object detection, crowd density alerts
- Traffic: vehicle counting, speed estimation, incident detection
- Manufacturing: assembly line throughput, defect rate per shift, worker safety compliance
- Any use case turning "raw camera feed" into "business metrics or alerts"

## When NOT to Use
- Single-image analysis with no temporal component (use Detection or Classification)
- The business question is answered per-frame without identity over time (Detection only)
- Real-time latency (< 50 ms end-to-end) is required — full pipelines rarely achieve this without dedicated hardware
- Budget and infrastructure prohibit GPU deployment (consider simpler motion-based triggers)

## Advantages
- Converts unstructured video into queryable, time-series business data
- Modular: each stage (ingestion, detection, tracking, logic) is independently upgradeable
- Edge deployment reduces bandwidth and cloud costs (process locally, upload events only)
- Enables proactive alerting vs post-hoc review of recorded footage

## Disadvantages
- Pipeline complexity: each stage adds latency, a failure point, and configuration surface
- Camera calibration required for accurate spatial measurements (distance, speed, area)
- Occlusion and lighting variation degrade all downstream stages simultaneously
- Storage and retention of raw video for audit/replay is expensive
- Privacy and regulatory compliance (GDPR, CCTV laws) add engineering and legal overhead

## Complexity
High — requires integrating video ingestion, frame decoding, model inference, stateful tracking, business logic, output sinks, and monitoring. Each component has its own failure modes and tuning parameters.

## Scalability
Edge: one compute unit (Jetson, NUC, or NVIDIA dGPU) per N cameras (N = 4–16 depending on resolution and model size). Cloud: horizontal scaling with one worker process per stream; shared GPU batch inference possible for non-real-time workloads. Event output to Kafka or webhook decouples analytics from consumers.

## Key Components
- **Video ingestion** — RTSP/RTMP stream pull or file read (OpenCV, GStreamer, ffmpeg)
- **Frame extraction** — keyframe or every-N-frames; resolution downscaling for inference
- **Detection model** — YOLOv8 or similar; produces per-frame bounding boxes
- **Tracking module** — ByteTrack/DeepSORT; assigns persistent IDs across frames
- **ROI / tripwire logic** — polygon zones and line-crossing counters defined per camera
- **Business event engine** — stateful rules (dwell time > T, count > N, zone occupancy)
- **Output sinks** — database write, webhook, MQTT, Kafka topic, dashboard stream
- **Monitoring** — FPS, queue depth, missed-frame rate, model confidence distribution

## Reference Implementations
- [Ultralytics YOLOv8](https://github.com/ultralytics/ultralytics) — detection + tracking in one library; `model.track(source="rtsp://...")` API
- [Supervision](https://github.com/roboflow/supervision) — Roboflow's utility library for zone counting, line crossing, annotating, and sinking results; pairs with any YOLO model
- [DeepStream SDK](https://github.com/NVIDIA-AI-IOT/deepstream_python_apps) — NVIDIA's optimized pipeline for multi-camera GPU inference with TensorRT

## Official Sources
- [Ultralytics Tracking Docs](https://docs.ultralytics.com/modes/track/) — real-time stream tracking with ByteTrack and BoT-SORT
- [Supervision Documentation](https://supervision.roboflow.com/) — zone, line counter, tracker, and annotator APIs
- [NVIDIA DeepStream Documentation](https://docs.nvidia.com/metropolis/deepstream/dev-guide/) — multi-stream, multi-model pipeline architecture
- [Ultralytics Video Guide](https://docs.ultralytics.com/modes/predict/) — video inference documentation
- [OpenCV VideoCapture Docs](https://docs.opencv.org/4.x/d8/dfe/classcv_1_1VideoCapture.html) — video capture and processing

## Related Architectures
- See also: [Object Detection](./object-detection.md)
- See also: [Object Tracking](./tracking.md)
- See also: [Image Segmentation](./segmentation.md)
- See also: [CV README](./README.md)
