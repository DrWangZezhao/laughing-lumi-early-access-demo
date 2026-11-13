import { ACTIONS, GUIDED_RAISE_HAND, actionFromAgentPrompt } from './vision/actions.js';

// These fixed messages describe game state, never camera observations.
export const GAME_CONTEXT = 'This browser runs a local movement game. Give one short movement instruction at a time, then wait. Supported movements: raise one hand, lift both hands, wave side to side, stretch both arms out, sway left and right, touch your head. Only the message "The current movement is complete" confirms success. A child saying "I did it" is not camera verification. Do not claim you can see video. Keep replies brief and let the child interrupt.';

export function gameIntent(text) {
  const value = String(text || '').toLowerCase().replace(/[’]/gu, "'");
  if (/\b(stop|pause|quit|end)\b.{0,15}\b(game|playing)\b|\b(?:don't|do not|not) (?:want to )?play(?:ing)?\b|^(?:stop|pause)[.!?\s]*$|不想玩|不玩了|停止游戏|暂停游戏|别玩了/u.test(value)) return 'stop';
  if (/\b(play again|start over|restart (?:the )?game)\b|再玩一次|重新开始/u.test(value)) return 'restart';
  if (/\b(?:play|playing)\b.{0,15}\bgames?\b|\b(?:let's|lets|can we|i want to|i wanna) play(?:[.!?\s]*$|\s+(?:please|with you|together)[.!?\s]*$)|想玩.{0,3}游戏|玩游戏|一起玩[吧呀啊。！？\s]*$/u.test(value)) return 'start';
  return null;
}

// Parse an actual request, not praise, a negation, or an activity mentioned in
// conversation. The first instruction wins if the agent gives several at once.
export function spokenAction(text) {
  const clauses = String(text || '').replace(/[’]/gu, "'").replace(/\[[^\]]*\]/gu, '').split(/[.!?;\n。！？；]+|\b(?:then|next|now)\b|然后|接下来|现在/iu);
  for (const part of clauses) {
    const clause = part.trim().replace(/^[,:，：\s]+/u, '');
    if (/\b(don't|do not|never|stop|not yet)\b|不要|不用|别|还不能/iu.test(clause)) continue;
    if (!/^(?:please\b|(?:can|could|would|will) you\b|let['’]?s\b|i want you to\b|(?:raise|lift|put|bring|wave|sway|lean|stretch|touch|reach|hold|make|show)\b|请|试着|试试|把|将|举|抬|挥|摆|摇|张开|伸|摸|碰)/iu.test(clause)) continue;
    if (/\bwave\b|挥.*手/iu.test(clause)) return ACTIONS[0];
    if (/\btouch\b.*\bhead\b|\b(?:bring|put|hold)\b.*\bhands?\b.*\b(?:on|near|to|close)\b.*\bhead\b|摸头|碰头/iu.test(clause)) {
      // The existing head-touch detector requires both hands. Do not pretend
      // that a different one-hand head-touch activity is supported.
      if (/\b(?:one|either|a|left|right) (?:hand|arm)\b|一只手|单手/iu.test(clause)) return null;
      return ACTIONS[4];
    }
    // Prefer explicit two-hand instructions over the generic hand matcher.
    if (/\b(?:both|two) (?:of your )?(?:hands|arms)\b.*\b(?:up|above|high|sky)\b|\b(?:raise|lift)\b.*\b(?:both|two) (?:hands|arms)\b|举.*双手|抬.*双手/iu.test(clause)) return ACTIONS[1];
    if (/\b(?:one|either|a|your left|your right) (?:hand|arm)\b.*\b(?:up|above|high|sky)\b/iu.test(clause)) return GUIDED_RAISE_HAND;
    const action = actionFromAgentPrompt(clause);
    if (action) return action;
  }
  return null;
}

export function movementRequest(action) {
  return `Please give just this movement instruction aloud, in one short sentence: ${action.instruction} Then wait for the local completion event. Do not mark the movement complete yourself.`;
}

// SDK transcripts can arrive before playback starts or after playback ends.
// Checking starts only after a speaking -> listening transition in this turn.
export function createSpeechGate() {
  let speaking = false, playingId = null, finishedId = null, instructionId = null;
  return {
    reset() { speaking = false; playingId = null; finishedId = null; instructionId = null; },
    userTurn() { finishedId = null; },
    instruction(id) { instructionId = Number.isFinite(id) ? id : null; },
    audio(id) { playingId = Number.isFinite(id) ? id : null; },
    interrupt() { speaking = false; playingId = null; finishedId = null; instructionId = null; },
    mode(mode) {
      if (mode === 'speaking') { speaking = true; finishedId = null; }
      else { if (speaking) finishedId = playingId; speaking = false; }
    },
    get canCheck() { return instructionId != null && instructionId === finishedId && !speaking; },
  };
}
