# Laughing Lumi early access

Approved V6 design, five original mascot poses, five languages and pointer/touch dragging. Plain HTML/CSS/JavaScript; no production dependencies or paid service required.

- Website: https://DrWangZezhao.github.io/laughing-lumi-early-access-demo/
- Real signup: **OFF**. Email entry and submission are disabled; the page says registration opens soon.
- Demo redirect: **OFF**. `demo/index.html` reserves the future route.
- Supabase: source prepared, **not provisioned or verified against a live project**.

## Preview and checks

Use Node 22+ and Python 3:

```sh
npm test
npm run build
python3 -m http.server 8765 --directory dist
```

Open http://localhost:8765. No npm install is needed for production or the core tests.

## Files

`index.html`, `css/styles.css`, `js/lumi.js`: original V6 content/animations, with narrow-screen and bubble-boundary fixes. `assets/`: losslessly extracted original logo and five PNG poses. `js/signup.js` / `signup-core.js`: submission UX. `js/config.js`: public activation flags. `privacy/`: current privacy information. `docs/PRIVACY-TEMPLATE.html`: notice template to complete before collection. `supabase/`: SQL and Edge Function source. `docs/`: deployment, admin and verification guidance.

## Updating with Codex

Ask Codex to open this repository, describe the change, preserve the approved V6 design and keep signup/redirect disabled unless explicitly activating them. Review changes, run `npm test` and browser checks, then push approved changes to `main`. The Pages Action tests, packages only public website files and deploys automatically. Check its successful run and the public HTTPS page. Revert a bad commit on `main` to roll back; Actions redeploys that version.

The backend deploys separately using the manual Supabase workflow. Editing the website does not automatically apply database migrations or change server secrets. Never add signup exports, credentials or real test data to this public repository.

See [setup and activation](docs/SETUP.md), [administrator guide](docs/ADMIN.md), [verification results](docs/VERIFICATION.md) and the [privacy template](docs/PRIVACY-TEMPLATE.html).
