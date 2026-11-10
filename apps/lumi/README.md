# Lumi web app (source of /demo/)

Web port of the Lumi Unity app (Unity project by Henri Tuupanen, `/main` changeset 7).
How the Unity app works and where this version differs: [SOURCE_NOTES.md](SOURCE_NOTES.md).

The built files are committed in `/demo/` so the site's normal build (`npm run build` at the
repo root, which copies `demo/` into `dist/`) needs no extra step in CI.

## Rebuild /demo/ after changing this folder

```
cd apps/lumi
npm ci
npm run build      # type-checks, builds into ../../demo/, inlines JS+CSS into demo/index.html
```

Then commit `apps/lumi/` and `demo/` together. Versions are pinned in `package-lock.json`.

- `npm run dev` serves the app at http://localhost:5173 for development.
- Voice uses the public ElevenLabs agent `agent_9301kcgfjb9dej59tnqs95024zq1` through the
  `@elevenlabs/client` SDK, bundled locally. No API key is used or stored.
- Voice needs https or localhost (microphone rule); the UI also works from a local file.
