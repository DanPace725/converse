import { guard, json, body } from "./access.js";
import { redact } from "./conclave/provider.js";

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
        if (action === "export")
          return json(res, 200, await core.export(conversation));
        if (action === "view")
          return json(res, 200, await core.view(conversation));
        if (action === "download") {
          const record = await core.download(conversation);
          res.writeHead(200, {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "Content-Disposition": `attachment; filename="${record.conversation_id}.json"`,
            "X-Content-Type-Options": "nosniff",
          });
          const text = JSON.stringify(record, null, 2);
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
          // Keep long context/tool preparation requests alive. A disconnected
          // display does not replay or abandon a possibly executed tool step.
          const heartbeat = setInterval(() => write({ type: "heartbeat" }), 15000);
          try {
            const method = input.action === "ask" ? "ask" : "agentStep";
            const view = await core[method](input.conversation_id, input, { onEvent: write });
            write({ done: true, view });
          } catch (error) {
            const storageError = !!(error.code || error.cause?.code);
            write({ error: storageError ? "Context storage unavailable. Try again shortly." : redact(error) });
          } finally {
            clearInterval(heartbeat);
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
          conversation_name: "name",
          document_save: "saveDocument",
          context_save: "saveContext",
          state_save: "saveState",
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
      const storageError = !!(error.code || error.cause?.code);
      return json(res, storageError ? 503 : error.status || 400, {
        error: storageError
          ? "Context storage unavailable. Try again shortly."
          : redact(error),
        conversation_id: conversation || null,
      });
    }
  };
}
