import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_CONTEXT, gameIntent, spokenAction, createPlayGuide, readyInvitation, createSpeechGate } from '../apps/lumi/src/guided-dialogue.js';
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

test('only the two animation-backed instructions select existing detectors', () => {
  for (const text of ['Wave hello, side to side.', 'Please wave your right hand.', "Yay, let's wave hello!", 'Can you wave hello?', '请挥挥手。']) assert.equal(spokenAction(text)?.id, 'wave', text);
  for (const text of ['Sway left and right like a tree.', "Let's sway gently from side to side.", '请左右摇摆。']) assert.equal(spokenAction(text)?.id, 'sway', text);
});

test('praise, invitation, negation and other movements never start a detector', () => {
  for (const text of ['Great wave!', 'You waved, well done!', "Let's play a game!", 'Please jump up and down.', 'Please do not wave.', 'Please don’t sway.', 'Put both hands on your head.', "Don't wave yet.", '请举起双手。', 'Please lift both hands above your shoulders.', 'Please raise either hand.', 'Stretch both arms out like a snowflake.', 'Would you like to wave hello?', 'Shall we sway?', 'We talked about snowflakes.']) assert.equal(spokenAction(text), null, text);
});

test('one instruction wins over a list; praise and audio tags are ignored', () => {
  assert.equal(spokenAction('Wave hello, then sway left and right!')?.id, 'wave');
  assert.equal(spokenAction('Great wave! Next, please sway like a tree.')?.id, 'sway');
  assert.equal(spokenAction('[excited] Please wave hello!')?.id, 'wave');
});

test('new sessions chat; wanting a game opens an invitation, not checking', () => {
  const guide = createPlayGuide();
  assert.equal(guide.phase, 'chat');
  assert.equal(guide.user('Hi, my name is Sam'), null);
  assert.equal(guide.user('Yes'), null);
  assert.equal(guide.user('I want to play game'), 'invite');
  assert.equal(guide.phase, 'invitation');
  assert.equal(guide.user('Yes', false), null);
  assert.equal(guide.phase, 'invitation');
  assert.equal(guide.user('I am not ready', true), 'stop');
  guide.user('I want to play game');
  assert.equal(guide.user("I don't know if I am ready", true), null);
  assert.equal(guide.user('Are you ready?', true), null);
  assert.equal(guide.user('I am ready!', true), 'begin');
  assert.equal(guide.phase, 'playing');
});

test('invitation recognition excludes greetings and instructions', () => {
  for (const text of ['Are you ready for a little snow adventure?', 'Would you like to wave hello with me?', 'Shall we sway like snowy trees?', '准备好了吗？']) assert.equal(readyInvitation(text), true, text);
  for (const text of ['Hello, what is your name?', 'Please wave hello.', 'Great job!', 'I am ready.']) assert.equal(readyInvitation(text), false, text);
});

test('consent, declining and restarting remain child-led across both rounds', () => {
  const guide = createPlayGuide();
  guide.user('我想玩游戏'); assert.equal(guide.user('好的', true), 'begin');
  guide.completed(true); assert.equal(guide.phase, 'invitation');
  assert.equal(guide.user('I did it', true), null);
  assert.equal(guide.phase, 'invitation');
  assert.equal(guide.user('Not now', true), 'stop');
  assert.equal(guide.phase, 'chat');
  assert.equal(guide.user('Play again'), 'invite');
  guide.user('Yes', true); guide.completed(false);
  assert.equal(guide.phase, 'chat');
  guide.user('Play again'); guide.reset(); assert.equal(guide.phase, 'chat');
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

test('runtime context preserves conversation, consent and local verification', () => {
  assert.match(GAME_CONTEXT, /Start with conversation/);
  assert.match(GAME_CONTEXT, /WAIT for their answer/);
  assert.match(GAME_CONTEXT, /only two movements/i);
  assert.match(GAME_CONTEXT, /interrupt/i);
  assert.match(GAME_CONTEXT, /saying "I did it" is not camera verification/i);
});

test('a previous reply ending cannot arm a different instruction before its own audio', () => {
  const gate = createSpeechGate();
  gate.mode('speaking'); gate.audio(10); gate.mode('listening');
  gate.instruction(11); assert.equal(gate.canCheck, false);
  gate.mode('speaking'); gate.audio(11); assert.equal(gate.canCheck, false);
  gate.mode('listening'); assert.equal(gate.canCheck, true);
});
