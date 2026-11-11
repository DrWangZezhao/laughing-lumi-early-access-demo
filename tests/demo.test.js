import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, createActionDetector } from '../apps/lumi/src/vision/actions.js';
import { createSessionClock } from '../apps/lumi/src/session.js';
import { createVoiceHandler } from '../supabase/functions/voice-session/handler.js';
import { createSyncHandler } from '../supabase/functions/sync-sheets/handler.js';

function pose(overrides = {}) {
  const landmarks = Array.from({ length: 33 }, () => ({ x: .5, y: .5, z: 0, visibility: 1 }));
  Object.assign(landmarks[11], { x: .4, y: .4 }, overrides.leftShoulder);
  Object.assign(landmarks[12], { x: .6, y: .4 }, overrides.rightShoulder);
  Object.assign(landmarks[13], { x: .3, y: .4 }, overrides.leftElbow);
  Object.assign(landmarks[14], { x: .7, y: .4 }, overrides.rightElbow);
  Object.assign(landmarks[15], { x: .3, y: .4 }, overrides.leftWrist);
  Object.assign(landmarks[16], { x: .7, y: .4 }, overrides.rightWrist);
  Object.assign(landmarks[23], { x: .43, y: .65 }, overrides.leftHip);
  Object.assign(landmarks[24], { x: .57, y: .65 }, overrides.rightHip);
  Object.assign(landmarks[0], { x: .5, y: .3 }, overrides.nose);
  Object.assign(landmarks[2], { x: .47, y: .28 }, overrides.leftEye);
  Object.assign(landmarks[5], { x: .53, y: .28 }, overrides.rightEye);
  return landmarks;
}

test('all five valid gestures require meaningful temporal or geometric evidence', () => {
  for (const action of ACTIONS) {
    const detector = createActionDetector(action.id);
    if (action.id === 'wave') {
      for (const x of [.22, .52, .22, .52]) detector.update(pose({ leftWrist: { x, y: .18 } }));
    } else if (action.id === 'hands-up') {
      for (let i = 0; i < 7; i++) detector.update(pose({ leftWrist: { x: .4, y: .1 }, rightWrist: { x: .6, y: .1 } }));
    } else if (action.id === 'snowflake') {
      for (let i = 0; i < 7; i++) detector.update(pose({ leftElbow: { x: .18, y: .4 }, rightElbow: { x: .82, y: .4 } }));
    } else if (action.id === 'sway') {
      for (const x of [.43, .57, .43, .57]) detector.update(pose({ leftShoulder: { x: x - .1, y: .4 }, rightShoulder: { x: x + .1, y: .4 } }));
    } else {
      for (let i = 0; i < 7; i++) detector.update(pose({ leftWrist: { x: .46, y: .18 }, rightWrist: { x: .54, y: .18 } }));
    }
    assert.equal(detector.update(pose()).status, 'not-detected');
    detector.reset();
    assert.equal(detector.update().status, 'camera-unavailable');
    assert.equal(detector.update([]).status, 'not-detected');
  }
});

test('wave uses shoulder-relative motion and discards motion history when the hand disappears', () => {
  const detector = createActionDetector('wave');
  const frame = (wristX, shift = 0) => pose({
    leftShoulder: { x: .4 + shift }, rightShoulder: { x: .6 + shift },
    leftWrist: { x: wristX + shift, y: .18 }, rightWrist: { x: .7 + shift },
  });
  for (const shift of [0, .04, .08, .12, .08, .04, 0, -.04, -.08]) {
    assert.equal(detector.update(frame(.2, shift)).detected, false);
  }
  for (const x of [.2, .3, .4, .5, .4, .3, .2]) assert.equal(detector.update(frame(x)).detected, false);
  detector.update([]);
  for (const x of [.2, .3, .4, .5]) assert.equal(detector.update(frame(x)).detected, false);
  let detected = false;
  for (const x of [.4, .3, .2, .3, .4, .5, .4, .3, .2]) detected ||= detector.update(frame(x)).detected;
  assert.equal(detected, true);
});

test('sway requires torso motion relative to hips, not whole-body camera motion', () => {
  const detector = createActionDetector('sway');
  const frame = (torsoShift, cameraShift = 0) => pose({
    leftShoulder: { x: .4 + torsoShift + cameraShift },
    rightShoulder: { x: .6 + torsoShift + cameraShift },
    leftHip: { x: .43 + cameraShift }, rightHip: { x: .57 + cameraShift },
  });
  for (const shift of [0, .04, .08, .12, .08, .04, 0, -.04, -.08]) {
    assert.equal(detector.update(frame(0, shift)).detected, false);
  }
  let detected = false;
  for (const shift of [0, .04, .08, .12, .08, .04, 0, -.04, -.08, -.04, 0, .04, .08]) {
    detected ||= detector.update(frame(shift)).detected;
  }
  assert.equal(detected, true);
});

test('wave detector rejects a stationary raised hand and low-confidence landmarks', () => {
  const detector = createActionDetector('wave');
  for (let i = 0; i < 40; i++) assert.equal(detector.update(pose({ leftWrist: { x: .22, y: .18 } })).detected, false);
  const lowConfidence = pose({ leftWrist: { x: .22, y: .18 } });
  lowConfidence[15].visibility = .1;
  assert.equal(detector.update(lowConfidence).status, 'not-detected');
});

test('public session clock expires from elapsed monotonic time and reconciles after a pause', () => {
  let now = 0; let ticks = 0; let expired = 0;
  const clock = createSessionClock({ durationMs: 60_000, now: () => now, onTick: () => ticks++, onExpire: () => expired++ });
  assert.equal(clock.start(), true); assert.equal(clock.remainingMs, 60_000);
  now = 60_001; assert.equal(clock.reconcile(), 0); assert.equal(clock.expired, true); assert.equal(expired, 1); assert.ok(ticks >= 2);
});

const voiceEnv = { ALLOWED_ORIGINS: 'https://example.test', ELEVENLABS_API_KEY: 'synthetic', ELEVENLABS_PUBLIC_AGENT_ID: 'public-agent', ELEVENLABS_INTERNAL_AGENT_ID: 'internal-agent', SUPABASE_URL: 'https://unit.supabase.co', SUPABASE_ANON_KEY: 'anon', INTERNAL_ALLOWED_EMAILS: 'kirsi@example.test' };
function voiceReq(body, headers = {}) { return new Request('https://unit.test/functions/v1/voice-session', { method: 'POST', headers: { origin: 'https://example.test', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }); }

test('voice session selects public agent server-side and rejects internal bypass attempts', async () => {
  let providerUrl = '';
  const fetcher = async (url) => { providerUrl = url; return Response.json({ signed_url: 'wss://api.elevenlabs.test/session' }); };
  const handler = createVoiceHandler(voiceEnv, fetcher);
  const publicResponse = await handler(voiceReq({ scope: 'public' }));
  assert.equal(publicResponse.status, 200); assert.match(providerUrl, /agent_id=public-agent/);
  assert.equal((await handler(voiceReq({ scope: 'internal' }))).status, 401);
  assert.equal((await handler(voiceReq({ scope: 'internal' }, { authorization: 'Bearer forged' }))).status, 403);
});

test('voice session verifies internal identity before selecting internal agent', async () => {
  const calls = [];
  const fetcher = async (url) => { calls.push(url); if (url.endsWith('/auth/v1/user')) return Response.json({ email: 'kirsi@example.test' }); return Response.json({ signed_url: 'wss://api.elevenlabs.test/internal' }); };
  const response = await createVoiceHandler(voiceEnv, fetcher)(voiceReq({ scope: 'internal' }, { authorization: 'Bearer verified-token' }));
  assert.equal(response.status, 200); assert.match(calls.at(-1), /agent_id=internal-agent/);
});

test('sheet sync retries an adapter failure without losing the outbox record', async () => {
  const env = { SUPABASE_URL: 'https://unit.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service', GOOGLE_SHEETS_ADAPTER_URL: 'https://script.google.test/exec', GOOGLE_SHEETS_SYNC_SECRET: 'sync-secret' };
  const calls = [];
  const row = { record_id: '11111111-1111-4111-8111-111111111111', email: 'adult@example.test', role: 'parent', interested_in_pilot: false, contact_consent: true, consent_timestamp: '2026-11-11T00:00:00Z', privacy_notice_version: 'public-1', preferred_language: 'EN', created_at: '2026-11-11T00:00:00Z', status: 'waitlisted', attempts: 0 };
  const fetcher = async (url, options = {}) => { calls.push({ url, options }); if (url.includes('registration_sheet_outbox?select')) return Response.json([row]); if (url === env.GOOGLE_SHEETS_ADAPTER_URL) return new Response('failed', { status: 500 }); return new Response(null, { status: 204 }); };
  const response = await createSyncHandler(env, fetcher, () => Date.parse('2026-11-11T00:00:00Z'))(new Request('https://unit.test', { method: 'POST', headers: { 'x-sync-secret': 'sync-secret' } }));
  assert.deepEqual(await response.json(), { processed: 1, synced: 0, failed: 1 });
  const retry = calls.at(-1); assert.match(retry.url, /registration_sheet_outbox\?record_id=/); assert.match(retry.options.body, /next_attempt_at/); assert.match(retry.options.body, /attempts/);
});
