import { createHandler } from './handler.js';
// Privileged key is supplied only by Supabase's server runtime. Never log requests.
Deno.serve(createHandler(Deno.env.toObject()));
