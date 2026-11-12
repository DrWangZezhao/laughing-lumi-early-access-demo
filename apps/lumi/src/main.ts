import './style.css';
import { Conversation, type VoiceConversation } from '@elevenlabs/client';
import { ACTIONS, GUIDED_RAISE_HAND, actionFromAgentPrompt, createActionDetector } from './vision/actions.js';
import { CameraController, type CameraStatus } from './vision/camera.js';
import { createSessionClock } from './session.js';
import { GUIDED_SEQUENCE, completionEvent } from './guided-game.js';

const IS_INTERNAL = /\/team-demo\/?$/u.test(window.location.pathname);
const SURVEY_URL = 'https://script.google.com/macros/s/AKfycbzhraBB4vfYdVVjBPNGkVEjB6rZ4o1G1FVc2nlwrHprgm5ZehF2f0isWVlquAwJrT9LlA/exec?src=homepage';
const DEMO_CONFIG = (window as unknown as { LUMI_DEMO_CONFIG?: { publicAgentId?: string; voiceEndpoint?: string } }).LUMI_DEMO_CONFIG ?? {};
const PUBLIC_AGENT_ID = DEMO_CONFIG.publicAgentId?.trim() || '';
const VOICE_ENDPOINT = DEMO_CONFIG.voiceEndpoint?.trim() || '';
const CONNECT_TIMEOUT_MS = 20000;
const UNMUTE_DELAY_MS = 400;
const QUOTA_MSG = 'Voice unavailable right now. Please try again later.';
const CLOSED_MSG = 'Voice connection closed. Tap TALK to reconnect.';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const el = {
  playButton: $('playButton'), lumiButton: $('lumiButton'), activityWindow: $('activityWindow'), companionWindow: $('companionWindow'),
  welcomePanel: $('welcomePanel'), activityButtons: $('activityButtons'), startDemoButton: $('startDemoButton'), startTogetherButton: $('startTogetherButton'), stopDemoButton: $('stopDemoButton'),
  sessionBar: $('sessionBar'), sessionLabel: $('sessionLabel'), countdown: $('countdown'), character: $('character') as HTMLImageElement,
  characterStatus: $('characterStatus'), cameraCard: $('cameraCard'), cameraPreview: $('cameraPreview') as HTMLVideoElement, cameraButton: $('cameraButton'), stopCameraButton: $('stopCameraButton'), cameraStatus: $('cameraStatus'), activityFeedback: $('activityFeedback'),
  activityName: $('activityName'), activityInstructionText: $('activityInstructionText'), activityProgress: $('activityProgress'), manualSuccessButton: $('manualSuccessButton') as HTMLButtonElement,
  playTalkButton: $('playTalkButton'), playStopButton: $('playStopButton'), playVoiceStatus: $('playVoiceStatus'), playTranscript: $('playTranscript'),
  debugBG: $('debugBG'), debugTranscript: $('debugTranscript'), debugInput: $('debugInput') as HTMLFormElement, debugText: $('debugText') as HTMLInputElement, debugHint: $('debugHint'), bottomButtons: $('bottomInteractionButtons'), bottomMic: $('bottomInteractionMicrophone'),
  talkButton: $('talkButton'), typeButton: $('typeButton'), companionCameraButton: $('companionCameraButton') as HTMLButtonElement, activeCameraButton: $('activeCameraButton') as HTMLButtonElement, stopButton: $('stopButton'), completionDialog: $('completionDialog'), closeCompletionButton: $('closeCompletionButton'), restartDemoButton: $('restartDemoButton'),
};
const show = (node: HTMLElement, visible: boolean) => { node.classList.toggle('hidden', !visible); node.hidden = !visible; };

type ViewMode = 'Play' | 'Lumi';
let viewMode: ViewMode = 'Play';
let trialActive = false;
let trialEnded = false;
type Activity = { id: string; label: string; instruction: string };
let currentAction: Activity | null = null;
let actionTimer: number | undefined;
let actionDetector: ReturnType<typeof createActionDetector> | null = null;
let actionArmed = false;
let awaitingGuidedPrompt = false;
let guidedIndex = -1;
let pendingAgentAction: Activity | null = null;
let promptRetryPending = false;
let promptRetriedIndex = -1;
let conversation: VoiceConversation | null = null;
let connecting = false;
let voiceMode: 'idle' | 'listening' | 'speaking' = 'idle';
let voiceRequest: AbortController | null = null;
let sessionId = 0;
let quotaExhausted = false;
let unmuteTimer: number | undefined;
let hintTimer: number | undefined;
type CharacterState = 'idle' | 'greeting' | 'listening' | 'speaking' | 'moving' | 'learning' | 'celebrating';
let characterState: CharacterState | null = null;
let frameTimer: number | undefined;
const frameImages = new Map<string, HTMLImageElement>();
const motionReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
  if (!actionDetector || !currentAction) {
    el.activityFeedback.textContent = landmarks.length ? 'Camera on · choose a movement' : 'No person in frame · move into view';
    return;
  }
  if (!actionArmed) { el.activityFeedback.textContent = 'Listen to Lumi first · camera is waiting'; return; }
  const result = actionDetector.update(landmarks);
  if (result.status === 'camera-unavailable') return;
  el.activityProgress.style.width = `${Math.round(result.progress * 100)}%`;
  el.activityFeedback.textContent = landmarks.length ? 'Camera on · checking locally' : 'No person in frame · move into view';
  if (result.progress > 0 && !result.detected) setActivityCharacter(currentAction.id === 'wave' ? 'greeting' : 'moving');
  if (result.detected) acknowledgeAction(true);
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

function activityCharacterState(): CharacterState {
  return currentAction?.id === 'wave' ? 'greeting' : currentAction ? 'moving' : voiceMode === 'listening' ? 'listening' : 'idle';
}

function setVoiceStatus(message: string) { el.playVoiceStatus.textContent = message; }
function isLumiSpeaking() { return voiceMode === 'speaking'; }
function syncVoiceControls() {
  const active = connecting || Boolean(conversation);
  show(el.playTalkButton, !active);
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
  el.cameraButton.textContent = status === 'ready' ? 'Stop camera' : status === 'starting' ? 'Starting camera…' : 'Enable camera';
  el.cameraButton.setAttribute('aria-pressed', String(status === 'ready'));
  for (const button of [el.companionCameraButton, el.activeCameraButton]) {
    button.setAttribute('aria-pressed', String(status === 'ready'));
    const label = button.querySelector('span');
    if (label) label.textContent = status === 'ready' ? 'CAMERA ON' : status === 'starting' ? 'STARTING' : 'CAMERA';
  }
  if (status === 'ready') { show(el.cameraCard, true); el.cameraStatus.textContent = 'Video stays here. With TALK on, only movement completion is sent to Lumi.'; el.activityFeedback.textContent = currentAction ? (actionArmed ? 'Camera on · checking locally' : 'Listen to Lumi first · camera is waiting') : 'Camera on · choose a movement'; setActivityCharacter(activityCharacterState()); return; }
  if (status === 'starting') { el.activityFeedback.textContent = 'Starting camera…'; return; }
  show(el.cameraCard, false);
  if (status === 'denied' || status === 'unavailable' || status === 'model-unavailable') { el.activityFeedback.textContent = 'Camera unavailable · manual mode'; hint(message || 'Camera unavailable. Movement is unverified.'); }
  else if (status === 'stopped') el.activityFeedback.textContent = currentAction ? 'Camera off · manual mode' : 'Camera off · choose a movement';
}

function resetActivity() {
  currentAction = null; actionDetector = null; actionArmed = false; window.clearTimeout(actionTimer);
  awaitingGuidedPrompt = Boolean(conversation && guidedIndex >= 0 && guidedIndex < GUIDED_SEQUENCE.length);
  document.querySelectorAll<HTMLButtonElement>('.act').forEach((button) => button.classList.remove('selected'));
  el.activityName.textContent = 'Ready when you are';
  el.activityInstructionText.textContent = 'Choose a movement, or TALK with Lumi for a guided first step.';
  el.activityProgress.style.width = '0%'; el.manualSuccessButton.disabled = true;
  el.activityFeedback.textContent = camera.active ? 'Camera on · choose a movement' : 'Camera off · choose a movement';
  el.characterStatus.textContent = 'Lumi is ready to play';
  setActivityCharacter('idle');
}

function activateAction(action: Activity, fromVoice = false) {
  if (!trialActive || trialEnded) return;
  window.clearTimeout(actionTimer); currentAction = action; actionDetector = createActionDetector(action.id); actionArmed = !fromVoice || voiceMode !== 'speaking';
  document.querySelectorAll<HTMLButtonElement>('.act').forEach((button) => button.classList.toggle('selected', ACTIONS[Number(button.dataset.activity)]?.id === action.id));
  el.activityName.textContent = action.label; el.activityInstructionText.textContent = action.instruction; el.activityProgress.style.width = '0%'; el.manualSuccessButton.disabled = false;
  setActivityCharacter(action.id === 'wave' ? 'greeting' : 'moving'); el.characterStatus.textContent = `Lumi says: ${action.instruction}`; el.activityFeedback.textContent = camera.active ? (actionArmed ? 'Camera on · checking locally' : 'Listen to Lumi first · camera is waiting') : 'Camera off · manual mode';
}

function chooseAction(index: number) {
  if (!trialActive || trialEnded || !ACTIONS[index]) return;
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
    } catch { hint('Lumi could not receive the completion event. Try TALK again.'); }
    actionTimer = window.setTimeout(() => { if (trialActive && !trialEnded && !currentAction) resetActivity(); }, 10000);
    return;
  }
  actionTimer = window.setTimeout(() => { if (trialActive && !trialEnded) resetActivity(); }, 1800);
}

function beginTrial() {
  if (IS_INTERNAL) {
    trialActive = true; trialEnded = false; el.sessionLabel.textContent = 'TEAM DEMO'; el.countdown.textContent = '—'; show(el.sessionBar, true);
  } else {
    if (clock.started && !clock.expired) return;
    trialActive = true; trialEnded = false; show(el.sessionBar, true); clock.start();
  }
  show(el.welcomePanel, false); show(el.activityButtons, true); resetActivity(); setCharacter('idle');
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

function onAgentMessage(text: string) {
  setTranscript(text);
  if (!awaitingGuidedPrompt || currentAction || !trialActive) return;
  const expected = GUIDED_SEQUENCE[guidedIndex];
  const requested = actionFromAgentPrompt(text) || (/(please|now|next|try|请|现在|接下来)/iu.test(text) ? pendingAgentAction : null);
  if (!expected) return;
  if (requested?.id !== expected.id) {
    if (promptRetriedIndex !== guidedIndex) { promptRetriedIndex = guidedIndex; promptRetryPending = true; }
    return;
  }
  promptRetryPending = false;
  awaitingGuidedPrompt = false; pendingAgentAction = null;
  activateAction(expected, true);
  openPlayView();
}

function flushPromptRetry() {
  if (!promptRetryPending || voiceMode !== 'listening' || !conversation || !trialActive) return;
  const expected = GUIDED_SEQUENCE[guidedIndex];
  promptRetryPending = false;
  if (!expected) return;
  try { conversation.sendUserMessage(`I am ready. Please say the movement instruction aloud now: ${expected.instruction} My camera checks it locally and will tell you when I finish.`); }
  catch { hint('Lumi could not receive the movement prompt. Try TALK again.'); }
}

async function startConversation() {
  if (!trialActive || trialEnded) { hint('Start the demo first.'); return; }
  if (quotaExhausted) { setVoiceStatus(QUOTA_MSG); return; }
  if (conversation || connecting) return;
  if (!PUBLIC_AGENT_ID && !VOICE_ENDPOINT) { const message = 'Voice is not activated yet. Movement play is still available.'; setVoiceStatus(message); hint(message); return; }
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { const message = 'Voice needs a secure page and a microphone-capable browser.'; setVoiceStatus(message); hint(message); return; }
  connecting = true; awaitingGuidedPrompt = true; guidedIndex = 0; pendingAgentAction = null; promptRetryPending = false; promptRetriedIndex = -1; const mySession = ++sessionId; const request = new AbortController(); voiceRequest = request; voiceMode = 'listening'; setCharacter('listening'); syncVoiceControls(); setTranscript(''); setVoiceStatus('Connecting to Lumi…'); hint('Connecting to Lumi…');
  let timeout: number | undefined;
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
      onMessage: (message) => { if (mySession !== sessionId) return; const role = (message as { role?: string; source?: string }).role || ((message as { source?: string }).source === 'ai' ? 'agent' : 'user'); if (role === 'agent') onAgentMessage((message as { message: string }).message); },
      onModeChange: ({ mode }) => { if (mySession !== sessionId) return; window.clearTimeout(unmuteTimer); if (mode === 'speaking') { voiceMode = 'speaking'; actionArmed = false; setVoiceStatus('Lumi is speaking'); setCharacter('speaking'); try { conversation?.setMicMuted(true); } catch { /* session ended */ } } else { voiceMode = 'listening'; if (currentAction && actionDetector) { actionDetector.reset(); actionArmed = true; } setVoiceStatus('Voice on · listening'); setCharacter(activityCharacterState()); flushPromptRetry(); unmuteTimer = window.setTimeout(() => { try { conversation?.setMicMuted(false); } catch { /* session ended */ } }, UNMUTE_DELAY_MS); } },
      onError: (message) => { if (mySession === sessionId) { const failure = describeFailure(message); setVoiceStatus(failure); hint(failure); } },
      onDisconnect: (details) => { if (mySession !== sessionId) return; sessionId++; conversation = null; connecting = false; awaitingGuidedPrompt = false; guidedIndex = -1; pendingAgentAction = null; promptRetryPending = false; voiceMode = 'idle'; syncVoiceControls(); if (details.reason !== 'user') { const failure = details.reason === 'error' ? describeFailure(details.message) : CLOSED_MSG; setVoiceStatus(failure); hint(failure); } else setVoiceStatus('Voice off · camera can stay on'); setActivityCharacter(activityCharacterState()); },
    }) as Promise<VoiceConversation>;
    timeout = window.setTimeout(() => { if (mySession === sessionId && !conversation) { sessionId++; connecting = false; voiceMode = 'idle'; syncVoiceControls(); setVoiceStatus('Voice connection timed out.'); hint('Voice connection timed out.'); } }, CONNECT_TIMEOUT_MS);
    const connected = await starting;
    if (mySession !== sessionId || !trialActive || trialEnded) { await connected.endSession().catch(() => {}); return; }
    conversation = connected; connecting = false; syncVoiceControls();
    try { connected.setMicMuted(isLumiSpeaking()); } catch { /* session ended */ }
    flushPromptRetry();
    if (awaitingGuidedPrompt && !currentAction) {
      try { connected.sendUserMessage('Let us play a movement game. First, please ask me aloud to lift both hands above my shoulders. Wait for me to try; do not move to the next action until I finish.'); }
      catch { setVoiceStatus('Voice connected, but the first movement prompt could not be sent.'); }
    }
  } catch (error) { if (mySession === sessionId) { sessionId++; connecting = false; awaitingGuidedPrompt = false; voiceMode = 'idle'; syncVoiceControls(); setActivityCharacter(activityCharacterState()); const failure = describeFailure(error); setVoiceStatus(failure); hint(failure); } }
  finally { window.clearTimeout(timeout); if (voiceRequest === request) voiceRequest = null; }
}

function endConversation() { sessionId++; window.clearTimeout(unmuteTimer); voiceRequest?.abort(); voiceRequest = null; const current = conversation; conversation = null; connecting = false; awaitingGuidedPrompt = false; guidedIndex = -1; pendingAgentAction = null; promptRetryPending = false; voiceMode = 'idle'; if (current) current.endSession().catch(() => {}); syncVoiceControls(); setVoiceStatus('Voice off · camera can stay on'); if (trialActive) setActivityCharacter(activityCharacterState()); }

function sendTextMessage(text: string) { const message = text.trim(); if (!message) return; if (!conversation) { hint('Open LUMI and tap TALK before sending a text message.'); return; } try { conversation.sendUserMessage(message); hint(''); } catch { hint('Message not sent. Tap TALK to reconnect.'); } }

el.playButton.addEventListener('click', openPlayView); el.lumiButton.addEventListener('click', openLumiView); el.startDemoButton.addEventListener('click', beginTrial); el.startTogetherButton.addEventListener('click', () => { beginTrial(); openLumiView(); void camera.start(); void startConversation(); }); el.stopDemoButton.addEventListener('click', () => endTrial(false));
document.querySelectorAll<HTMLButtonElement>('.act').forEach((button) => button.addEventListener('click', () => chooseAction(Number(button.dataset.activity))));
el.cameraButton.addEventListener('click', () => { if (!trialActive) return; if (camera.active) camera.stop(); else void camera.start(); }); el.stopCameraButton.addEventListener('click', () => camera.stop()); el.manualSuccessButton.addEventListener('click', () => acknowledgeAction(false));
for (const button of [el.companionCameraButton, el.activeCameraButton]) button.addEventListener('click', () => { if (!trialActive) { hint('Start the demo first.'); return; } if (camera.active) camera.stop(); else void camera.start(); });
el.talkButton.addEventListener('click', () => void startConversation()); el.playTalkButton.addEventListener('click', () => void startConversation()); el.stopButton.addEventListener('click', endConversation); el.playStopButton.addEventListener('click', endConversation); el.typeButton.addEventListener('click', () => { el.debugInput.hidden = !el.debugInput.hidden; if (!el.debugInput.hidden) el.debugText.focus(); });
el.debugInput.addEventListener('submit', (event) => { event.preventDefault(); sendTextMessage(el.debugText.value); el.debugText.value = ''; });
el.closeCompletionButton.addEventListener('click', () => { show(el.completionDialog, false); show(el.welcomePanel, true); show(el.activityButtons, false); }); el.restartDemoButton.addEventListener('click', () => { show(el.completionDialog, false); beginTrial(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { endConversation(); camera.stop(); } else if (!IS_INTERNAL) clock.reconcile(); });
window.addEventListener('pagehide', () => { endConversation(); camera.dispose(); });

openPlayView(); if (IS_INTERNAL) beginTrial();
(window as unknown as { lumi: object }).lumi = { get connected() { return Boolean(conversation); }, get mode() { return viewMode; }, get trialActive() { return trialActive; }, get trialEnded() { return trialEnded; }, get internal() { return IS_INTERNAL; }, startDemo: beginTrial, stopDemo: () => endTrial(false) };
