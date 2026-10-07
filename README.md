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

Open http://localhost:3211. Keys stay server-side: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`; optional `JEV_API_KEY` or `TYPESAFE_API_KEY` enables Jev. A hosted deployment with Google sign-in can instead have each person [save their own keys](docs/HOSTED_CONTEXT.md#personal-api-keys).

`web_search` in Context and Agent modes uses native OpenAI or Anthropic search with the existing provider key. Each lookup uses the selected model, permits up to two native tool uses, and saves findings and citation URLs. There are eight lookups per turn or agent run. Search findings are discovery leads: models can use `web_fetch` to read a source URL directly, including a URL supplied by the user, without a summary call or another API key. The complete HTTP response and extracted text are saved with URL, timestamp and content hash. The answering model receives the text before older receipts become source pointers; Conclave can then select, summarize, offload and retrieve exact passages. Oversized requests may show paged exact text with retrieval offsets. Fetching allows eight attempts per turn/run, three redirects, a 15-second deadline and 2 MiB responses, restricted to public addresses and HTML/text. It does not render JavaScript or extract PDFs. Search token usage is separately recorded; native search fees are additional and excluded from current token-only valuations.

With pooled `DATABASE_URL`, Context/Agent uses Neon. Without it, local development uses SQLite under `CONCLAVE_DATA_DIR` or the sibling Conclave `.conclave` directory. Ordinary Chat stays in browser storage, separately for each signed-in account. Hosted requests require Neon and either Google sign-in or `APP_PASSWORD`; see [hosted setup](docs/HOSTED_CONTEXT.md#google-sign-in).

## Use the app

- **Chat:** select recipients or use @GPT, @Claude, @Gemini. Multiple recipients reply in parallel.
- **Context:** choose GPT or Claude for a saved conversation with retrievable history and editable context/state.
- **Agent:** submit an objective; keep the tab open for steps. Stop/Resume operates on the saved run.
- **Models:** hold (or right-click, or press ↓ on) a recipient name above the message box to choose that provider's model; the sidebar Models list sets the same choice.
- **Workspace:** one panel with Files, Context and Memory tabs. In Files, upload, edit, download, remove/restore documents, or reference a filename in chat. Manual actions make no model calls. Limits: 20 active files, 100 KB/file, 500 KB active text.
- **Context tab:** the garden map, what the last request sent split by part (each part opens to its pieces), the working pieces, and the activity report with references, protections, request counts, and saved transformations. The top-bar Context shortcut shows the last request size and opens this tab. **Memory** holds named state.
- **Docs:** opens the same guide available to models through `read_app_guide`. It is also linked from the splash page shown before sign-in, next to the GitHub link.

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
| Personal API keys | `lib/conclave/credentials.js`, `lib/keys.js`, `api/keys.js` |
| HTTP handlers | `api/`, `lib/conclave-http.js` |
| UI and shared guide | `public/` |
| Reports and comparisons | `scripts/`, [commands](docs/REPORTING.md) |

## Install

Use the Chromium install menu, or Safari → Share → Add to Home Screen. HTTPS is required outside localhost. The shell and device chat can open offline after the first visit; model replies require internet. Installed-app updates activate after existing windows close.
