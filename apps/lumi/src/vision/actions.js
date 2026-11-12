// Pure, browser-independent movement recognition. MediaPipe supplies normalized
// landmarks; every threshold is relative to the user's shoulder width.
export const ACTIONS = Object.freeze([
  { id: 'wave', label: 'Wave Hello', instruction: 'Raise one hand and wave side to side.' },
  { id: 'hands-up', label: 'Hands Up', instruction: 'Lift both hands above your shoulders.' },
  { id: 'snowflake', label: 'Snowflake Pose', instruction: 'Stretch both arms out like a snowflake.' },
  { id: 'sway', label: 'Sway Like a Tree', instruction: 'Sway left, then right, like a tree in the snow.' },
  { id: 'head-touch', label: 'Touch Your Head', instruction: 'Bring both hands close to the top of your head.' },
]);

// A simpler first step for a spoken, guided interaction. The original five
// selectable activities above stay intact.
export const GUIDED_RAISE_HAND = Object.freeze({
  id: 'raise-hand', label: 'Raise One Hand', instruction: 'Raise either hand above your shoulder and hold it there.',
});

export function actionFromAgentPrompt(text) {
  const prompt = String(text || '').toLowerCase();
  const candidates = [
    [ACTIONS[0], /\b(wave|waving)\b|挥手/gu],
    [ACTIONS[1], /\b(both hands|two hands|hands up|raise your hands|lift your hands|raise both arms|lift both arms)\b|双手|两只手/gu],
    [ACTIONS[2], /\b(snowflake|arms out|stretch both arms)\b|雪花|张开双臂/gu],
    [ACTIONS[3], /\b(sway|lean left|lean right)\b|摇摆|左右摆/gu],
    [ACTIONS[4], /\b(touch your head|hands on your head)\b|摸头|碰头/gu],
    [GUIDED_RAISE_HAND, /\b(raise|lift|put up).{0,30}\b(hand|arm)\b|举.{0,6}手/gu],
  ];
  let latest = null;
  for (const [action, pattern] of candidates) {
    for (const match of prompt.matchAll(pattern)) {
      if (!latest || match.index > latest.index) latest = { action, index: match.index };
    }
  }
  return latest?.action || null;
}

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
  smoothing: 0.4,
  motionThreshold: 0.07,
  waveMotionThreshold: 0.045,
  waveRange: 0.5,
  swayRange: 0.32,
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
  state.hand = null;
  state.smoothed = null;
}

function motion(state, position, options, requiredRange) {
  state.smoothed = state.smoothed == null ? position
    : state.smoothed + options.smoothing * (position - state.smoothed);
  if (state.last != null) {
    const delta = state.smoothed - state.last;
    const direction = Math.abs(delta) >= options.motionThreshold ? Math.sign(delta) : 0;
    if (direction && state.direction && direction !== state.direction) state.changes += 1;
    if (direction) state.direction = direction;
  }
  state.last = state.smoothed;
  state.history.push(state.smoothed);
  if (state.history.length > options.historyFrames) state.history.shift();
  state.range = Math.max(...state.history) - Math.min(...state.history);
  const detected = state.changes >= 2 && state.range >= requiredRange;
  const progress = detected ? 1 : Math.min(0.95, state.changes / 2, state.range / requiredRange);
  if (detected) {
    state.cooldown = options.cooldownFrames;
    state.frames = 0;
    state.history = [];
    state.last = null;
    state.smoothed = null;
    state.direction = 0;
    state.changes = 0;
    state.range = 0;
  }
  return { valid: true, progress, detected };
}

function confirmation(state, condition, options) {
  if (state.cooldown > 0) { state.cooldown -= 1; state.frames = 0; return false; }
  // A single noisy frame should not erase a nearly completed held gesture.
  // Sustained relaxation still drains the evidence before confirmation.
  state.frames = condition ? state.frames + 1 : Math.max(0, state.frames - 2);
  if (state.cooldown === 0 && state.frames >= options.confirmFrames) {
    state.cooldown = options.cooldownFrames;
    state.frames = 0;
    return true;
  }
  return false;
}

function wave(state, landmarks, options) {
  if (state.cooldown > 0) { state.cooldown -= 1; return { valid: true, progress: 0, detected: false }; }
  const needed = [I.leftShoulder, I.rightShoulder];
  if (!required(landmarks, needed, options.minVisibility)) return { valid: false, progress: 0 };
  const scale = scaleFor(landmarks);
  const shoulders = [point(landmarks, I.leftShoulder), point(landmarks, I.rightShoulder)];
  const wrists = [point(landmarks, I.leftWrist), point(landmarks, I.rightWrist)];
  const raised = [0, 1].filter((side) => visible(wrists[side], options.minVisibility)
    && wrists[side].y < shoulders[side].y - scale * 0.12);
  if (!raised.length) { resetState(state); return { valid: true, progress: 0 }; }
  const side = raised.includes(state.hand) ? state.hand : raised[0];
  if (state.hand !== side) resetState(state);
  state.hand = side;
  return motion(state, (wrists[side].x - shoulders[side].x) / scale,
    { ...options, motionThreshold: options.waveMotionThreshold }, options.waveRange);
}

function handsUp(state, landmarks, options) {
  const needed = [I.leftShoulder, I.rightShoulder, I.leftWrist, I.rightWrist];
  if (!required(landmarks, needed, options.minVisibility)) return { valid: false, progress: 0 };
  const ls = point(landmarks, I.leftShoulder), rs = point(landmarks, I.rightShoulder);
  const lw = point(landmarks, I.leftWrist), rw = point(landmarks, I.rightWrist);
  const scale = scaleFor(landmarks);
  const condition = lw.y < ls.y - scale * 0.2 && rw.y < rs.y - scale * 0.2;
  const detected = confirmation(state, condition, options);
  return { valid: true, progress: Math.min(1, state.frames / options.confirmFrames), detected };
}

function raiseHand(state, landmarks, options) {
  const shoulders = [point(landmarks, I.leftShoulder), point(landmarks, I.rightShoulder)];
  if (!shoulders.every((shoulder) => visible(shoulder, options.minVisibility))) return { valid: false, progress: 0 };
  const scale = scaleFor(landmarks);
  const wrists = [point(landmarks, I.leftWrist), point(landmarks, I.rightWrist)];
  const condition = wrists.some((wrist, side) => visible(wrist, options.minVisibility)
    && wrist.y < shoulders[side].y - scale * 0.3);
  const detected = confirmation(state, condition, { ...options, confirmFrames: 4 });
  return { valid: true, progress: Math.min(1, state.frames / 4), detected };
}

function snowflake(state, landmarks, options) {
  const needed = [I.leftShoulder, I.rightShoulder, I.leftElbow, I.rightElbow];
  if (!required(landmarks, needed, options.minVisibility)) return { valid: false, progress: 0 };
  const ls = point(landmarks, I.leftShoulder), rs = point(landmarks, I.rightShoulder);
  const le = point(landmarks, I.leftElbow), re = point(landmarks, I.rightElbow);
  const leftDx = ls.x - le.x, rightDx = re.x - rs.x;
  const horizontal = Math.abs(le.y - ls.y) < Math.abs(leftDx) * 0.75
    && Math.abs(re.y - rs.y) < Math.abs(rightDx) * 0.75;
  const scale = scaleFor(landmarks);
  const condition = leftDx > scale * 0.6 && rightDx > scale * 0.6 && horizontal;
  const detected = confirmation(state, condition, options);
  return { valid: true, progress: Math.min(1, state.frames / options.confirmFrames), detected };
}

function sway(state, landmarks, options) {
  if (state.cooldown > 0) { state.cooldown -= 1; return { valid: true, progress: 0, detected: false }; }
  const needed = [I.leftShoulder, I.rightShoulder, I.leftHip, I.rightHip];
  if (!required(landmarks, needed, options.minVisibility)) return { valid: false, progress: 0 };
  const ls = point(landmarks, I.leftShoulder), rs = point(landmarks, I.rightShoulder);
  const lh = point(landmarks, I.leftHip), rh = point(landmarks, I.rightHip);
  const scale = scaleFor(landmarks);
  const shoulderCenter = (ls.x + rs.x) / 2;
  const hipCenter = (lh.x + rh.x) / 2;
  return motion(state, (shoulderCenter - hipCenter) / scale, options, options.swayRange);
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

const detectors = { wave, 'raise-hand': raiseHand, 'hands-up': handsUp, snowflake, sway, 'head-touch': headTouch };

export function createActionDetector(actionId, overrides = {}) {
  if (!detectors[actionId]) throw new Error(`Unknown action: ${actionId}`);
  const options = { ...DEFAULTS, ...overrides };
  const state = {};
  resetState(state);
  return {
    reset() { resetState(state); },
    update(landmarks) {
      if (!Array.isArray(landmarks)) { resetState(state); return { status: 'camera-unavailable', progress: 0, detected: false }; }
      if (landmarks.length < 25) { resetState(state); return { status: 'not-detected', progress: 0, detected: false }; }
      const result = detectors[actionId](state, landmarks, options);
      if (!result.valid) { resetState(state); return { status: 'not-detected', progress: 0, detected: false }; }
      return { status: result.detected ? 'detected' : 'not-detected', progress: result.progress || 0, detected: Boolean(result.detected) };
    },
  };
}

export const landmarkIndices = I;
