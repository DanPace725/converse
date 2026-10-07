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
import {
  startGoogle,
  finishGoogle,
  verifierOf,
  emailCode,
} from "../lib/neon-auth.js";

const secure = () => (process.env.VERCEL ? "; Secure" : "");
const sessionCookie = (value, age) =>
  `converse_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secure()}`;
// Lax, not Strict: the browser must present it when Google sends it back here.
const challengeCookie = (value, age) =>
  `converse_signin=${value}; HttpOnly; SameSite=Lax; Path=/api/session; Max-Age=${age}${secure()}`;
// `why` is a short code shown beside the splash's message, so a failure on
// someone else's device can be told apart without the server logs.
function redirect(res, outcome, cookies, why) {
  res.writeHead(302, {
    Location: outcome
      ? "/?signin=" + outcome + (why ? "&why=" + why : "")
      : "/",
    "Cache-Control": "no-store",
    "Set-Cookie": cookies,
  });
  res.end();
}
// Google's return reaches this address through a chain of cross-site
// redirects, where browsers differ over which of this site's cookies they
// send and keep, Safari most of all. This page repeats the request as a
// navigation of the site's own, so the challenge cookie arrives and the
// session cookie is set on that request. This cannot repair a failure in
// Neon Auth's own return before it supplies the verifier.
function resume(res, url) {
  const next = new URL(url);
  next.searchParams.set("resume", "1");
  const target = (next.pathname + next.search)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=${target}"><title>Signing in…</title><link rel="stylesheet" href="/styles.css"><p class="note"><a href="${target}">Continue to Converse</a></p></html>`,
  );
}
// Google's return leg: exchange the verifier for the signed-in user.
async function completeSignIn(req, res, origin, verifier) {
  const challenge = (req.headers.cookie || "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("converse_signin="))
    ?.slice(16);
  const clear = challengeCookie("", 0);
  // Each way the return can fall short is named in the function logs.
  const incomplete = (reason, why, outcome = "failed") => {
    console.warn(JSON.stringify({ event: "sign_in_incomplete", reason }));
    return redirect(res, outcome, [clear], why);
  };
  if (!identityRequired())
    return incomplete("sign-in is not enabled", "not-enabled");
  if (!challenge)
    return incomplete("challenge cookie missing or expired", "no-challenge");
  try {
    const user = await finishGoogle(origin, verifier, challenge);
    if (!user) return incomplete("exchange refused", "refused");
    if (!emailAllowed(user.email))
      return incomplete("address not allowed", "", "denied");
    return redirect(res, "", [clear, sessionCookie(session(user), 604800)]);
  } catch (error) {
    return incomplete("exchange failed: " + error.message, "exchange-error");
  }
}
export default async function handler(req, res) {
  const origin = `${process.env.VERCEL ? "https" : "http"}://${req.headers.host}`;
  const url = new URL(req.url, origin);
  if (req.method === "GET") {
    const verifier = verifierOf(url);
    if (verifier)
      return url.searchParams.get("resume") === "1"
        ? completeSignIn(req, res, origin, verifier)
        : resume(res, url);
    // A browser sent here with no verifier: the sign-in service gave up
    // before finishing, and says why in `error` when it says anything.
    if (
      url.searchParams.has("error") ||
      req.headers["sec-fetch-mode"] === "navigate"
    ) {
      console.warn(
        JSON.stringify({
          event: "sign_in_incomplete",
          reason: "returned without a verifier",
          error: String(url.searchParams.get("error") || "").slice(0, 80),
        }),
      );
      return redirect(res, "failed", [challengeCookie("", 0)], "no-verifier");
    }
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
      if (input.provider === "email-code") {
        const email =
          typeof input.email === "string"
            ? input.email.trim().toLowerCase()
            : "";
        if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
          return json(res, 400, { error: "Enter a valid email address." });
        if (
          input.otp !== undefined &&
          (typeof input.otp !== "string" || !/^\d{4,10}$/.test(input.otp))
        )
          return json(res, 400, { error: "Enter the code from your email." });
        if (!emailAllowed(email))
          return json(res, 403, {
            error: "This email address does not have access to Converse.",
          });
        try {
          const result = await emailCode(origin, email, input.otp);
          if (result.error)
            return json(res, result.status, { error: result.error });
          if (result.user) {
            if (!emailAllowed(result.user.email))
              return json(res, 403, {
                error: "This email address does not have access to Converse.",
              });
            res.setHeader("Set-Cookie", [
              challengeCookie("", 0),
              sessionCookie(session(result.user), 604800),
            ]);
          }
          return json(res, 200, { ok: true });
        } catch {
          return json(res, 502, {
            error:
              "Email sign-in is unavailable. Try again shortly or continue with Google.",
          });
        }
      }
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
