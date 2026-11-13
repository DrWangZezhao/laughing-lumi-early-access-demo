import { createActionDetector } from './actions.js';
import { interpretGesture } from './gesture-mirror.js';

// Local free play has no voice/session/completion-event dependency. It reuses
// the authoritative temporal detectors, never a single raised-hand visual cue.
export function createLocalMovementDetector() {
  const wave = createActionDetector('wave');
  const sway = createActionDetector('sway');
  const visible = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y)
    && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1
    && Number.isFinite(p.visibility) && p.visibility >= .55
    && (p.presence == null || p.presence >= .55);
  const reset = () => { wave.reset(); sway.reset(); };
  return {
    reset,
    update(landmarks) {
      if (!interpretGesture(landmarks).poseVisible) { reset(); return null; }
      const canWave = [15, 16].some((index) => visible(landmarks[index]));
      const canSway = [23, 24].every((index) => visible(landmarks[index]));
      const waved = wave.update(canWave ? landmarks : []).detected;
      const swayed = sway.update(canSway ? landmarks : []).detected;
      if (waved) { sway.reset(); return 'wave'; }
      if (swayed) { wave.reset(); return 'sway'; }
      return null;
    },
  };
}
