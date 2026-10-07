# Personal provider API keys

2026-10-06. Setup steps live in [hosted setup](../../HOSTED_CONTEXT.md#personal-api-keys).

## What changed

- **Switch** (Conclave `9457e92`, `src/credentials.js`): `KEY_ENCRYPTION_SECRET` together with Google sign-in turns personal keys on. Without it every request uses the deployment's environment keys, as before. With it a signed-in user's requests spend only the keys that user saved; the environment keys serve only addresses on `SHARED_KEY_EMAILS`. A request with no user gets no keys.
- **Storage**: `app.provider_keys` (migration `0004_provider_keys`), one row per user and provider. The key is AES-256-GCM encrypted under a key derived from the secret, with the owner and provider authenticated alongside it, so a ciphertext copied to another row does not decrypt. Only the last four characters are kept in the clear.
- **Provider registry**: `keyProviders` lists OpenAI, Anthropic, Google Gemini and Jev with their environment names and a cheap authenticated read used to check a key before it is stored. Adding a provider is one entry there plus the adapter that spends its key.
- **No fallback**: the engine providers and the embedding provider treat an explicit `apiKey`, even an empty one, as the caller's own key and never substitute the environment key. `ContextRepository` takes the user's key map and builds model, Jev and embedding providers from it; hosted status reports that user's availability.
- **Endpoint** (`api/keys.js`, managed wrapper): `GET` lists each provider as own, shared or none; `POST` saves or removes one. The key is never returned.
- **Chat path** (Converse `lib/providers.js`, `lib/keys.js`): `chat`, `models`, title generation and `redact` take the same key map; `api/chat.js`, `api/models.js` and `api/title.js` resolve it per request.
- **UI** (`public/keys.js`): API keys in the menu, shown only where personal keys are on. It opens by itself for a signed-in user with no usable key. Saving reloads the model lists and Context/Agent availability.

## Evidence

- Conclave: 303 passes, one optional skip. `test/credentials.test.js` runs all five migrations on PGlite and checks encryption at rest, owner binding, a rotated and a too-short secret, shared-address allowance, fail-closed resolution without a user, the endpoint's refused/unreachable/saved/removed paths, and a hosted `ask` through the real OpenAI adapter: the stubbed provider saw only the user's key, a user with no key reached no provider, and the downloaded audit contained neither key.
- Converse: 197 passes, one optional skip; 89-file parity. `test/keys.test.js` covers the Chat adapters for all three providers, the model list, titles, refusal before any request, and redaction.
- Browser: 115 desktop/mobile runs passed, one optional skip, and 80 Agent runs. The keys dialog was exercised against a fixture endpoint.

## Not verified

- Nothing ran against Neon or a live provider. Migration `0004` has run on PGlite only, and no real key has been checked or saved.
- The dialog was driven with a mocked `/api/keys`; a signed-in session against the real endpoint has not been tried in a browser.

## Limits

- Sign-in is still restricted to `ALLOWED_EMAILS`. Opening access to others is a separate step, and there are no per-user request or storage limits yet.
- Changing `KEY_ENCRYPTION_SECRET` makes every saved key unreadable; each person enters theirs again.
- Semantic history search uses the user's OpenAI key, so someone with only an Anthropic key has keyword search only. Jev works for a user only with their own Jev key or the shared allowance.
- Keys are held in server memory for the length of a request and added to the process's redaction set.
- Password and local access have no user and keep using the environment keys.
