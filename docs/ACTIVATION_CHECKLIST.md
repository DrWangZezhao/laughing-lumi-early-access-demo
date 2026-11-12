# Laughing Lumi activation checklist

Complete these steps only after reviewing the final privacy and safeguarding decisions.

## ElevenLabs

- The browser demos use the same public Agent ID serialized in Henri's Unity `SampleScene.unity`; the pinned ElevenLabs SDK connects directly without an API key. Confirm with the Agent owner that public website usage, domain restrictions, quota and audio/event retention are approved before release. If the owner makes the Agent private, use the signed-URL path below instead.
- The browser asks the agent to begin with hands-up, and retries once after a greeting if necessary. After a verified completion event, it asks the agent to praise the player aloud and give the next instruction (wave, then snowflake, sway, and head-touch). Optionally register a client tool named `showMovement` with an `activity` string parameter; supported values are `raise-hand`, `wave`, `hands-up`, `snowflake`, `sway`, and `head-touch`. The browser also recognizes spoken instruction text if the tool is not configured. The tool selects a local detector; only a later verified-completion event is sent back to the agent.
- The optional Supabase `voice-session` function needs server-only `ELEVENLABS_API_KEY` and `ELEVENLABS_PUBLIC_AGENT_ID` to issue signed URLs for a private public Agent. `ELEVENLABS_INTERNAL_AGENT_ID` and `INTERNAL_ALLOWED_EMAILS` are additionally required for privileged internal voice. The open `/team-demo/` never requests the internal scope.
- The deployed `voice-session` currently has legacy JWT verification off only for that function, as approved; its public request returns `503` until server-side provider configuration exists. Do not put provider secrets in `apps/lumi/public/voice-config.js` or activate privileged internal voice without authorization.

## Supabase and internal access

- Set `ALLOWED_ORIGINS` to the exact GitHub Pages origin, `SUPABASE_ANON_KEY` to the project anon key, and use the project `SUPABASE_URL` supplied by Supabase.
- The browser's `/team-demo/` route deliberately has no login gate and uses only the public voice agent. Do not expose the internal agent through that route.
- Set the server-only `INTERNAL_ALLOWED_EMAILS` allowlist. Never copy this list into website JavaScript.
- Deploy the latest migrations and `voice-session`. Verify an allowlisted user can request the internal agent and an unlisted user cannot.

## Google Sheets synchronization

- Confirm the private `Registrations` tab and its existing columns remain team-shared, not public.
- Configure the Apps Script adapter URL and a server-only `GOOGLE_SHEETS_SYNC_SECRET` in Supabase. Set `GOOGLE_SHEETS_ADAPTER_URL` and deploy `sync-sheets`.
- Verify a confirmed Supabase registration creates one outbox row, a successful adapter call marks it synced, and an adapter failure records attempts/backoff for a later retry.

## Privacy and release

- Confirm controller identity, processor disclosures, retention, withdrawal/deletion handling, and child-use safeguards. Set the final `PRIVACY_NOTICE_VERSION` and only then enable `REAL_SIGNUP_ENABLED=true` and `PRIVACY_READY=true` for `signup`.
- Verify that camera video, frames, landmarks, and confidence scores stay local. With TALK on, only a camera-verified “current movement complete” event is sent to ElevenLabs for spoken praise and the next prompt; confirm this disclosure and the provider's audio/event retention settings before public activation.
- Run the real end-to-end checks for registration, duplicate handling, Sheets sync, public 60-second expiry, denied camera/microphone, no-login Team demo, and server-side rejection of unauthenticated internal voice requests. Check deployed `/demo/` and `/team-demo/` routes on desktop and mobile.
