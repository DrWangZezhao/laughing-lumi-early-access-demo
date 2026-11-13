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
- Movement recognition uses the pinned local MediaPipe Pose Landmarker Lite model and
  bundled WASM. Frames, landmarks, visibility/confidence values and mirror cues stay
  on the device. Only a detector-confirmed completion event is sent to voice; device
  camera availability is also supplied as session context. Microphone audio is sent
  to ElevenLabs for the conversation. No new runtime dependencies were added.

## Conversation first, two matching movements

The single existing Start Demo gesture starts camera and microphone together and unlocks
browser audio. There are no separate camera/TALK launch buttons, activity buttons,
manual-completion controls, view tabs or placeholder score/settings buttons. The large
colored activity panel is gone. A small caption area shows Lumi's latest reply, voice
connection state and the current movement. Session stop and camera stop remain available
for privacy. Public sessions still last 60 seconds; Team Demo still has no time limit.
The survey and existing completion flow remain intact. Camera denial leaves conversation
available; microphone denial is explained without claiming a working voice connection.

Session-only context follows the original stored Lumi prompt's warm, curious, child-led
North Pole character and short replies. It does not edit the persistent ElevenLabs agent,
voice/model, prompts in Drive or any server quota/authentication settings. Its flow is:

1. Greet and chat. Connection itself sends no synthetic user request for a movement.
2. When a child says “I want to play game” (or a supported Chinese equivalent), invite
   them into a small adventure, ask if they are ready, then wait.
3. An affirmative answer counts only after the invitation's matching audio has finished.
   Negation, a request to chat, stopping, interruption, or an unplayed invitation cannot
   authorize checking.
4. Recognize only a spoken **wave** or **sway** instruction. The other legacy detectors
   remain unchanged but are not offered by this demo's conversational bridge.
5. Wait for that instruction's own audio playback to finish. Demonstrate wave with the
   existing Unity wave PNG frames and sway with a small body tilt. While speaking, the
   existing speaking frames take priority. Visible player lean takes over the sway;
   absent pose/reduced motion clears tilt. The same existing authoritative detector
   checks the player's attempt locally.
6. A verified completion sends one completion event for praise. Lumi asks before the
   next movement, then returns to conversation after the two rounds. Saying “I did it”
   never verifies an action. The legacy unverified branch still sends no completion event;
   its UI control was removed at the user's request.

Camera mirroring is **gesture-triggered animation with body tilt**, not full motion
capture, 3D skeletal tracking or real-time skeletal retargeting. Even while chatting, a
reliably raised single hand can cue the existing wave frames, and torso lean relative to
hips produces at most ±10° rotation and six design pixels of translation. Two raised
hands are no longer represented as a hands-up animation using unrelated moving frames.
Visual changes require three consecutive frames and lean is smoothed. Pose loss, camera
stop and trial end reset transforms. Reduced motion uses static images with no tilt.
Mirroring never completes an activity. Framing hints explain when hands/torso are missing.

The connection deadline covers signed-URL fetching and SDK startup, and late sessions
are disposed. Recoverable provider rejection/disconnection retries at most twice per
trial (2 and 4 seconds); permission, known quota and authentication errors do not retry.
A startup timeout does not auto-open another session while an uncancellable SDK setup may
still be pending. Persistent failures clear stale game state and show an honest error.
The microphone stays open during replies for the pinned SDK's interruption handling,
echo cancellation and noise suppression. Hiding the page stops media; returning restores
an active session's media after reconciling public expiry.

## Validation and service limitation

Run `npm ci --prefix apps/lumi`, `npm test` and `npm run build` at the repository root.
The unit suite covers interpreter confidence/smoothing, the original detectors, invitation
and audio gates, child consent/negation, unsupported movements and connection error policy.
Browser QA must distinguish synthetic camera/voice fixtures from live-provider tests.
Phone viewport checks are emulation; physical phone/child speech recognition still needs
hands-on validation.

On 13 November 2026, a live test using synthetic microphone/camera devices received
“The AI agent you are trying to reach is not available” on all three attempts, before
any agent response. Therefore this change does **not** establish that the upstream voice
service or its spoken guiding quality has been restored. The current public agent owner
must inspect its availability/configuration and service-side logs; the error alone does
not establish a quota or domain cause. No private API key is available in this repository,
and none is embedded in the browser. Runtime context guides the agent but cannot guarantee
its responses or restore an unavailable service.

SDK references: [callbacks and contextual updates](https://elevenlabs.io/docs/eleven-agents/libraries/java-script),
[optional client-tool configuration](https://elevenlabs.io/docs/eleven-agents/customization/tools/client-tools).
