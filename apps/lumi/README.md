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
  Camera and voice start together from the existing Start Demo button. Camera processing
  continues while voice connects or if voice fails. The public agent owner controls voice
  availability, usage and domain settings.
- Movement recognition uses the pinned `@mediapipe/tasks-vision` Pose Landmarker Lite model,
  with locally bundled WASM and model files. Camera frames and landmarks remain in the browser.
  In a guided voice session, a camera-verified action sends only a completion event to the
  public voice agent, which can praise the player and speak the next instruction. Manual
  unverified completion never sends that event. The default first rounds are hands-up and
  wave; if Lumi speaks another supported instruction, its matching detector is selected.
- Camera mirroring is **gesture-triggered animation with body tilt**, not full motion capture,
  3D skeletal tracking, or real-time skeletal retargeting. With the camera on, even before
  choosing an activity, one raised hand triggers the existing Unity wave frames and two
  raised hands trigger the existing move frames as an approximation. Torso lean relative
  to the hips adds at most ±10° tilt and six design pixels of horizontal movement,
  mirrored to match the camera preview. These cues do not verify activity completion.
- Visual gesture changes require three consecutive frames and lean is smoothed. Missing
  or uncertain shoulders reset the mirror; hips are required for tilt, and wrist visibility
  is checked for raised-hand cues. Stopping the camera or trial clears the transform.
  Reduced-motion preferences use static character images without body tilt or translation.
  Hands Up asks the player to move back when both wrists are not reliably in frame.
  The existing action detector remains authoritative. The mirroring cues are separate
  from activity verification and never advance the voice game themselves.
- Mirroring runs entirely on device with no new runtime dependencies. It sends no camera
  frames, landmarks, confidence scores, or visual cue data to a server. Run `npm test`
  at the repository root for deterministic interpreter, smoothing, and detector checks.
- Voice needs https or localhost (microphone rule); the UI also works from a local file.

## One start and a connected voice/movement game

Start Demo now requests camera and microphone access and starts both connections. There
are no separate Enable Camera or TALK start buttons, and no new buttons were added. The
existing camera/voice/session stop controls remain available. Both public and Team Demo
wait for this one user gesture so browsers can unlock audio; the public clock still lasts
60 seconds and Team Demo still has no time limit. Permission denial leaves manual,
explicitly unverified play available. To retry a stopped or failed connection, stop and
restart the demo after adjusting browser permissions.

The browser now handles user transcripts such as “I want to play game”, “play again”,
and “stop the game”, plus Chinese equivalents. An existing activity button also requests
a spoken instruction when voice is connected. A small local coordinator follows this flow:

1. Prepare a game or requested activity and ask Lumi for one short supported instruction.
2. Match the actual instruction to an existing detector, including one-hand raising.
   Praise, negated instructions, and unsupported movements do not start detectors.
3. Match the instruction's event ID to the SDK audio playback event and wait for its
   speaking-to-listening transition before checking the movement. Transcripts may arrive
   before or after audio; duplicate messages/listening events do not restart progress.
4. Only `createActionDetector` confirmation calls the existing verified-completion path.
   It sends one existing completion event to voice, which requests praise and the next step.
   A spoken “I did it” or manual completion never sends a verified-completion event.

Fixed game context is sent with `sendContextualUpdate`, and prompt recovery uses at most
two explicit requests per pending instruction. This prevents an endless prompt loop when
the agent only says “let's play” or does not give a usable movement. The microphone stays
open during replies so the child can interrupt; the pinned SDK already requests echo
cancellation and noise suppression. Interrupted instruction playback does not arm checking.
The 20-second connection deadline now also covers signed-URL fetching, and late sessions
are disposed. Stopping/restarting ignores callbacks from the old session.

No persistent ElevenLabs agent settings, voice model, or server security/quota settings
were changed. `showMovement` remains an optional client tool; it still requires matching
configuration in ElevenLabs if used. Explicit spoken instructions also work without it.
The coordinator sends only fixed game/instruction context and the existing verified
completion event; video, pose landmarks, visibility/confidence, and mirror cues stay local.
The remote agent's response quality, speech recognition, latency, and availability still
require live testing. Runtime context is guidance to the agent, not a guarantee about its
spoken responses.

SDK behavior references: [callbacks and contextual updates](https://elevenlabs.io/docs/eleven-agents/libraries/java-script),
[optional client-tool configuration](https://elevenlabs.io/docs/eleven-agents/customization/tools/client-tools).
