export type ActionResult = { status: 'detected' | 'not-detected' | 'camera-unavailable'; progress: number; detected: boolean };
export type Landmark = { x: number; y: number; z?: number; visibility?: number };
export declare const ACTIONS: readonly { id: string; label: string; instruction: string }[];
export declare function createActionDetector(actionId: string, overrides?: Record<string, number>): { reset(): void; update(landmarks: Landmark[] | undefined): ActionResult };
export declare const landmarkIndices: Record<string, number>;
