# Lumi Unity project: source notes

Source: Unity Version Control, repository `Lumi/Lumi`, branch `/main`, changeset 7.
Unity 6000.3.26f1 (de8167e7440c). One scene: `Assets/Scenes/SampleScene.unity`.
Files read: the 9 C# scripts, `SampleScene.unity` (YAML), `Packages/manifest.json`,
`ProjectSettings/ProjectVersion.txt`, and the 2D art (PNG/SVG). The 3D Lumi model
(the prefab under `CharacterBase`), its Animator, the audio clips and the `.meta`
files were not downloaded, so sprite GUIDs in the scene were matched to art files by
file name, colour and size, not by GUID.

## What the app is

A voice companion for children. The child taps TALK, the microphone is streamed to an
ElevenLabs Conversational AI agent over a WebSocket, the agent's speech is played
back, and a 3D Lumi character stands in a winter scene. A second view (PLAY) lists four
activities. Most activity logic is still stubbed out in cs:7.

## Scene layout (UICanvas, Screen Space Overlay)

CanvasScaler: Scale With Screen Size, reference 1920x1080, match width (0).
The positions are clearly authored for an iPad-portrait screen (about 1668x2388, i.e.
2x the 834x1194 Figma mockups), so 1 scene unit = 0.5 mockup px.

Hierarchy and initial active state (`[on]`/`[off]` = `m_IsActive`):

- `Color-DarkBlue` [off] #1B74CF, `Color-LightBlue` [off] #DBE4FF, `Color-ActivityBorder` [off] #76ACE2 (colour swatches only)
- `TempMainView` [off] old Wave/Talk test buttons
- `Background` [on] -> `BorderImage`: light-blue frame (`Background border SVG`, 834x1194 with a rounded transparent window). The 3D camera view shows through the window.
- `GuideImage` [off]: 30% alpha mockup overlay used for alignment
- `TopBar` [on]
  - `LogoImage` 160x160, top-left (58, -36)
  - `NameImage` 384x160 "Laughing Lumi" letters (preserve aspect)
  - `NameText` [off] "Laughing Lumi"
  - `ViewButtons` 556x120 top-centre, component `UIModeToggle`
    - `PlayButton` 262x104 text "PLAY" (56), starts dark blue with white text -> `UIModeToggle.PlayMode()`
    - `LumiButton` 262x104 text "LUMI" (56), starts white with blue text -> `UIModeToggle.LumiMode()`
  - `ScoresButton` 100x100 top-right (-188, -68), trophy icon, **no onClick**
  - `SettingsButton` 100x100 top-right (-60, -68), gear icon, **no onClick**
- `ActivityWindow` [on], component `UIActivityView` (editor id `UIActivityWindow`)
  - `ThoughtBubbleImage` [off] 320x320 with a camera icon
  - `BottomInteractionActivity`
    - `ActivityButtonsBaseImage` [on] (blue bottom panel, = `activityButtons`)
      - `ActivityButton-1` 725x238 -> `SelectActivity(0)` name **MOVE** (#D09100), text "Show Lumi how to greet new friends by waving"
      - `ActivityButton-2` -> `SelectActivity(1)` **LISTEN** (#59B3B7) "Listen to what Lumi knows about snow"
      - `ActivityButton-3` -> `SelectActivity(2)` **CREATE** (#9E42B7) "Draw a snowflake with Lumi"
      - `ActivityButton-4` -> `SelectActivity(3)` **DO** (#AABD00) "Take Lumi outdoors"
      Each: coloured wide base, white 238x238 icon square, 128px colour icon, 44pt name, 40pt white text.
    - `ChosenActivityBaseImage` [off] (= `activityInstruction`)
      - `ActivityInstruction` 1470x238 -> `PlayActivityInstructions()`; icon SHOW (#1B74CF), text "Activity instruction text. Show Lumi how to greet new friends by waving"
      - `StartActivityButton` 292x292 round, camera icon -> `StartActivity()`
  - `ActivityHappening` (empty)
- `AICompanionWindow` [off], component `UICharacterView` (editor id `UICharacterWindow`), AudioSource for mic sound effects
  - `Debug-BG` [on] 1600x400 at (0, -400) from screen centre, black 50% alpha
    - `Debug-Transcript` TMP 40pt white, top-left (= `debugTranscript`)
  - `BottomInteractionButtons` [on] (= `bottomInteractionButtons`)
    - `TalkButton` 420x420 round, bottom +140, mic icon, "TALK" (84) -> `UICharacterView.StartConversation()`
    - `TypeButton` 260x170 bottom-left, keyboard icon, "TYPE" (38), **no onClick**
  - `BottomInteractionMicrophone` [on in scene, hidden by OpenView] (= `microphoneListening`)
    - `BaseImage` blue panel
    - `TalkButton` 268x268 round, mic icon -> `UICharacterView.EndConversation()`
    - `LumiText` "LUMI IS LISTENING..." (56), `StopTalkingText` "STOP TALKING" (38)
- `DebugCanvas` -> `Button` "Wave" at (761, 1090), outside the visible area -> `CharacterAnimator.AnimateWave()`
- `ElevenLabsClient` [on]: `ElevenLabsConvAIClient` + AudioSource. Serialized values:
  `agentId: agent_9301kcgfjb9dej59tnqs95024zq1`, `apiKey:` (empty), `sampleRate: 16000`,
  `chunkIntervalSeconds: 0.25`, `unmuteDelaySeconds: 0.4`, `preventSpeakerFeedback: 1`,
  `showDebugTextInput: 1`, `transcriptFileName:` (empty)
- `CharacterBase` [on]: `CharacterAnimator` + AudioSource + the 3D Lumi prefab instance
- `Main Camera`, `Directional Light`, `Global Volume` (URP), `EventSystem`, `Plane` [off]

Button transitions: Activity buttons, PLAY/LUMI and the instruction bar use no
transition; TALK, TYPE, Scores, Settings, Start use Color Tint (pressed = 0.784 grey).

## Scripts

**UIManager** (on UICanvas). `OpenPlayView()`: ActivityWindow on, AICompanionWindow
off, `activityView.OpenView()`, `characterView.CloseView()`. `OpenLumiView()`: the
reverse. `OpenScores()` and `OpenSettings()` are empty and not wired to any button.

**UIModeToggle** (on ViewButtons). `viewMode` starts as Play. `PlayMode()`/`LumiMode()`
return early if already in that mode, swap the dark-blue/white colours of the two
buttons and their text, then call UIManager.

**UIActivityView**. Enum `Show=0, Listen=1, Draw=2, Do=3`. `OpenView()` shows the four
buttons and hides the instruction panel. `SelectActivity(int)`: `Show` (and default)
hides the buttons and shows the instruction panel; `Listen`, `Draw`, `Do` are empty
cases, so buttons 2-4 do nothing. `CloseView()`, `PlayActivityInstructions()` and
`StartActivity()` are empty. There is no back button: the panel resets only when
switching LUMI -> PLAY. Note the enum names (Show/Listen/Draw/Do, as in the mockup)
differ from the button labels in the scene (MOVE/LISTEN/CREATE/DO).

**UICharacterView** (on AICompanionWindow). `OnEnable()` clears the transcript text.
`OpenView()`: bottom buttons on, listening panel off. `CloseView()`:
`aiClient.EndConversation()`. `StartConversation()`: plays `startMicEffect`, calls
`aiClient.StartConversation(AgentTranscript)`. `EndConversation()`: plays
`endMicEffect`, ends the session. `AgentTranscript(text)` sets `Debug-Transcript`.
Nothing in cs:7 switches to the `BottomInteractionMicrophone` ("LUMI IS LISTENING...")
panel; it exists in the scene and in the Figma mockup but is never activated by code.

**ElevenLabsConvAIClient** (websocket-sharp + Newtonsoft.Json).
- Connects to `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=<agentId>`
  with TLS 1.2 forced. No auth (the `xi-api-key` header code is commented out), so the
  agent must be public. Does not send `conversation_initiation_client_data`.
- `StartConversation()` is ignored if a socket is already open/connecting; refuses with
  the quota message after a `quota_exceeded` close.
- Microphone: `Microphone.Start(devices[0], loop, 10 s, 16000 Hz)`; every 0.25 s reads
  new samples, converts float -> PCM16 little-endian mono, base64, sends
  `{"user_audio_chunk": "<b64>"}`. While agent audio is pending or less than 0.4 s after
  it ended, the chunk is zeroed (silence still sent) to avoid echo.
- Text: `SendTextMessage()` sends `{"type":"user_message","text":...}` only if connected
  (otherwise logs "Can't send text: not connected."). An IMGUI text field + "Send"
  button (32px high, 10px margins) is drawn across the bottom of the screen on every
  view because `showDebugTextInput` is on.
- Server messages handled:
  - `audio` -> `..audio_base_64` decoded as PCM16 mono, played at `sampleRate` (16 kHz)
    through `PcmPlaybackBuffer` (30 s ring buffer, 150 ms prebuffer, streaming AudioClip)
  - `ping` -> replies `{"type":"pong","event_id":<id>}`
  - `user_transcript` -> logged as user
  - `agent_response` -> logged as agent and passed to the UI callback (shown in `Debug-Transcript`; only the latest agent line is visible)
  - `conversation_initiation_metadata` -> logged
  - `interruption` -> clears the playback buffer
  - anything else (e.g. `vad_score`, `internal_tentative_agent_response`, `agent_chat_response_part`) ignored
- On close: if the reason contains `quota_exceeded`, shows "Voice unavailable:
  ElevenLabs credits exhausted. After credits are restored, restart Play mode." and
  blocks further attempts; otherwise "Voice connection closed. Tap TALK to reconnect."
- Transcript-to-JSONL file writing exists but is commented out.

**PcmPlaybackBuffer**. Thread-safe float ring buffer fed with PCM16; inserts the
prebuffer silence after every underrun; counts underruns/overflow for a debug log.

**CharacterAnimator** (on CharacterBase). `AnimateWave()` sets Animator trigger
"Wave" and plays the `lumiGreet` clip. Only wired to the off-screen debug Wave button.

**MicrophoneListener**, **UIActivityButton**: not used in the scene.
MicrophoneListener hard-codes the device "Microphone (Logi C270 HD WebCam)" and reads
0.5 s chunks; it is an older capture path superseded by ElevenLabsConvAIClient.
UIActivityButton is an empty MonoBehaviour.

## Packages of note (manifest.json)

URP 17.3.0, Input System 1.20.0, Newtonsoft JSON 3.2.2, Vector Graphics (SVG import),
`com.cdm.figma` Figma importer 2.0.0, Toon Shader 0.14.1-preview, Recorder.
websocket-sharp is not a UPM package, so it must be a DLL under Assets/ (not downloaded).

## Platform notes

- WebGL: Unity's `Microphone` class does not exist in WebGL builds, and websocket-sharp
  uses .NET sockets that WebGL cannot use. A direct WebGL build would not have voice.
- iOS/macOS: Microphone and websocket-sharp work; needs a microphone usage description.

## Live check of the agent (11 Nov 2026)

- 00:03 CET: two raw WebSocket connections were closed by the server with code 3000
  "The AI agent you are trying to reach is not available."
- From 00:08 CET onwards: the same URL (no auth, as in the Unity code) returned
  `conversation_initiation_metadata`, audio and `agent_response`; the browser SDK
  session connected, the agent greeted ("Hi! I'm Lumi. What's your name?") and
  answered a typed `user_message`. The earlier refusal looks temporary; cause unknown.
