import { ACTIONS } from './vision/actions.js';

// Each offered movement has a matching existing bear visual and local detector.
export const GUIDED_SEQUENCE = Object.freeze([ACTIONS[0], ACTIONS[3]]);

export function completionEvent(nextAction) {
  return nextAction
    ? `The current movement is complete. Praise me briefly. Invite me to ${nextAction.label.toLowerCase()} in our adventure, ask if I am ready, and WAIT for my answer before speaking the next instruction. Do not start another movement yet.`
    : 'The current movement is complete. Praise me briefly, say the movement game is finished, and return to friendly conversation. Let me choose what to talk about.';
}
