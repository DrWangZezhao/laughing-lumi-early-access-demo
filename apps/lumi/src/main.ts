// Web port of the Lumi Unity scene (SampleScene, cs:7). Comments reference the
// original C# classes so behaviour can be checked against the source.
import './style.css';
import { Conversation, type VoiceConversation } from '@elevenlabs/client';

// From SampleScene.unity -> ElevenLabsClient.agentId
const AGENT_ID = 'agent_9301kcgfjb9dej59tnqs95024zq1';
// ElevenLabsConvAIClient.unmuteDelaySeconds
const UNMUTE_DELAY_MS = 400;
// Strings copied from ElevenLabsConvAIClient.cs
const QUOTA_MSG = 'Voice unavailable: ElevenLabs credits exhausted. After credits are restored, restart Play mode.';
const CLOSED_MSG = 'Voice connection closed. Tap TALK to reconnect.';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const el = {
  playButton: $('playButton'),
  lumiButton: $('lumiButton'),
  activityWindow: $('activityWindow'),
  companionWindow: $('companionWindow'),
  activityButtons: $('activityButtons'),
  activityInstruction: $('activityInstruction'),
  bottomButtons: $('bottomInteractionButtons'),
  bottomMic: $('bottomInteractionMicrophone'),
  talkButton: $('talkButton'),
  stopButton: $('stopButton'),
  debugBG: $('debugBG'),
  debugTranscript: $('debugTranscript'),
  debugInput: $<HTMLFormElement>('debugInput'),
  debugText: $<HTMLInputElement>('debugText'),
  debugHint: $('debugHint'),
};

const show = (e: HTMLElement, on: boolean) => e.classList.toggle('hidden', !on);

// ---------------------------------------------------------------- UIModeToggle
type ViewMode = 'Play' | 'Lumi';
let viewMode: ViewMode = 'Play';

function setToggle(mode: ViewMode) {
  const play = mode === 'Play';
  el.playButton.classList.toggle('on', play);
  el.lumiButton.classList.toggle('on', !play);
  el.playButton.setAttribute('aria-selected', String(play));
  el.lumiButton.setAttribute('aria-selected', String(!play));
}

function playMode() {
  if (viewMode === 'Play') return;
  viewMode = 'Play';
  setToggle('Play');
  openPlayView();
}

function lumiMode() {
  if (viewMode === 'Lumi') return;
  viewMode = 'Lumi';
  setToggle('Lumi');
  openLumiView();
}

// ------------------------------------------------------------------- UIManager
function openPlayView() {
  show(el.activityWindow, true);
  show(el.companionWindow, false);
  activityOpenView();
  characterCloseView();
}

function openLumiView() {
  show(el.companionWindow, true);
  show(el.activityWindow, false);
  characterOnEnable();
  characterOpenView();
  // UIActivityView.CloseView() is empty in the source.
}

// -------------------------------------------------------------- UIActivityView
function activityOpenView() {
  show(el.activityButtons, true);
  show(el.activityInstruction, false);
}

function selectActivity(activity: number) {
  // Only Activity.Show (0) has behaviour in the source; Listen/Draw/Do are empty cases.
  if (activity === 0 || activity > 3) {
    show(el.activityButtons, false);
    show(el.activityInstruction, true);
  }
}

// ------------------------------------------------------------- UICharacterView
function characterOnEnable() {
  setTranscript('');
}

function characterOpenView() {
  show(el.bottomButtons, true);
  show(el.bottomMic, false);
}

function characterCloseView() {
  endConversation();
}

function setTranscript(text: string) {
  el.debugTranscript.textContent = text;
  show(el.debugBG, text.length > 0);
}

// ------------------------------------------------------ ElevenLabsConvAIClient
// Every session gets an id. Callbacks from an older session (after STOP, a view
// switch or a page hide) compare ids and do nothing, so a late reply can never
// reopen the UI or overwrite the current state.
const CONNECT_TIMEOUT_MS = 20000;
let conversation: VoiceConversation | null = null;
let connecting = false;
let quotaExhausted = false;
let unmuteTimer: number | undefined;
let sessionId = 0;

function setListeningUI(on: boolean) {
  // The scene has the "LUMI IS LISTENING..." panel (BottomInteractionMicrophone) but in
  // cs:7 nothing activates it; we show it while a session is live, as in the Figma mockup.
  show(el.bottomButtons, !on);
  show(el.bottomMic, on);
}

/** Readable text for a failed start or a dropped connection. */
function describeFailure(err: unknown): string {
  const name = (err as { name?: string })?.name ?? '';
  const msg = err instanceof Error ? err.message : String(err ?? '');
  if (name === 'NotAllowedError' || name === 'SecurityError' || /permission denied|not allowed/i.test(msg))
    return 'Microphone access is blocked. Allow the microphone for this page in the browser settings, then tap TALK again.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError')
    return 'No microphone found. Connect a microphone and tap TALK again.';
  if (name === 'NotReadableError' || name === 'AbortError')
    return 'The microphone is in use by another app. Close it and tap TALK again.';
  if (/quota_exceeded/i.test(msg)) { quotaExhausted = true; return QUOTA_MSG; }
  if (!navigator.onLine) return 'No internet connection. Connect and tap TALK to try again.';
  const detail = msg ? `\n(${msg})` : '';
  return `Lumi is not available right now. Tap TALK to try again.${detail}`;
}

function preflight(): string | null {
  if (!window.isSecureContext) return 'Voice needs a secure page (https or localhost).';
  if (!navigator.mediaDevices?.getUserMedia) return 'This browser cannot use the microphone.';
  if (!navigator.onLine) return 'No internet connection. Connect and tap TALK to try again.';
  return null;
}

async function startConversation() {
  if (quotaExhausted) { setTranscript(QUOTA_MSG); return; }
  if (conversation || connecting) return; // TALK can be clicked repeatedly
  const problem = preflight();
  if (problem) { setTranscript(problem); return; }

  connecting = true;
  const mySession = ++sessionId;
  setListeningUI(true);
  setTranscript('');
  hint('');

  let timer: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error('Connection timed out')), CONNECT_TIMEOUT_MS);
  });
  const starting = Conversation.startSession({
    agentId: AGENT_ID,
    connectionType: 'websocket',
    libsampleratePath: new URL('./vendor/libsamplerate.worklet.js', document.baseURI).href,
    onConnect: () => console.log('[ElevenLabsConvAI] Connected.'),
    onMessage: (m) => {
      if (mySession !== sessionId) return;
      const role = (m as { role?: string }).role ?? (m.source === 'ai' ? 'agent' : 'user');
      console.log(`[ElevenLabsConvAI] [${role}] ${m.message}`);
      if (role === 'agent') setTranscript(m.message);
    },
    onModeChange: ({ mode }) => {
      // preventSpeakerFeedback: mute the mic while Lumi speaks, unmute 0.4 s after.
      if (mySession !== sessionId || !conversation) return;
      window.clearTimeout(unmuteTimer);
      try {
        if (mode === 'speaking') conversation.setMicMuted(true);
        else unmuteTimer = window.setTimeout(() => { try { conversation?.setMicMuted(false); } catch { /* session gone */ } }, UNMUTE_DELAY_MS);
      } catch { /* session gone */ }
    },
    onError: (message) => console.warn('[ElevenLabsConvAI] error:', message),
    onDisconnect: (details) => {
      if (mySession !== sessionId) return;
      const wasConnected = conversation !== null;
      conversation = null;
      connecting = false;
      window.clearTimeout(unmuteTimer);
      setListeningUI(false);
      if (details.reason === 'user') return;
      const reason = ('closeReason' in details && details.closeReason) || ('message' in details && details.message) || '';
      console.warn('[ElevenLabsConvAI] Session ended.', details);
      if (/quota_exceeded/i.test(reason)) { quotaExhausted = true; setTranscript(QUOTA_MSG); return; }
      if (wasConnected) setTranscript(reason ? `${CLOSED_MSG}\n(${reason})` : CLOSED_MSG);
      else setTranscript(describeFailure(new Error(reason)));
    },
  }) as Promise<VoiceConversation>;

  try {
    const conv = await Promise.race([starting, timeout]);
    if (mySession !== sessionId) { conv.endSession().catch(() => {}); return; }
    conversation = conv;
  } catch (err) {
    // A start that finishes after a timeout or STOP must still be closed.
    starting.then((c) => c.endSession().catch(() => {}), () => {});
    if (mySession !== sessionId) return;
    sessionId++; // ignore late callbacks from the failed attempt
    connecting = false;
    setListeningUI(false);
    setTranscript(describeFailure(err));
    console.error('[ElevenLabsConvAI]', err);
  } finally {
    window.clearTimeout(timer);
    if (mySession === sessionId) connecting = false;
  }
}

function endConversation() {
  sessionId++;
  window.clearTimeout(unmuteTimer);
  const c = conversation;
  conversation = null;
  connecting = false;
  if (c) c.endSession().catch(() => {});
  setListeningUI(false);
}

function sendTextMessage(text: string) {
  const t = text.trim();
  if (!t) return;
  if (!conversation) {
    console.warn("[ElevenLabsConvAI] Can't send text: not connected.");
    hint(connecting ? 'Connecting to Lumi, try again in a moment.' : "Can't send text: not connected. Open LUMI and tap TALK first.");
    return;
  }
  try {
    conversation.sendUserMessage(t);
    hint('');
  } catch (err) {
    console.warn('[ElevenLabsConvAI] send failed', err);
    hint('Message not sent. Tap TALK to reconnect.');
  }
}

let hintTimer: number | undefined;
function hint(text: string) {
  el.debugHint.textContent = text;
  show(el.debugHint, !!text);
  window.clearTimeout(hintTimer);
  if (text) hintTimer = window.setTimeout(() => show(el.debugHint, false), 4000);
}

// ---------------------------------------------------------------------- wiring
el.playButton.addEventListener('click', playMode);
el.lumiButton.addEventListener('click', lumiMode);
document.querySelectorAll<HTMLButtonElement>('.act').forEach((b) =>
  b.addEventListener('click', () => selectActivity(Number(b.dataset.activity))),
);
// PlayActivityInstructions(), StartActivity(), TYPE, Scores and Settings have no
// behaviour in the source, so their buttons do nothing here either.
el.talkButton.addEventListener('click', () => void startConversation());
// iOS Safari: the SDK unlocks audio on the tap itself (capture-phase listener
// installed on import), so startConversation must stay a direct click handler.
el.stopButton.addEventListener('click', endConversation);
el.debugInput.addEventListener('submit', (e) => {
  e.preventDefault();
  sendTextMessage(el.debugText.value);
  el.debugText.value = '';
});

// Leaving the page (tab hidden, app switched, navigation) ends the session so the
// microphone is released and no credits are used in the background.
window.addEventListener('pagehide', endConversation);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') endConversation(); });

// expose for automated tests
(window as unknown as { lumi: object }).lumi = { get connected() { return !!conversation; }, get mode() { return viewMode; } };
