export type GuidedAction = { id: string; label: string; instruction: string };
export declare const GUIDED_SEQUENCE: readonly GuidedAction[];
export declare function completionEvent(nextAction?: GuidedAction): string;
