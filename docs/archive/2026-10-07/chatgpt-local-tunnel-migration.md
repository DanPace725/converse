# Local ChatGPT tunnel setup synchronization

Conclave source `d75ac8ffd34c115c8c89de66a995865f6aa57573` prepares the private local Secure MCP Tunnel route for regular ChatGPT chats. The source checkout owns the launcher commands, registered-app plugin generator, workflows and plain-language setup guide. They are development setup artifacts rather than Converse hosting modules.

Migration reports **102 files, zero changed runtime files**, and source parity matches. The existing hosted OAuth/HTTP implementation, application identity and database are unchanged. No deployment, push or database migration. Source passed 355 checks / one optional replay skipped and syntax/UI bundle checks. Actual tunnel registration and ChatGPT tool invocation remain pending because the runtime key is absent and Chrome blocks automation while another extension UI is open.

Converse validation: 203 passes / one optional live Neon skip, syntax and 102-file manifest integrity passed.

[User setup guide](../../../../CLA/conclave/docs/CHATGPT_LOCAL.md) · [Source evidence](../../../../CLA/conclave/docs/archive/2026-10-07/chatgpt-local-tunnel.md).
