export type ActionResult = { status: 'detected' | 'not-detected' | 'camera-unavailable'; progress: number; detected: boolean };
export type Landmark = { x: number; y: number; z?: number; visibility?: number };
export declare const ACTIONS: readonly { id: string; label: string; instruction: string }[];
export declare const GUIDED_RAISE_HAND: { readonly id: 'raise-hand'; readonly label: 'Raise One Hand'; readonly instruction: string };
export declare function actionFromAgentPrompt(text: string): { id: string; label: string; instruction: string } | null;
export declare function createActionDetector(actionId: string, overrides?: Record<string, number>): { reset(): void; update(landmarks: Landmark[] | undefined): ActionResult };
export declare const landmarkIndices: Record<string, number>;
