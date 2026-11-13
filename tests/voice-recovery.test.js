import test from 'node:test';
import assert from 'node:assert/strict';
import { voiceFailure } from '../apps/lumi/src/voice-recovery.js';

test('temporary provider rejection and network loss allow bounded recovery', () => {
  const failure = voiceFailure(new Error('The AI agent you are trying to reach is not available.'));
  assert.equal(failure.retryable, true);
  assert.match(failure.message, /voice service is temporarily unavailable/i);
  assert.equal(voiceFailure(new TypeError('Failed to fetch')).retryable, true);
});

test('permission, missing microphone, service quota and auth errors do not retry', () => {
  for (const name of ['NotAllowedError', 'NotFoundError']) {
    const error = new Error(); error.name = name;
    assert.equal(voiceFailure(error).retryable, false);
  }
  for (const message of ['Daily quota exceeded', 'Unauthorized', 'Forbidden', 'Authentication required']) assert.equal(voiceFailure(message).retryable, false, message);
});
