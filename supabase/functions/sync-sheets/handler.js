function headers() { return { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }; }
function reply(status, body) { return new Response(JSON.stringify(body), { status, headers: headers() }); }

export function createSyncHandler(env, fetcher = fetch, now = () => Date.now()) {
  return async (request) => {
    if (request.method !== 'POST' || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.GOOGLE_SHEETS_ADAPTER_URL || !env.GOOGLE_SHEETS_SYNC_SECRET) return reply(503, { error: 'Sheet sync is not configured' });
    if (request.headers.get('x-sync-secret') !== env.GOOGLE_SHEETS_SYNC_SECRET) return reply(401, { error: 'Unauthorized' });
    const baseHeaders = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
    try {
      const pendingResponse = await fetcher(`${env.SUPABASE_URL}/rest/v1/registration_sheet_outbox?select=*&synced_at=is.null&next_attempt_at=lte.${encodeURIComponent(new Date(now()).toISOString())}&order=next_attempt_at.asc&limit=20`, { headers: baseHeaders });
      if (!pendingResponse.ok) return reply(503, { error: 'Outbox unavailable' });
      const pending = await pendingResponse.json(); let synced = 0; let failed = 0;
      for (const row of pending) {
        const payload = { id: row.record_id, email: row.email, role: row.role, interested_in_pilot: row.interested_in_pilot, contact_consent: row.contact_consent, consent_timestamp: row.consent_timestamp, privacy_notice_version: row.privacy_notice_version, preferred_language: row.preferred_language, created_at: row.created_at, status: row.status };
        try {
          const sheet = await fetcher(env.GOOGLE_SHEETS_ADAPTER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-adapter-secret': env.GOOGLE_SHEETS_SYNC_SECRET }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10000) });
          if (!sheet.ok) throw new Error(`adapter_${sheet.status}`);
          const patch = await fetcher(`${env.SUPABASE_URL}/rest/v1/registration_sheet_outbox?record_id=eq.${encodeURIComponent(row.record_id)}`, { method: 'PATCH', headers: { ...baseHeaders, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ synced_at: new Date(now()).toISOString(), last_error: null, updated_at: new Date(now()).toISOString() }) });
          if (!patch.ok) throw new Error('outbox_update_failed');
          synced++;
        } catch (error) {
          failed++;
          const attempts = Number(row.attempts || 0) + 1;
          await fetcher(`${env.SUPABASE_URL}/rest/v1/registration_sheet_outbox?record_id=eq.${encodeURIComponent(row.record_id)}`, { method: 'PATCH', headers: { ...baseHeaders, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ attempts, next_attempt_at: new Date(now() + Math.min(86_400_000, 60_000 * (2 ** Math.min(attempts, 10)))).toISOString(), last_error: String(error?.message || 'sync_failed').slice(0, 200), updated_at: new Date(now()).toISOString() }) });
        }
      }
      return reply(200, { processed: pending.length, synced, failed });
    } catch { return reply(503, { error: 'Sheet sync unavailable' }); }
  };
}
