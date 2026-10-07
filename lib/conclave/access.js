import { createHmac, timingSafeEqual, createHash } from "node:crypto";
export function json(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}
// SESSION_SECRET selects identity sessions: every cookie names a signed-in user
// on ALLOWED_EMAILS, and APP_PASSWORD sessions are no longer accepted.
export const identityRequired = () => !!process.env.SESSION_SECRET;
const secret = () => process.env.SESSION_SECRET || process.env.APP_PASSWORD;
export function equal(a, b) {
  return timingSafeEqual(
    createHash("sha256").update(String(a)).digest(),
    createHash("sha256").update(String(b)).digest(),
  );
}
// ALLOWED_EMAILS lists who may sign in. "*" admits any verified account, but
// only while personal API keys are on (KEY_ENCRYPTION_SECRET): without them
// every visitor would spend the deployment's own provider keys.
export function emailAllowed(email) {
  const candidate = String(email || "").trim().toLowerCase();
  const allowed = (process.env.ALLOWED_EMAILS || "")
    .split(",")
    .map((x) => x.trim().toLowerCase());
  return (
    !!candidate &&
    (allowed.includes(candidate) ||
      (allowed.includes("*") && !!process.env.KEY_ENCRYPTION_SECRET))
  );
}
function sign(value) {
  return createHmac("sha256", secret()).update(value).digest("hex");
}
export function session(user) {
  const expires = String(Date.now() + 7 * 86400000);
  if (!user) return expires + "." + sign(expires);
  const payload = Buffer.from(
    JSON.stringify({ id: String(user.id), email: String(user.email) }),
  ).toString("base64url");
  return expires + "." + payload + "." + sign(expires + "." + payload);
}
// Returns null without a valid cookie, otherwise { user }; user is null for a
// password session.
function current(req) {
  if (!secret()) return null;
  const parts = (
    (req.headers.cookie || "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("converse_session="))
      ?.slice(17) || ""
  ).split(".");
  const [expires] = parts,
    signature = parts.at(-1);
  if (
    parts.length < 2 ||
    parts.length > 3 ||
    !/^\d+$/.test(expires) ||
    !signature ||
    Number(expires) < Date.now() ||
    !equal(signature, sign(parts.slice(0, -1).join(".")))
  )
    return null;
  if (parts.length === 2) return { user: null };
  try {
    const { id, email } = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    );
    return typeof id === "string" && typeof email === "string"
      ? { user: { id, email } }
      : null;
  } catch {
    return null;
  }
}
// The signed-in user, or null for password sessions and open local access.
export function identity(req) {
  const user = current(req)?.user;
  return identityRequired() && user && emailAllowed(user.email) ? user : null;
}
export function guard(req, res) {
  if (
    req.headers.origin &&
    req.headers.origin !==
      `${process.env.VERCEL ? "https" : "http"}://${req.headers.host}`
  ) {
    json(res, 403, { error: "Origin not allowed" });
    return false;
  }
  if (!secret()) {
    if (!process.env.VERCEL) return true;
    json(res, 503, {
      error: "Set APP_PASSWORD in Vercel environment variables.",
    });
    return false;
  }
  if (identityRequired() ? !identity(req) : !current(req)) {
    json(res, 401, {
      error: identityRequired()
        ? "Sign in to continue."
        : "Unlock Converse to continue.",
    });
    return false;
  }
  return true;
}
export async function body(req) {
  if (!req.headers["content-type"]?.startsWith("application/json"))
    throw Error("JSON required");
  let value;
  if (req.body !== undefined) {
    value =
      Buffer.isBuffer(req.body) || typeof req.body === "string"
        ? JSON.parse(req.body.toString())
        : req.body;
    if (Buffer.byteLength(JSON.stringify(value) || "") > 1000000)
      throw Error("Chat is too large.");
  } else {
    const chunks = [];
    let length = 0;
    for await (const chunk of req) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      length += bytes.length;
      if (length > 1000000) throw Error("Chat is too large.");
      chunks.push(bytes);
    }
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("JSON object required");
  return value;
}
