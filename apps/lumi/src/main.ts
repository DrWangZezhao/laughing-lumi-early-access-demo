import './style.css';
import { Conversation, type VoiceConversation } from '@elevenlabs/client';
import { ACTIONS, GUIDED_RAISE_HAND, createActionDetector } from './vision/actions.js';
import { CameraController, type CameraStatus } from './vision/camera.js';
import { createGestureMirror, type MirrorCue } from './vision/gesture-mirror.js';
import { createSessionClock } from './session.js';
import { GUIDED_SEQUENCE as DEFAULT_GUIDED_SEQUENCE, completionEvent } from './guided-game.js';
import { GAME_CONTEXT, gameIntent, spokenAction, movementRequest, createSpeechGate } from './guided-dialogue.js';

const IS_INTERNAL = /\/team-demo\/?$/u.test(window.location.pathname);
const SURVEY_URL = 'https://script.google.com/macros/s/AKfycbzhraBB4vfYdVVjBPNGkVEjB6rZ4o1G1FVc2nlwrHprgm5ZehF2f0isWVlquAwJrT9LlA/exec?src=homepage';
const DEMO_CONFIG = (window as unknown as { LUMI_DEMO_CONFIG?: { publicAgentId?: string; voiceEndpoint?: string } }).LUMI_DEMO_CONFIG ?? {};
const PUBLIC_AGENT_ID = DEMO_CONFIG.publicAgentId?.trim() || '';
const VOICE_ENDPOINT = DEMO_CONFIG.voiceEndpoint?.trim() || '';
const CONNECT_TIMEOUT_MS = 20000;
const QUOTA_MSG = 'Voice unavailable right now. Please try again later.';
const CLOSED_MSG = 'Voice connection closed. Stop and restart the demo to reconnect.';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const el = {
  playButton: $('playButton'), lumiButton: $('lumiButton'), activityWindow: $('activityWindow'), companionWindow: $('companionWindow'),
  welcomePanel: $('welcomePanel'), activityButtons: $('activityButtons'), startDemoButton: $('startDemoButton'), stopDemoButton: $('stopDemoButton'),
  sessionBar: $('sessionBar'), sessionLabel: $('sessionLabel'), countdown: $('countdown'), character: $('character') as HTMLImageElement,
  characterStatus: $('characterStatus'), cameraCard: $('cameraCard'), cameraPreview: $('cameraPreview') as HTMLVideoElement, stopCameraButton: $('stopCameraButton'), cameraStatus: $('cameraStatus'), activityFeedback: $('activityFeedback'),
  activityName: $('activityName'), activityInstructionText: $('activityInstructionText'), activityProgress: $('activityProgress'), manualSuccessButton: $('manualSuccessButton') as HTMLButtonElement,
  playStopButton: $('playStopButton'), playVoiceStatus: $('playVoiceStatus'), voiceActivityLabel: $('voiceActivityLabel'), playTranscript: $('playTranscript'),
  debugBG: $('debugBG'), debugTranscript: $('debugTranscript'), debugInput: $('debugInput') as HTMLFormElement, debugText: $('debugText') as HTMLInputElement, debugHint: $('debugHint'), bottomButtons: $('bottomInteractionButtons'), bottomMic: $('bottomInteractionMicrophone'),
  typeButton: $('typeButton'), stopButton: $('stopButton'), completionDialog: $('completionDialog'), closeCompletionButton: $('closeCompletionButton'), restartDemoButton: $('restartDemoButton'),
};
const show = (node: HTMLElement, visible: boolean) => { node.classList.toggle('hidden', !visible); node.hidden = !visible; };

type ViewMode = 'Play' | 'Lumi';
let viewMode: ViewMode = 'Play';
let trialActive = false;
let trialEnded = false;
type Activity = { id: string; label: string; instruction: string };
// Match the local detector to the supported instruction actually spoken. The
// completion pathway still advances this plan only after detector confirmation.
const GUIDED_SEQUENCE: Activity[] = [...DEFAULT_GUIDED_SEQUENCE];
let currentAction: Activity | null = null;
let actionTimer: number | undefined;
let actionDetector: ReturnType<typeof createActionDetector> | null = null;
let actionArmed = false;
let actionInstructionPlayed = false;
let awaitingGuidedPrompt = false;
let guidedIndex = -1;
let pendingAgentAction: Activity | null = null;
let instructionTimer: number | undefined;
let responseTimer: number | undefined;
let promptKey = '';
let promptAttempts = 0;
let guidedFeedback = '';
const speechGate = createSpeechGate();
const seenMessages = new Set<string>();
let conversation: VoiceConversation | null = null;
let connecting = false;
let voiceMode: 'idle' | 'listening' | 'speaking' = 'idle';
let voiceRequest: AbortController | null = null;
let sessionId = 0;
let quotaExhausted = false;
let hintTimer: number | undefined;
type CharacterState = 'idle' | 'greeting' | 'listening' | 'speaking' | 'moving' | 'learning' | 'celebrating';
let characterState: CharacterState | null = null;
let frameTimer: number | undefined;
const frameImages = new Map<string, HTMLImageElement>();
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
let motionReduced = motionPreference.matches;
const gestureMirror = createGestureMirror();
let mirrorGesture: MirrorCue['gesture'] = 'idle';
const frameSets: Record<CharacterState, { name: string; count: number; period: number }> = {
  idle: { name: 'idle', count: 32, period: 260 },
  greeting: { name: 'wave', count: 32, period: 99 },
  listening: { name: 'idle', count: 32, period: 260 },
  speaking: { name: 'speak', count: 28, period: 129 },
  moving: { name: 'move', count: 16, period: 40 },
  learning: { name: 'idle', count: 32, period: 260 },
  celebrating: { name: 'wave', count: 32, period: 99 },
};

const camera = new CameraController(el.cameraPreview, (landmarks) => {
  if (!trialActive || trialEnded) return;
  const mirror = gestureMirror.update(landmarks);
  mirrorGesture = mirror.gesture;
  applyMirrorTransform(mirror);
  setActivityCharacter(activityCharacterState());
  if (!actionDetector || !currentAction) {
    el.activityFeedback.textContent = awaitingGuidedPrompt ? guidedFeedback || 'Listen to Lumi · getting the movement ready' : landmarks.length ? 'Camera on · choose a movement' : 'No person in frame · move into view';
    return;
  }
  const framingHint = currentAction.id === 'hands-up' && !mirror.wristsVisible
    ? 'Move back so both hands fit in the camera.' : null;
  if (!actionArmed) { el.activityFeedback.textContent = framingHint || 'Listen to Lumi first · camera is waiting'; return; }
  const result = actionDetector.update(landmarks);
  if (result.status === 'camera-unavailable') return;
  el.activityProgress.style.width = `${Math.round(result.progress * 100)}%`;
  el.activityFeedback.textContent = framingHint || (landmarks.length ? 'Camera on · checking locally' : 'No person in frame · move into view');
  if (result.detected) { speechGate.userTurn(); acknowledgeAction(true); watchForMovement(); }
}, (status, message) => updateCameraStatus(status, message));

const clock = createSessionClock({
  onTick: (remaining) => { el.countdown.textContent = formatTime(remaining); },
  onExpire: () => endTrial(true),
});

function formatTime(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function setCharacter(state: CharacterState) {
  if (state === characterState) return;
  const previousMotion = characterState ? frameSets[characterState].name : null;
  characterState = state;
  if (!motionReduced && previousMotion === frameSets[state].name) {
    el.character.className = `character is-${state}`;
    return;
  }
  window.clearInterval(frameTimer);
  const assets: Record<string, string> = { idle: 'lumi-idle.png', greeting: 'lumi-idle.png', listening: 'lumi-idle.png', speaking: 'lumi-idle.png', moving: 'lumi-move.png', learning: 'lumi-idle.png', celebrating: 'lumi-idle.png' };
  el.character.src = `./character/unity/${assets[state]}`;
  el.character.className = `character is-${state}`;
  if (motionReduced) return;
  const sequence = frameSets[state];
  const frames = Array.from({ length: sequence.count }, (_, index) => {
    const url = `./character/unity/frames/${sequence.name}/${String(index).padStart(2, '0')}.png`;
    let image = frameImages.get(url);
    if (!image) { image = new Image(); image.src = url; frameImages.set(url, image); }
    return image;
  });
  let index = 0;
  frameTimer = window.setInterval(() => {
    if (document.hidden) return;
    // Ping-pong a non-looping Unity wave so the arm returns without a pose jump.
    const wave = sequence.name === 'wave';
    const frame = wave && index >= sequence.count ? 2 * sequence.count - index - 2 : index;
    const image = frames[frame];
    if (image.complete && image.naturalWidth) el.character.src = image.src;
    index = (index + 1) % (wave ? 2 * sequence.count - 2 : sequence.count);
  }, sequence.period);
}

function setActivityCharacter(state: CharacterState) {
  if (voiceMode !== 'speaking') setCharacter(state);
}

function applyMirrorTransform(cue?: MirrorCue) {
  el.character.style.setProperty('--mirror-tilt', `${!motionReduced && cue ? cue.tilt : 0}deg`);
  // Six design pixels at most; keep the existing space around the controls.
  el.character.style.setProperty('--mirror-x', String(!motionReduced && cue ? cue.lateral * 6 : 0));
}

function resetGestureMirror() {
  gestureMirror.reset(); mirrorGesture = 'idle'; applyMirrorTransform();
  setActivityCharacter(activityCharacterState());
}

function activityCharacterState(): CharacterState {
  if (camera.active && trialActive && !trialEnded) {
    if (mirrorGesture === 'one-hand-raised') return 'greeting';
    if (mirrorGesture === 'both-hands-raised') return 'moving';
  }
  return currentAction?.id === 'wave' ? 'greeting' : currentAction ? 'moving' : voiceMode === 'listening' ? 'listening' : 'idle';
}

function setVoiceStatus(message: string) { el.playVoiceStatus.textContent = message; el.voiceActivityLabel.textContent = voiceMode === 'speaking' ? 'Lumi is speaking' : connecting ? 'Connecting to Lumi…' : 'Lumi is listening'; }
function isLumiSpeaking() { return voiceMode === 'speaking'; }
function syncVoiceControls() {
  const active = connecting || Boolean(conversation);
  show(el.playStopButton, active);
  show(el.bottomButtons, !active);
  show(el.bottomMic, active);
}

function setToggle(mode: ViewMode) {
  const play = mode === 'Play';
  el.playButton.classList.toggle('on', play); el.lumiButton.classList.toggle('on', !play);
  el.playButton.setAttribute('aria-selected', String(play)); el.lumiButton.setAttribute('aria-selected', String(!play));
}

function openPlayView() {
  viewMode = 'Play'; setToggle('Play'); show(el.activityWindow, true); show(el.companionWindow, false); setCharacter(voiceMode === 'speaking' ? 'speaking' : activityCharacterState());
}

function openLumiView() {
  viewMode = 'Lumi'; setToggle('Lumi'); show(el.activityWindow, false); show(el.companionWindow, true); setCharacter(voiceMode === 'speaking' ? 'speaking' : activityCharacterState());
}

function setTranscript(text: string) { el.debugTranscript.textContent = text; show(el.debugBG, Boolean(text)); el.playTranscript.textContent = text; show(el.playTranscript, Boolean(text)); }
function hint(text: string) { el.debugHint.textContent = text; show(el.debugHint, Boolean(text)); window.clearTimeout(hintTimer); if (text) hintTimer = window.setTimeout(() => show(el.debugHint, false), 5000); }

function updateCameraStatus(status: CameraStatus, message?: string) {
  if (status !== 'ready') resetGestureMirror();
  if (status === 'ready') { show(el.cameraCard, true); el.cameraStatus.textContent = 'Video stays here. Only verified movement completion is sent to Lumi.'; el.activityFeedback.textContent = currentAction ? (actionArmed ? 'Camera on · checking locally' : 'Listen to Lumi first · camera is waiting') : 'Camera on · listening to Lumi'; setActivityCharacter(activityCharacterState()); return; }
  if (status === 'starting') { el.activityFeedback.textContent = 'Starting camera…'; return; }
  show(el.cameraCard, false);
  if (status === 'denied' || status === 'unavailable' || status === 'model-unavailable') { el.activityFeedback.textContent = 'Camera unavailable · manual mode'; hint(message || 'Camera unavailable. Movement is unverified.'); }
  else if (status === 'stopped') el.activityFeedback.textContent = currentAction ? 'Camera off · manual mode' : 'Camera off · choose a movement';
}

function resetActivity() {
  currentAction = null; actionDetector = null; actionArmed = false; actionInstructionPlayed = false; window.clearTimeout(actionTimer);
  awaitingGuidedPrompt = Boolean(conversation && guidedIndex >= 0 && guidedIndex < GUIDED_SEQUENCE.length);
  document.querySelectorAll<HTMLButtonElement>('.act').forEach((button) => button.classList.remove('selected'));
  el.activityName.textContent = 'Ready when you are';
  el.activityInstructionText.textContent = 'Say “I want to play a game”, or choose a movement.';
  el.activityProgress.style.width = '0%'; el.manualSuccessButton.disabled = true;
  el.activityFeedback.textContent = camera.active ? 'Camera on · choose a movement' : 'Camera off · choose a movement';
  el.characterStatus.textContent = 'Lumi is ready to play';
  setActivityCharacter('idle');
}

function activateAction(action: Activity, fromVoice = false) {
  if (!trialActive || trialEnded) return;
  window.clearTimeout(actionTimer); currentAction = action; actionDetector = createActionDetector(action.id); actionArmed = fromVoice ? speechGate.canCheck : voiceMode !== 'speaking';
  actionInstructionPlayed = !fromVoice || speechGate.canCheck;
  document.querySelectorAll<HTMLButtonElement>('.act').forEach((button) => button.classList.toggle('selected', ACTIONS[Number(button.dataset.activity)]?.id === action.id));
  el.activityName.textContent = action.label; el.activityInstructionText.textContent = action.instruction; el.activityProgress.style.width = '0%'; el.manualSuccessButton.disabled = false;
  setActivityCharacter(action.id === 'wave' ? 'greeting' : 'moving'); el.characterStatus.textContent = `Lumi says: ${action.instruction}`; el.activityFeedback.textContent = camera.active ? (actionArmed ? 'Camera on · checking locally' : 'Listen to Lumi first · camera is waiting') : 'Camera off · manual mode';
}

function chooseAction(index: number) {
  if (!trialActive || trialEnded || !ACTIONS[index]) return;
  if (conversation || connecting) { prepareGuidedGame(ACTIONS[index]); scheduleMovementPrompt(); return; }
  awaitingGuidedPrompt = false; guidedIndex = -1; pendingAgentAction = null;
  activateAction(ACTIONS[index]);
}

function acknowledgeAction(verified: boolean) {
  if (!trialActive || trialEnded || !currentAction) return;
  const completed = currentAction;
  currentAction = null; actionDetector = null; actionArmed = false; el.manualSuccessButton.disabled = true;
  setActivityCharacter('celebrating'); el.characterStatus.textContent = verified ? 'Lumi saw it — waiting for her voice!' : 'Nice try! (unverified)'; el.activityFeedback.textContent = verified ? 'Movement detected ✓' : 'Marked complete · unverified';
  window.clearTimeout(actionTimer);
  if (verified && conversation && guidedIndex >= 0 && GUIDED_SEQUENCE[guidedIndex]?.id === completed.id) {
    guidedIndex += 1;
    const next = GUIDED_SEQUENCE[guidedIndex];
    awaitingGuidedPrompt = Boolean(next);
    try {
      // The only vision-derived data sent to ElevenLabs is this completion event.
      // Video, images, landmarks, and confidence scores remain on this device.
      conversation.sendUserMessage(completionEvent(next));
    } catch { hint('Lumi could not receive the completion event. Stop and restart the demo.'); }
    actionTimer = window.setTimeout(() => { if (trialActive && !trialEnded && !currentAction) resetActivity(); }, 10000);
    return;
  }
  actionTimer = window.setTimeout(() => { if (trialActive && !trialEnded) resetActivity(); }, 1800);
}

function beginTrial() {
  if (trialActive && !trialEnded) return;
  if (IS_INTERNAL) {
    trialActive = true; trialEnded = false; el.sessionLabel.textContent = 'TEAM DEMO'; el.countdown.textContent = '—'; show(el.sessionBar, true);
  } else {
    if (clock.started && !clock.expired) return;
    trialActive = true; trialEnded = false; show(el.sessionBar, true); clock.start();
  }
  show(el.welcomePanel, false); show(el.activityButtons, true); resetActivity(); setCharacter('idle');
  // One existing Start Demo gesture starts both permissions/connections. Do not
  // wait for the camera/model before starting voice and unlocking its audio.
  void camera.start(); void startConversation();
}

function endTrial(expired = false) {
  if (!trialActive && !expired) return;
  trialActive = false; trialEnded = expired || trialEnded; endConversation(); camera.stop(); resetActivity(); show(el.sessionBar, false);
  if (!IS_INTERNAL) clock.stop();
  if (expired && !IS_INTERNAL) { setCharacter('greeting'); el.characterStatus.textContent = 'Thank you for playing with Lumi!'; show(el.completionDialog, true); }
  else { show(el.welcomePanel, true); show(el.activityButtons, false); setCharacter('idle'); el.characterStatus.textContent = 'Lumi is ready to play'; }
}

async function requestSignedUrl(signal: AbortSignal): Promise<string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const response = await fetch(VOICE_ENDPOINT, { method: 'POST', headers, body: JSON.stringify({ scope: 'public' }), signal });
  const data = await response.json().catch(() => ({})) as { signedUrl?: string; error?: string };
  if (!response.ok || !data.signedUrl) throw new Error(data.error || 'Voice is not configured yet.');
  return data.signedUrl;
}

function describeFailure(error: unknown): string {
  const name = (error as { name?: string })?.name || ''; const message = error instanceof Error ? error.message : String(error || '');
  if (name === 'NotAllowedError' || /permission denied|not allowed/i.test(message)) return 'Microphone access was denied. You can still use text or movement play.';
  if (name === 'NotFoundError') return 'No microphone was found. You can still use text or movement play.';
  if (/quota/i.test(message)) { quotaExhausted = true; return QUOTA_MSG; }
  if (name === 'TypeError' && /fetch|network/i.test(message)) return 'Voice service is unreachable. Movement play is still available.';
  return message || 'Lumi is not available right now. Please try again later.';
}

function clearPromptTimers() { window.clearTimeout(instructionTimer); window.clearTimeout(responseTimer); }

function prepareGuidedGame(firstAction?: Activity) {
  clearPromptTimers(); guidedIndex = -1; resetActivity();
  GUIDED_SEQUENCE.splice(0, GUIDED_SEQUENCE.length, ...(firstAction ? [firstAction, ...DEFAULT_GUIDED_SEQUENCE.filter((action) => action.id !== firstAction.id)] : DEFAULT_GUIDED_SEQUENCE));
  guidedIndex = 0; awaitingGuidedPrompt = true; pendingAgentAction = null;
  promptKey = ''; promptAttempts = 0; guidedFeedback = ''; speechGate.userTurn();
  el.activityName.textContent = 'Getting the game ready';
  el.activityInstructionText.textContent = 'Listen to Lumi, then show the movement. Your camera checks it here.';
  openPlayView();
}

function clearVoiceGame() {
  clearPromptTimers(); awaitingGuidedPrompt = false; guidedIndex = -1; pendingAgentAction = null;
  guidedFeedback = ''; promptKey = ''; promptAttempts = 0; speechGate.reset(); seenMessages.clear();
  // Camera play remains usable when voice fails or is stopped.
  if (currentAction && actionDetector) { actionDetector.reset(); actionArmed = true; }
}

function updateGameContext(message: string) {
  try { conversation?.sendContextualUpdate(message); }
  catch { hint('Voice could not receive the game context. Stop and restart the demo.'); }
}

function watchForMovement() {
  window.clearTimeout(responseTimer);
  if (!awaitingGuidedPrompt || currentAction) return;
  const mySession = sessionId;
  responseTimer = window.setTimeout(() => { if (mySession === sessionId) scheduleMovementPrompt(); }, 7000);
}

function scheduleMovementPrompt() {
  window.clearTimeout(instructionTimer);
  if (!trialActive || trialEnded || !conversation || !awaitingGuidedPrompt || currentAction || voiceMode === 'speaking') return;
  const expected = pendingAgentAction || GUIDED_SEQUENCE[guidedIndex];
  if (!expected) return;
  const key = `${guidedIndex}:${expected.id}`;
  if (key !== promptKey) { promptKey = key; promptAttempts = 0; }
  if (promptAttempts >= 2) {
    guidedFeedback = 'No movement instruction yet · say “play again” or choose a movement';
    el.activityFeedback.textContent = guidedFeedback;
    return;
  }
  const mySession = sessionId;
  // Wait for a late final transcript before requesting another spoken prompt.
  instructionTimer = window.setTimeout(() => {
    if (mySession !== sessionId || !trialActive || trialEnded || !conversation || !awaitingGuidedPrompt || currentAction || voiceMode === 'speaking') return;
    promptAttempts += 1; speechGate.userTurn();
    try { conversation.sendUserMessage(movementRequest(expected)); watchForMovement(); }
    catch { guidedFeedback = 'Voice could not start the movement · choose a movement to keep playing'; el.activityFeedback.textContent = guidedFeedback; }
  }, 450);
}

function onUserMessage(text: string) {
  if (!trialActive || trialEnded) return;
  speechGate.userTurn();
  const intent = gameIntent(text);
  if (intent === 'stop') {
    clearVoiceGame(); resetActivity();
    updateGameContext('The player stopped the movement game. No movement completion was confirmed. Wait for the player to request another game.');
  } else if (intent) {
    if (intent === 'restart' || guidedIndex < 0 || guidedIndex >= GUIDED_SEQUENCE.length) prepareGuidedGame();
    else { guidedFeedback = ''; promptAttempts = 0; }
    updateGameContext(GAME_CONTEXT);
    scheduleMovementPrompt();
  }
}

function onAgentMessage(text: string, eventId: number) {
  setTranscript(text);
  if (!trialActive || trialEnded || guidedIndex < 0) return;
  const requested = spokenAction(text);
  if (currentAction) {
    if (requested?.id === currentAction.id) {
      speechGate.instruction(eventId);
      if (speechGate.canCheck) { actionInstructionPlayed = true; actionArmed = true; }
      return;
    }
    if (!requested) return;
    if (actionInstructionPlayed) {
      updateGameContext(`The active movement is still ${currentAction.label}. Wait for its completion event before giving another movement.`);
      return;
    }
    // A correction before instruction playback is not a completed round.
  }
  if (!awaitingGuidedPrompt && !currentAction) return;
  if (!requested) { scheduleMovementPrompt(); return; }
  clearPromptTimers(); guidedFeedback = ''; pendingAgentAction = null;
  // A supported spoken instruction is the source of truth, even if the agent
  // says "raise one hand" when the default plan expected both hands.
  GUIDED_SEQUENCE[guidedIndex] = requested;
  awaitingGuidedPrompt = false; speechGate.instruction(eventId);
  activateAction(requested, true); openPlayView();
  updateGameContext(`The active movement is ${requested.label}. Wait for the completion event; do not advance based on conversation alone.`);
}

function onVoiceMode(mode: 'speaking' | 'listening') {
  const wasSpeaking = voiceMode === 'speaking';
  voiceMode = mode; speechGate.mode(mode);
  if (mode === 'speaking') {
    window.clearTimeout(instructionTimer); actionArmed = false;
    setVoiceStatus('Lumi is speaking · you can interrupt'); setCharacter('speaking');
  } else {
    if (wasSpeaking && currentAction && actionDetector) { actionDetector.reset(); actionInstructionPlayed ||= speechGate.canCheck; actionArmed = actionInstructionPlayed; }
    setVoiceStatus('Voice on · listening'); setCharacter(activityCharacterState()); scheduleMovementPrompt();
  }
}

async function startConversation() {
  if (!trialActive || trialEnded) return;
  if (quotaExhausted) { setVoiceStatus(QUOTA_MSG); return; }
  if (conversation || connecting) return;
  if (!PUBLIC_AGENT_ID && !VOICE_ENDPOINT) { const message = 'Voice is not activated yet. Movement play is still available.'; setVoiceStatus(message); hint(message); return; }
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { const message = 'Voice needs a secure page and a microphone-capable browser.'; setVoiceStatus(message); hint(message); return; }
  clearVoiceGame(); prepareGuidedGame();
  connecting = true; const mySession = ++sessionId; const request = new AbortController(); voiceRequest = request; voiceMode = 'listening'; setCharacter('listening'); syncVoiceControls(); setTranscript(''); setVoiceStatus('Connecting to Lumi…');
  // Include signed-URL fetching in the deadline, and dispose of late sessions.
  const timeout = window.setTimeout(() => {
    if (mySession !== sessionId || conversation) return;
    sessionId++; request.abort(); connecting = false; voiceMode = 'idle'; clearVoiceGame(); syncVoiceControls();
    setVoiceStatus('Voice connection timed out · restart the demo to retry'); setActivityCharacter(activityCharacterState());
  }, CONNECT_TIMEOUT_MS);
  try {
    const access = PUBLIC_AGENT_ID ? { agentId: PUBLIC_AGENT_ID } : { signedUrl: await requestSignedUrl(request.signal) };
    if (voiceRequest === request) voiceRequest = null;
    if (mySession !== sessionId || !trialActive || trialEnded) return;
    const starting = Conversation.startSession({ ...access, connectionType: 'websocket', libsampleratePath: new URL('./vendor/libsamplerate.worklet.js', document.baseURI).href,
      clientTools: { showMovement: ({ activity }: { activity?: string }) => {
        if (mySession !== sessionId || !trialActive || trialEnded) return 'The demo has ended.';
        const action = activity === GUIDED_RAISE_HAND.id ? GUIDED_RAISE_HAND : ACTIONS.find((item) => item.id === activity);
        if (!action) return 'Unknown movement.';
        pendingAgentAction = action;
        return 'The movement will be shown after you say the instruction aloud.';
      } },
      onConnect: () => { if (mySession === sessionId) { hint(''); setVoiceStatus(isLumiSpeaking() ? 'Lumi is speaking' : 'Voice on · listening'); setCharacter(isLumiSpeaking() ? 'speaking' : 'listening'); } },
      onMessage: (message) => {
        if (mySession !== sessionId || !trialActive || trialEnded) return;
        const role = message.role || (message.source === 'ai' ? 'agent' : 'user');
        if (Number.isFinite(message.event_id)) {
          const key = `${role}:${message.event_id}`;
          if (seenMessages.has(key)) return;
          seenMessages.add(key);
          if (seenMessages.size > 64) seenMessages.delete(seenMessages.values().next().value!);
        }
        if (role === 'agent') onAgentMessage(message.message, message.event_id); else onUserMessage(message.message);
      },
      onModeChange: ({ mode }) => { if (mySession === sessionId) onVoiceMode(mode); },
      onAudioAlignmentPlayback: ({ event_id }) => { if (mySession === sessionId) speechGate.audio(event_id); },
      onInterruption: () => { if (mySession === sessionId) { speechGate.interrupt(); actionArmed = false; if (currentAction && !actionInstructionPlayed) resetActivity(); } },
      onError: (message) => { if (mySession === sessionId) { const failure = describeFailure(message); setVoiceStatus(failure); hint(failure); } },
      onDisconnect: (details) => { if (mySession !== sessionId) return; sessionId++; conversation = null; connecting = false; voiceMode = 'idle'; clearVoiceGame(); syncVoiceControls(); if (details.reason !== 'user') { const failure = details.reason === 'error' ? describeFailure(details.message) : CLOSED_MSG; setVoiceStatus(failure); hint(failure); } else setVoiceStatus('Voice stopped · camera can stay on'); setActivityCharacter(activityCharacterState()); },
    }) as Promise<VoiceConversation>;
    const connected = await starting;
    if (mySession !== sessionId || !trialActive || trialEnded) { await connected.endSession().catch(() => {}); return; }
    conversation = connected; connecting = false; syncVoiceControls();
    // Keep the SDK microphone open for natural interruption; the SDK's input
    // pipeline provides echo cancellation instead of muting the whole reply.
    updateGameContext(GAME_CONTEXT); scheduleMovementPrompt(); watchForMovement();
  } catch (error) { if (mySession === sessionId) { sessionId++; connecting = false; voiceMode = 'idle'; clearVoiceGame(); syncVoiceControls(); setActivityCharacter(activityCharacterState()); const failure = describeFailure(error); setVoiceStatus(failure); hint(failure); } }
  finally { window.clearTimeout(timeout); if (voiceRequest === request) voiceRequest = null; }
}

function endConversation() { sessionId++; voiceRequest?.abort(); voiceRequest = null; const current = conversation; conversation = null; connecting = false; voiceMode = 'idle'; clearVoiceGame(); if (current) current.endSession().catch(() => {}); syncVoiceControls(); setVoiceStatus('Voice stopped · restart the demo to reconnect'); if (trialActive) setActivityCharacter(activityCharacterState()); }

function sendTextMessage(text: string) { const message = text.trim(); if (!message) return; if (!conversation) { hint('Voice is not connected. Stop and restart the demo to retry.'); return; } try { onUserMessage(message); conversation.sendUserMessage(message); hint(''); } catch { hint('Message not sent. Stop and restart the demo to reconnect.'); } }

el.playButton.addEventListener('click', openPlayView); el.lumiButton.addEventListener('click', openLumiView); el.startDemoButton.addEventListener('click', beginTrial); el.stopDemoButton.addEventListener('click', () => endTrial(false));
document.querySelectorAll<HTMLButtonElement>('.act').forEach((button) => button.addEventListener('click', () => chooseAction(Number(button.dataset.activity))));
el.stopCameraButton.addEventListener('click', () => camera.stop()); el.manualSuccessButton.addEventListener('click', () => acknowledgeAction(false));
el.stopButton.addEventListener('click', endConversation); el.playStopButton.addEventListener('click', endConversation); el.typeButton.addEventListener('click', () => { el.debugInput.hidden = !el.debugInput.hidden; if (!el.debugInput.hidden) el.debugText.focus(); });
el.debugInput.addEventListener('submit', (event) => { event.preventDefault(); sendTextMessage(el.debugText.value); el.debugText.value = ''; });
el.closeCompletionButton.addEventListener('click', () => { show(el.completionDialog, false); show(el.welcomePanel, true); show(el.activityButtons, false); }); el.restartDemoButton.addEventListener('click', () => { show(el.completionDialog, false); beginTrial(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { endConversation(); camera.stop(); } else if (!IS_INTERNAL) clock.reconcile(); });
window.addEventListener('pagehide', () => { endConversation(); camera.dispose(); });
motionPreference.addEventListener('change', (event) => {
  motionReduced = event.matches; resetGestureMirror();
  const state = characterState || 'idle'; characterState = null; setCharacter(state);
});

openPlayView();
if (IS_INTERNAL) {
  $('welcomeTitle').textContent = 'Team Demo — play with Lumi';
  $('trialNote').textContent = 'Start Demo asks for camera and microphone permission. Video stays here; microphone audio goes to the voice service. Team Demo has no time limit.';
}
(window as unknown as { lumi: object }).lumi = { get connected() { return Boolean(conversation); }, get mode() { return viewMode; }, get trialActive() { return trialActive; }, get trialEnded() { return trialEnded; }, get internal() { return IS_INTERNAL; }, startDemo: beginTrial, stopDemo: () => endTrial(false) };
