# Context and Agent image uploads

The composer paperclip now accepts one JPEG/PNG or Markdown file in Context and Agent. Images up to 10 MB are resized/re-encoded to at most 2048 pixels and 512 KB. The composer previews the exact processed upload; saved messages show a compact image card with a filename/dimension caption. Clicking it opens the saved pixels. Ordinary Chat retains its Markdown picker and rejects image sends.

GPT and Claude receive native pixels from immutable Conclave image sources. Follow-ups, reloads, edits and Agent checkpoints retain the source; old/offloaded images can be loaded through `view_image`. Normal saved-chat responses carry metadata, with authenticated image reads for thumbnails. Canonical JSON retains pixels and hashes; raw Markdown exports contain an image description/hash. Workspace text editing excludes binary attachments. Local token estimates show an uncalibrated image reserve; provider counts and actual usage remain distinct. No image-memory extraction, Gemini changes or database migration.

Shared engine implemented/committed first in Conclave (`84b2493`, validation updates `7b5b50d` and `69e42c7`), then migrated with the 83-file hash manifest. Source image contract: `CLA/conclave/docs/IMAGES.md` in the parent workspace.

Validation:

- Conclave full source suite: **292 passed, one optional skip, zero failures**; syntax checks passed. Seven dedicated image regressions also cover hosted PGlite reads/authentication/isolation/removal, source revisions, native adapters/preflight, exact saved references, signed Claude restart and Agent restart/Stop.
- Converse full suite: **190 passed, one optional skip, zero failures**; syntax and 83-file engine parity passed.
- **Six desktop/mobile scenarios passed:** Context PNG resize/preview/upload/reload/follow-up/edit, Agent JPEG paused reload/Resume, and existing document removal/provider-count/Claude controls. Final image screenshots were captured in a separate test output folder to avoid parallel browser work replacing them.
- Two bounded **live Context calls** using existing credentials: `gpt-6-luna` and `claude-sonnet-5-5` both recognized a yellow square on blue. Native input 4,223 / 8,873 tokens; output 15 / 36 respectively, including existing system/tools. [Exact responses and usage](image-native.json), [test image](../../reports/assets/vision-fixture.png). This confirms basic image delivery and recognition, not broad vision accuracy. GPT described the square as centered although it was left of center. Production hosting/performance remains unverified.

Screenshots: [Context desktop](../../reports/assets/context-image-desktop.png), [Context mobile](../../reports/assets/context-image-mobile.png), [Agent desktop](../../reports/assets/agent-image-desktop.png), [Agent mobile](../../reports/assets/agent-image-mobile.png).

Local implementation only; no push or deployment was requested. Parallel memory-map changes are outside this image commit.
