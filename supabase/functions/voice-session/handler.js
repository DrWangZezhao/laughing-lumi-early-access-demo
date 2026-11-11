const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin' };

function response(status, body, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...jsonHeaders, ...extra } });
}

function allowedOrigins(env) {
  return (env.ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean);
}

function allowedEmails(env) {
  return new Set((env.INTERNAL_ALLOWED_EMAILS || '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean));
}

export function createVoiceHandler(env, fetcher = fetch, now = () => Date.now()) {
  const requests = new Map();
  const limit = Math.max(1, Number(env.VOICE_RATE_LIMIT_PER_MINUTE || 8));
  return async (request) => {
    const origin = request.headers.get('origin');
    const origins = allowedOrigins(env);
    if (!origin || !origins.includes(origin)) return response(403, { error: 'Origin not allowed' });
    const cors = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, content-type' };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...jsonHeaders, ...cors } });
    if (request.method !== 'POST') return response(405, { error: 'Method not allowed' }, cors);
    if (!env.ELEVENLABS_API_KEY || !env.ELEVENLABS_PUBLIC_AGENT_ID || !env.ELEVENLABS_INTERNAL_AGENT_ID || !env.SUPABASE_URL) return response(503, { error: 'Voice is not configured' }, cors);

    const key = origin;
    const windowStart = now() - 60_000;
    const recent = (requests.get(key) || []).filter((stamp) => stamp >= windowStart);
    if (recent.length >= limit) return response(429, { error: 'Please try again shortly' }, { ...cors, 'Retry-After': '60' });
    recent.push(now()); requests.set(key, recent);

    let body;
    try { body = await request.json(); } catch { return response(400, { error: 'Invalid JSON' }, cors); }
    const scope = body?.scope === 'internal' ? 'internal' : body?.scope === 'public' ? 'public' : null;
    if (!scope) return response(400, { error: 'Invalid session scope' }, cors);

    if (scope === 'internal') {
      const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
      if (!token || !env.SUPABASE_ANON_KEY) return response(401, { error: 'Internal sign-in required' }, cors);
      try {
        const userResponse = await fetcher(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
        if (!userResponse.ok) return response(401, { error: 'Internal sign-in required' }, cors);
        const user = await userResponse.json();
        if (!allowedEmails(env).has(String(user.email || '').trim().toLowerCase())) return response(403, { error: 'Internal access is not approved' }, cors);
      } catch { return response(401, { error: 'Internal sign-in could not be verified' }, cors); }
    }

    const agentId = scope === 'internal' ? env.ELEVENLABS_INTERNAL_AGENT_ID : env.ELEVENLABS_PUBLIC_AGENT_ID;
    try {
      const signed = await fetcher(`https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${encodeURIComponent(agentId)}`, {
        headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, Accept: 'application/json' }, signal: AbortSignal.timeout(10000),
      });
      if (!signed.ok) return response(503, { error: 'Voice provider unavailable' }, cors);
      const data = await signed.json();
      if (typeof data.signed_url !== 'string' || !data.signed_url.startsWith('wss://')) return response(503, { error: 'Voice provider unavailable' }, cors);
      return response(200, { signedUrl: data.signed_url, scope }, cors);
    } catch { return response(503, { error: 'Voice provider unavailable' }, cors); }
  };
}
