import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { getDatabase } from "../lib/database.js";
import {
  ContextRepository,
  downloadRecord,
} from "../lib/context-repository.js";
import { events, snapshots, conversations } from "../lib/db-schema.js";
import { AnthropicProvider } from "../lib/conclave/provider.js";

test(
  "Neon survives fresh instances, publishes progress, fences overlapping turns and keeps complete exports",
  {
    skip:
      !process.env.DATABASE_URL ||
      process.env.NEON_BRANCH !== "converse-hosting-check",
  },
  async () => {
    const { db, pool } = getDatabase();
    let calls = 0,
      started;
    const ready = new Promise((resolve) => {
      started = resolve;
    });
    let finish;
    const wait = new Promise((resolve) => {
      finish = resolve;
    });
    const options = {
      serviceOptions: {
        availability: () => ({ openai: true, jev: false }),
        providerFactory: () => ({
          name: "openai",
          respond: async () => {
            calls++;
            started();
            await wait;
            return {
              status: "completed",
              id: "fixture_response",
              model: "fixture",
              usage: { input_tokens: 100, output_tokens: 5 },
              output: [
                {
                  type: "message",
                  content: [{ type: "output_text", text: "Saved in Neon." }],
                },
              ],
            };
          },
        }),
      },
    };
    try {
      const writer = new ContextRepository(db, options);
      const { conversation_id: id } = await writer.create(
        "Disposable hosting check",
      );
      const input = {
        message_id: "msg_neon_fixture",
        content: "Remember café 🌱.",
        settings: { model: "fixture", jev: false },
      };
      const pending = writer.run(id, true, (service) => service.ask(id, input));
      // Observe the already persisted request while inference is still in flight.
      await ready;
      const reader = new ContextRepository(db, options);
      const activity = await reader.run(id, false, (service) =>
        service.activity(id),
      );
      assert.equal(activity.busy, true);
      assert.equal(activity.history.count, 1);
      assert.equal(activity.latest.kind, "inference_request");
      try {
        await assert.rejects(
          reader.run(id, true, (service) => service.ask(id, input)),
          { status: 409 },
        );
      } finally {
        finish();
      }
      const view = await pending;
      assert.equal(view.messages[1].content, "Saved in Neon.");
      const uploaded = await writer.run(id, true, (service) => service.uploadDocument(id, {
        name: "Reference notes.md", content: "# Source\nIndependent workspace upload café 🌱.",
      }));
      assert.equal(uploaded.context.revision, view.context.revision);
      assert.equal(uploaded.messages.length, view.messages.length);
      assert.equal(calls, 1);
      const persistedUpload = await new ContextRepository(db, options).run(id, false,
        service => service.workspaceFile(id, "Reference_notes.md"));
      assert.equal(persistedUpload.content, "# Source\nIndependent workspace upload café 🌱.");
      assert.equal(persistedUpload.operation, "upload");
      await reader.run(id, true, (service) => service.ask(id, input));
      assert.equal(
        calls,
        1,
        "a completed retry must not incur inference again",
      );
      await assert.rejects(
        reader.run(id, true, (service) =>
          service.ask(id, { ...input, content: "Changed request" }),
        ),
        { status: 409 },
      );
      await reader.run(id, true, (service) =>
        service.remember(id, {
          key: "goal",
          type: "objective",
          content: "Keep all originals.",
        }),
      );
      // A new request reloads remembered attribution through PostgreSQL JSONB.
      await new ContextRepository(db, options).run(id, true, (service) =>
        service.ask(id, {
          ...input,
          message_id: "msg_after_state",
          content: "Continue using the saved goal.",
        }),
      );
      assert.equal(calls, 2);
      const record = await new ContextRepository(db, options).run(
        id,
        false,
        (service) => downloadRecord(service, id),
      );
      assert.equal(record.messages.length, 4);
      assert.equal(record.messages[1].reply_to, input.message_id);
      assert.equal(
        record.context_layer.snapshots.length,
        record.context_layer.context.revision,
      );
      assert.equal(record.context_layer.metrics.input_tokens, 200);
      assert.ok(
        record.context_layer.events.some(
          (event) => event.content === "Remember café 🌱.",
        ),
      );
      assert.equal(
        (
          await reader.run(id, false, (service) =>
            service.activity(id, { replay: true }),
          )
        ).busy,
        false,
      );
      const immutable = (error) =>
        /append-only/.test(error.cause?.message || error.message);
      await assert.rejects(
        db.delete(events).where(eq(events.conversationId, id)),
        immutable,
      );
      await assert.rejects(
        db
          .update(snapshots)
          .set({ segments: [] })
          .where(eq(snapshots.conversationId, id)),
        immutable,
      );
      const [row] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, id));
      assert.equal(row.leaseToken, null);
      let agentCalls = 0;
      const agentOptions = {
        serviceOptions: {
          availability: () => ({ openai: true, jev: false }),
          providerFactory: () => ({
            name: "openai",
            respond: async (payload) => {
              agentCalls++;
              const output =
                agentCalls === 1
                  ? [
                      {
                        type: "function_call",
                        call_id: "call_file",
                        name: "workspace_write",
                        arguments: JSON.stringify({
                          path: "neon-proof.md",
                          content: "# Saved\nFresh request proof.",
                        }),
                      },
                    ]
                  : agentCalls === 2
                    ? [
                        {
                          type: "function_call",
                          call_id: "call_read",
                          name: "workspace_read",
                          arguments: JSON.stringify({
                            path: "neon-proof.md",
                            offset: 0,
                          }),
                        },
                      ]
                    : [
                        {
                          type: "message",
                          content: [
                            {
                              type: "output_text",
                              text: "Verified saved workspace.",
                            },
                          ],
                        },
                      ];
              if (agentCalls === 2)
                assert.ok(
                  payload.input.some(
                    (i) =>
                      i.call_id === "call_file" &&
                      i.type === "function_call_output",
                  ),
                );
              return {
                status: "completed",
                model: "fixture",
                usage: { input_tokens: 100, output_tokens: 10 },
                output,
              };
            },
          }),
        },
      };
      const agentId = (
        await new ContextRepository(db, agentOptions).create(
          "Disposable agent hosting check",
        )
      ).conversation_id;
      let agent = await new ContextRepository(db, agentOptions).run(
        agentId,
        true,
        (service) =>
          service.agentStart(agentId, {
            message_id: "msg_agent_neon",
            content: "Write a saved file.",
            settings: { model: "fixture" },
          }),
      );
      const firstStep = { run_id: agent.agent.run_id, expected_step: 0 };
      agent = await new ContextRepository(db, agentOptions).run(
        agentId,
        true,
        (service) => service.agentStep(agentId, firstStep),
      );
      await new ContextRepository(db, agentOptions).run(
        agentId,
        true,
        (service) => service.agentStep(agentId, firstStep),
      );
      assert.equal(agentCalls, 1);
      const reloaded = await new ContextRepository(db, agentOptions).run(
        agentId,
        false,
        (service) => service.view(agentId),
      );
      assert.equal(
        reloaded.agent.files[0].content,
        "# Saved\nFresh request proof.",
      );
      agent = await new ContextRepository(db, agentOptions).run(
        agentId,
        true,
        (service) =>
          service.agentStep(agentId, {
            run_id: agent.agent.run_id,
            expected_step: agent.agent.steps,
          }),
      );
      assert.equal(agent.agent.status, "running");
      agent = await new ContextRepository(db, agentOptions).run(
        agentId,
        true,
        (service) =>
          service.agentStep(agentId, {
            run_id: agent.agent.run_id,
            expected_step: agent.agent.steps,
          }),
      );
      assert.equal(agent.agent.status, "completed");
      assert.equal(agent.agent.input_tokens, 300);
      assert.equal(agentCalls, 3);
      let claudeCalls = 0;
      const claudeOptions = {
        serviceOptions: {
          availability: () => ({ anthropic: true, jev: false }),
          providerFactory: (selected) => {
            assert.equal(selected, "anthropic");
            return new AnthropicProvider({
              apiKey: "fixture",
              fetchImpl: async (_url, options) => {
                const body = JSON.parse(options.body);
                assert.equal(body.model, "claude-fixture");
                claudeCalls++;
                if (claudeCalls === 2) {
                  assert.ok(
                    body.messages
                      .flatMap((m) => m.content)
                      .some(
                        (p) =>
                          p.type === "tool_result" &&
                          p.tool_use_id === "claude_write",
                      ),
                  );
                  assert.ok(
                    body.messages
                      .flatMap((m) => m.content)
                      .some(
                        (p) =>
                          p.type === "thinking" &&
                          p.signature === "signed-fixture",
                      ),
                  );
                }
                return new Response(
                  JSON.stringify({
                    id: "msg_claude",
                    model: "claude-fixture",
                    stop_reason: claudeCalls < 3 ? "tool_use" : "end_turn",
                    usage: { input_tokens: 30, output_tokens: 5 },
                    content:
                      claudeCalls === 1
                        ? [
                            {
                              type: "thinking",
                              thinking: "",
                              signature: "signed-fixture",
                            },
                            {
                              type: "tool_use",
                              id: "claude_write",
                              name: "workspace_write",
                              input: {
                                path: "claude.md",
                                content: "Claude persisted in Neon.",
                                expected_source_event_id: null,
                              },
                            },
                          ]
                        : claudeCalls === 2
                          ? [
                              {
                                type: "tool_use",
                                id: "claude_read",
                                name: "workspace_read",
                                input: { path: "claude.md", offset: 0 },
                              },
                            ]
                          : [
                              {
                                type: "text",
                                text: "Claude verified persisted context.",
                              },
                            ],
                  }),
                );
              },
            });
          },
        },
      };
      const claudeId = (
        await new ContextRepository(db, claudeOptions).create(
          "Disposable Claude hosting check",
        )
      ).conversation_id;
      let claudeView = await new ContextRepository(db, claudeOptions).run(
        claudeId,
        true,
        (service) =>
          service.agentStart(claudeId, {
            message_id: "claude_objective",
            content: "Write and verify a file.",
            settings: { provider: "anthropic", model: "claude-fixture" },
          }),
      );
      while (claudeView.agent.status === "running")
        claudeView = await new ContextRepository(db, claudeOptions).run(
          claudeId,
          true,
          (service) =>
            service.agentStep(claudeId, {
              run_id: claudeView.agent.run_id,
              expected_step: claudeView.agent.steps,
            }),
        );
      assert.equal(
        claudeView.agent.status,
        "completed",
        claudeView.agent.error,
      );
      const claudeRecord = await new ContextRepository(db, claudeOptions).run(
        claudeId,
        false,
        (service) => downloadRecord(service, claudeId),
      );
      assert.equal(claudeRecord.messages.at(-1).provider, "Claude");
      assert.equal(
        claudeRecord.context_layer.events.find(
          (e) => e.metadata.workspace_path === "claude.md",
        ).actor,
        "anthropic",
      );
      assert.equal(
        claudeRecord.context_layer.events.find(
          (e) => e.kind === "inference_request",
        ).metadata.provider_payload.model,
        "claude-fixture",
      );
      assert.equal(
        claudeRecord.context_layer.metrics.usage_by_provider.anthropic
          .input_tokens,
        90,
      );
      const mixed = await new ContextRepository(db, claudeOptions).run(
        id,
        true,
        (service) =>
          service.ask(id, {
            message_id: "claude_after_gpt",
            content: "Continue the saved GPT conversation as Claude.",
            settings: { provider: "anthropic", model: "claude-fixture" },
          }),
      );
      assert.deepEqual(
        mixed.messages
          .filter((m) => m.role === "assistant")
          .map((m) => m.provider),
        ["GPT", "GPT", "Claude"],
      );
      // Manual editor operations persist through the same leases and fresh readers.
      const beforeEditCalls = calls + claudeCalls + agentCalls;
      const editedFile = await new ContextRepository(db, claudeOptions).run(
        claudeId,
        true,
        (service) =>
          service.saveDocument(claudeId, {
            path: "claude.md",
            content: "Human revision of the Claude file.",
            expected_source_event_id: claudeView.workspace[0].source_event_id,
          }),
      );
      const freshFile = await new ContextRepository(db, claudeOptions).run(
        claudeId,
        false,
        (service) => service.workspaceFile(claudeId, "claude.md"),
      );
      assert.equal(freshFile.content, "Human revision of the Claude file.");
      assert.equal(
        freshFile.source_event_id,
        editedFile.workspace[0].source_event_id,
      );
      await assert.rejects(
        new ContextRepository(db, claudeOptions).run(
          claudeId,
          true,
          (service) =>
            service.saveDocument(claudeId, {
              path: "claude.md",
              content: "Stale human revision.",
              expected_source_event_id: claudeView.workspace[0].source_event_id,
            }),
        ),
        { status: 409 },
      );
      const section = mixed.context.segments.find(
        (s) =>
          !s.state_key &&
          !s.pinned &&
          !s.verbatim_required &&
          s.type !== "reference",
      );
      const editedContext = await new ContextRepository(db, options).run(
        id,
        true,
        (service) =>
          service.saveContext(id, {
            bundle_id: section.id,
            content: "Human clarification of working context.",
            expected_revision: mixed.context.revision,
          }),
      );
      const oldGoal = editedContext.state.entries.find(
        (s) => s.state_key === "goal",
      );
      await new ContextRepository(db, options).run(id, true, (service) =>
        service.saveState(id, {
          key: "goal",
          type: "objective",
          content: "Keep originals and human revisions.",
          status: "active",
          expected_revision: editedContext.context.revision,
          expected_bundle_id: oldGoal.id,
        }),
      );
      const editorRecord = await new ContextRepository(db, options).run(
        id,
        false,
        (service) => downloadRecord(service, id),
      );
      assert.ok(
        editorRecord.context_layer.context.segments.some(
          (s) => s.content === "Human clarification of working context.",
        ),
      );
      const newGoal = editorRecord.context_layer.context.segments.find(
        (s) => s.state_key === "goal",
      );
      assert.equal(newGoal.content, "Keep originals and human revisions.");
      assert.ok(newGoal.relations.supersedes.includes(oldGoal.id));
      assert.ok(newGoal.attribution.some((a) => a.actor === "human"));
      assert.equal(calls + claudeCalls + agentCalls, beforeEditCalls);
    } finally {
      finish();
      await pool.end();
    }
  },
);
