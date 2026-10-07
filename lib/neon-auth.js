// Server-side relay for Neon Auth's Google sign-in. The browser never calls
// Neon Auth itself, so the app keeps its same-origin CSP and its own session
// cookie; Neon Auth only proves who signed in.
const CHALLENGE = "__Secure-neon-auth.session_challenge";
// Neon Auth still issues this misspelled twin while it migrates; send both.
const LEGACY_CHALLENGE = "__Secure-neon-auth.session_challange";
const VERIFIER = "neon_auth_session_verifier";
const UNAVAILABLE = "Google sign-in is unavailable. Try again shortly.";
const base = () => (process.env.NEON_AUTH_BASE_URL || "").replace(/\/+$/, "");
export const verifierOf = (url) => url.searchParams.get(VERIFIER);
function upstream(path, origin, init = {}) {
  if (!base()) throw Error("Set NEON_AUTH_BASE_URL to enable Google sign-in.");
  return fetch(base() + path, {
    ...init,
    signal: AbortSignal.timeout(10000),
    headers: { origin, "x-neon-auth-middleware": "true", ...init.headers },
  }).catch(() => {
    throw Error(UNAVAILABLE);
  });
}
// Returns Google's sign-in address and the challenge that the returning
// browser must present with its verifier.
export async function startGoogle(origin) {
  const response = await upstream("/sign-in/social", origin, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      provider: "google",
      callbackURL: origin + "/api/session",
    }),
  });
  const data = await response.json().catch(() => null);
  if (data?.code === "INVALID_CALLBACKURL")
    throw Error(
      `${origin} is not a trusted sign-in address. Add it to Neon Auth's trusted domains; locally, open the app at http://localhost instead of 127.0.0.1.`,
    );
  const challenge = response.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith(CHALLENGE + "="))
    ?.slice(CHALLENGE.length + 1)
    .split(";")[0];
  if (!response.ok || !challenge || !/^https:\/\//.test(data?.url || ""))
    throw Error(UNAVAILABLE);
  return { url: data.url, challenge };
}
// Exchanges the verifier Neon Auth appended to the return address for the
// user who completed sign-in; null when the exchange is refused.
export async function finishGoogle(origin, verifier, challenge) {
  const response = await upstream(
    "/get-session?" + new URLSearchParams({ [VERIFIER]: verifier }),
    origin,
    {
      headers: {
        cookie: `${CHALLENGE}=${challenge}; ${LEGACY_CHALLENGE}=${challenge}`,
      },
    },
  );
  const user = (await response.json().catch(() => null))?.user;
  if (response.ok && user?.id && user.email && user.emailVerified === true)
    return { id: user.id, email: user.email };
  // No address or token: only what is needed to tell the refusals apart.
  console.warn(
    JSON.stringify({
      event: "sign_in_exchange_refused",
      status: response.status,
      user: !!user?.id,
      email_verified: user?.emailVerified === true,
    }),
  );
  return null;
}

// Email codes avoid the cross-site OAuth return altogether. Neon generates,
// delivers, expires and rate-limits the codes. Codes are not persisted in
// browser storage or logs; upstream session tokens never reach the browser.
export async function emailCode(origin, email, otp) {
  const checking = otp !== undefined;
  const response = await upstream(
    checking ? "/sign-in/email-otp" : "/email-otp/send-verification-otp",
    origin,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        checking ? { email, otp } : { email, type: "sign-in" },
      ),
    },
  );
  const data = await response.json().catch(() => null);
  if (response.status === 429 || data?.code === "TOO_MANY_ATTEMPTS")
    return {
      status: 429,
      error: "Too many attempts. Wait a little, then request a new code.",
    };
  if (!response.ok)
    return {
      status: response.status >= 500 || response.status === 404 ? 502 : 400,
      error: checking
        ? "That code could not be verified. Try again or request a new code."
        : "Could not send a code. Try again shortly or continue with Google.",
    };
  if (!checking)
    return data?.success === true
      ? { status: 200 }
      : { status: 502, error: "Could not send a code. Try again shortly." };
  const user = data?.user;
  if (
    !data?.token ||
    !user?.id ||
    user.emailVerified !== true ||
    String(user.email || "")
      .trim()
      .toLowerCase() !== email
  )
    return {
      status: 401,
      error: "That code could not be verified. Request a new code.",
    };
  return { status: 200, user: { id: user.id, email: user.email } };
}
