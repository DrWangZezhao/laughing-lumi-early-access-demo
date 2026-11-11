# Laughing Lumi activation checklist

Complete these steps only after reviewing the final privacy and safeguarding decisions.

## ElevenLabs

- Create or select two Conversational AI agents: `ELEVENLABS_PUBLIC_AGENT_ID` for the public trial and `ELEVENLABS_INTERNAL_AGENT_ID` for approved presenters.
- Enable signed-URL authentication on both agents. Configure the public agent provider duration to 60 seconds and the internal agent to the approved presenter duration.
- In Supabase Edge Function secrets, set `ELEVENLABS_API_KEY`, `ELEVENLABS_PUBLIC_AGENT_ID`, `ELEVENLABS_INTERNAL_AGENT_ID`, and `VOICE_RATE_LIMIT_PER_MINUTE`.
- Deploy `voice-session`, then verify that a public request receives a temporary signed URL and an unauthenticated internal request receives `401`.
- Only after that check succeeds, set the public `voiceEndpoint` in `apps/lumi/public/voice-config.js` to the deployed HTTPS `voice-session` URL, rebuild Pages, and verify a real microphone conversation while camera-based movement checking remains active. A blank endpoint intentionally reports voice as inactive; never substitute a fabricated URL or expose provider secrets in this file.

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
- Verify that camera video, frames, landmarks, and inferred actions stay local; explain that voice audio is streamed to ElevenLabs when TALK is used and confirm provider retention settings.
- Run the real end-to-end checks for registration, duplicate handling, Sheets sync, public 60-second expiry, denied camera/microphone, no-login Team demo, and server-side rejection of unauthenticated internal voice requests. Check deployed `/demo/` and `/team-demo/` routes on desktop and mobile.
