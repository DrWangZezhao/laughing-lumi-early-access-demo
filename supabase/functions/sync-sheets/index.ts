import { createSyncHandler } from './handler.js';

// Invoke this function from an authorized scheduler or operator. It is not
// exposed to the browser and retries failed adapter writes through the outbox.
Deno.serve(createSyncHandler(Deno.env.toObject()));
