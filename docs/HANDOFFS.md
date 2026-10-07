# Conclave handoffs in Converse

The online handoff implementation is prepared on `codex/conclave-handoffs`, but it has not been deployed or applied to the live database. It uses Converse's existing sign-in and PostgreSQL pool. MCP access covers only the signed-in account's handoff packets; it does not grant access to chats or provider API keys.

The ongoing plain-language document, including ChatGPT, Claude, Gemini CLI and local app installation directions, is [the Conclave setup checklist](../../CLA/conclave/docs/HANDOFF_SETUP.md). The shared [technical contract](../../CLA/conclave/docs/HANDOFF_MCP.md) documents authorization, storage and limits.

## Deployment settings

Set `CONCLAVE_MCP_ORIGIN` to the fixed HTTPS origin of this deployment, with no trailing slash or path. The MCP handler remains disabled when this is absent. Existing `SESSION_SECRET`, `ALLOWED_EMAILS`, pooled `DATABASE_URL` and sign-in settings are required. Migration `0005_handoff_mcp` adds the packet and authorization tables; use the intended direct database connection with `npm run db:migrate` after validating an isolated branch.

`vercel.json` routes `/mcp`, `/authorize`, `/token`, `/register`, `/revoke`, `/connect`, and the two OAuth metadata paths to `api/mcp.js`. Whitelisted `__mcp_path` markers preserve the route even if hosting supplies the rewritten URL. The wrapper disables body parsing so the official SDK handles JSON and OAuth forms. Local `npm run dev` exposes the same paths.

The public MCP address is the origin plus `/mcp`. The permission and connection-management page is the origin plus `/connect`. OAuth discovery endpoints must be reachable by cloud clients without a Vercel protection login. Conclave's own Bearer authorization and consent remain required. The fixed origin must match the Host header, metadata resource and sign-in host.

Before enabling the live pilot, restore access to the owning Vercel team and rotate the configuration credentials described in the setup checklist. Do not paste credentials into this document, handoff packets or connector settings. Hosting plan/cost, a public endpoint test and actual ChatGPT-to-Claude interoperability remain unverified.
