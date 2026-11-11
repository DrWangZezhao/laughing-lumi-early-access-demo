export declare const PUBLIC_SESSION_MS: number;
export declare function createSessionClock(options?: { durationMs?: number; now?: () => number; onTick?: (remaining: number) => void; onExpire?: () => void }): { start(): boolean; stop(): void; reconcile(): number; readonly started: boolean; readonly expired: boolean; readonly remainingMs: number };
