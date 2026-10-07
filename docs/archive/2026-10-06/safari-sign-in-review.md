# Safari sign-in review and email-code fallback

2026-10-06. Reviewed Claude's `07b27ba` retry and `88a5d00` same-site return step. The owner confirmed their friend has **not** retried Safari since those changes; the original failure and its cause remain unobserved here.

## Findings

- The verifier/challenge exchange matches [Neon's server middleware](https://github.com/neondatabase/neon-js/blob/main/packages/auth/src/server/middleware/oauth.ts). Converse stores its challenge as a first-party, non-partitioned cookie and sends the challenge server-to-server.
- Serving a page before repeating the callback resets the browser navigation to the app's origin. Keep this fix and the bounded retry. They cannot repair an upstream failure before Neon supplies a verifier.
- [WebKit bug 306194](https://bugs.webkit.org/show_bug.cgi?id=306194) is still NEW at this review. Its reporter observed Safari 26.2 omitting partitioned cookies after multiple cross-site redirects, then sending them after refresh. This is a plausible lead, not a diagnosis for Converse; Converse's own challenge cookie is not partitioned.
- The existing mobile Playwright project runs Chromium/Edge with an iPhone viewport, so the earlier mobile passes were not WebKit evidence.

## Implemented fallback

The splash offers **Use an email code instead** below Google. The app relays the managed `/email-otp/send-verification-otp` and `/sign-in/email-otp` APIs, which were confirmed in the current branch's live OpenAPI schema. Neon owns delivery, expiration and attempt limits. There is no Google redirect, third-party browser request, new database schema or new dependency.

Before sending or checking, validate the email and allowlist. Before issuing an app cookie, require a successful upstream response, a session token, a verified user ID and an email matching the request; recheck the allowlist. The app signs the same identity session used by Google and discards Neon's token. Code/token values are not logged or persisted in browser storage. The form supports code autofill, errors and requesting another code.

## Evidence

- 203 app tests passed; one optional Neon test skipped. Ten session tests include the successful email exchange and existing account ID, bad input, unlisted addresses, unverified or mismatched users, missing session token, refused exchanges, expiry, rate limits and transport failures.
- 12 authentication browser checks passed across desktop/mobile Edge and WebKit 26.6 on Windows. Both Google return and email fallback exercise the actual app handler with a fixture Neon response; the UI check additionally exercises a rejected code, requesting another code, reload and sign-out.
- Eight existing Google sign-in, splash and bounded-retry browser regressions passed in desktop/mobile Edge. The mobile WebKit fallback was also visually inspected.
- Syntax checks and all 89 Conclave migration hashes passed; no engine files changed.
- The old browser fixture fulfilled a mocked 302, which Playwright WebKit rejects. It now serves a small page that navigates to a real cross-site HTTP redirect. The callback still arrives cross-site and its resume request is same-origin. Cookie checks verify the actual emitted Strict attribute and the browser's HttpOnly session because this Windows WebKit build reports SameSite as None in cookie inspection.

## Remaining real-world checks

The fallback is local and has not been deployed. No email was sent during this review. Actual email delivery, Google/OTP resolution to the same existing account in Neon, production HTTPS cookies and the friend's Safari result remain unverified. The connected Neon configuration tools failed; the CLI's saved authentication was rejected, so the production email-sign-in setting could not be rechecked. Enable email sign-in in Neon and configure production SMTP before relying on delivery. See [setup](../../HOSTED_CONTEXT.md#email-code-fallback).
