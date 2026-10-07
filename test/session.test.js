import test from "node:test";
import assert from "node:assert/strict";
const { default: handler } = await import("../api/session.js");
const { guard, identity } = await import("../lib/access.js");

const names = [
  "APP_PASSWORD",
  "SESSION_SECRET",
  "ALLOWED_EMAILS",
  "NEON_AUTH_BASE_URL",
  "VERCEL",
];
const google = {
  SESSION_SECRET: "fixture-session-secret",
  ALLOWED_EMAILS: "ada@example.com",
  NEON_AUTH_BASE_URL: "https://auth.example/neondb/auth/",
};
async function withEnv(values, upstream, run) {
  const before = Object.fromEntries(names.map((n) => [n, process.env[n]]));
  const fetchBefore = globalThis.fetch;
  for (const n of names)
    if (values[n] === undefined) delete process.env[n];
    else process.env[n] = values[n];
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), ...init });
    return upstream(String(url), init);
  };
  try {
    return await run(calls);
  } finally {
    globalThis.fetch = fetchBefore;
    for (const n of names)
      if (before[n] === undefined) delete process.env[n];
      else process.env[n] = before[n];
  }
}
async function call(method, { url = "/api/session", cookie, body } = {}) {
  const res = {
    headers: {},
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    writeHead(status, headers = {}) {
      this.status = status;
      for (const [name, value] of Object.entries(headers))
        this.setHeader(name, value);
    },
    end(text) {
      this.body = text ? JSON.parse(text) : null;
    },
  };
  await handler(
    {
      method,
      url,
      body,
      headers: {
        host: "localhost:3211",
        ...(body ? { "content-type": "application/json" } : {}),
        ...(cookie ? { cookie } : {}),
      },
    },
    res,
  );
  return {
    status: res.status,
    body: res.body,
    location: res.headers.location,
    cookies: [res.headers["set-cookie"] || []].flat(),
  };
}
const pair = (cookies, name) =>
  cookies.find((c) => c.startsWith(name + "="))?.split(";")[0];
function neonAuth(user) {
  return (url) =>
    url.includes("/sign-in/social")
      ? new Response(
          JSON.stringify({ url: "https://auth.example/init?token=t", redirect: true }),
          {
            headers: {
              "set-cookie":
                "__Secure-neon-auth.session_challenge=chal%2Evalue; Max-Age=600; Path=/; HttpOnly; Secure; SameSite=None; Partitioned",
            },
          },
        )
      : Response.json(user ? { session: { id: "s1" }, user } : null);
}
const ada = { id: "user-ada", email: "Ada@Example.com", emailVerified: true };
// The request the resume page makes; Google's own return lacks `resume`.
const arriving = "/api/session?neon_auth_session_verifier=verifier-1";
const returning = arriving + "&resume=1";

test("Google sign-in relays through Neon Auth and issues an identity session", async () => {
  await withEnv(google, neonAuth(ada), async (calls) => {
    assert.deepEqual((await call("GET")).body, { sign_in: "google", user: null, access: false });
    const started = await call("POST", { body: { provider: "google" } });
    assert.deepEqual(started.body, { url: "https://auth.example/init?token=t" });
    assert.equal(calls[0].url, "https://auth.example/neondb/auth/sign-in/social");
    assert.equal(calls[0].headers.origin, "http://localhost:3211");
    assert.equal(calls[0].headers["x-neon-auth-middleware"], "true");
    assert.deepEqual(JSON.parse(calls[0].body), {
      provider: "google",
      callbackURL: "http://localhost:3211/api/session",
    });
    const challenge = started.cookies.find((c) => c.startsWith("converse_signin="));
    assert.match(challenge, /^converse_signin=chal%2Evalue; HttpOnly; SameSite=Lax; Path=\/api\/session; Max-Age=600$/);

    const finished = await call("GET", { url: returning, cookie: pair(started.cookies, "converse_signin") });
    assert.deepEqual([finished.status, finished.location], [302, "/"]);
    assert.equal(
      calls[1].url,
      "https://auth.example/neondb/auth/get-session?neon_auth_session_verifier=verifier-1",
    );
    assert.equal(
      calls[1].headers.cookie,
      "__Secure-neon-auth.session_challenge=chal%2Evalue; __Secure-neon-auth.session_challange=chal%2Evalue",
    );
    assert.match(finished.cookies.find((c) => c.startsWith("converse_signin=")), /Max-Age=0/);
    const sessionCookie = finished.cookies.find((c) => c.startsWith("converse_session="));
    assert.match(sessionCookie, /HttpOnly; SameSite=Strict; Path=\/; Max-Age=604800$/);
    const req = { headers: { cookie: pair(finished.cookies, "converse_session") } };
    assert.equal(guard(req, { writeHead() {}, end() {} }), true);
    assert.deepEqual(identity(req), { id: "user-ada", email: "Ada@Example.com" });
    assert.deepEqual(
      (await call("GET", { cookie: req.headers.cookie })).body,
      { sign_in: "google", user: { email: "Ada@Example.com" }, access: true },
    );
    assert.equal(calls.length, 2);
  });
});

test("Google sign-in refuses unlisted, unverified and unchallenged returns", async () => {
  const cookie = "converse_signin=chal%2Evalue";
  for (const [user, outcome] of [
    [{ ...ada, email: "eve@example.com" }, "denied"],
    [{ ...ada, emailVerified: false }, "failed"],
    [null, "failed"],
  ])
    await withEnv(google, neonAuth(user), async () => {
      const finished = await call("GET", { url: returning, cookie });
      assert.deepEqual(
        [finished.status, finished.location],
        [302, "/?signin=" + outcome + (outcome === "failed" ? "&why=refused" : "")],
      );
      assert.equal(pair(finished.cookies, "converse_session"), undefined);
    });
  await withEnv(google, neonAuth(ada), async (calls) => {
    assert.equal((await call("GET", { url: returning })).location, "/?signin=failed&why=no-challenge");
    assert.equal(calls.length, 0);
    const password = await call("POST", { body: { password: "anything" } });
    assert.deepEqual([password.status, password.cookies], [401, []]);
  });
  await withEnv({ ...google, SESSION_SECRET: undefined, APP_PASSWORD: "fixture-password" }, neonAuth(ada), async (calls) => {
    assert.equal((await call("GET", { url: returning, cookie })).location, "/?signin=failed&why=not-enabled");
    assert.equal(calls.length, 0);
  });
});

test("Google sign-in reports untrusted addresses and upstream failures", async () => {
  await withEnv(google, () => Response.json({ code: "INVALID_CALLBACKURL" }, { status: 403 }), async () => {
    const started = await call("POST", { body: { provider: "google" } });
    assert.equal(started.status, 502);
    assert.match(started.body.error, /trusted sign-in address/);
  });
  await withEnv(google, () => { throw Error("socket secret detail"); }, async () => {
    const started = await call("POST", { body: { provider: "google" } });
    assert.deepEqual([started.status, started.body.error, started.cookies], [502, "Google sign-in is unavailable. Try again shortly.", []]);
  });
});

test("password access is unchanged without SESSION_SECRET, and sign-out clears the session", async () => {
  await withEnv({ APP_PASSWORD: "fixture-password" }, () => assert.fail("no upstream call"), async () => {
    assert.deepEqual((await call("GET")).body, { sign_in: "password", user: null, access: false });
    assert.equal((await call("POST", { body: { password: "wrong" } })).status, 401);
    assert.equal((await call("POST", { body: { provider: "google" } })).status, 401);
    const unlocked = await call("POST", { body: { password: "fixture-password" } });
    assert.equal(unlocked.status, 200);
    const req = { headers: { cookie: pair(unlocked.cookies, "converse_session") } };
    assert.equal(guard(req, { writeHead() {}, end() {} }), true);
    // The splash page reads this to tell an unlocked browser from a new visitor.
    assert.equal((await call("GET", { cookie: req.headers.cookie })).body.access, true);
    const signedOut = await call("DELETE");
    assert.match(signedOut.cookies[0], /^converse_session=; .*Max-Age=0$/);
  });
});

test("an incomplete sign-in return names its reason in the logs without the address", async () => {
  const cookie = "converse_signin=chal%2Evalue";
  const warn = console.warn,
    logged = [];
  console.warn = (line) => logged.push(JSON.parse(line));
  try {
    await withEnv(google, neonAuth({ ...ada, emailVerified: false }), () => call("GET", { url: returning, cookie }));
    await withEnv(google, neonAuth(null), () => call("GET", { url: returning, cookie }));
    await withEnv(google, neonAuth(ada), () => call("GET", { url: returning }));
    await withEnv(google, neonAuth({ ...ada, email: "eve@example.com" }), () => call("GET", { url: returning, cookie }));
    await withEnv(google, () => { throw Error("socket hang up"); }, () => call("GET", { url: returning, cookie }));
  } finally {
    console.warn = warn;
  }
  assert.deepEqual(logged, [
    { event: "sign_in_exchange_refused", status: 200, user: true, email_verified: false },
    { event: "sign_in_incomplete", reason: "exchange refused" },
    { event: "sign_in_exchange_refused", status: 200, user: false, email_verified: false },
    { event: "sign_in_incomplete", reason: "exchange refused" },
    { event: "sign_in_incomplete", reason: "challenge cookie missing or expired" },
    { event: "sign_in_incomplete", reason: "address not allowed" },
    { event: "sign_in_incomplete", reason: "exchange failed: Google sign-in is unavailable. Try again shortly." },
  ]);
  assert.doesNotMatch(JSON.stringify(logged), /example\.com|chal%2E|verifier-1/i);
});

test("Google's return is repeated as a same-site navigation before any cookie is needed", async () => {
  const warn = console.warn,
    logged = [];
  console.warn = (line) => logged.push(JSON.parse(line));
  try {
    await withEnv(google, neonAuth(ada), async (calls) => {
      // The arrival through the redirect chain carries no cookies here and needs none.
      const res = { writeHead(status, headers) { this.status = status; this.headers = headers; }, end(text) { this.text = text; } };
      await handler({ method: "GET", url: "/api/session?neon_auth_session_verifier=a%26b%22%3Cc", headers: { host: "localhost:3211" } }, res);
      assert.equal(res.status, 200);
      assert.match(res.headers["Content-Type"], /^text\/html/);
      assert.equal(res.headers["Cache-Control"], "no-store");
      assert.equal(res.headers["Set-Cookie"], undefined);
      const target = "/api/session?neon_auth_session_verifier=a%26b%22%3Cc&amp;resume=1";
      assert.ok(res.text.includes(`<meta http-equiv="refresh" content="0;url=${target}">`), res.text);
      assert.ok(res.text.includes(`<a href="${target}">`));
      assert.doesNotMatch(res.text, /<script/i);
      assert.equal(calls.length, 0);

      // Sent back with no verifier, the browser returns to the splash with a reason.
      const gaveUp = await call("GET", { url: "/api/session?error=state_mismatch" });
      assert.deepEqual([gaveUp.status, gaveUp.location], [302, "/?signin=failed&why=no-verifier"]);
      // The page's own status request is not a navigation and still gets JSON.
      assert.equal((await call("GET")).body.sign_in, "google");
    });
  } finally {
    console.warn = warn;
  }
  assert.deepEqual(logged, [{ event: "sign_in_incomplete", reason: "returned without a verifier", error: "state_mismatch" }]);
});
