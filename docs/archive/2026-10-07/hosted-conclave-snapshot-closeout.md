# Independent hosted Conclave snapshot closeout

Conclave now runs independently on Railway with its own Neon database/Auth. Converse retains its existing application, sign-in and deployment configuration. Development now prioritizes hosted ChatGPT/Claude interoperability; see the source [session handoff](../../../../CLA/conclave/docs/SESSION_HANDOFF.md) and [hosted setup](../../../../CLA/conclave/docs/HOSTED_HANDOFFS.md).

Four additional validated snapshot commits (`3206a94`, `c286f08`, `9e577f0`, `1ad96ef`) preserve standalone branding compatibility and the source's native consent Origin, callback CSP and OAuth scope-discovery fixes. The 102-file manifest points to Conclave `40128be2c325299c20a00ef145a8d61d35cc6b7a`; later source documentation commits do not change managed files.

Converse passed 203 tests / one optional skip with a workspace-local TEMP/TMP directory, plus syntax/parity checks. Source passed 360 tests / one optional skip. These validated commits and closeout documentation are published on `codex/conclave-hosted` and fast-forwarded to the existing `codex/conclave-handoffs` branch for [PR #26](https://github.com/DanPace725/converse/pull/26). No main merge, production migration, new environment settings or Converse deployment was performed.

The independent service's successful Railway runtime is `40128be`, deployment `52deb270-d20a-471d-9f17-da6db6c7abe8`. The user reports overall app access working. Claude's old read-only grant needs reconnecting and approval for read and save; its actual update and the cross-app revision round trip remain acceptance checks. Existing packet data and connection scopes were not modified during diagnosis.
