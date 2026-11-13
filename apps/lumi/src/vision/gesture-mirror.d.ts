import type { Landmark } from './actions.js';

export type MirrorGesture = 'idle' | 'one-hand-raised' | 'both-hands-raised' | 'sway';
export type MirrorLandmark = Landmark & { presence?: number };
export type MirrorCue = {
  gesture: MirrorGesture;
  lateral: number;
  tilt: number;
  poseVisible: boolean;
  wristsVisible: boolean;
};
export declare function interpretGesture(landmarks?: readonly MirrorLandmark[]): MirrorCue;
export declare function createGestureMirror(): {
  reset(): void;
  update(landmarks?: readonly MirrorLandmark[]): MirrorCue;
};
