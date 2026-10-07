import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

// The real session handler behind a real cross-site round trip: only the
// sign-in service and Google themselves are stood in for.
const names = ["SESSION_SECRET", "ALLOWED_EMAILS", "NEON_AUTH_BASE_URL", "APP_PASSWORD", "KEY_ENCRYPTION_SECRET", "VERCEL"];
// The production response headers that could interfere with the resume page.
const policy = "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

test("Google's cross-site return signs in through the same-site resume step", async ({ page }) => {
  const before = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  Object.assign(process.env, {
    SESSION_SECRET: "fixture-session-secret",
    ALLOWED_EMAILS: "ada@example.com",
    NEON_AUTH_BASE_URL: "https://auth.example/neondb/auth",
  });
  const fetchBefore = globalThis.fetch;
  // Neon Auth, as the server sees it.
  globalThis.fetch = async (url) =>
    String(url).includes("/sign-in/social")
      ? new Response(JSON.stringify({ url: "https://accounts.example/consent" }), {
          headers: { "set-cookie": "__Secure-neon-auth.session_challenge=chal%2Evalue; Max-Age=600; Path=/; HttpOnly; Secure; SameSite=None; Partitioned" },
        })
      : Response.json({ session: { id: "s1" }, user: { id: "user-ada", email: "ada@example.com", emailVerified: true } });
  const [{ default: session }, { guard, json }] = await Promise.all([import("../../api/session.js"), import("../../lib/access.js")]);
  const returns = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    res.setHeader("Content-Security-Policy", policy);
    res.setHeader("Referrer-Policy", "no-referrer");
    if (url.pathname === "/api/session") {
      if (req.method === "GET" && url.searchParams.has("neon_auth_session_verifier"))
        returns.push({ resume: url.searchParams.get("resume"), site: req.headers["sec-fetch-site"],
          challenge: /converse_signin=/.test(req.headers.cookie || "") });
      return session(req, res);
    }
    if (url.pathname === "/api/models") {
      if (!guard(req, res)) return;
      return json(res, 200, { GPT: { models: ["gpt-fixture"] }, Claude: { models: [] }, Gemini: { models: [] } });
    }
    if (url.pathname.startsWith("/api/")) return json(res, 200, { available: false, enabled: false, providers: [] });
    try {
      const file = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      res.setHeader("Content-Type", file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : file.endsWith(".png") ? "image/png" : "text/html");
      res.end(await readFile(new URL("../../public/" + file, import.meta.url)));
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "localhost", resolve));
  const app = `http://localhost:${server.address().port}`;
  // Google and the sign-in service, as the browser sees them: another site
  // (127.0.0.1 is not localhost) that sends the browser back with a verifier.
  const elsewhere = createServer((req, res) => {
    res.writeHead(302, { Location: `${app}/api/session?neon_auth_session_verifier=verifier-1` });
    res.end();
  });
  await new Promise((resolve) => elsewhere.listen(0, "127.0.0.1", resolve));
  try {
    // The handler only follows https addresses; hand that one to the other site.
    await page.route("https://accounts.example/**", (route) =>
      route.fulfill({ status: 302, headers: { location: `http://127.0.0.1:${elsewhere.address().port}/callback` } }),
    );
    await page.goto(app + "/");
    await expect(page.locator("#google-sign-in")).toBeVisible();
    await page.locator("#google-sign-in").click();

    await expect(page.locator("#status")).toHaveText("Ready");
    await expect(page.locator("#unlock")).toBeHidden();
    await expect(page).toHaveURL(app + "/");
    await page.locator("#more-menu > summary").click();
    await expect(page.locator("#sign-out")).toHaveText("Sign out (ada@example.com)");
    // The arrival from the other site only hands over to this site's own
    // request, which is the one that carries the challenge.
    expect(returns.map((entry) => [entry.resume, entry.site])).toEqual([[null, "cross-site"], ["1", "same-origin"]]);
    expect(returns[1].challenge).toBe(true);
    const cookies = await page.context().cookies(app);
    expect(cookies.find((cookie) => cookie.name === "converse_session")?.sameSite).toBe("Strict");
    expect(cookies.find((cookie) => cookie.name === "converse_signin")).toBeUndefined();
  } finally {
    server.close();
    elsewhere.close();
    globalThis.fetch = fetchBefore;
    for (const name of names) if (before[name] === undefined) delete process.env[name]; else process.env[name] = before[name];
  }
});
