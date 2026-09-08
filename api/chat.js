import { chat, redact } from "../lib/providers.js";
import { guard, json, body } from "../lib/access.js";
export default async function handler(req, res) {
  if (!guard(req, res)) return;
  if (req.method !== "POST") return json(res, 405, { error: "POST required" });
  let input;
  try {
    input = await body(req);
  } catch (e) {
    return json(res, 400, { error: e.message });
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
    await chat(input, (delta) => write({ delta }), controller.signal);
    write({ done: true });
  } catch (e) {
    write({ error: redact(e) });
  }
  res.end();
}
