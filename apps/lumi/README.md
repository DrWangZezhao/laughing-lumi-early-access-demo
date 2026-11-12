# Lumi web app (source of /demo/)

Web port of the Lumi Unity app (Unity project by Henri Tuupanen, `/main` changeset 7).
How the Unity app works and where this version differs: [SOURCE_NOTES.md](SOURCE_NOTES.md).

The demo's five character images in `public/character/unity/` are transparent renders of
the active 3D Lumi prefab in `Assets/Scenes/SampleScene.unity`, not the main website's
2D mascot illustrations. `scripts/unity/LumiPoseExport.cs` is the editor batch export
script; copy it into the Unity project's `Assets/Editor/` and set `LUMI_RENDER_DIR`
before invoking `LumiPoseExport.Run` in Unity 6000.3.26f1.

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
- The two browser routes use the public ElevenLabs agent ID already serialized in Henri's
  Unity scene, with the pinned `@elevenlabs/client` SDK and no login. No provider API key
  is included in the browser. The optional Supabase `voice-session` path remains available
  for a private agent, but its internal scope still requires server-side authorization.
  Camera movement recognition works independently and remains active while voice connects
  or runs. The public agent owner controls its availability, usage and domain settings.
- Movement recognition uses the pinned `@mediapipe/tasks-vision` Pose Landmarker Lite model,
  with locally bundled WASM and model files. Camera frames and landmarks remain in the browser.
  In a guided voice session, a camera-verified action sends only a completion event to the
  public voice agent, which can praise the player and speak the next instruction. Manual
  unverified completion never sends that event. The first rounds are hands-up and wave.
- Voice needs https or localhost (microphone rule); the UI also works from a local file.
