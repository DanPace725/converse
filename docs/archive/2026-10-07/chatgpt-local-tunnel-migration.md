# Local ChatGPT tunnel setup synchronization

Conclave source `d75ac8ffd34c115c8c89de66a995865f6aa57573` prepares the private local Secure MCP Tunnel route for regular ChatGPT chats. The source checkout owns the launcher commands, registered-app plugin generator, workflows and plain-language setup guide. They are development setup artifacts rather than Converse hosting modules.

Migration reports **102 files, zero changed runtime files**, and source parity matches. The existing hosted OAuth/HTTP implementation, application identity and database are unchanged. No deployment, push or database migration. Source passed 355 checks / one optional replay skipped and syntax/UI bundle checks. Actual tunnel registration and ChatGPT tool invocation remain pending because the runtime key is absent and Chrome blocks automation while another extension UI is open.

Converse validation: 203 passes / one optional live Neon skip, syntax and 102-file manifest integrity passed.

[User setup guide](../../../../CLA/conclave/docs/CHATGPT_LOCAL.md) · [Source evidence](../../../../CLA/conclave/docs/archive/2026-10-07/chatgpt-local-tunnel.md).

## Follow-up: verified private ChatGPT connection

Source `606e8f047867d6c86c7130699ed4abe896052da2` records the user's approved private tunnel/ChatGPT connection and actual regular-chat read/save. Existing revision-2 Coding Pilot was retrieved without change; a new synthetic revision-1 packet saved by ChatGPT was independently retrieved by the SDK stdio client from the same canonical local store. The official client runs outside the agent sandbox, health live/ready, key environment-only. NordPass and firewall settings unchanged. Optional workflow package generated with actual app ID, not installed; native desktop invocation remains pending.

Applied source migration: **102 files, zero changed runtime files**, parity matched. Updated app context and source receipt; no hosting changes, deployment, migration or push. The active guide now includes the registered connection name, actual Tunnel ID form, direct Node flag-bearing commands and safe stop/restart instructions.

Current Converse checks: syntax and manifest integrity passed; **203 tests passed, one optional live Neon test skipped**.
