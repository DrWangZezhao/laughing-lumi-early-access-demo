import { ACTIONS } from './vision/actions.js';

// Session-only guidance complements the original child-led Lumi personality.
// No observations or camera data are included in this context.
export const GAME_CONTEXT = "Stay Lumi: a curious, cheerful polar bear in a playful North Pole adventure. Use simple, warm replies of 1–3 short sentences and follow the child's choices. Start with conversation, never a movement command. When the child wants a game, acknowledge them, invite them into a tiny snow adventure, ask if they are ready, and WAIT for their answer. Only after they agree, demonstrate and say ONE movement: wave hello side to side OR sway gently left and right. These are the only two movements this bear can show. No hands-up, snowflake, head-touch, jumping, or other activities. Say \"wave\" or \"sway\" explicitly in each instruction, so the matching demonstration can follow your words. After giving a movement, wait. Only the message \"The current movement is complete\" confirms success; a child saying \"I did it\" is not camera verification. After confirmation, praise briefly and ASK before another movement. Children can chat, change their mind, or interrupt at any time. Never claim you see video. If checking is unavailable, chat without claiming a verified result.";

export function readyInvitation(text) {
  const value = String(text || '');
  return /\b(?:are you ready|ready to|shall we|would you like to|do you want to)\b|准备好了吗|准备好没|要不要|想不想/iu.test(value)
    && /\b(?:play|game|adventure|wave|sway|ready)\b|玩|冒险|挥手|摇摆|准备/iu.test(value);
}

// Conversation can continue indefinitely. An invitation is never an instruction,
// and consent counts only after that invitation's audio actually finished.
export function createPlayGuide() {
  let phase = 'chat';
  return {
    get phase() { return phase; },
    reset() { phase = 'chat'; },
    completed(hasNext) { phase = hasNext ? 'invitation' : 'chat'; },
    user(text, invitationPlayed = false) {
      const intent = gameIntent(text);
      if (intent === 'stop' || /\b(?:no|nope|nah|not now|not ready|not yet|don['’]?t want to|do not want to)\b|还没准备好|还没好/iu.test(text) || /\b(?:talk|chat instead|something else)\b|先聊天|聊聊天|换一个/iu.test(text)
        || /^(?:no|nope|not now|不要|不想|不)[.!?。！？，,\s]*$/iu.test(text)) { phase = 'chat'; return 'stop'; }
      if (phase === 'invitation' && invitationPlayed
        && (/^(?:yes|yeah|yep|sure|okay|ok|ready|let['’]?s (?:go|play)|i am (?:really )?ready|i'm (?:really )?ready)\b|^(?:我|嗯)?(?:好|好的|可以|准备好了|开始吧|来吧)[呀吧啊。！？\s]*$/iu.test(text) || intent)) {
        phase = 'playing'; return 'begin';
      }
      if (intent && (phase !== 'playing' || intent === 'restart')) { phase = 'invitation'; return 'invite'; }
      return null;
    },
  };
}

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
    const clause = part.trim().replace(/^[,:，：\s]+/u, '').replace(/^(?:(?:yay|hooray|great|okay|ok|all right|alright)[,!，]+\s*)+/iu, '');
    if (readyInvitation(clause)) continue;
    if (/\b(don't|do not|never|stop|not yet)\b|不要|不用|别|还不能/iu.test(clause)) continue;
    if (!/^(?:please\b|(?:can|could|would|will) you\b|let['’]?s\b|i want you to\b|(?:raise|lift|put|bring|wave|sway|lean|stretch|touch|reach|hold|make|show)\b|请|试着|试试|把|将|举|抬|挥|摆|摇|张开|伸|摸|碰)/iu.test(clause)) continue;
    if (/\bwave\b|挥.*手/iu.test(clause)) return ACTIONS[0];
    if (/\b(?:sway|lean)\b.*\b(?:left|right|side|tree)\b|左右.*(?:摆|摇)|(?:摆|摇).*左右/iu.test(clause)) return ACTIONS[3];
  }
  return null;
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
