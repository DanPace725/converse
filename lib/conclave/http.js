import { guard, json, body } from "./access.js";
import { redact } from "./provider.js";
import { sanitizeExport } from './export-sanitizer.js';
import { exportFilename } from './export-name.js';

export function createContextHandler(core) {
  return async (req, res) => {
    if (!guard(req, res)) return;
    const url = new URL(req.url, "http://localhost");
    const action = url.searchParams.get("action") || "view";
    const conversation = url.searchParams.get("conversation");
    try {
      if (req.method === "GET") {
        if (action === "status") return json(res, 200, await core.status());
        if (action === "list")
          return json(res, 200, { conversations: await core.list() });
        if (action === "clp_frames") return json(res, 200, await core.clpFrames(conversation));
        if (action === "clp_bundle") return json(res, 200, await core.clpBundle(conversation, url.searchParams.get("bundle")));
        if (action === "source_event")
          return json(
            res,
            200,
            await core.sourceEvent(conversation, url.searchParams.get("event")),
          );
        if (action === "context_bundle")
          return json(
            res,
            200,
            await core.contextBundle(
              conversation,
              url.searchParams.get("bundle"),
            ),
          );
        if (action === "activity")
          return json(
            res,
            200,
            await core.activity(conversation, {
              after: Number(url.searchParams.get("after") || 0),
              replay: url.searchParams.get("replay") === "1",
            }),
          );
        if (action === "audit")
          return json(
            res,
            200,
            await core.audit(conversation, {
              before_seq: Number(url.searchParams.get("before") || 0),
              kind: url.searchParams.get("kind") || "context",
              limit: 12,
            }),
          );
        if (action === 'jev_audit') return json(res, 200, await core.jevAudit(conversation, {
          before_seq: Number(url.searchParams.get('before') || 0), limit: 12,
        }));
        if (action === "workspace_file") {
          const file = await core.workspaceFile(
            conversation,
            url.searchParams.get("path"),
          );
          res.writeHead(200, {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition":
              'attachment; filename="' + file.path.split("/").at(-1) + '"',
          });
          return res.end(file.content);
        }
        if (action === 'shareable_export') return json(res, 200, await core.shareableExport(conversation));
        if (action === "export")
          return json(res, 200, (url.searchParams.get('sanitize') === '1' ? await core.shareableExport(conversation) : await core.export(conversation)));
        if (action === "view")
          return json(res, 200, await core.view(conversation));
        if (action === "transcript")
          return json(res, 200, await core.transcript(conversation));
        if (action === "download") {
          const original = await core.download(conversation);
          const record = url.searchParams.get('sanitize') === '1' ? sanitizeExport(original) : original;
          const filename = exportFilename(record.title, record.exported_at || new Date());
          const encoded = encodeURIComponent(filename).replace(/['()*]/g,
            character => '%' + character.charCodeAt(0).toString(16).toUpperCase());
          res.writeHead(200, {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "Content-Disposition": `attachment; filename="${filename.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encoded}`,
            "X-Content-Type-Options": "nosniff",
          });
          // Audit payloads repeat native requests and revisions. Whitespace adds
          // transfer/memory cost without changing the canonical JSON record.
          const text = JSON.stringify(record);
          if (typeof res.write !== "function") return res.end(text);
          // Stream the canonical JSON so large audits don't require a buffered response.
          res.flushHeaders?.();
          const bytes = Buffer.from(text);
          for (
            let offset = 0;
            offset < bytes.length && !res.destroyed;
            offset += 65536
          )
            if (!res.write(bytes.subarray(offset, offset + 65536)))
              await new Promise((resolve) => {
                const done = () => {
                  res.off("drain", done);
                  res.off("close", done);
                  res.off("error", done);
                  resolve();
                };
                res.once("drain", done);
                res.once("close", done);
                res.once("error", done);
              });
          return res.end();
        }
      } else if (req.method === "POST") {
        const input = await body(req);
        if (input.action === "create")
          return json(res, 201, await core.create(input.title));
        if (input.stream === true && ["ask", "agent_step"].includes(input.action)) {
          const controller = new AbortController();
          const disconnect = () => {
            if (input.action === "agent_step" && !res.writableEnded)
              controller.abort(Object.assign(Error("Agent stopped; the active request was cancelled."),
                { name: "AbortError", agent_status: "stopped" }));
          };
          res.once?.("close", disconnect);
          // Vercel's Node runtime reports cancellation on the request. Local
          // Node HTTP also reports a closed response connection.
          req.once?.("error", disconnect);
          req.signal?.addEventListener("abort", disconnect, { once: true });
          if (req.signal?.aborted) disconnect();
          res.writeHead(200, {
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Cache-Control": "no-store, no-transform",
            "X-Content-Type-Options": "nosniff",
            "X-Accel-Buffering": "no",
          });
          res.flushHeaders?.();
          const write = event => {
            if (!res.destroyed) res.write(JSON.stringify(event) + "\n");
          };
          // Keep long preparation requests alive; cancelled Agent streams stop
          // their active work while preserving already executed actions.
          const heartbeat = setInterval(() => write({ type: "heartbeat" }), 15000);
          try {
            const method = input.action === "ask" ? "ask" : "agentStep";
            const view = await core[method](input.conversation_id, input, {
              onEvent: write, ...(input.action === "agent_step" ? { signal: controller.signal } : {}),
            });
            write({ done: true, view });
          } catch (error) {
            const storageError = !error.agent_detail && !!(error.code || error.cause?.code);
            write({ error: storageError ? "Context storage unavailable. Try again shortly." : redact(error) });
          } finally {
            clearInterval(heartbeat);
            res.off?.("close", disconnect);
            req.off?.("error", disconnect);
            req.signal?.removeEventListener("abort", disconnect);
            res.end();
          }
          return;
        }
        if (input.action === "ask")
          return json(res, 200, await core.ask(input.conversation_id, input));
        if (input.action === "remember")
          return json(
            res,
            200,
            await core.remember(input.conversation_id, input),
          );
        const agentActions = {
          clp_frame_register: "clpRegisterFrame",
          clp_attest: "clpAttest",
          clp_record: "clpRecord",
          clp_link: "clpLink",
          clp_query: "clpQuery",
          clp_frames: "clpFrames",
          conversation_name: "name",
          document_upload: "uploadDocument",
          document_save: "saveDocument",
          document_lifecycle: "changeDocument",
          token_count: "countTokens",
          context_save: "saveContext",
          state_save: "saveState",
          memory_save: "saveMemory",
          memory_lifecycle: "memoryLifecycle",
          agent_start: "agentStart",
          agent_step: "agentStep",
          agent_stop: "agentStop",
        };
        if (agentActions[input.action])
          return json(
            res,
            200,
            await core[agentActions[input.action]](
              input.conversation_id,
              input,
            ),
          );
      }
      return json(res, 405, { error: "Unsupported context operation" });
    } catch (error) {
      if (res.headersSent) {
        res.destroy?.();
        return;
      }
      const storageError = !error.agent_detail && !!(error.code || error.cause?.code);
      return json(res, storageError ? 503 : error.status || 400, {
        error: storageError
          ? "Context storage unavailable. Try again shortly."
          : redact(error),
        conversation_id: conversation || null,
      });
    }
  };
}
