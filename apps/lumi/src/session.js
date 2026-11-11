export const PUBLIC_SESSION_MS = 60_000;

export function createSessionClock({ durationMs = PUBLIC_SESSION_MS, now = () => performance.now(), onTick = () => {}, onExpire = () => {} } = {}) {
  let startedAt = null;
  let expired = false;
  let timer = null;
  const remaining = () => startedAt == null ? durationMs : Math.max(0, durationMs - (now() - startedAt));
  const reconcile = () => {
    if (startedAt == null || expired) return remaining();
    const left = remaining();
    onTick(left);
    if (left <= 0) {
      expired = true;
      if (timer != null) clearTimeout(timer);
      timer = null;
      onExpire();
      return 0;
    }
    timer = setTimeout(reconcile, Math.min(250, Math.max(16, left)));
    return left;
  };
  return {
    start() { if (startedAt != null && !expired) return false; startedAt = now(); expired = false; reconcile(); return true; },
    stop() { if (timer != null) clearTimeout(timer); timer = null; startedAt = null; expired = false; },
    reconcile,
    get started() { return startedAt != null; },
    get expired() { return expired; },
    get remainingMs() { return remaining(); },
  };
}
