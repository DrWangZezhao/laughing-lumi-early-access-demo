// Provider failures are distinct from camera permission and movement results.
export function voiceFailure(error) {
  const name = error?.name || '';
  const message = error instanceof Error ? error.message : String(error || '');
  if (name === 'NotAllowedError' || /permission denied|NotAllowedError/i.test(message))
    return { message: 'Microphone permission is off. Allow it in your browser, then stop and start the demo.', retryable: false };
  if (name === 'NotFoundError')
    return { message: 'No microphone found. Connect one, then stop and start the demo.', retryable: false };
  if (/quota|daily.?limit|unauthori[sz]ed|forbidden|authentication|override.*(?:not allowed|disabled)/i.test(message))
    return { message: 'Voice is unavailable at the service. Please try again later.', retryable: false };
  return { message: /agent.*not available/i.test(message)
    ? 'Lumi’s voice service is temporarily unavailable.' : 'Lumi’s voice connection was interrupted.', retryable: true };
}
