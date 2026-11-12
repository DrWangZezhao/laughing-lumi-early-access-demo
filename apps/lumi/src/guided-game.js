import { ACTIONS } from './vision/actions.js';

// The first two rounds are hands-up and wave; the original five activities
// remain available for a longer team session.
export const GUIDED_SEQUENCE = Object.freeze([ACTIONS[1], ACTIONS[0], ACTIONS[2], ACTIONS[3], ACTIONS[4]]);

export function completionEvent(nextAction) {
  return nextAction
    ? `The current movement is complete. Please praise me briefly, then speak the next instruction: ${nextAction.instruction} Wait for me to try it.`
    : 'The current movement is complete. Please praise me and say the movement game is finished.';
}
