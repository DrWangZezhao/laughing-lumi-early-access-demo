import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_CONTEXT, gameIntent, spokenAction, movementRequest, createSpeechGate } from '../apps/lumi/src/guided-dialogue.js';
import { ACTIONS } from '../apps/lumi/src/vision/actions.js';

test('child game requests are recognized in English and Chinese', () => {
  for (const text of ['I want to play game', 'I want to play a game!', "Let's play", 'Can we play a game?', 'I wanna play', '我想玩游戏', '我们一起玩吧']) {
    assert.equal(gameIntent(text), 'start', text);
  }
  assert.equal(gameIntent('Play again!'), 'restart');
  assert.equal(gameIntent('重新开始'), 'restart');
});

test('stop and negation take priority over a game request', () => {
  for (const text of ['Stop the game', 'stop', "I don't want to play a game", 'I am not playing games', '不玩了', '我不想玩游戏']) {
    assert.equal(gameIntent(text), 'stop', text);
  }
  for (const text of ['hello Lumi', 'I did it', 'I played a game yesterday', 'I want to play guitar', 'Can we talk?']) {
    assert.equal(gameIntent(text), null, text);
  }
});

test('supported spoken instructions select the matching original detector', () => {
  const cases = [
    ['Please lift both hands above your shoulders.', 'hands-up'],
    ['Raise both arms!', 'hands-up'],
    ['Can you put one hand above your shoulder?', 'raise-hand'],
    ['Please raise either hand.', 'raise-hand'],
    ['Please raise one hand above your head.', 'raise-hand'],
    ['Wave hello, side to side.', 'wave'],
    ['Please wave your right hand above your shoulder.', 'wave'],
    ['Stretch both arms out like a snowflake.', 'snowflake'],
    ['Sway left and right like a tree.', 'sway'],
    ['Bring both hands to the top of your head.', 'head-touch'],
    ['Put both hands on your head.', 'head-touch'],
    ['请举起你的双手。', 'hands-up'],
    ['请举起一只手。', 'raise-hand'],
  ];
  for (const [text, id] of cases) assert.equal(spokenAction(text)?.id, id, text);
});

test('praise, negation, and unsupported movements never start a detector', () => {
  for (const text of ['Great wave!', 'You raised both hands, well done!', "Let's play a game!", 'Please jump up and down.', 'Please do not raise both hands.', 'Please don’t raise both hands.', 'Put one hand on your head.', "Don't wave yet.", '不要举起双手。', 'We talked about snowflakes.']) {
    assert.equal(spokenAction(text), null, text);
  }
});

test('one instruction wins over a list; praise and audio tags are ignored', () => {
  assert.equal(spokenAction('Lift both hands, then wave hello!')?.id, 'hands-up');
  assert.equal(spokenAction('Great wave! Next, please touch your head.')?.id, 'head-touch');
  assert.equal(spokenAction('[excited] Please raise one hand!')?.id, 'raise-hand');
});

test('instructions received before playback cannot arm detection early', () => {
  const gate = createSpeechGate();
  gate.mode('listening'); gate.instruction(1);
  assert.equal(gate.canCheck, false);
  gate.mode('speaking'); gate.audio(1); assert.equal(gate.canCheck, false);
  gate.mode('listening'); assert.equal(gate.canCheck, true);
});

test('a final instruction transcript received after playback can arm immediately', () => {
  const gate = createSpeechGate();
  gate.mode('speaking'); gate.audio(1); gate.mode('listening');
  assert.equal(gate.canCheck, false);
  gate.instruction(1); assert.equal(gate.canCheck, true);
  gate.mode('listening'); assert.equal(gate.canCheck, true);
});

test('an interrupted instruction needs a fresh announcement and playback end', () => {
  const gate = createSpeechGate();
  gate.instruction(1); gate.mode('speaking'); gate.audio(1); gate.interrupt(); gate.mode('listening');
  assert.equal(gate.canCheck, false);
  gate.mode('speaking'); gate.audio(1); gate.mode('listening');
  assert.equal(gate.canCheck, false);
  gate.instruction(1); assert.equal(gate.canCheck, true);
});

test('new user turns and resets do not inherit a completed playback gate', () => {
  const gate = createSpeechGate();
  gate.instruction(1); gate.mode('speaking'); gate.audio(1); gate.mode('listening');
  gate.userTurn(); gate.instruction(1); assert.equal(gate.canCheck, false);
  gate.mode('speaking'); gate.audio(1); gate.mode('listening'); assert.equal(gate.canCheck, true);
  gate.reset(); gate.instruction(1); assert.equal(gate.canCheck, false);
});

test('context and bounded prompt requests contain no observations or completion claims', () => {
  assert.match(GAME_CONTEXT, /wait/i);
  assert.match(GAME_CONTEXT, /interrupt/i);
  assert.match(movementRequest(ACTIONS[1]), /Lift both hands above your shoulders/);
  assert.doesNotMatch(movementRequest(ACTIONS[1]), /landmark|confidence|coordinates|detected|i saw/i);
  assert.match(movementRequest(ACTIONS[1]), /do not mark the movement complete/i);
});


test('a previous reply ending cannot arm a different instruction before its own audio', () => {
  const gate = createSpeechGate();
  gate.mode('speaking'); gate.audio(10); gate.mode('listening');
  gate.instruction(11); assert.equal(gate.canCheck, false);
  gate.mode('speaking'); gate.audio(11); assert.equal(gate.canCheck, false);
  gate.mode('listening'); assert.equal(gate.canCheck, true);
});
