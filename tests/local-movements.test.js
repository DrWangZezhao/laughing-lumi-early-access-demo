import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalMovementDetector } from '../apps/lumi/src/vision/local-movements.js';

function pose({ wristX = .3, wristY = .6, lean = 0, confidence = 1 } = {}) {
  const p = Array.from({ length: 33 }, () => ({ x: .5, y: .5, visibility: confidence }));
  for (const [i, x, y] of [[11,.4+lean,.4],[12,.6+lean,.4],[15,wristX,wristY],[16,.7,.6],[23,.43,.65],[24,.57,.65]]) Object.assign(p[i], { x,y });
  return p;
}
const waveXs = [.30,.32,.36,.40,.44,.42,.38,.34,.30,.32,.36,.40,.44,.42,.38,.34,.30];
const swayXs = [0,.04,.08,.12,.08,.04,0,-.04,-.08,-.04,0,.04,.08];

test('local wave recognition works without any voice or selected activity', () => {
  const detector = createLocalMovementDetector();
  const events = waveXs.map(wristX => detector.update(pose({ wristX, wristY:.18 }))).filter(Boolean);
  assert.deepEqual(events, ['wave']);
});

test('local sway recognition works independently and remains distinct from wave', () => {
  const detector = createLocalMovementDetector();
  const events = swayXs.map(lean => detector.update(pose({ lean }))).filter(Boolean);
  assert.deepEqual(events, ['sway']);
});

test('face only, missing, uncertain, stationary and merely raised hands do not confirm movements', () => {
  const detector = createLocalMovementDetector();
  for (let i = 0; i < 40; i++) {
    assert.equal(detector.update(), null); assert.equal(detector.update([]), null);
    assert.equal(detector.update(pose({confidence:.1})), null);
    assert.equal(detector.update(pose({wristY:.18})), null);
  }
  for (const lean of swayXs) {
    const p = pose({ lean }); p[23].visibility=.1; p[24].visibility=.1;
    assert.equal(detector.update(p), null);
  }
  for (const wristX of waveXs) {
    const p = pose({ wristX, wristY:.18 }); p[15].visibility=.1; p[16].visibility=.1;
    assert.equal(detector.update(p), null);
  }
});

test('pose loss and reset discard incomplete movement history', () => {
  const detector = createLocalMovementDetector();
  for (const wristX of [.3,.4,.3]) assert.equal(detector.update(pose({wristX,wristY:.18})), null);
  detector.update([]);
  for (const wristX of [.3,.4]) assert.equal(detector.update(pose({wristX,wristY:.18})), null);
  detector.reset();
  assert.deepEqual(waveXs.map(wristX => detector.update(pose({wristX,wristY:.18}))).filter(Boolean), ['wave']);
});
