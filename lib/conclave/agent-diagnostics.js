// Run-scoped measurements; cached input is a subset of reported input tokens.
export function runMetrics(events, state) {
  const run = events.filter(e => e.seq > state.started_after_seq &&
    (!state.finished_after_seq || e.seq <= state.finished_after_seq));
  const requests = run.filter(e => e.kind === 'inference_request');
  const requestIds = new Set(requests.map(e => e.id));
  const responses = run.filter(e => e.kind === 'inference_response' && requestIds.has(e.metadata.request_id));
  const byPurpose = {};
  for (const purpose of new Set(requests.map(e => e.content))) {
    const submitted = requests.filter(e => e.content === purpose);
    const ids = new Set(submitted.map(e => e.id));
    const received = responses.filter(e => ids.has(e.metadata.request_id));
    byPurpose[purpose] = {
      calls: submitted.length, responses: received.length,
      input_tokens: received.reduce((n,e) => n + (e.metadata.usage?.input_tokens || 0), 0),
      output_tokens: received.reduce((n,e) => n + (e.metadata.usage?.output_tokens || 0), 0),
      usage_complete: received.length === submitted.length && received.every(e =>
        e.metadata.status !== 'partial' && Number.isSafeInteger(e.metadata.usage?.input_tokens) && Number.isSafeInteger(e.metadata.usage?.output_tokens)),
    };
  }
  const results = run.filter(e => e.kind === 'tool_result' && e.metadata.run_id === state.run_id);
  const toolErrors = results.flatMap(e => {
    try { const value = JSON.parse(e.content); return value.error ? [{tool: e.metadata.tool, message: value.error, seq: e.seq}] : []; }
    catch { return []; }
  });
  return {
    calls: requests.length, responses: responses.length, usage_by_purpose: byPurpose,
    usage_complete: Object.values(byPurpose).every(p => p.usage_complete),
    cached_input_tokens: responses.reduce((n,e) => n + (e.metadata.usage?.input_tokens_details?.cached_tokens || e.metadata.usage?.cache_read_input_tokens || 0), 0),
    tool_calls: run.filter(e => e.kind === 'tool_call' && e.metadata.run_id === state.run_id).length,
    tool_errors: toolErrors,
    inference_failures: run.filter(e => e.kind === 'inference_failure').length,
    readbacks: run.filter(e => e.kind === 'workspace_read').length,
    completion_corrections: run.filter(e => e.kind === 'workspace_validation').length,
    limit_adjustments: run.filter(e => e.kind === 'agent_limit_adjustment').length,
  };
}

export function stopDetail(status, state, error, detail = {}) {
  const messages = {
    completed: state.harness_version >= 2 ? 'The model finished. Written files passed the readback check.' : 'The model returned a final answer.',
    token_limit: 'The total-token guard blocked further calls. It includes reported usage plus an estimated complete input-token reserve and output reserve for the next call.',
    step_limit: `Reached the ${state.limits.max_steps}-step limit.`,
    expired: `Reached the ${state.limits.duration_seconds}-second run deadline.`,
    stopped: 'Stopped by you. Saved files and the audit remain available.',
    interrupted: 'A previous request did not checkpoint. Start a new run to avoid replaying a possibly executed action.',
    failed: error || 'The run failed. Inspect its audit for the provider or tool error.',
  };
  return { code: status, message: error || messages[status] || status,
    used_tokens: state.input_tokens + state.output_tokens, ...detail };
}
