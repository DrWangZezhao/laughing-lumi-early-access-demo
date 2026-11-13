import type { Landmark } from './actions.js';
export declare function createLocalMovementDetector(): {
  reset(): void;
  update(landmarks: Landmark[] | undefined): 'wave' | 'sway' | null;
};
