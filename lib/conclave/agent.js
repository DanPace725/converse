import { randomUUID } from "node:crypto";
import { budgetUnits } from "./harness.js";
import { inputSize } from "./input-size.js";
import { WorkspaceHarness, workspaceFiles } from "./workspace.js";
export { workspaceFiles } from "./workspace.js";
import { responseText, redact } from "./provider.js";
import { runMetrics, stopDetail } from "./agent-diagnostics.js";

export const agentDefaults = {
  budget: 256000,
  output: 16384,
  max_steps: 40,
  duration_seconds: 600,
  max_total_tokens: 250000,
};
export const agentCeilings = { max_steps: 200, duration_seconds: 3600, max_total_tokens: 2000000 };

// Automatic testing grows allowances only as the loop needs them, up to fixed ceilings.
async function capacity(store, id, state, required) {
  if (state.limit_mode !== 'adaptive') return;
  const previous = { ...state.limits };
  for (const [key, value] of Object.entries(required)) {
    if (value > state.limits[key]) state.limits[key] = Math.min(agentCeilings[key],
      Math.max(value, state.limits[key] * 2));
  }
  if (JSON.stringify(previous) === JSON.stringify(state.limits)) return;
  state.deadline = Date.parse(state.started_at) + state.limits.duration_seconds * 1000;
  store.append(id, 'agent_limit_adjustment', 'Automatically expanded testing allowance', {
    run_id: state.run_id, previous, limits: { ...state.limits }, required, ceilings: agentCeilings,
  });
  // Persist the expanded allowance before another paid call.
  await checkpoint(store, id, state);
}
const fail = (text, status = 400) => {
  throw Object.assign(Error(text), { status });
};
const integer = (value, min, max, name) => {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    fail(`${name} must be an integer from ${min} to ${max}`);
  return value;
};
export function agentState(store, id) {
  return (
    store.events(id).findLast((e) => e.kind === "agent_checkpoint")?.metadata
      .state || null
  );
}
export function agentView(store, id) {
  const state = agentState(store, id);
  if (!state) return null;
  const { pending, protected_ids, continuation, ...view } = state;
  // Old runs did not save their end timestamp; the terminal checkpoint is authoritative.
  const endCheckpoint = state.status === 'running' ? null : store.events(id).findLast(e =>
    e.kind === 'agent_checkpoint' && e.metadata.state.run_id === state.run_id);
  const end = endCheckpoint?.timestamp;
  const metrics = runMetrics(store.events(id), { ...state, finished_after_seq: state.finished_after_seq || endCheckpoint?.seq });
  return {
    ...view,
    stop: state.status === 'running' ? null : state.stop || stopDetail(state.status, state, state.error),
    metrics,
    usage_complete: metrics.usage_complete,
    elapsed_seconds: Math.max(0, ((Date.parse(state.finished_at || end) || Date.now()) - Date.parse(state.started_at)) / 1000),
    files: workspaceFiles(store, id),
    tools: store
      .events(id)
      .filter(
        (e) => e.kind === "tool_call" && e.metadata.run_id === state.run_id,
      )
      .slice(-12)
      .map((e) => ({ name: e.content, timestamp: e.timestamp })),
  };
}
const checkpoint = async (store, id, state) => {
  store.append(id, "agent_checkpoint", state.status, { state });
  await store.flush?.();
};

// Store each projection once in the canonical audit. Checkpoints reference it
// instead of copying a full context into every step and status response.
export function restoreProjection(h, state) {
  if (state.settings.freezeProjection !== true) return;
  const event = h.store.events(h.conversation).find(e => e.id === state.projection_event_id);
  if (event?.kind === 'agent_projection' && event.metadata.run_id === state.run_id)
    h.frozenInput = structuredClone(event.metadata.input);
  h.forceHandoff = state.projection_handoff === true;
}
function saveProjection(h, state) {
  if (state.settings.freezeProjection !== true) return;
  if (!h.frozenInput) state.projection_event_id = null;
  else if (h.frozenInput !== h.savedProjection) {
    const event = h.store.append(h.conversation, 'agent_projection', '', {
      run_id: state.run_id, revision: h.store.context(h.conversation).revision,
      input: structuredClone(h.frozenInput),
    });
    state.projection_event_id = event.id;
    h.savedProjection = h.frozenInput;
  }
  state.projection_handoff = h.forceHandoff === true;
}

export class AgentHarness extends WorkspaceHarness {
  answerPayload(pending = []) {
    const payload = super.answerPayload(pending);
    payload.instructions +=
      "\nYou are running an autonomous task. Continue useful tool actions until the objective is complete, then return a final report. A text response without tool calls ends the run after completion checks.";
    return payload;
  }
}

export async function startAgent(service, id, input) {
  if (agentState(service.store, id)?.status === "running")
    fail("Stop the current agent before starting another", 409);
  if (
    typeof input.content !== "string" ||
    !input.content.trim() ||
    input.content.length > 100000
  )
    fail("Supply an agent objective");
  if (
    typeof input.message_id !== "string" ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(input.message_id)
  )
    fail("Invalid message ID");
  if (
    service.store
      .events(id)
      .some(
        (e) =>
          e.kind === "user" &&
          e.metadata.client_message_id === input.message_id,
      )
  )
    fail("Message ID already saved", 409);
  const settings = service.settings({
    ...input.settings,
    budget: input.settings?.budget ?? agentDefaults.budget,
    output: input.settings?.output ?? agentDefaults.output,
    jev: input.settings?.jev ?? true,
  });
  const limitMode = input.limits?.mode ?? 'fixed';
  if (!['fixed', 'adaptive'].includes(limitMode)) fail('Invalid agent limit mode');
  const limits = limitMode === 'adaptive' ? { ...agentDefaults } : { ...agentDefaults, ...input.limits };
  delete limits.mode;
  integer(limits.max_steps, 1, 200, "max_steps");
  integer(limits.duration_seconds, 10, 3600, "duration_seconds");
  integer(limits.max_total_tokens, 1000, 2000000, "max_total_tokens");
  const documents = input.attachments ?? [];
  if (!Array.isArray(documents) || documents.length > 1)
    fail("At most one Markdown attachment");
  const attachments = documents.map((a) => service.validateAttachment(a));
  if (
    attachments.some((a) =>
      service.store
        .events(id)
        .some((e) => e.metadata.attachment_id === a.attachment_id),
    )
  )
    fail("Attachment ID already saved", 409);
  const revision = service.revisionMetadata(id, input.revises_message_id);
  const h = new AgentHarness(service.store, id, { name: settings.provider }, settings);
  for (const doc of attachments) {
    const { content, ...metadata } = doc;
    h.ingestText(doc.name, content, input.content, metadata);
  }
  const added = h.addMessage(
    "user",
    input.content.trim(),
    {},
    {
      client_message_id: input.message_id,
      web_settings: settings,
      attachment_ids: attachments.map((a) => a.attachment_id),
      purpose: "agent-objective",
      ...revision,
    },
  );
  await checkpoint(service.store, id, {
    run_id: "run_" + randomUUID(),
    harness_version: 4,
    limit_mode: limitMode,
    status: "running",
    phase: "ready",
    steps: 0,
    started_at: new Date().toISOString(),
    deadline: Date.now() + limits.duration_seconds * 1000,
    settings,
    limits,
    user_event_id: added.event.id,
    started_after_seq: service.store.events(id).at(-1).seq,
    protected_ids: [added.item.id],
    pending: [],
    input_tokens: 0,
    output_tokens: 0,
  });
}

export async function stopAgent(service, id, runId) {
  const state = agentState(service.store, id);
  if (!state || state.run_id !== runId) fail("Agent run not found", 404);
  if (state.status === "running")
    await checkpoint(service.store, id, {
      ...state,
      status: "stopped",
      phase: "ready",
      pending: [],
      finished_at: new Date().toISOString(),
      finished_after_seq: service.store.events(id).at(-1).seq,
      stop: stopDetail('stopped', state),
    });
}

export async function stepAgent(service, id, input, { onEvent } = {}) {
  const saved = agentState(service.store, id);
  if (!saved || saved.run_id !== input.run_id) fail("Agent run not found", 404);
  integer(input.expected_step, 0, 200, "expected_step");
  if (input.expected_step > saved.steps) fail("Stale agent step; reload", 409);
  if (saved.status !== "running" || input.expected_step < saved.steps) return;
  const state = structuredClone(saved),
    store = service.store;
  const finish = async (status, error, detail) => {
    // Include billed usage from incomplete/failed responses as well as successful steps.
    const responses = store
      .events(id)
      .filter(
        (e) =>
          e.seq > state.started_after_seq && e.kind === "inference_response",
      );
    state.usage_complete = runMetrics(store.events(id), state).usage_complete;
    state.input_tokens = responses.reduce(
      (n, e) => n + (e.metadata.usage?.input_tokens || 0),
      0,
    );
    state.output_tokens = responses.reduce(
      (n, e) => n + (e.metadata.usage?.output_tokens || 0),
      0,
    );
    state.status = status;
    state.phase = "ready";
    state.pending = [];
    state.continuation = null;
    state.finished_at = new Date().toISOString();
    state.finished_after_seq = store.events(id).at(-1).seq;
    state.stop = stopDetail(status, state, error, detail);
    if (error) state.error = error;
    await checkpoint(store, id, state);
  };
  if (state.phase === "inflight")
    return finish(
      "interrupted",
      "A previous step did not checkpoint. Its audit is saved; start a new run rather than replay a possibly executed action.",
    );
  await capacity(store, id, state, {
    max_steps: state.steps + 1,
    duration_seconds: Math.ceil((Date.now() - Date.parse(state.started_at)) / 1000) + 90,
  });
  if (Date.now() >= state.deadline) return finish("expired");
  if (state.steps >= state.limits.max_steps) return finish("step_limit");
  try {
    // Old checkpoints mixed advisory selector holds into request safeguards.
    // Recover only the current objective; pins/state are checked independently.
    state.protected_ids = store
      .context(id)
      .segments.filter(
        (s) =>
          s.type === "user" && s.source_event_ids.includes(state.user_event_id),
      )
      .map((s) => s.id);
    state.harness_version = 4;
    const h = new AgentHarness(store, id, service.providerFactory(state.settings.provider || 'openai'), {
      ...state.settings,
      run_id: state.run_id,
      onEvent,
      decisionAdapter: service.decisionAdapter(state.settings),
      compactAttempts: 1,
    });
    h.continuation = state.continuation || null;
    restoreProjection(h, state);
    h.savedProjection = h.frozenInput;
    const responses = () =>
      store
        .events(id)
        .filter(
          (e) =>
            e.seq > state.started_after_seq && e.kind === "inference_response",
        );
    const usageTotal = () =>
      responses().reduce(
        (n, e) =>
          n +
          (e.metadata.usage?.input_tokens || 0) +
          (e.metadata.usage?.output_tokens || 0),
        0,
      );
    h.syncWorkspaceContext();
    const invoke = h.call.bind(h);
    h.call = async (payload, purpose, limits = {}) => {
      if (
        responses().some(
          (e) =>
            !Number.isSafeInteger(e.metadata.usage?.input_tokens) ||
            !Number.isSafeInteger(e.metadata.usage?.output_tokens),
        )
      )
        throw Object.assign(Error(
          "Provider usage was missing; stopped to preserve the total-token limit.",
        ), { agent_detail: { code: 'usage_missing', purpose } });
      await capacity(store, id, state, {
        duration_seconds: Math.ceil((Date.now() - Date.parse(state.started_at)) / 1000) + 90,
      });
      if (Date.now() >= state.deadline)
        throw Object.assign(Error("Agent deadline reached"), {
          agent_status: "expired",
        });
      const reserve = purpose === "attention-selection"
            ? 1024
            : (limits.output ??
              payload.max_output_tokens ??
              state.settings.output);
      const provider = limits.provider || h.provider;
      const estimate = inputSize(payload, provider, store.events(id));
      const inputUnits = estimate.estimated_tokens;
      const required = usageTotal() + inputUnits + reserve;
      await capacity(store, id, state, { max_total_tokens: required });
      if (required > state.limits.max_total_tokens)
        throw Object.assign(
          Error("Total-token limit reached before the next call"),
          { agent_status: "token_limit", agent_detail: {
            code: 'next_call_reserve', purpose, estimated_input_units: inputUnits,
            estimated_input_tokens: inputUnits, input_bytes: estimate.bytes,
            output_reserve: reserve, required_tokens: required, limit_tokens: state.limits.max_total_tokens,
            counter: estimate.method,
            message: `Next ${purpose} call blocked: ${usageTotal()} reported tokens + ${inputUnits} estimated input tokens + ${reserve} output reserve = ${required}, above the ${state.limits.max_total_tokens} allowance. ` +
              (state.limits.max_total_tokens >= agentCeilings.max_total_tokens
                ? 'The maximum run allowance was reached. Saved files and the audit remain available for a follow-up.'
                : 'Increase the total limit or choose Automatic testing.'),
          } },
        );
      const bounded = {
        name: provider.name,
        ...(provider.requestPayload ? { requestPayload: p => provider.requestPayload(p) } : {}),
        respond: (p, options) =>
          provider.respond(p, {
            ...options,
            signal: AbortSignal.timeout(
              Math.max(1, state.deadline - Date.now()),
            ),
          }),
      };
      const response = await invoke(payload, purpose, {
        ...limits,
        provider: bounded,
      });
      if (
        !Number.isSafeInteger(response.usage?.input_tokens) ||
        !Number.isSafeInteger(response.usage?.output_tokens)
      )
        throw Object.assign(Error(
          "Provider usage was missing; stopped to preserve the total-token limit.",
        ), { agent_detail: { code: 'usage_missing', purpose } });
      if (usageTotal() >= state.limits.max_total_tokens)
        await capacity(store, id, state, { max_total_tokens: usageTotal() + 1 });
      if (usageTotal() >= state.limits.max_total_tokens)
        throw Object.assign(Error("Total-token limit reached"), {
          agent_status: "token_limit", agent_detail: { code: 'reported_token_limit', purpose, limit_tokens: state.limits.max_total_tokens,
            message: `Reported usage reached ${usageTotal()} tokens against the ${state.limits.max_total_tokens} run allowance. Saved files and the audit remain available.` },
        });
      return response;
    };
    state.phase = "inflight";
    await checkpoint(store, id, state);
    if (!h.frozenInput) await h.reviewContext(
      state.protected_ids, h.continuation ? 0 : budgetUnits(state.pending),
    );
    h.protectedIds = state.protected_ids;
    const prepared = h.prepareAnswer(state.pending, state.protected_ids);
    state.continuation = h.continuation || null;
    saveProjection(h, state);
    const response = await h.call(
      prepared,
      "answer",
    );
    state.input_tokens = responses().reduce(
      (n, e) => n + e.metadata.usage.input_tokens,
      0,
    );
    state.output_tokens = responses().reduce(
      (n, e) => n + e.metadata.usage.output_tokens,
      0,
    );
    state.steps++;
    const usage = response.usage;
    if (
      Number.isSafeInteger(usage?.input_tokens) &&
      Number.isSafeInteger(usage?.output_tokens)
    ) {
      // Usage includes task calls and context-management calls.
    } else
      return finish(
        "failed",
        "Provider usage was missing; stopped to preserve the total-token limit.",
      );
    const calls = (response.output || []).filter(
      (item) => item.type === "function_call",
    );
    if (!calls.length) {
      const answer = responseText(response);
      if (!answer) throw Error("No final answer or tool call returned");
      const correction = h.completionCheck();
      if (correction) {
        state.pending.push(...response.output, {
          role: "user",
          content: correction,
        });
        state.phase = "ready";
        await capacity(store, id, state, { max_steps: state.steps + 1 });
        if (state.steps >= state.limits.max_steps) return finish("step_limit");
        await checkpoint(store, id, state);
        return;
      }
      const completed = h.addMessage("assistant", answer, {}, { model: response.model || null });
      store.append(id, "turn_complete", "", {
        user_event_id: state.user_event_id,
        assistant_event_id: completed.event.id,
        run_id: state.run_id,
      });
      return finish("completed");
    }
    if (calls.length > 8) throw Error("Too many tool calls in one step");
    state.pending.push(...response.output);
    for (const call of calls) {
      if (Date.now() >= state.deadline) return finish("expired");
      store.append(
        id,
        "tool_call",
        call.name,
        {
          run_id: state.run_id,
          call_id: call.call_id,
          arguments: call.arguments,
          user_event_id: state.user_event_id,
          request_id: h.lastRequestId,
          revision: store.context(id).revision,
        },
        h.provider.name,
      );
      let result;
      try {
        result = h.toolResult(
          call.name,
          JSON.parse(call.arguments),
          state.protected_ids,
        );
      } catch (error) {
        result = {
          error: redact(error),
          revision: store.context(id).revision,
          ...(error.inspection ? { inspection: error.inspection } : {}),
        };
      }
      store.append(id, "tool_result", JSON.stringify(result), {
        run_id: state.run_id,
        call_id: call.call_id,
        tool: call.name,
        request_id: h.lastRequestId,
        previous_revision: store
          .events(id)
          .findLast(
            (e) =>
              e.kind === "tool_call" && e.metadata.call_id === call.call_id,
          )?.metadata.revision,
        revision: store.context(id).revision,
      });
      state.pending.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(result),
      });
    }
    state.continuation = h.continuation || null;
    saveProjection(h, state);
    state.input_tokens = responses().reduce(
      (n, e) => n + e.metadata.usage.input_tokens,
      0,
    );
    state.output_tokens = responses().reduce(
      (n, e) => n + e.metadata.usage.output_tokens,
      0,
    );
    state.phase = "ready";
    await capacity(store, id, state, { max_steps: state.steps + 1 });
    if (state.steps >= state.limits.max_steps) return finish("step_limit");
    if (Date.now() >= state.deadline) return finish("expired");
    await checkpoint(store, id, state);
  } catch (error) {
    if (error.agent_status) return finish(error.agent_status, undefined, error.agent_detail);
    if (Date.now() >= state.deadline) return finish("expired", redact(error));
    store.append(id, "turn_failure", redact(error), {
      user_event_id: state.user_event_id,
      run_id: state.run_id,
    });
    const last = store.events(id).findLast(e => e.kind === 'inference_response' && e.seq > state.started_after_seq);
    const detail = error.agent_detail || {
      code: /^(Context budget|Request byte guard) exceeded/.test(error.message) ? 'context_budget' :
        last?.metadata.status && last.metadata.status !== 'completed' ? 'provider_incomplete' : 'provider_or_runtime_error',
      ...(last?.metadata.status && last.metadata.status !== 'completed' ? { provider_status: last.metadata.status,
        provider_stop_reason: last.metadata.stop_reason || last.metadata.incomplete_details?.reason || null } : {}),
    };
    await finish("failed", redact(error), detail);
  }
}
