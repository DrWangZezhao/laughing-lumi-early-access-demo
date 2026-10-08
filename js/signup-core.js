export function realSignupReady(c) {
  try {
    const u = new URL(c.SIGNUP_ENDPOINT);
    return c.REAL_SIGNUP_ENABLED === true && c.PRIVACY_READY === true &&
      !!c.PRIVACY_NOTICE_VERSION && !c.PRIVACY_NOTICE_VERSION.startsWith('draft') &&
      u.protocol === 'https:' && u.pathname.endsWith('/functions/v1/signup');
  } catch { return false; }
}
export function redirectDestination(c, base) {
  if (!c.DEMO_REDIRECT_ENABLED) return null;
  const u = new URL(c.DEMO_REDIRECT_URL, base);
  if (u.username || u.password || u.search || u.hash || u.protocol !== 'https:') throw Error('Invalid demo destination');
  if (u.origin !== new URL(base).origin && !c.TRUSTED_DEMO_ORIGINS.includes(u.origin)) throw Error('Untrusted demo destination');
  return u.href;
}
export async function sendSignup(c, data, fetcher = fetch) {
  if (!realSignupReady(c)) throw Error('Signup unavailable');
  const response = await fetcher(c.SIGNUP_ENDPOINT, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data), credentials: 'omit', referrerPolicy: 'no-referrer',
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (!response.ok || result.stored !== true) throw Error('Storage not confirmed');
  return result;
}
