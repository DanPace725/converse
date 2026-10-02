import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeConversation,
  latestExports,
} from "../scripts/report-conversations.js";

test("reports separate purpose guards, count actual top-level errors, and retain unknown usage", () => {
  const events = [
    { seq: 1, id: "user", kind: "user", metadata: {} },
    {
      seq: 2,
      id: "answer",
      kind: "inference_request",
      content: "answer",
      metadata: {
        estimated_input_units: 91217,
        output_reserve: 16384,
        input_budget: 256000,
      },
    },
    {
      seq: 3,
      kind: "inference_response",
      metadata: {
        request_id: "answer",
        usage: {
          input_tokens: 20805,
          output_tokens: 277,
          input_tokens_details: { cached_tokens: 1000 },
        },
      },
    },
    {
      seq: 4,
      id: "selector",
      kind: "inference_request",
      content: "attention-selection",
      metadata: {
        estimated_input_units: 7791,
        output_reserve: 0,
        input_budget: 8000,
      },
    },
    {
      seq: 5,
      kind: "inference_response",
      metadata: { request_id: "selector" },
    },
    {
      seq: 6,
      kind: "tool_result",
      content: JSON.stringify({ records: [{ error: "historical failure" }] }),
      metadata: { tool: "read_telemetry" },
    },
    {
      seq: 7,
      kind: "tool_result",
      content: JSON.stringify({ error: "Protected." }),
      metadata: { tool: "offload_context" },
    },
    { seq: 8, kind: "turn_complete", metadata: { user_event_id: "user" } },
    {
      seq: 9,
      kind: "conversation_title",
      content: "Title",
      metadata: {
        generated: true,
        usage: { input_tokens: 20, output_tokens: 3 },
      },
    },
  ];
  const result = analyzeConversation({
    conversation_id: "conv_a",
    context_layer: { events },
  });
  assert.equal(result.tool_errors.length, 1);
  assert.equal(result.completed_with_tool_errors, 1);
  assert.equal(result.failed, 0);
  assert.equal(result.missing_usage, 1);
  assert.equal(result.purpose.answer.peak_guard.ratio, 107601 / 256000);
  assert.equal(
    result.purpose["attention-selection"].peak_guard.ratio,
    7791 / 8000,
  );
  assert.equal(result.input, 20825);
  assert.equal(result.cached, 1000);
  assert.equal(result.calls, 2);
  assert.equal(result.title_calls, 1);
});

test("report selection uses the latest export once per conversation", () => {
  const record = (date, n) => ({
    conversation_id: "conv_a",
    exported_at: date,
    context_layer: { events: Array(n).fill({}) },
  });
  const old = record("2026-10-02T16:58:57Z", 579),
    latest = record("2026-10-02T17:31:13Z", 658);
  assert.deepEqual(latestExports([old, latest, old]), [latest]);
});
