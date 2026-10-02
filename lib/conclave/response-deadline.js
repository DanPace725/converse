// Leave time to persist partial output and the terminal checkpoint before the
// hosted repository's 200-second deadline and Vercel's 240-second ceiling.
export const RESPONSE_TIMEOUT_MS = 180000;
export const HOSTED_REQUEST_TIMEOUT_MS = 200000;

export function hostedRequestSignal() {
  const controller = new AbortController();
  const timer = AbortSignal.timeout(HOSTED_REQUEST_TIMEOUT_MS);
  timer.addEventListener('abort', () => controller.abort(Object.assign(
    Error('The hosted request reached its 200-second limit. Completed actions and partial diagnostics are saved; start a follow-up from the saved progress.'),
    { name: 'TimeoutError', agent_detail: { code: 'hosted_request_timeout', timeout_ms: HOSTED_REQUEST_TIMEOUT_MS } },
  )), { once: true });
  return controller.signal;
}

export async function withResponseDeadline(provider, parentSignal, invoke, timeoutMs = RESPONSE_TIMEOUT_MS) {
  const local = AbortSignal.timeout(timeoutMs);
  const signal = parentSignal ? AbortSignal.any([local, parentSignal]) : local;
  try {
    return await invoke(signal);
  } catch (error) {
    // The run/request's earlier deadline takes precedence over this allowance.
    if (parentSignal?.aborted) {
      const reason = parentSignal.reason;
      if (!reason?.agent_detail) throw error;
      const failure = Object.assign(Error(reason.message), { name: 'TimeoutError', cause: error, agent_detail: reason.agent_detail });
      if (error.partial_response) failure.partial_response = error.partial_response;
      throw failure;
    }
    if (!local.aborted) throw error;
    const label = provider === 'anthropic' ? 'Claude' : 'GPT';
    const failure = Object.assign(Error(`${label} response timed out after ${timeoutMs / 1000} seconds. The response did not finish; completed actions and partial diagnostics are saved.`), {
      name: 'TimeoutError', cause: error,
      agent_detail: { code: 'provider_response_timeout', provider, timeout_ms: timeoutMs },
    });
    if (error.partial_response) failure.partial_response = error.partial_response;
    throw failure;
  }
}
