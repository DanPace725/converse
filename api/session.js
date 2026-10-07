import {
  json,
  body,
  equal,
  session,
  identity,
  identityRequired,
  emailAllowed,
  guard,
} from "../lib/access.js";
import { startGoogle, finishGoogle, verifierOf } from "../lib/neon-auth.js";

const secure = () => (process.env.VERCEL ? "; Secure" : "");
const sessionCookie = (value, age) =>
  `converse_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secure()}`;
// Lax, not Strict: the browser must present it when Google sends it back here.
const challengeCookie = (value, age) =>
  `converse_signin=${value}; HttpOnly; SameSite=Lax; Path=/api/session; Max-Age=${age}${secure()}`;
function redirect(res, outcome, cookies) {
  res.writeHead(302, {
    Location: outcome ? "/?signin=" + outcome : "/",
    "Cache-Control": "no-store",
    "Set-Cookie": cookies,
  });
  res.end();
}
// Google's return leg: exchange the verifier for the signed-in user.
async function completeSignIn(req, res, origin, verifier) {
  const challenge = (req.headers.cookie || "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("converse_signin="))
    ?.slice(16);
  const clear = challengeCookie("", 0);
  if (!identityRequired() || !challenge) return redirect(res, "failed", [clear]);
  try {
    const user = await finishGoogle(origin, verifier, challenge);
    if (!user) return redirect(res, "failed", [clear]);
    if (!emailAllowed(user.email)) return redirect(res, "denied", [clear]);
    return redirect(res, "", [clear, sessionCookie(session(user), 604800)]);
  } catch {
    return redirect(res, "failed", [clear]);
  }
}
export default async function handler(req, res) {
  const origin = `${process.env.VERCEL ? "https" : "http"}://${req.headers.host}`;
  const url = new URL(req.url, origin);
  if (req.method === "GET") {
    const verifier = verifierOf(url);
    if (verifier) return completeSignIn(req, res, origin, verifier);
    const user = identity(req);
    return json(res, 200, {
      sign_in: identityRequired() ? "google" : "password",
      user: user ? { email: user.email } : null,
      // Whether this browser is already past the sign-in or password gate.
      access: guard(req, { writeHead() {}, end() {} }),
    });
  }
  if (!["POST", "DELETE"].includes(req.method))
    return json(res, 405, { error: "POST required" });
  if (req.headers.origin && req.headers.origin !== origin)
    return json(res, 403, { error: "Origin not allowed" });
  if (req.method === "DELETE") {
    res.setHeader("Set-Cookie", sessionCookie("", 0));
    return json(res, 200, { ok: true });
  }
  try {
    const input = await body(req);
    if (identityRequired()) {
      if (input.provider !== "google")
        return json(res, 401, { error: "Sign in with Google to continue." });
      try {
        const { url: location, challenge } = await startGoogle(origin);
        res.setHeader("Set-Cookie", challengeCookie(challenge, 600));
        return json(res, 200, { url: location });
      } catch (error) {
        return json(res, 502, { error: error.message });
      }
    }
    if (
      !process.env.APP_PASSWORD ||
      !equal(input.password, process.env.APP_PASSWORD)
    )
      return json(res, 401, { error: "Incorrect access password." });
    res.setHeader("Set-Cookie", sessionCookie(session(), 604800));
    return json(res, 200, { ok: true });
  } catch {
    return json(res, 400, { error: "Invalid request" });
  }
}
