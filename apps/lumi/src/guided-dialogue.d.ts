import type { GuidedAction } from './guided-game.js';
export declare const GAME_CONTEXT: string;
export declare function gameIntent(text: string): 'start' | 'restart' | 'stop' | null;
export declare function spokenAction(text: string): GuidedAction | null;
export declare function readyInvitation(text: string): boolean;
export declare function createPlayGuide(): {
  readonly phase: 'chat' | 'invitation' | 'playing';
  reset(): void;
  completed(hasNext: boolean): void;
  user(text: string, invitationPlayed?: boolean): 'invite' | 'begin' | 'stop' | null;
};
export declare function createSpeechGate(): {
  reset(): void;
  userTurn(): void;
  instruction(id: number): void;
  audio(id: number): void;
  interrupt(): void;
  mode(mode: 'speaking' | 'listening'): void;
  readonly canCheck: boolean;
};
