# Converse

Installable chat app for GPT, Claude, and Gemini, with persistent Conclave Context and Agent modes.

[App guide](public/app-guide.md) · [Project context](PROJECT_CONTEXT.md) · [Development method](docs/DEVELOPMENT_METHOD.md) · [Hosted setup](docs/HOSTED_CONTEXT.md) · [Reporting](docs/REPORTING.md)

## Run locally

Requires Node.js 22.13+.

```powershell
npm ci
# Copy .env.example to .env and supply provider keys.
npm run dev
```

Open http://127.0.0.1:3211. Keys stay server-side: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`; optional `JEV_API_KEY` or `TYPESAFE_API_KEY` enables Jev.

`web_search` in Context and Agent modes uses native OpenAI or Anthropic search with the existing provider key. Ask for current web information; the model chooses when to search. Each lookup is a separate, bounded call to the selected provider/model and permits up to two native tool uses, with eight lookups per turn or agent run. The immediate result includes up to five source URLs; all returned URLs and readable findings are saved. Conclave gets short evidence sections and can select, summarize, offload and retrieve them. Search-generated findings retain qualifications, provider/model and retrieval time. The provider's native result blocks stay in the audit; independently verified full-page text is not stored. Search token usage is recorded separately; native search fees are additional and not included in current token-only valuations. No additional search key is required.

With pooled `DATABASE_URL`, Context/Agent uses Neon. Without it, local development uses SQLite under `CONCLAVE_DATA_DIR` or the sibling Conclave `.conclave` directory. Ordinary Chat stays in browser storage. Hosted requests require Neon and `APP_PASSWORD`.

## Use the app

- **Chat:** select recipients or use @GPT, @Claude, @Gemini. Multiple recipients reply in parallel.
- **Context:** choose GPT or Claude for a saved conversation with retrievable history and editable context/state.
- **Agent:** submit an objective; keep the tab open for steps. Stop/Resume operates on the saved run.
- **Workspace:** upload, edit, download, remove/restore documents, or reference a filename in chat. Manual actions make no model calls. Limits: 20 active files, 100 KB/file, 500 KB active text.
- **Context Garden / Context activity:** inspect working sections, references, protections, request counts, and saved transformations.
- **About / Help:** opens the same guide available to models through `read_app_guide`.

Copy preserves raw Markdown. Replies render sanitized Markdown and bundled KaTeX. The thought trail shows provider-returned reasoning summaries. Export Markdown is the readable transcript; canonical JSON retains the complete historical audit. Export names use title plus UTC timestamp, with `Conversation` for an untitled chat.

The [app guide](public/app-guide.md) describes storage, removals, tools, counting, guards, and timeout behavior. Workspace tools operate on virtual text documents.

## Develop and check

```powershell
npm test
npm run check
npm run test:browser
npm run test:agent:browser
```

Browser checks use Playwright and installed Microsoft Edge. Live provider/Neon scripts are separate opt-in checks.

| Area | Location |
|---|---|
| Ordinary provider adapters | `lib/providers.js` |
| Conclave engine and adaptations | `lib/conclave/`, [snapshot notes](lib/conclave/VENDORED.md) |
| Storage and coordination | `lib/context-repository.js`, `lib/database.js`, `drizzle/` |
| HTTP handlers | `api/`, `lib/conclave-http.js` |
| UI and shared guide | `public/` |
| Reports and comparisons | `scripts/`, [commands](docs/REPORTING.md) |

## Install

Use the Chromium install menu, or Safari → Share → Add to Home Screen. HTTPS is required outside localhost. The shell and device chat can open offline after the first visit; model replies require internet. Installed-app updates activate after existing windows close.
