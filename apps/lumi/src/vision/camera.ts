import { PosePipeline } from './pose.js';
import type { Landmark } from './actions.js';

export type CameraStatus = 'idle' | 'starting' | 'ready' | 'denied' | 'unavailable' | 'model-unavailable' | 'stopped';

export class CameraController {
  private stream: MediaStream | null = null;
  private running = false;
  private loopTimer: number | null = null;
  private readonly pipeline = new PosePipeline();
  private readonly onLandmarks: (landmarks: Landmark[]) => void;
  private readonly onStatus: (status: CameraStatus, message?: string) => void;
  private readonly video: HTMLVideoElement;

  constructor(video: HTMLVideoElement, onLandmarks: (landmarks: Landmark[]) => void, onStatus: (status: CameraStatus, message?: string) => void) {
    this.video = video;
    this.onLandmarks = onLandmarks;
    this.onStatus = onStatus;
    this.video.muted = true;
    this.video.playsInline = true;
  }

  get active(): boolean { return this.running; }

  async start(): Promise<void> {
    if (this.running) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.onStatus('unavailable', 'This browser cannot use the camera. You can continue in manual mode (unverified).');
      return;
    }
    this.onStatus('starting');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false,
      });
      this.video.srcObject = this.stream;
      await this.video.play();
      await this.pipeline.init();
      this.running = true;
      this.onStatus('ready');
      this.loop();
    } catch (error) {
      this.stop();
      const name = (error as { name?: string }).name;
      if (name === 'NotAllowedError' || name === 'SecurityError') this.onStatus('denied', 'Camera access was denied. Manual mode is available, but movement is unverified.');
      else if (name === 'NotFoundError') this.onStatus('unavailable', 'No camera was found. Manual mode is available, but movement is unverified.');
      else this.onStatus('model-unavailable', 'The local movement model could not start. Manual mode is available, but movement is unverified.');
    }
  }

  private loop(): void {
    if (!this.running) return;
    try {
      const result = this.pipeline.detect(this.video);
      if (result?.landmarks[0]) this.onLandmarks(result.landmarks[0]);
    } catch {
      this.stop(false);
      this.onStatus('model-unavailable', 'Movement checking paused. Manual mode is available, but movement is unverified.');
      return;
    }
    this.loopTimer = window.setTimeout(() => this.loop(), 100);
  }

  stop(notify = true): void {
    this.running = false;
    if (this.loopTimer != null) window.clearTimeout(this.loopTimer);
    this.loopTimer = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video.pause();
    this.video.srcObject = null;
    if (notify) this.onStatus('stopped');
  }

  dispose(): void { this.stop(); this.pipeline.close(); }
}
