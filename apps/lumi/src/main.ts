import './style.css';
import { Conversation, type VoiceConversation } from '@elevenlabs/client';
import { createActionDetector } from './vision/actions.js';
import { CameraController, type CameraStatus } from './vision/camera.js';
import { createGestureMirror, type MirrorCue } from './vision/gesture-mirror.js';
import { createSessionClock } from './session.js';
import { GUIDED_SEQUENCE as DEFAULT_GUIDED_SEQUENCE, completionEvent } from './guided-game.js';
import { GAME_CONTEXT, createPlayGuide, readyInvitation, spokenAction, createSpeechGate } from './guided-dialogue.js';
import { createLocalMovementDetector } from './vision/local-movements.js';
import { voiceFailure } from './voice-recovery.js';

const IS_INTERNAL = /\/team-demo\/?$/u.test(window.location.pathname);
const DEMO_CONFIG = (window as unknown as { LUMI_DEMO_CONFIG?: { publicAgentId?: string; voiceEndpoint?: string } }).LUMI_DEMO_CONFIG ?? {};
const PUBLIC_AGENT_ID = DEMO_CONFIG.publicAgentId?.trim() || '';
const VOICE_ENDPOINT = DEMO_CONFIG.voiceEndpoint?.trim() || '';
const CONNECT_TIMEOUT_MS = 20000;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const el = {
  welcomePanel: $('welcomePanel'), startDemoButton: $('startDemoButton'), stopDemoButton: $('stopDemoButton'),
  sessionBar: $('sessionBar'), sessionLabel: $('sessionLabel'), countdown: $('countdown'), character: $<HTMLImageElement>('character'),
  characterStatus: $('characterStatus'), cameraCard: $('cameraCard'), cameraPreview: $<HTMLVideoElement>('cameraPreview'), stopCameraButton: $('stopCameraButton'),
  activityFeedback: $('activityFeedback'), activityName: $('activityName'),
  conversationPanel: $('conversationPanel'), playVoiceStatus: $('playVoiceStatus'), playTranscript: $('playTranscript'),
  completionDialog: $('completionDialog'), closeCompletionButton: $('closeCompletionButton'), restartDemoButton: $('restartDemoButton'),
};
const show = (node: HTMLElement, visible: boolean) => { node.classList.toggle('hidden', !visible); node.hidden = !visible; };
type Activity = { id: string; label: string; instruction: string };
let trialActive = false, trialEnded = false;
const GUIDED_SEQUENCE: Activity[] = [...DEFAULT_GUIDED_SEQUENCE];
let currentAction: Activity | null = null;
let actionTimer: number | undefined;
let actionDetector: ReturnType<typeof createActionDetector> | null = null;
let actionArmed = false, actionInstructionPlayed = false, awaitingGuidedPrompt = false;
let guidedIndex = -1;
const guide = createPlayGuide();
const speechGate = createSpeechGate(), invitationGate = createSpeechGate();
const seenMessages = new Set<string>();
let conversation: VoiceConversation | null = null;
let connecting = false;
let voiceMode: 'idle' | 'listening' | 'speaking' = 'idle';
let voiceRequest: AbortController | null = null;
let sessionId = 0, reconnectAttempts = 0;
let retryTimer: number | undefined;
let cameraProblem = '';
let resumeCamera = false, resumeVoice = false;
type CharacterState = 'idle' | 'greeting' | 'listening' | 'speaking' | 'moving' | 'learning' | 'celebrating';
let characterState: CharacterState | null = null;
let frameTimer: number | undefined;
const frameImages = new Map<string, HTMLImageElement>();
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
let motionReduced = motionPreference.matches;
const gestureMirror = createGestureMirror();
const localMovement = createLocalMovementDetector();
let localDetected: 'wave' | 'sway' | null = null;
let localDetectedUntil = 0;
let mirrorGesture: MirrorCue['gesture'] = 'idle';
const frameSets: Record<CharacterState, { name: string; count: number; period: number }> = {
  idle: { name: 'idle', count: 32, period: 260 }, greeting: { name: 'wave', count: 32, period: 99 },
  listening: { name: 'idle', count: 32, period: 260 }, speaking: { name: 'speak', count: 28, period: 129 },
  moving: { name: 'move', count: 16, period: 40 }, learning: { name: 'idle', count: 32, period: 260 },
  celebrating: { name: 'wave', count: 32, period: 99 },
};

const camera = new CameraController(el.cameraPreview, (landmarks) => {
  if (!trialActive || trialEnded) return;
  const mirror = gestureMirror.update(landmarks);
  mirrorGesture = mirror.gesture;
  const hipsVisible = [23, 24].every((index) => {
    const point = landmarks[index];
    return point && Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.x <= 1
      && point.y >= 0 && point.y <= 1 && (point.visibility ?? 0) >= .55;
  });
  // Demonstrate the same small sway after the spoken cue. Visible player lean
  // takes over immediately; pose loss and reduced motion always clear it.
  const demonstrateSway = currentAction?.id === 'sway' && actionInstructionPlayed && mirror.poseVisible && hipsVisible
    && mirror.gesture !== 'sway' && voiceMode !== 'speaking';
  const demoLean = Math.sin(performance.now() / 650) * .5;
  applyMirrorTransform(!hipsVisible ? { ...mirror, lateral: 0, tilt: 0 }
    : demonstrateSway ? { ...mirror, lateral: demoLean, tilt: demoLean * 10 } : mirror);
  setActivityCharacter(activityCharacterState());
  if (!currentAction || !actionDetector) {
    // Free play remains usable while voice connects, fails, or is not playing a
    // guided round. This feedback NEVER acknowledges a voice-game completion.
    const detected = localMovement.update(landmarks);
    if (!mirror.poseVisible) { localDetected = null; localDetectedUntil = 0; }
    if (detected) { localDetected = detected; localDetectedUntil = performance.now() + 2200; }
    if (localDetected && performance.now() < localDetectedUntil) {
      el.activityName.textContent = localDetected === 'wave' ? 'Wave detected ✓' : 'Sway detected ✓';
      el.activityFeedback.textContent = '';
    } else {
      localDetected = null; el.activityName.textContent = 'Wave · Sway';
      el.activityFeedback.textContent = mirror.poseVisible ? '' : 'Step back so your shoulders, hands and hips fit in view.';
    }
    setActivityCharacter(activityCharacterState());
    return;
  }
  localMovement.reset(); localDetected = null; localDetectedUntil = 0;
  if (!actionArmed) { el.activityFeedback.textContent = 'Listen to Lumi first'; return; }
  const result = actionDetector.update(landmarks);
  el.activityFeedback.textContent = !mirror.poseVisible ? 'Move back so your shoulders and hands fit in the camera.'
    : currentAction.id === 'wave' && !mirror.wristsVisible ? 'Move back so your hands fit in the camera.'
    : currentAction.id === 'sway' && !hipsVisible
      ? 'Move back so your shoulders and hips fit in the camera.' : 'Try it with Lumi · checking on this device';
  if (result.detected) {
    guide.completed(Boolean(GUIDED_SEQUENCE[guidedIndex + 1])); invitationGate.reset(); speechGate.userTurn();
    acknowledgeAction(true);
  }
}, updateCameraStatus);
const clock = createSessionClock({ onTick: (remaining) => { el.countdown.textContent = formatTime(remaining); }, onExpire: () => endTrial(true) });

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
    if (localDetected === 'wave' && performance.now() < localDetectedUntil) return 'greeting';
    if (mirrorGesture === 'one-hand-raised') return 'greeting';
  }
  return currentAction?.id === 'wave' ? 'greeting' : currentAction ? 'idle' : voiceMode === 'listening' ? 'listening' : 'idle';
}

function setVoiceStatus(message: string) { el.playVoiceStatus.textContent = message; el.playVoiceStatus.title = ''; }
function setTranscript(text: string) { el.playTranscript.textContent = text; show(el.playTranscript, Boolean(text)); }
function updateGameContext(message: string) {
  try { conversation?.sendContextualUpdate(message); }
  catch { setVoiceStatus('Voice could not receive the game context. Stop and start the demo to reconnect.'); }
}
function updateCameraStatus(status: CameraStatus) {
  localMovement.reset(); localDetected = null; localDetectedUntil = 0;
  if (status !== 'ready') resetGestureMirror();
  show(el.cameraCard, status === 'ready');
  if (status === 'ready') { cameraProblem = ''; if (!currentAction) el.activityName.textContent = 'Wave · Sway'; }
  else if (status === 'starting') cameraProblem = 'Starting camera…';
  else if (status === 'denied') cameraProblem = 'Camera permission is off. You can still talk to Lumi.';
  else if (status === 'unavailable' || status === 'model-unavailable') cameraProblem = 'Camera checking is unavailable. You can still talk to Lumi.';
  else cameraProblem = trialActive ? 'Camera is off. You can still talk to Lumi.' : '';
  if (status !== 'ready' && !currentAction) el.activityName.textContent = status === 'starting' ? 'Starting camera…' : 'Camera off';
  el.activityFeedback.textContent = cameraProblem;
  // Availability is device state, never a pose observation or success event.
  if (conversation && status !== 'starting') updateGameContext(status === 'ready'
    ? 'Local movement checking is available. Continue our conversation; do not start a game without asking.'
    : 'Local movement checking is unavailable. Keep chatting; do not claim a movement was verified.');
}
function resetActivity() {
  currentAction = null; actionDetector = null; actionArmed = false; actionInstructionPlayed = false; window.clearTimeout(actionTimer);
  awaitingGuidedPrompt = Boolean(conversation && guidedIndex >= 0 && guidedIndex < GUIDED_SEQUENCE.length);
  el.activityName.textContent = camera.active ? 'Wave · Sway' : 'Camera off';
  el.activityFeedback.textContent = cameraProblem; el.characterStatus.textContent = 'Lumi is here to chat';
  setActivityCharacter(activityCharacterState());
}
function activateAction(action: Activity) {
  if (!trialActive || trialEnded || guide.phase !== 'playing') return;
  window.clearTimeout(actionTimer); currentAction = action; actionDetector = createActionDetector(action.id);
  actionArmed = speechGate.canCheck; actionInstructionPlayed = speechGate.canCheck;
  el.activityName.textContent = action.label;
  el.characterStatus.textContent = action.label;
  el.activityFeedback.textContent = camera.active ? 'Listen to Lumi first' : cameraProblem;
  setActivityCharacter(activityCharacterState());
}

function acknowledgeAction(verified: boolean) {
  if (!trialActive || trialEnded || !currentAction) return;
  const completed = currentAction;
  currentAction = null; actionDetector = null; actionArmed = false;
  setActivityCharacter('celebrating'); el.characterStatus.textContent = verified ? 'Movement detected!' : 'Nice try! (unverified)';
  el.activityFeedback.textContent = verified ? 'Movement detected ✓' : 'Marked complete · unverified';
  el.activityName.textContent = verified ? 'Well done!' : 'Unverified';
  window.clearTimeout(actionTimer);
  if (verified && conversation && guidedIndex >= 0 && GUIDED_SEQUENCE[guidedIndex]?.id === completed.id) {
    guidedIndex += 1;
    const next = GUIDED_SEQUENCE[guidedIndex];
    awaitingGuidedPrompt = Boolean(next);
    try {
      // The only vision-derived data sent to ElevenLabs is this completion event.
      // Video, images, landmarks, and confidence scores remain on this device.
      conversation.sendUserMessage(completionEvent(next));
    } catch { setVoiceStatus('Lumi could not receive the completion event. Stop and start the demo.'); }
    actionTimer = window.setTimeout(() => { if (trialActive && !trialEnded && !currentAction) resetActivity(); }, 10000);
    return;
  }
  actionTimer = window.setTimeout(() => { if (trialActive && !trialEnded) resetActivity(); }, 1800);
}
function beginTrial() {
  if (trialActive && !trialEnded) return;
  reconnectAttempts = 0;
  if (IS_INTERNAL) {
    trialActive = true; trialEnded = false; el.sessionLabel.textContent = 'TEAM DEMO'; el.countdown.textContent = '—'; show(el.sessionBar, true);
  } else {
    if (clock.started && !clock.expired) return;
    trialActive = true; trialEnded = false; show(el.sessionBar, true); clock.start();
  }
  show(el.welcomePanel, false); show(el.conversationPanel, true); resetActivity(); setCharacter('idle');
  // One browser gesture starts both permissions and unlocks voice output.
  void camera.start(); void startConversation();
}
function endTrial(expired = false) {
  if (!trialActive && !expired) return;
  trialActive = false; trialEnded = expired || trialEnded; resumeCamera = false; resumeVoice = false;
  endConversation(); camera.stop(); resetActivity(); show(el.sessionBar, false); show(el.conversationPanel, false);
  if (!IS_INTERNAL) clock.stop();
  if (expired && !IS_INTERNAL) { setCharacter('greeting'); el.characterStatus.textContent = 'Thank you for playing with Lumi!'; show(el.completionDialog, true); }
  else { show(el.welcomePanel, true); setCharacter('idle'); el.characterStatus.textContent = 'Meet Lumi'; }
}
async function requestSignedUrl(signal: AbortSignal): Promise<string> {
  const response = await fetch(VOICE_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'public' }), signal });
  const data = await response.json().catch(() => ({})) as { signedUrl?: string; error?: string };
  if (!response.ok || !data.signedUrl) throw new Error(data.error || 'Voice is not configured yet.');
  return data.signedUrl;
}
function clearVoiceGame() {
  guide.reset(); awaitingGuidedPrompt = false; guidedIndex = -1;
  speechGate.reset(); invitationGate.reset(); seenMessages.clear(); resetActivity();
}
function prepareGuidedGame() {
  guidedIndex = -1; resetActivity();
  GUIDED_SEQUENCE.splice(0, GUIDED_SEQUENCE.length, ...DEFAULT_GUIDED_SEQUENCE);
  guidedIndex = 0; awaitingGuidedPrompt = true; invitationGate.reset();
  el.activityName.textContent = 'A little snow adventure';
}
function onUserMessage(text: string) {
  if (!trialActive || trialEnded) return;
  const decision = guide.user(text, invitationGate.canCheck);
  speechGate.userTurn(); invitationGate.userTurn();
  if (decision === 'stop') {
    clearVoiceGame(); updateGameContext('The child wants to pause or chat. Follow their choice. No movement is complete.');
  } else if (decision === 'invite') {
    prepareGuidedGame();
    updateGameContext('The child wants to play. Acknowledge them warmly in our snow adventure. Ask if they are ready to wave hello with you, then WAIT for their answer. No movement command yet.');
  } else if (decision === 'begin') {
    const expected = GUIDED_SEQUENCE[guidedIndex];
    updateGameContext(`The child agreed after your invitation. Guide them warmly and give this one instruction: ${expected?.instruction || DEFAULT_GUIDED_SEQUENCE[0].instruction} Then wait for local completion. Do not add another movement.`);
  }
}
function onAgentMessage(text: string, eventId: number) {
  setTranscript(text);
  if (!trialActive || trialEnded) return;
  if (guide.phase === 'invitation') {
    if (readyInvitation(text)) invitationGate.instruction(eventId);
    return;
  }
  if (guide.phase !== 'playing' || guidedIndex < 0) return;
  const requested = spokenAction(text);
  if (!requested) return;
  if (currentAction) {
    if (requested.id === currentAction.id) {
      speechGate.instruction(eventId);
      if (speechGate.canCheck) { actionInstructionPlayed = true; actionArmed = true; }
    } else updateGameContext(`We are still trying ${currentAction.label}. Wait, or let the child choose to stop. No completion has been confirmed.`);
    return;
  }
  if (!awaitingGuidedPrompt) return;
  // Follow the supported action actually spoken, never a different canned cue.
  GUIDED_SEQUENCE[guidedIndex] = requested;
  awaitingGuidedPrompt = false; speechGate.instruction(eventId); activateAction(requested);
  updateGameContext(`The current movement is ${requested.label}. Wait for its completion event. Praise and ask before the next movement. Conversation alone cannot verify it.`);
}
function onVoiceMode(mode: 'speaking' | 'listening') {
  const wasSpeaking = voiceMode === 'speaking';
  voiceMode = mode; speechGate.mode(mode); invitationGate.mode(mode);
  if (mode === 'speaking') {
    actionArmed = false; setVoiceStatus('Lumi is talking · you can interrupt'); setCharacter('speaking');
  } else {
    if (wasSpeaking && currentAction && actionDetector) { actionDetector.reset(); actionInstructionPlayed ||= speechGate.canCheck; actionArmed = actionInstructionPlayed; }
    setVoiceStatus('Lumi is listening'); setCharacter(activityCharacterState());
  }
}
function recoverVoice(error: unknown) {
  const failure = voiceFailure(error);
  clearVoiceGame(); setCharacter(activityCharacterState());
  window.clearTimeout(retryTimer); retryTimer = undefined;
  if (failure.retryable && trialActive && !trialEnded && !document.hidden && reconnectAttempts < 2) {
    const delay = ++reconnectAttempts * 2000;
    setVoiceStatus('Voice reconnecting…');
    retryTimer = window.setTimeout(() => { retryTimer = undefined; void startConversation(); }, delay);
  } else setVoiceStatus('Voice unavailable');
  el.playVoiceStatus.title = failure.message;
}
async function startConversation() {
  if (!trialActive || trialEnded || conversation || connecting) return;
  if (!PUBLIC_AGENT_ID && !VOICE_ENDPOINT) { setVoiceStatus('Voice is not configured.'); return; }
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { setVoiceStatus('Voice needs HTTPS and a microphone-capable browser.'); return; }
  clearVoiceGame(); connecting = true;
  const mySession = ++sessionId; const request = new AbortController(); voiceRequest = request;
  voiceMode = 'listening'; setCharacter('listening'); setTranscript(''); setVoiceStatus('Connecting to Lumi…');
  const timeout = window.setTimeout(() => {
    if (mySession !== sessionId || conversation) return;
    sessionId++; request.abort(); connecting = false; voiceMode = 'idle'; clearVoiceGame();
    // The SDK cannot cancel pending permission/setup. Do not open overlapping
    // sessions on a timeout; a late result is disposed below.
    setVoiceStatus('Voice connection timed out. Stop and start the demo to try again.'); setCharacter(activityCharacterState());
  }, CONNECT_TIMEOUT_MS);
  try {
    const access = PUBLIC_AGENT_ID ? { agentId: PUBLIC_AGENT_ID } : { signedUrl: await requestSignedUrl(request.signal) };
    if (mySession !== sessionId || !trialActive || trialEnded) return;
    const connected = await Conversation.startSession({ ...access, connectionType: 'websocket',
      libsampleratePath: new URL('./vendor/libsamplerate.worklet.js', document.baseURI).href,
      clientTools: { showMovement: ({ activity }: { activity?: string }) => {
        if (mySession !== sessionId || !trialActive || trialEnded) return 'The demo has ended.';
        if (!DEFAULT_GUIDED_SEQUENCE.some((item) => item.id === activity)) return 'Only wave and sway can be demonstrated. Invite the child first.';
        return 'Say the matching instruction aloud only after the child agrees. Wait for local completion.';
      } },
      onConnect: () => { if (mySession === sessionId) setVoiceStatus('Lumi is listening'); },
      onMessage: (message) => {
        if (mySession !== sessionId || !trialActive || trialEnded) return;
        const role = message.role || (message.source === 'ai' ? 'agent' : 'user');
        if (Number.isFinite(message.event_id)) {
          const key = `${role}:${message.event_id}`;
          if (seenMessages.has(key)) return;
          seenMessages.add(key); if (seenMessages.size > 64) seenMessages.delete(seenMessages.values().next().value!);
        }
        if (role === 'agent') onAgentMessage(message.message, message.event_id); else onUserMessage(message.message);
      },
      onModeChange: ({ mode }) => { if (mySession === sessionId) onVoiceMode(mode); },
      onAudioAlignmentPlayback: ({ event_id }) => { if (mySession === sessionId) { speechGate.audio(event_id); invitationGate.audio(event_id); } },
      onInterruption: () => {
        if (mySession !== sessionId) return;
        speechGate.interrupt(); invitationGate.interrupt(); actionArmed = false;
        if (currentAction && !actionInstructionPlayed) { resetActivity(); awaitingGuidedPrompt = true; }
      },
      onError: (message) => { if (mySession === sessionId) setVoiceStatus(voiceFailure(message).message); },
      onDisconnect: (details) => {
        if (mySession !== sessionId) return;
        sessionId++; conversation = null; connecting = false; voiceMode = 'idle';
        if (details.reason === 'user' || details.reason === 'agent') { clearVoiceGame(); setVoiceStatus('Lumi’s voice session ended. Stop and start the demo to talk again.'); }
        else recoverVoice(details.message);
      },
    }) as VoiceConversation;
    if (mySession !== sessionId || !trialActive || trialEnded) { await connected.endSession().catch(() => {}); return; }
    conversation = connected; connecting = false;
    updateGameContext(GAME_CONTEXT);
    updateGameContext(camera.active ? 'Local movement checking is available.' : 'Local movement checking is not available yet. Keep chatting.');
    // No synthetic user request or movement instruction is sent at connection.
  } catch (error) {
    if (mySession === sessionId) { sessionId++; connecting = false; voiceMode = 'idle'; recoverVoice(error); }
  } finally { window.clearTimeout(timeout); if (voiceRequest === request) voiceRequest = null; }
}
function endConversation() {
  sessionId++; window.clearTimeout(retryTimer); retryTimer = undefined; voiceRequest?.abort(); voiceRequest = null;
  const current = conversation; conversation = null; connecting = false; voiceMode = 'idle'; clearVoiceGame();
  if (current) void current.endSession().catch(() => {});
  setVoiceStatus('Voice stopped');
}

el.startDemoButton.addEventListener('click', beginTrial);
el.stopDemoButton.addEventListener('click', () => endTrial(false));
el.stopCameraButton.addEventListener('click', () => { resumeCamera = false; camera.stop(); });
el.closeCompletionButton.addEventListener('click', () => { show(el.completionDialog, false); show(el.welcomePanel, true); });
el.restartDemoButton.addEventListener('click', () => { show(el.completionDialog, false); beginTrial(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { resumeCamera = camera.active; resumeVoice = Boolean(conversation || connecting || retryTimer); endConversation(); camera.stop(); }
  else {
    if (!IS_INTERNAL) clock.reconcile();
    if (trialActive && !trialEnded) { if (resumeCamera) void camera.start(); if (resumeVoice) void startConversation(); }
    resumeCamera = false; resumeVoice = false;
  }
});
window.addEventListener('pagehide', () => { endConversation(); camera.dispose(); });
motionPreference.addEventListener('change', (event) => {
  motionReduced = event.matches; resetGestureMirror();
  const state = characterState || 'idle'; characterState = null; setCharacter(state);
});
setCharacter('idle');
if (IS_INTERNAL) {
  $('welcomeTitle').textContent = 'Move with Lumi · Team Demo';
  $('trialNote').textContent = 'Start asks for camera and microphone permission. Video stays here; microphone audio goes to the voice service. Team Demo has no time limit.';
}
(window as unknown as { lumi: object }).lumi = {
  get connected() { return Boolean(conversation); }, get trialActive() { return trialActive; },
  get trialEnded() { return trialEnded; }, get internal() { return IS_INTERNAL; },
  startDemo: beginTrial, stopDemo: () => endTrial(false),
};
