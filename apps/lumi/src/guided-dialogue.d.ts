import type { GuidedAction } from './guided-game.js';
export declare const GAME_CONTEXT: string;
export declare function gameIntent(text: string): 'start' | 'restart' | 'stop' | null;
export declare function spokenAction(text: string): GuidedAction | null;
export declare function movementRequest(action: GuidedAction): string;
export declare function createSpeechGate(): {
  reset(): void;
  userTurn(): void;
  instruction(id: number): void;
  audio(id: number): void;
  interrupt(): void;
  mode(mode: 'speaking' | 'listening'): void;
  readonly canCheck: boolean;
};
