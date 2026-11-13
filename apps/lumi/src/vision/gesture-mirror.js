import { landmarkIndices as I } from './actions.js';

// Visual cues only: these approximations must never complete an activity.
const MIN_CONFIDENCE = 0.55;
const clamp = (value) => Math.max(-1, Math.min(1, value));
const visible = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y)
  && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1
  && Number.isFinite(p.visibility) && p.visibility >= MIN_CONFIDENCE
  && (p.presence == null || (Number.isFinite(p.presence) && p.presence >= MIN_CONFIDENCE));
const idle = () => ({ gesture: 'idle', lateral: 0, tilt: 0, poseVisible: false, wristsVisible: false });

// Pure and independent of the selected activity, clock, voice, DOM, and network.
export function interpretGesture(landmarks) {
  const ls = landmarks?.[I.leftShoulder], rs = landmarks?.[I.rightShoulder];
  if (!visible(ls) || !visible(rs)) return idle();
  const scale = Math.hypot(ls.x - rs.x, ls.y - rs.y);
  if (scale < 0.08) return idle();
  const lw = landmarks?.[I.leftWrist], rw = landmarks?.[I.rightWrist];
  const leftUp = visible(lw) && lw.y < ls.y - scale * 0.2;
  const rightUp = visible(rw) && rw.y < rs.y - scale * 0.2;
  const lh = landmarks?.[I.leftHip], rh = landmarks?.[I.rightHip];
  // Mirror the preview's horizontal direction. Whole-body/camera translation
  // cancels out because the lean is measured relative to the hips.
  const lean = visible(lh) && visible(rh) ? -((ls.x + rs.x - lh.x - rh.x) / 2) / scale : 0;
  const swaying = Math.abs(lean) > 0.12;
  const gesture = leftUp && rightUp ? 'both-hands-raised'
    : leftUp || rightUp ? 'one-hand-raised' : swaying ? 'sway' : 'idle';
  const lateral = swaying ? clamp(lean / 0.6) : 0;
  return { gesture, lateral, tilt: lateral * 10, poseVisible: true, wristsVisible: Boolean(visible(lw) && visible(rw)) };
}

// Three consecutive frames (~300 ms at the existing camera cadence) confirm a
// change. Pose loss resets immediately so stale motion never survives a restart.
export function createGestureMirror() {
  let gesture = 'idle', candidate = 'idle', frames = 0, lateral = 0;
  const reset = () => { gesture = 'idle'; candidate = 'idle'; frames = 0; lateral = 0; };
  return {
    reset,
    update(landmarks) {
      const cue = interpretGesture(landmarks);
      if (!cue.poseVisible) { reset(); return cue; }
      if (cue.gesture === candidate) frames = Math.min(3, frames + 1);
      else { candidate = cue.gesture; frames = 1; }
      if (frames >= 3) gesture = candidate;
      // Apply lean only after confirmation and smooth direction changes.
      if (gesture === cue.gesture) lateral += 0.35 * (cue.lateral - lateral);
      return { ...cue, gesture, lateral, tilt: lateral * 10 };
    },
  };
}
