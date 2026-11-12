# Laughing Lumi early access

Approved V6 design, five original mascot poses, five languages and pointer/touch dragging. Plain HTML/CSS/JavaScript; no production dependencies or paid service required.

- Website: https://DrWangZezhao.github.io/laughing-lumi-early-access-demo/
- Real signup: guarded by server-side activation and privacy gates. The public form submits only to the Supabase Edge Function when those gates are explicitly enabled.
- Demo routes: `demo/` is the public 60-second experience; `team-demo/` opens without a login gate or time limit. Both request the public voice agent. The internal voice agent remains server-authorized and is not exposed by either route.
- Supabase: source includes registration, optional signed voice-session issuance for private agents, and a durable Google Sheets outbox; the public demo currently uses the same public agent ID as Unity.

## Preview and checks

Use Node 22+ and Python 3:

```sh
npm test
npm run build
python3 -m http.server 8765 --directory dist
```

Open http://localhost:8765. No npm install is needed for production or the core tests.

## Files

`index.html`, `css/styles.css`, `js/lumi.js`: original V6 content/animations, with narrow-screen and bubble-boundary fixes. `apps/lumi/`: the shared Vite demo, Unity-model pose renders, MediaPipe movement detectors, local camera pipeline, and ElevenLabs client using the public Unity agent. `assets/`: original logo and five PNG poses, preserved for the main website. `js/signup.js` / `signup-core.js`: registration UX. `supabase/`: guarded registration, optional private voice authorization, and Sheet outbox functions. `docs/ACTIVATION_CHECKLIST.md`: required manual activation and verification steps.

## Updating with Codex

Ask Codex to open this repository, describe the change, preserve the approved V6 design and keep the future demo redirect disabled unless explicitly activating it. Review changes, run `npm test` and browser checks, then push approved changes to `main`. The Pages Action tests, packages only public website files and deploys automatically. Check its successful run and the public HTTPS page. Revert a bad commit on `main` to roll back; Actions redeploys that version.

The backend deploys separately using the manual Supabase workflow. Editing the website does not automatically apply database migrations or change server secrets. Never add signup exports, credentials or real test data to this public repository.

See [setup and activation](docs/SETUP.md), [administrator guide](docs/ADMIN.md), [verification results](docs/VERIFICATION.md) and the [privacy template](docs/PRIVACY-TEMPLATE.html).
