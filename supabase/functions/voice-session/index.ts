import { createVoiceHandler } from './handler.js';

// The browser never receives the ElevenLabs API key. Internal identity is
// checked here before the internal agent is selected.
Deno.serve(createVoiceHandler(Deno.env.toObject()));
