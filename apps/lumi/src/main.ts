import './style.css';
import { Conversation, type VoiceConversation } from '@elevenlabs/client';
import { ACTIONS, createActionDetector } from './vision/actions.js';
import { CameraController, type CameraStatus } from './vision/camera.js';
import { createSessionClock } from './session.js';

const IS_INTERNAL = /\/team-demo\/?$/u.test(window.location.pathname);
const SURVEY_URL = 'https://script.google.com/macros/s/AKfycbzhraBB4vfYdVVjBPNGkVEjB6rZ4o1G1FVc2nlwrHprgm5ZehF2f0isWVlquAwJrT9LlA/exec?src=homepage';
const DEMO_CONFIG = (window as unknown as { LUMI_DEMO_CONFIG?: { voiceEndpoint?: string; supabaseUrl?: string; supabaseAnonKey?: string } }).LUMI_DEMO_CONFIG ?? {};
const VOICE_ENDPOINT = DEMO_CONFIG.voiceEndpoint || 'https://vgeseoyoztogthygvzog.supabase.co/functions/v1/voice-session';
const CONNECT_TIMEOUT_MS = 20000;
const UNMUTE_DELAY_MS = 400;
const QUOTA_MSG = 'Voice unavailable right now. Please try again later.';
const CLOSED_MSG = 'Voice connection closed. Tap TALK to reconnect.';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const el = {
  playButton: $('playButton'), lumiButton: $('lumiButton'), activityWindow: $('activityWindow'), companionWindow: $('companionWindow'),
  welcomePanel: $('welcomePanel'), activityButtons: $('activityButtons'), startDemoButton: $('startDemoButton'), stopDemoButton: $('stopDemoButton'),
  sessionBar: $('sessionBar'), sessionLabel: $('sessionLabel'), countdown: $('countdown'), character: $('character') as HTMLImageElement,
  characterStatus: $('characterStatus'), cameraCard: $('cameraCard'), cameraPreview: $('cameraPreview') as HTMLVideoElement, cameraButton: $('cameraButton'), stopCameraButton: $('stopCameraButton'), cameraStatus: $('cameraStatus'), activityFeedback: $('activityFeedback'),
  activityName: $('activityName'), activityInstructionText: $('activityInstructionText'), activityProgress: $('activityProgress'), manualSuccessButton: $('manualSuccessButton'),
  debugBG: $('debugBG'), debugTranscript: $('debugTranscript'), debugInput: $('debugInput') as HTMLFormElement, debugText: $('debugText') as HTMLInputElement, debugHint: $('debugHint'), bottomButtons: $('bottomInteractionButtons'), bottomMic: $('bottomInteractionMicrophone'),
  talkButton: $('talkButton'), typeButton: $('typeButton'), stopButton: $('stopButton'), completionDialog: $('completionDialog'), closeCompletionButton: $('closeCompletionButton'), restartDemoButton: $('restartDemoButton'),
  internalGate: $('internalGate'), internalLoginForm: $('internalLoginForm') as HTMLFormElement, internalEmail: $('internalEmail') as HTMLInputElement, internalLoginStatus: $('internalLoginStatus'), internalLogoutButton: $('internalLogoutButton'),
};
const show = (node: HTMLElement, visible: boolean) => { node.classList.toggle('hidden', !visible); node.hidden = !visible; };

type ViewMode = 'Play' | 'Lumi';
let viewMode: ViewMode = 'Play';
let trialActive = false;
let trialEnded = false;
let currentAction = 0;
let actionTimer: number | undefined;
let actionDetector = createActionDetector(ACTIONS[0].id);
let accessToken = sessionStorage.getItem('lumi_internal_access_token') || '';
let conversation: VoiceConversation | null = null;
let connecting = false;
let sessionId = 0;
let quotaExhausted = false;
let unmuteTimer: number | undefined;
let hintTimer: number | undefined;

const camera = new CameraController(el.cameraPreview, (landmarks) => {
  if (!trialActive || trialEnded) return;
  const result = actionDetector.update(landmarks);
  if (result.status === 'camera-unavailable') return;
  el.activityProgress.style.width = `${Math.round(result.progress * 100)}%`;
  if (result.progress > 0 && !result.detected) setCharacter('moving');
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

function setCharacter(state: 'idle' | 'greeting' | 'listening' | 'speaking' | 'moving' | 'learning' | 'celebrating') {
  const assets: Record<string, string> = { idle: 'lumi-stand.png', greeting: 'lumi-wave.png', listening: 'lumi-peek.png', speaking: 'lumi-stand.png', moving: 'lumi-run.png', learning: 'lumi-book.png', celebrating: 'lumi-wave.png' };
  el.character.src = `./character/${assets[state]}`;
  el.character.className = `character is-${state}`;
}

function setToggle(mode: ViewMode) {
  const play = mode === 'Play';
  el.playButton.classList.toggle('on', play); el.lumiButton.classList.toggle('on', !play);
  el.playButton.setAttribute('aria-selected', String(play)); el.lumiButton.setAttribute('aria-selected', String(!play));
}

function openPlayView() {
  viewMode = 'Play'; setToggle('Play'); show(el.activityWindow, true); show(el.companionWindow, false); setCharacter(trialActive ? 'learning' : 'idle');
}

function openLumiView() {
  viewMode = 'Lumi'; setToggle('Lumi'); show(el.activityWindow, false); show(el.companionWindow, true); setTranscript(''); setCharacter(conversation ? 'listening' : 'greeting');
}

function setTranscript(text: string) { el.debugTranscript.textContent = text; show(el.debugBG, Boolean(text)); }
function hint(text: string) { el.debugHint.textContent = text; show(el.debugHint, Boolean(text)); window.clearTimeout(hintTimer); if (text) hintTimer = window.setTimeout(() => show(el.debugHint, false), 5000); }

function updateCameraStatus(status: CameraStatus, message?: string) {
  if (status === 'ready') { show(el.cameraCard, true); el.cameraStatus.textContent = 'Video is processed locally and is not uploaded or saved.'; el.activityFeedback.textContent = 'Camera on · checking locally'; setCharacter('listening'); return; }
  if (status === 'starting') { el.activityFeedback.textContent = 'Starting camera…'; return; }
  show(el.cameraCard, false);
  if (status === 'denied' || status === 'unavailable' || status === 'model-unavailable') { el.activityFeedback.textContent = 'Camera unavailable · manual mode'; hint(message || 'Camera unavailable. Movement is unverified.'); }
  else if (status === 'stopped') el.activityFeedback.textContent = 'Camera off · manual mode';
}

function chooseAction(index: number) {
  if (!trialActive || trialEnded) return;
  currentAction = Math.max(0, Math.min(ACTIONS.length - 1, index));
  actionDetector = createActionDetector(ACTIONS[currentAction].id);
  document.querySelectorAll<HTMLButtonElement>('.act').forEach((button) => button.classList.toggle('selected', Number(button.dataset.activity) === currentAction));
  el.activityName.textContent = ACTIONS[currentAction].label; el.activityInstructionText.textContent = ACTIONS[currentAction].instruction; el.activityProgress.style.width = '0%';
  setCharacter('learning'); el.characterStatus.textContent = `Lumi says: ${ACTIONS[currentAction].instruction}`; el.activityFeedback.textContent = camera.active ? 'Camera on · checking locally' : 'Camera off · manual mode';
}

function acknowledgeAction(verified: boolean) {
  if (!trialActive || trialEnded) return;
  setCharacter('celebrating'); el.characterStatus.textContent = verified ? 'Lumi saw it — hooray!' : 'Nice try! (unverified)'; el.activityFeedback.textContent = verified ? 'Movement detected ✓' : 'Marked complete · unverified';
  actionDetector.reset();
  window.clearTimeout(actionTimer);
  actionTimer = window.setTimeout(() => { if (!trialActive || trialEnded) return; chooseAction((currentAction + 1) % ACTIONS.length); }, 950);
}

function beginTrial() {
  if (IS_INTERNAL) {
    trialActive = true; trialEnded = false; el.sessionLabel.textContent = 'TEAM DEMO'; el.countdown.textContent = '—'; show(el.sessionBar, true);
  } else {
    if (clock.started && !clock.expired) return;
    trialActive = true; trialEnded = false; show(el.sessionBar, true); clock.start();
  }
  show(el.welcomePanel, false); show(el.activityButtons, true); chooseAction(currentAction); setCharacter('greeting');
}

function endTrial(expired = false) {
  if (!trialActive && !expired) return;
  trialActive = false; trialEnded = expired || trialEnded; endConversation(); camera.stop(); actionDetector.reset(); window.clearTimeout(actionTimer); show(el.sessionBar, false);
  if (!IS_INTERNAL) clock.stop();
  if (expired && !IS_INTERNAL) { setCharacter('greeting'); el.characterStatus.textContent = 'Thank you for playing with Lumi!'; show(el.completionDialog, true); }
  else { show(el.welcomePanel, true); show(el.activityButtons, false); setCharacter('idle'); el.characterStatus.textContent = 'Lumi is ready to play'; }
}

async function requestSignedUrl(scope: 'public' | 'internal'): Promise<string> {
  if (scope === 'internal' && !accessToken) throw new Error('Internal sign-in required.');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (scope === 'internal') headers.Authorization = `Bearer ${accessToken}`;
  const response = await fetch(VOICE_ENDPOINT, { method: 'POST', headers, body: JSON.stringify({ scope }) });
  const data = await response.json().catch(() => ({})) as { signedUrl?: string; error?: string };
  if (!response.ok || !data.signedUrl) throw new Error(data.error || 'Voice is not configured yet.');
  return data.signedUrl;
}

function describeFailure(error: unknown): string {
  const name = (error as { name?: string })?.name || ''; const message = error instanceof Error ? error.message : String(error || '');
  if (name === 'NotAllowedError' || /permission denied|not allowed/i.test(message)) return 'Microphone access was denied. You can still use text or movement play.';
  if (name === 'NotFoundError') return 'No microphone was found. You can still use text or movement play.';
  if (/quota/i.test(message)) { quotaExhausted = true; return QUOTA_MSG; }
  return message || 'Lumi is not available right now. Please try again later.';
}

async function startConversation() {
  if (!trialActive || trialEnded) { hint(IS_INTERNAL ? 'Sign in and start the team demo first.' : 'Start the 1-minute demo first.'); return; }
  if (quotaExhausted || conversation || connecting) return;
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { hint('Voice needs a secure page and a microphone-capable browser.'); return; }
  connecting = true; const mySession = ++sessionId; setCharacter('listening'); show(el.bottomButtons, false); show(el.bottomMic, true); setTranscript(''); hint('Connecting to Lumi…');
  let timeout: number | undefined;
  try {
    const signedUrl = await requestSignedUrl(IS_INTERNAL ? 'internal' : 'public');
    const starting = Conversation.startSession({ signedUrl, connectionType: 'websocket', libsampleratePath: new URL('./vendor/libsamplerate.worklet.js', document.baseURI).href,
      onConnect: () => { if (mySession === sessionId) { hint(''); setCharacter('listening'); } },
      onMessage: (message) => { if (mySession !== sessionId) return; const role = (message as { role?: string; source?: string }).role || ((message as { source?: string }).source === 'ai' ? 'agent' : 'user'); if (role === 'agent') setTranscript((message as { message: string }).message); },
      onModeChange: ({ mode }) => { if (mySession !== sessionId || !conversation) return; window.clearTimeout(unmuteTimer); try { if (mode === 'speaking') { conversation.setMicMuted(true); setCharacter('speaking'); } else { setCharacter('listening'); unmuteTimer = window.setTimeout(() => { try { conversation?.setMicMuted(false); } catch { /* session ended */ } }, UNMUTE_DELAY_MS); } } catch { /* session ended */ } },
      onError: (message) => { if (mySession === sessionId) hint(describeFailure(message)); },
      onDisconnect: (details) => { if (mySession !== sessionId) return; const wasConnected = Boolean(conversation); conversation = null; connecting = false; show(el.bottomButtons, true); show(el.bottomMic, false); if (details.reason !== 'user') setTranscript(wasConnected ? CLOSED_MSG : describeFailure(details)); setCharacter('idle'); },
    }) as Promise<VoiceConversation>;
    timeout = window.setTimeout(() => { if (mySession === sessionId && !conversation) { sessionId++; connecting = false; show(el.bottomButtons, true); show(el.bottomMic, false); hint('Voice connection timed out.'); } }, CONNECT_TIMEOUT_MS);
    const connected = await starting;
    if (mySession !== sessionId || !trialActive || trialEnded) { await connected.endSession().catch(() => {}); return; }
    conversation = connected;
  } catch (error) { if (mySession === sessionId) { sessionId++; connecting = false; show(el.bottomButtons, true); show(el.bottomMic, false); setCharacter('idle'); hint(describeFailure(error)); } }
  finally { window.clearTimeout(timeout); }
}

function endConversation() { sessionId++; window.clearTimeout(unmuteTimer); const current = conversation; conversation = null; connecting = false; if (current) current.endSession().catch(() => {}); show(el.bottomButtons, true); show(el.bottomMic, false); }

function sendTextMessage(text: string) { const message = text.trim(); if (!message) return; if (!conversation) { hint('Open LUMI and tap TALK before sending a text message.'); return; } try { conversation.sendUserMessage(message); hint(''); } catch { hint('Message not sent. Tap TALK to reconnect.'); } }

async function requestMagicLink(email: string) {
  if (!DEMO_CONFIG.supabaseUrl || !DEMO_CONFIG.supabaseAnonKey) throw new Error('Internal sign-in is not configured yet.');
  const response = await fetch(`${DEMO_CONFIG.supabaseUrl}/auth/v1/otp`, { method: 'POST', headers: { apikey: DEMO_CONFIG.supabaseAnonKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, create_user: false, email_redirect_to: `${window.location.origin}${window.location.pathname}` }) });
  if (!response.ok) throw new Error('That sign-in link could not be requested.');
}

function handleAuthHash() { const params = new URLSearchParams(window.location.hash.replace(/^#/, '')); const token = params.get('access_token'); if (token) { accessToken = token; sessionStorage.setItem('lumi_internal_access_token', token); history.replaceState(null, '', window.location.pathname); } }

function bootInternal() {
  handleAuthHash();
  if (!IS_INTERNAL) return;
  if (accessToken) { show(el.internalGate, false); beginTrial(); } else { show(el.internalGate, true); el.internalLoginStatus.textContent = DEMO_CONFIG.supabaseAnonKey ? '' : 'Internal access is unavailable until Supabase Auth is configured.'; }
}

el.playButton.addEventListener('click', openPlayView); el.lumiButton.addEventListener('click', openLumiView); el.startDemoButton.addEventListener('click', beginTrial); el.stopDemoButton.addEventListener('click', () => endTrial(false));
document.querySelectorAll<HTMLButtonElement>('.act').forEach((button) => button.addEventListener('click', () => chooseAction(Number(button.dataset.activity))));
el.cameraButton.addEventListener('click', () => { if (trialActive) void camera.start(); }); el.stopCameraButton.addEventListener('click', () => camera.stop()); el.manualSuccessButton.addEventListener('click', () => acknowledgeAction(false));
el.talkButton.addEventListener('click', () => void startConversation()); el.stopButton.addEventListener('click', endConversation); el.typeButton.addEventListener('click', () => { el.debugInput.hidden = !el.debugInput.hidden; if (!el.debugInput.hidden) el.debugText.focus(); });
el.debugInput.addEventListener('submit', (event) => { event.preventDefault(); sendTextMessage(el.debugText.value); el.debugText.value = ''; });
el.closeCompletionButton.addEventListener('click', () => { show(el.completionDialog, false); show(el.welcomePanel, true); show(el.activityButtons, false); }); el.restartDemoButton.addEventListener('click', () => { show(el.completionDialog, false); beginTrial(); });
el.internalLoginForm.addEventListener('submit', async (event) => { event.preventDefault(); el.internalLoginStatus.textContent = 'Sending sign-in link…'; try { await requestMagicLink(el.internalEmail.value.trim()); el.internalLoginStatus.textContent = 'Check your email for the one-time sign-in link.'; } catch (error) { el.internalLoginStatus.textContent = describeFailure(error); } });
el.internalLogoutButton.addEventListener('click', () => { accessToken = ''; sessionStorage.removeItem('lumi_internal_access_token'); endTrial(false); show(el.internalGate, true); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { endConversation(); camera.stop(); } else if (!IS_INTERNAL) clock.reconcile(); });
window.addEventListener('pagehide', () => { endConversation(); camera.dispose(); });

openPlayView(); bootInternal();
(window as unknown as { lumi: object }).lumi = { get connected() { return Boolean(conversation); }, get mode() { return viewMode; }, get trialActive() { return trialActive; }, get trialEnded() { return trialEnded; }, get internal() { return IS_INTERNAL; }, startDemo: beginTrial, stopDemo: () => endTrial(false) };
