// Pure, browser-independent movement recognition. MediaPipe supplies normalized
// landmarks; every threshold is relative to the user's shoulder width.
export const ACTIONS = Object.freeze([
  { id: 'wave', label: 'Wave Hello', instruction: 'Raise one hand and wave side to side.' },
  { id: 'hands-up', label: 'Hands Up', instruction: 'Lift both hands above your shoulders.' },
  { id: 'snowflake', label: 'Snowflake Pose', instruction: 'Stretch both arms out like a snowflake.' },
  { id: 'sway', label: 'Sway Like a Tree', instruction: 'Sway left, then right, like a tree in the snow.' },
  { id: 'head-touch', label: 'Touch Your Head', instruction: 'Bring both hands close to the top of your head.' },
]);

const I = Object.freeze({
  nose: 0, leftEye: 2, rightEye: 5, leftShoulder: 11, rightShoulder: 12,
  leftElbow: 13, rightElbow: 14, leftWrist: 15, rightWrist: 16,
  leftHip: 23, rightHip: 24,
});

const DEFAULTS = Object.freeze({
  minVisibility: 0.55,
  confirmFrames: 6,
  cooldownFrames: 18,
  historyFrames: 48,
});

const point = (landmarks, index) => landmarks?.[index];
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const visible = (p, minVisibility) => p && Number.isFinite(p.x) && Number.isFinite(p.y)
  && (p.visibility == null || p.visibility >= minVisibility);

function required(landmarks, indices, minVisibility) {
  return indices.every((index) => visible(point(landmarks, index), minVisibility));
}

function scaleFor(landmarks) {
  return Math.max(0.08, distance(point(landmarks, I.leftShoulder), point(landmarks, I.rightShoulder)));
}

function resetState(state) {
  state.frames = 0;
  state.cooldown = 0;
  state.history = [];
  state.last = null;
  state.direction = 0;
  state.changes = 0;
  state.range = 0;
}

function confirmation(state, condition, options) {
  if (state.cooldown > 0) { state.cooldown -= 1; state.frames = 0; return false; }
  state.frames = condition ? state.frames + 1 : 0;
  if (state.cooldown === 0 && state.frames >= options.confirmFrames) {
    state.cooldown = options.cooldownFrames;
    state.frames = 0;
    return true;
  }
  return false;
}

function wave(state, landmarks, options) {
  if (state.cooldown > 0) { state.cooldown -= 1; return { valid: true, progress: 0, detected: false }; }
  const needed = [I.leftShoulder, I.rightShoulder, I.leftWrist, I.rightWrist];
  if (!required(landmarks, needed, options.minVisibility)) return { valid: false, progress: 0 };
  const scale = scaleFor(landmarks);
  const shoulders = [point(landmarks, I.leftShoulder), point(landmarks, I.rightShoulder)];
  const wrists = [point(landmarks, I.leftWrist), point(landmarks, I.rightWrist)];
  const hand = wrists[0].y < shoulders[0].y - scale * 0.08 ? wrists[0]
    : wrists[1].y < shoulders[1].y - scale * 0.08 ? wrists[1] : null;
  if (!hand) { state.last = null; state.direction = 0; state.changes = 0; state.range = 0; return { valid: true, progress: 0 }; }
  if (state.last != null) {
    const delta = hand.x - state.last;
    const direction = Math.abs(delta) > scale * 0.045 ? Math.sign(delta) : 0;
    if (direction && state.direction && direction !== state.direction) state.changes += 1;
    if (direction) state.direction = direction;
    state.range = Math.max(state.range, Math.abs(hand.x - state.last));
  }
  state.last = hand.x;
  state.history.push(hand.x);
  if (state.history.length > options.historyFrames) state.history.shift();
  const span = Math.max(...state.history) - Math.min(...state.history);
  const detected = state.changes >= 2 && Math.max(state.range, span) > scale * 0.22;
  if (detected) { state.cooldown = options.cooldownFrames; state.changes = 0; state.history = []; }
  return { valid: true, progress: Math.min(1, (state.changes + span / (scale * 0.22)) / 3), detected };
}

function handsUp(state, landmarks, options) {
  const needed = [I.leftShoulder, I.rightShoulder, I.leftWrist, I.rightWrist];
  if (!required(landmarks, needed, options.minVisibility)) return { valid: false, progress: 0 };
  const ls = point(landmarks, I.leftShoulder), rs = point(landmarks, I.rightShoulder);
  const lw = point(landmarks, I.leftWrist), rw = point(landmarks, I.rightWrist);
  const condition = lw.y < ls.y - 0.04 && rw.y < rs.y - 0.04;
  const detected = confirmation(state, condition, options);
  return { valid: true, progress: Math.min(1, state.frames / options.confirmFrames), detected };
}

function snowflake(state, landmarks, options) {
  const needed = [I.leftShoulder, I.rightShoulder, I.leftElbow, I.rightElbow];
  if (!required(landmarks, needed, options.minVisibility)) return { valid: false, progress: 0 };
  const ls = point(landmarks, I.leftShoulder), rs = point(landmarks, I.rightShoulder);
  const le = point(landmarks, I.leftElbow), re = point(landmarks, I.rightElbow);
  const leftDx = ls.x - le.x, rightDx = re.x - rs.x;
  const horizontal = Math.abs(le.y - ls.y) < Math.abs(leftDx) * 0.75
    && Math.abs(re.y - rs.y) < Math.abs(rightDx) * 0.75;
  const condition = leftDx > 0.12 && rightDx > 0.12 && horizontal;
  const detected = confirmation(state, condition, options);
  return { valid: true, progress: Math.min(1, state.frames / options.confirmFrames), detected };
}

function sway(state, landmarks, options) {
  if (state.cooldown > 0) { state.cooldown -= 1; return { valid: true, progress: 0, detected: false }; }
  const needed = [I.leftShoulder, I.rightShoulder, I.leftHip, I.rightHip];
  if (!required(landmarks, needed, options.minVisibility)) return { valid: false, progress: 0 };
  const ls = point(landmarks, I.leftShoulder), rs = point(landmarks, I.rightShoulder);
  const lh = point(landmarks, I.leftHip), rh = point(landmarks, I.rightHip);
  const x = (ls.x + rs.x + lh.x + rh.x) / 4;
  const scale = scaleFor(landmarks);
  if (state.last != null) {
    const delta = x - state.last;
    const direction = Math.abs(delta) > scale * 0.035 ? Math.sign(delta) : 0;
    if (direction && state.direction && direction !== state.direction) state.changes += 1;
    if (direction) state.direction = direction;
    state.history.push(x);
    if (state.history.length > options.historyFrames) state.history.shift();
  }
  state.last = x;
  const span = state.history.length ? Math.max(...state.history) - Math.min(...state.history) : 0;
  state.range = Math.max(state.range, span);
  const detected = state.changes >= 2 && state.range > scale * 0.18;
  if (detected) { state.cooldown = options.cooldownFrames; state.changes = 0; state.history = []; state.range = 0; }
  return { valid: true, progress: Math.min(1, (state.changes + state.range / (scale * 0.18)) / 3), detected };
}

function headTouch(state, landmarks, options) {
  const needed = [I.nose, I.leftEye, I.rightEye, I.leftWrist, I.rightWrist, I.leftShoulder, I.rightShoulder];
  if (!required(landmarks, needed, options.minVisibility)) return { valid: false, progress: 0 };
  const nose = point(landmarks, I.nose), le = point(landmarks, I.leftEye), re = point(landmarks, I.rightEye);
  const head = { x: (nose.x + le.x + re.x) / 3, y: (nose.y + le.y + re.y) / 3 - scaleFor(landmarks) * 0.25 };
  const scale = scaleFor(landmarks);
  const condition = distance(point(landmarks, I.leftWrist), head) < scale * 0.65
    && distance(point(landmarks, I.rightWrist), head) < scale * 0.65;
  const detected = confirmation(state, condition, options);
  return { valid: true, progress: Math.min(1, state.frames / options.confirmFrames), detected };
}

const detectors = { wave, 'hands-up': handsUp, snowflake, sway, 'head-touch': headTouch };

export function createActionDetector(actionId, overrides = {}) {
  if (!detectors[actionId]) throw new Error(`Unknown action: ${actionId}`);
  const options = { ...DEFAULTS, ...overrides };
  const state = {};
  resetState(state);
  return {
    reset() { resetState(state); },
    update(landmarks) {
      if (!Array.isArray(landmarks) || landmarks.length < 25) return { status: 'camera-unavailable', progress: 0, detected: false };
      const result = detectors[actionId](state, landmarks, options);
      if (!result.valid) return { status: 'not-detected', progress: 0, detected: false };
      return { status: result.detected ? 'detected' : 'not-detected', progress: result.progress || 0, detected: Boolean(result.detected) };
    },
  };
}

export const landmarkIndices = I;
