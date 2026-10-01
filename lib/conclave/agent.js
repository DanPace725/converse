import { randomUUID } from "node:crypto";
import { budgetUnits } from "./harness.js";
import { WorkspaceHarness, workspaceFiles } from "./workspace.js";
export { workspaceFiles } from "./workspace.js";
import { responseText, redact } from "./provider.js";

export const agentDefaults = {
  budget: 256000,
  output: 16384,
  max_steps: 40,
  duration_seconds: 600,
  max_total_tokens: 250000,
};
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
  const { pending, protected_ids, ...view } = state;
  return {
    ...view,
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

class AgentHarness extends WorkspaceHarness {
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
  const limits = { ...agentDefaults, ...input.limits };
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
  const h = new AgentHarness(service.store, id, { name: "openai" }, settings);
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
    },
  );
  await checkpoint(service.store, id, {
    run_id: "run_" + randomUUID(),
    harness_version: 2,
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
    });
}

export async function stepAgent(service, id, input) {
  const saved = agentState(service.store, id);
  if (!saved || saved.run_id !== input.run_id) fail("Agent run not found", 404);
  integer(input.expected_step, 0, 200, "expected_step");
  if (input.expected_step > saved.steps) fail("Stale agent step; reload", 409);
  if (saved.status !== "running" || input.expected_step < saved.steps) return;
  const state = structuredClone(saved),
    store = service.store;
  const finish = async (status, error) => {
    // Include billed usage from incomplete/failed responses as well as successful steps.
    const responses = store
      .events(id)
      .filter(
        (e) =>
          e.seq > state.started_after_seq && e.kind === "inference_response",
      );
    state.usage_complete = responses.every(
      (e) =>
        Number.isSafeInteger(e.metadata.usage?.input_tokens) &&
        Number.isSafeInteger(e.metadata.usage?.output_tokens),
    );
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
    if (error) state.error = error;
    await checkpoint(store, id, state);
  };
  if (state.phase === "inflight")
    return finish(
      "interrupted",
      "A previous step did not checkpoint. Its audit is saved; start a new run rather than replay a possibly executed action.",
    );
  if (Date.now() >= state.deadline) return finish("expired");
  if (state.steps >= state.limits.max_steps) return finish("step_limit");
  try {
    const h = new AgentHarness(store, id, service.providerFactory(), {
      ...state.settings,
      decisionAdapter: service.decisionAdapter(state.settings),
      compactAttempts: 1,
    });
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
        throw Error(
          "Provider usage was missing; stopped to preserve the total-token limit.",
        );
      if (Date.now() >= state.deadline)
        throw Object.assign(Error("Agent deadline reached"), {
          agent_status: "expired",
        });
      if (
        usageTotal() +
          budgetUnits(payload) +
          (purpose === "attention-selection"
            ? 1024
            : (limits.output ??
              payload.max_output_tokens ??
              state.settings.output)) >
        state.limits.max_total_tokens
      )
        throw Object.assign(
          Error("Total-token limit reached before the next call"),
          { agent_status: "token_limit" },
        );
      const provider = limits.provider || h.provider;
      const bounded = {
        name: provider.name,
        respond: (p) =>
          provider.respond(p, {
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
        throw Error(
          "Provider usage was missing; stopped to preserve the total-token limit.",
        );
      if (usageTotal() >= state.limits.max_total_tokens)
        throw Object.assign(Error("Total-token limit reached"), {
          agent_status: "token_limit",
        });
      return response;
    };
    state.phase = "inflight";
    await checkpoint(store, id, state);
    const compacted = await h.compact(
      state.protected_ids,
      false,
      budgetUnits(state.pending),
    );
    state.protected_ids.push(...compacted.decision_retained_bundle_ids);
    const response = await h.call(
      h.prepareAnswer(state.pending, state.protected_ids),
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
        if (state.steps >= state.limits.max_steps) return finish("step_limit");
        await checkpoint(store, id, state);
        return;
      }
      const completed = h.addMessage("assistant", answer);
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
        },
        "openai",
      );
      let result;
      try {
        result = h.toolResult(
          call.name,
          JSON.parse(call.arguments),
          state.protected_ids,
        );
      } catch (error) {
        result = { error: redact(error), revision: store.context(id).revision };
      }
      store.append(id, "tool_result", JSON.stringify(result), {
        run_id: state.run_id,
        call_id: call.call_id,
        tool: call.name,
      });
      state.pending.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(result),
      });
    }
    state.input_tokens = responses().reduce(
      (n, e) => n + e.metadata.usage.input_tokens,
      0,
    );
    state.output_tokens = responses().reduce(
      (n, e) => n + e.metadata.usage.output_tokens,
      0,
    );
    state.phase = "ready";
    if (state.steps >= state.limits.max_steps) return finish("step_limit");
    if (Date.now() >= state.deadline) return finish("expired");
    await checkpoint(store, id, state);
  } catch (error) {
    if (error.agent_status) return finish(error.agent_status);
    if (Date.now() >= state.deadline) return finish("expired", redact(error));
    store.append(id, "turn_failure", redact(error), {
      user_event_id: state.user_event_id,
      run_id: state.run_id,
    });
    await finish("failed", redact(error));
  }
}
