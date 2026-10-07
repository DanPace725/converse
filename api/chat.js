import { chat, redact } from "../lib/providers.js";
import { guard, json, body } from "../lib/access.js";
import { requestKeys } from "../lib/keys.js";
export default async function handler(req, res) {
  if (!guard(req, res)) return;
  if (req.method !== "POST") return json(res, 405, { error: "POST required" });
  let input, keys;
  try {
    input = await body(req);
  } catch (e) {
    return json(res, 400, { error: e.message });
  }
  try {
    keys = await requestKeys(req);
  } catch (e) {
    return json(res, 503, { error: redact(e) });
  }
  const controller = new AbortController();
  res.on("close", () => controller.abort());
  res.writeHead(200, {
    "Content-Type": "application/x-ndjson",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.flushHeaders();
  const write = (data) => {
    if (!res.destroyed) res.write(JSON.stringify(data) + "\n");
  };
  try {
    const result = await chat(
      input,
      (delta) => write({ delta }),
      controller.signal,
      { onReasoning: part => write({ type: 'reasoning', ...part }), keys },
    );
    write({ done: true, usage: result.usage, provenance: result.provenance, reasoning: result.reasoning });
  } catch (e) {
    write({ error: redact(e, keys), provenance: e.provenance, reasoning: e.reasoning, usage: e.usage });
  }
  res.end();
}
