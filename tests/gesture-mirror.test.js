import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretGesture, createGestureMirror } from '../apps/lumi/src/vision/gesture-mirror.js';
import { createActionDetector } from '../apps/lumi/src/vision/actions.js';

function pose(overrides = {}) {
  const points = [];
  for (const [index, x, y] of [[11, .4, .4], [12, .6, .4], [15, .3, .6], [16, .7, .6], [23, .43, .7], [24, .57, .7]]) {
    points[index] = { x, y, visibility: 1, ...overrides[index] };
  }
  return points;
}
const oneHand = () => pose({ 15: { y: .15 } });
const bothHands = () => pose({ 15: { y: .15 }, 16: { y: .15 } });
const lean = (shift) => pose({ 11: { x: .4 + shift }, 12: { x: .6 + shift } });
const repeat = (mirror, points, count = 3) => Array.from({ length: count }, () => mirror.update(points)).at(-1);

test('absent, face-only, uncertain, and invalid shoulders yield a neutral cue', () => {
  const neutral = { gesture: 'idle', lateral: 0, tilt: 0, poseVisible: false, wristsVisible: false };
  for (const points of [undefined, [], [{ x: .5, y: .2, visibility: 1 }],
    pose({ 11: { visibility: .1 } }), pose({ 12: { visibility: undefined } }),
    pose({ 11: { visibility: NaN } }), pose({ 11: { presence: .1 } }),
    pose({ 11: { x: NaN } }), pose({ 12: { x: 1.1 } }), pose({ 12: { x: .4 } })]) {
    assert.deepEqual(interpretGesture(points), neutral);
  }
});

test('either reliably raised hand cues a wave; two cue the moving approximation', () => {
  assert.equal(interpretGesture(oneHand()).gesture, 'one-hand-raised');
  assert.equal(interpretGesture(pose({ 16: { y: .15 } })).gesture, 'one-hand-raised');
  assert.equal(interpretGesture(bothHands()).gesture, 'both-hands-raised');
  assert.equal(interpretGesture(pose()).gesture, 'idle');
  assert.equal(interpretGesture(pose({ 15: { y: .38 } })).gesture, 'idle');
});

test('wrists must be in frame and confident, including presence when supplied', () => {
  for (const invalid of [{ visibility: .1 }, { presence: .1 }, { visibility: undefined }, { y: -.1 }, { x: Infinity }]) {
    const cue = interpretGesture(pose({ 15: { y: .15, ...invalid }, 16: { y: .15 } }));
    assert.equal(cue.gesture, 'one-hand-raised');
    assert.equal(cue.wristsVisible, false);
  }
  const missing = pose(); delete missing[15];
  assert.equal(interpretGesture(missing).wristsVisible, false);
  assert.equal(interpretGesture(bothHands()).wristsVisible, true);
});

test('torso sway mirrors the preview direction and clamps lateral motion and tilt', () => {
  const right = interpretGesture(lean(.06)), left = interpretGesture(lean(-.06));
  assert.equal(right.gesture, 'sway');
  assert.ok(right.lateral < 0 && left.lateral > 0);
  assert.ok(Math.abs(right.tilt + left.tilt) < 1e-10);
  assert.equal(interpretGesture(lean(.3)).tilt, -10);
  assert.equal(interpretGesture(lean(-.3)).tilt, 10);
  assert.equal(interpretGesture(lean(.3)).lateral, -1);
  assert.equal(interpretGesture(lean(-.3)).lateral, 1);
});

test('sway uses hips as a reference and returns to idle at center', () => {
  const shifted = pose();
  for (const point of shifted.filter(Boolean)) point.x += .1;
  assert.equal(interpretGesture(shifted).gesture, 'idle');
  assert.equal(interpretGesture(lean(.01)).tilt, 0);
  assert.equal(interpretGesture(pose({ 11: { x: .46 }, 12: { x: .66 }, 23: { visibility: .1 } })).gesture, 'idle');
  assert.equal(interpretGesture(lean(.06)).gesture, 'sway');
  assert.deepEqual(interpretGesture(pose()), { gesture: 'idle', lateral: 0, tilt: 0, poseVisible: true, wristsVisible: true });
});

test('interpretation is deterministic and does not mutate landmarks', () => {
  const points = bothHands(), original = structuredClone(points);
  points.forEach(Object.freeze); Object.freeze(points);
  assert.deepEqual(interpretGesture(points), interpretGesture(points));
  assert.deepEqual(points, original);
});

test('three consecutive frames confirm changes, including returning to idle', () => {
  const mirror = createGestureMirror();
  assert.equal(repeat(mirror, oneHand(), 2).gesture, 'idle');
  assert.equal(mirror.update(pose()).gesture, 'idle');
  assert.equal(repeat(mirror, oneHand(), 2).gesture, 'idle');
  assert.equal(mirror.update(oneHand()).gesture, 'one-hand-raised');
  assert.equal(repeat(mirror, bothHands(), 2).gesture, 'one-hand-raised');
  assert.equal(mirror.update(bothHands()).gesture, 'both-hands-raised');
  assert.equal(repeat(mirror, pose(), 2).gesture, 'both-hands-raised');
  assert.equal(mirror.update(pose()).gesture, 'idle');
});

test('lean is smoothed, bounded, and settles toward zero after returning to idle', () => {
  const mirror = createGestureMirror();
  assert.equal(repeat(mirror, lean(.3), 2).tilt, 0);
  const first = mirror.update(lean(.3)).tilt;
  assert.ok(first < 0 && first > -10);
  const held = repeat(mirror, lean(.3), 20).tilt;
  assert.ok(held < first && held >= -10);
  const centered = repeat(mirror, pose(), 30);
  assert.equal(centered.gesture, 'idle');
  assert.ok(Math.abs(centered.tilt) < .001);
});

test('pose loss and explicit reset discard motion and pending confirmations', () => {
  const mirror = createGestureMirror();
  repeat(mirror, lean(.3));
  assert.equal(mirror.update([]).tilt, 0);
  assert.equal(mirror.update([]).gesture, 'idle');
  assert.equal(repeat(mirror, oneHand(), 2).gesture, 'idle');
  mirror.reset();
  assert.equal(repeat(mirror, oneHand(), 2).gesture, 'idle');
  assert.equal(mirror.update(oneHand()).gesture, 'one-hand-raised');
  assert.equal(mirror.update(pose({ 12: { visibility: .1 } })).gesture, 'idle');
});

test('a visual cue is available before the authoritative action detector confirms completion', () => {
  const mirror = createGestureMirror(), detector = createActionDetector('hands-up');
  for (let frame = 0; frame < 3; frame++) {
    mirror.update(bothHands());
    assert.equal(detector.update(bothHands()).detected, false);
  }
  assert.equal(mirror.update(bothHands()).gesture, 'both-hands-raised');
  assert.equal(detector.update(bothHands()).detected, false);
  assert.equal(detector.update(bothHands()).detected, false);
  assert.equal(detector.update(bothHands()).detected, true);
});
