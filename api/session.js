import { json, body, equal, session } from "../lib/access.js";
export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "POST required" });
  if (
    req.headers.origin &&
    req.headers.origin !==
      `${process.env.VERCEL ? "https" : "http"}://${req.headers.host}`
  )
    return json(res, 403, { error: "Origin not allowed" });
  try {
    const input = await body(req);
    if (
      !process.env.APP_PASSWORD ||
      !equal(input.password, process.env.APP_PASSWORD)
    )
      return json(res, 401, { error: "Incorrect access password." });
    res.setHeader(
      "Set-Cookie",
      `converse_session=${session()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${process.env.VERCEL ? "; Secure" : ""}`,
    );
    return json(res, 200, { ok: true });
  } catch {
    return json(res, 400, { error: "Invalid request" });
  }
}
