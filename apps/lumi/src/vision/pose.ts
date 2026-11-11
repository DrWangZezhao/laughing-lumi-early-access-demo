import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { Landmark } from './actions.js';

export type PoseResult = { landmarks: Landmark[][] };

export class PosePipeline {
  private landmarker: PoseLandmarker | null = null;
  private loading: Promise<void> | null = null;
  private lastVideoTime = -1;

  async init(): Promise<void> {
    if (this.landmarker) return;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const wasmPath = new URL('./vendor/mediapipe/', document.baseURI).href;
      const modelPath = new URL('./models/pose_landmarker_lite.task', document.baseURI).href;
      const vision = await FilesetResolver.forVisionTasks(wasmPath);
      try {
        this.landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: modelPath, delegate: 'GPU' },
          runningMode: 'VIDEO', numPoses: 1,
        });
      } catch {
        this.landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: modelPath, delegate: 'CPU' },
          runningMode: 'VIDEO', numPoses: 1,
        });
      }
    })();
    try { await this.loading; } finally { this.loading = null; }
  }

  detect(video: HTMLVideoElement): PoseResult | null {
    if (!this.landmarker || video.readyState < 2 || video.currentTime === this.lastVideoTime) return null;
    this.lastVideoTime = video.currentTime;
    const result = this.landmarker.detectForVideo(video, performance.now());
    return { landmarks: (result.landmarks ?? []) as Landmark[][] };
  }

  close(): void {
    this.landmarker?.close();
    this.landmarker = null;
    this.lastVideoTime = -1;
  }
}
