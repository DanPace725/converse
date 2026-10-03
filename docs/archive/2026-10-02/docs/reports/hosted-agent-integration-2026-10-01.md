# Hosted agent integration — 2026-10-01

The agent/workspace increment and Claude's redesigned Converse UI are working together at https://converse-cyan.vercel.app. No additional schema migration or hosted filesystem storage was required. Verification created one new conversation; existing conversations were not edited.

## Deployment and configuration

- Verified runtime commit: `f7b929dea4dc1dce1f3b914f3e80b18a038dd905`.
- Deployment: `dpl_HghhGNUuwDMDLiqPu4tKWpjYUqNX`, production, READY; the stable alias points to it.
- Runtime: Node 24, `iad1`, configured function duration 240 seconds. The existing application deadlines and Neon lease/checkpoint path remain in use.
- Authenticated capabilities reported PostgreSQL storage and available OpenAI/Jev credentials. Defaults were Jev enabled, 256,000 context units and 16,384 output tokens per call.
- Production JavaScript assets matched the tested local files byte for byte. The GitHub `main` integration deployed the change automatically.

The first browser check exposed a sign-in race: an unauthenticated context-capability request could arrive after successful login and reopen the password dialog. A session generation now guards delayed authentication failures, and context capabilities refresh again if login completed during an earlier request. The service-worker shell version was advanced. Desktop and phone regression checks reproduce the delayed response and verify recovery without another password submission.

## Live result

Conversation: `conv_9f9e3d77-8a07-46d6-a096-1c6c8db4857e`, titled “Hosted integration proof 2026-10-01T19:02:54.889Z”. Verification finished at 19:04:45 UTC.

The browser selected **Agent** and submitted an ordinary composer message. The selected UI model was `gpt-6.1-sol`; the service default remains Luna. The test used three minutes, eight maximum steps and 75,000 total tokens while retaining the normal context/output budgets.

1. The agent called calculate for 17 × 23, wrote the exact requested `hosted-proof.md`, read the saved file and returned a final answer. It completed in four steps. The progress strip showed model work while the context garden was closed.
2. Repeating a completed step returned saved progress without adding an inference request.
3. Switching to **Context** in the same chat performed a fresh read, an exact patch from “Verification: pending.” to “Verification: passed.”, another read and a final answer. The patch receipt linked its preceding version and preserved the other 46 characters exactly.
4. Reload restored the same saved chat and Context mode. The current file download contained the patched text. Browser Export JSON retained the original and updated documents, three version-specific read receipts, nine agent checkpoints and the complete usage audit.

| Phase | Task calls | Input tokens | Output tokens |
| --- | ---: | ---: | ---: |
| Agent | 4 | 7,666 | 142 |
| Context follow-up | 4 | 9,747 | 158 |
| Total | 8 | 17,413 | 300 |

The export contains 56 events and seven snapshots at context revision seven. Provider usage was complete, with zero recorded failures, zero completion corrections and zero browser JavaScript errors. Reported cached input was 11,291 tokens; no pricing or cost estimate is inferred from this.

Jev was configured and enabled by default. This small conversation required no selection or compaction calls, so this check does **not** establish hosted Jev behavior under pressure. The earlier local native-Jev pressure test and disposable-Neon persistence test remain separate evidence.

## Evidence and repeatability

Ignored local evidence is in `.agent-smoke/hosted/`: `audit.json`, `result.json`, `hosted-proof.md`, `agent-working.png` and `context-edited.png`. The downloaded audit's SHA-256 is `c0bfd0f8ab49893b651ee822eb859ef89ffacd0cd0ef1e57ef1fb99ad213046c`.

`scripts/hosted-agent-smoke.js --live` creates another isolated hosted chat and spends provider tokens. Supply `APP_PASSWORD` through the process environment; the script keeps credentials/cookies in memory. It uses installed Microsoft Edge by default, with optional `CONVERSE_TEST_BROWSER` and HTTPS `CONVERSE_TEST_ORIGIN` overrides. It saves only the new test chat's audit and artifacts. Its first run reached the download checks but used the wrong receipt event name in an assertion; the assertion was corrected to `workspace_read`, and the same saved conversation was checked again without further paid inference.

Syntax checks and 27 offline tests passed. The desktop/phone browser suite passed 23 checks, with the desktop touch-only check skipped. Hosted checks verified the real browser → Vercel API → Neon → provider → download flow; no load or long-horizon acceptance test was performed.

## Remaining increments

The browser still schedules agent steps and must stay open. Stop waits for the active request. A durable worker/queue is the next increment for unattended execution; it should preserve the existing deadlines, fenced leases, saved step identity and interrupted-call behavior. Stronger content acceptance checks remain useful beyond mechanical readback. Ordinary multi-provider Chat mode remains device-local; Context and Agent chats use Neon.
