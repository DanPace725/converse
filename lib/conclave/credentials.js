import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { providerKeys } from './db-schema.js';
import { guard, identity, identityRequired, json, body } from './access.js';
import { environment, redact } from './provider.js';

// Every provider a person can bring a key for. An entry makes the key storable,
// checkable and listed; the adapter that spends it is separate. `env` names the
// deployment's own key, `check` a cheap authenticated read that proves a key.
export const keyProviders = {
  openai: { label: 'OpenAI', env: ['OPENAI_API_KEY'],
    check: key => ({ url: 'https://api.openai.com/v1/models', headers: { Authorization: `Bearer ${key}` } }) },
  anthropic: { label: 'Anthropic', env: ['ANTHROPIC_API_KEY'],
    check: key => ({ url: 'https://api.anthropic.com/v1/models?limit=1', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' } }) },
  gemini: { label: 'Google Gemini', env: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
    check: key => ({ url: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', headers: { 'x-goog-api-key': key } }) },
  jev: { label: 'Jev', env: ['TYPESAFE_API_KEY', 'JEV_API_KEY'],
    check: key => ({ url: 'https://api.typesafe.ai/v1/models', headers: { Authorization: `Bearer ${key}` } }) },
};

const fail = (message, status = 400) => { throw Object.assign(Error(message), { status }); };
function validKey(key) {
  if (typeof key !== 'string' || !/^[\x21-\x7e]{8,400}$/.test(key)) fail('Enter the API key exactly as the provider shows it.');
  return key;
}

// KEY_ENCRYPTION_SECRET turns own keys on for signed-in users. From then on a
// user's requests spend only the keys that user saved; the deployment's
// environment keys serve nobody but the addresses on SHARED_KEY_EMAILS.
export const ownKeysEnabled = () => identityRequired() && !!process.env.KEY_ENCRYPTION_SECRET;
export function sharedKeysAllowed(email) {
  const candidate = String(email || '').trim().toLowerCase();
  return !!candidate && (process.env.SHARED_KEY_EMAILS || '').split(',').map(x => x.trim().toLowerCase()).includes(candidate);
}
function environmentKey(provider) {
  for (const name of keyProviders[provider].env) { const value = environment(name); if (value) return value; }
}

function cipherKey() {
  const secret = process.env.KEY_ENCRYPTION_SECRET || '';
  if (secret.length < 32) fail('KEY_ENCRYPTION_SECRET must be at least 32 characters.', 503);
  return Buffer.from(hkdfSync('sha256', secret, '', 'conclave-provider-keys-v1', 32));
}
// AES-256-GCM. The owner and provider are authenticated with the ciphertext, so
// a stored value moved to another row does not decrypt.
function seal(owner, provider, key) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', cipherKey(), iv);
  cipher.setAAD(Buffer.from(owner + '\n' + provider));
  const data = Buffer.concat([cipher.update(key, 'utf8'), cipher.final()]);
  return ['v1', iv, cipher.getAuthTag(), data].map(part => typeof part === 'string' ? part : part.toString('base64url')).join('.');
}
function open(owner, provider, secret) {
  const [version, iv, tag, data] = String(secret).split('.');
  if (version !== 'v1' || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', cipherKey(), Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from(owner + '\n' + provider));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  } catch (error) {
    if (error.status) throw error;
    // Written under another secret, or altered: unusable until saved again.
    return null;
  }
}

export class CredentialStore {
  constructor(db) { this.db = db; }

  async rows(owner) {
    if (!owner) return [];
    return (await this.db.select().from(providerKeys).where(eq(providerKeys.ownerId, owner)))
      .filter(row => Object.hasOwn(keyProviders, row.provider))
      .map(row => ({ ...row, key: open(owner, row.provider, row.secret) }));
  }

  // The usable keys, by provider.
  async keys(owner) {
    return Object.fromEntries((await this.rows(owner)).filter(row => row.key).map(row => [row.provider, row.key]));
  }

  async save(owner, provider, key) {
    if (!owner) fail('Sign in to save an API key.', 401);
    if (!Object.hasOwn(keyProviders, provider)) fail('Unknown provider.');
    const values = { secret: seal(owner, provider, validKey(key)), hint: key.slice(-4), updatedAt: new Date().toISOString() };
    await this.db.insert(providerKeys).values({ ownerId: owner, provider, ...values })
      .onConflictDoUpdate({ target: [providerKeys.ownerId, providerKeys.provider], set: values });
  }

  async remove(owner, provider) {
    if (!owner) fail('Sign in to remove an API key.', 401);
    await this.db.delete(providerKeys).where(and(eq(providerKeys.ownerId, owner), eq(providerKeys.provider, provider)));
  }
}

// The keys one request may spend, by provider. Undefined means the deployment's
// environment: own keys are off, as under password or local access. Otherwise
// only the returned keys are used, and a provider absent from them has none.
export async function requestCredentials(database, user) {
  if (!ownKeysEnabled()) return undefined;
  if (!user) return {};
  const keys = await new CredentialStore(database()).keys(user.id);
  if (sharedKeysAllowed(user.email))
    for (const provider of Object.keys(keyProviders)) keys[provider] ||= environmentKey(provider);
  return Object.fromEntries(Object.entries(keys).filter(([, key]) => key));
}

// What the engine can reach with those keys.
export const keyAvailability = keys => ({ openai: !!keys.openai, anthropic: !!keys.anthropic, jev: !!keys.jev });

// One authenticated read against the provider. Returns nothing when the key
// works; a refused key and an unreachable provider fail differently.
export async function checkKey(provider, key, { fetchImpl = fetch } = {}) {
  const { label, check } = keyProviders[provider], { url, headers } = check(key);
  let response;
  try { response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(10000) }); }
  catch { fail(`Could not reach ${label} to check the key. Try again.`, 502); }
  if ([400, 401, 403].includes(response.status)) fail(`${label} did not accept this key.`);
  if (!response.ok) fail(`Could not check the key with ${label} (${response.status}). Try again.`, 502);
}

async function listing(database, user) {
  const rows = await new CredentialStore(database()).rows(user.id), shared = sharedKeysAllowed(user.email);
  return { enabled: true, providers: Object.entries(keyProviders).map(([id, { label }]) => {
    const row = rows.find(item => item.provider === id);
    return { id, label,
      // 'own': this user's saved key. 'shared': the deployment's key, by allowance.
      source: row?.key ? 'own' : shared && environmentKey(id) ? 'shared' : null,
      ...(row ? { hint: row.hint, saved_at: row.updatedAt, ...(row.key ? {} : { unreadable: true }) } : {}) };
  }) };
}

// GET lists each provider's key status for the signed-in user; POST saves
// ({ action: 'save', provider, key }) or removes ({ action: 'remove', provider })
// one. A key is checked with its provider before it is stored and is never
// returned: only its last four characters are.
export function createCredentialHandler({ database, fetchImpl }) {
  return async (req, res) => {
    if (!guard(req, res)) return;
    let submitted;
    try {
      if (!ownKeysEnabled()) return json(res, 200, { enabled: false, providers: [] });
      const user = identity(req);
      if (req.method === 'GET') return json(res, 200, await listing(database, user));
      if (req.method !== 'POST') return json(res, 405, { error: 'GET or POST required' });
      const input = await body(req), store = new CredentialStore(database());
      if (!Object.hasOwn(keyProviders, input.provider)) fail('Unknown provider.');
      if (input.action === 'save') {
        submitted = typeof input.key === 'string' ? input.key.trim() : input.key;
        await checkKey(input.provider, validKey(submitted), { fetchImpl });
        await store.save(user.id, input.provider, submitted);
      } else if (input.action === 'remove') await store.remove(user.id, input.provider);
      else fail('Unsupported key operation');
      return json(res, 200, await listing(database, user));
    } catch (error) {
      const storage = !error.status && !!(error.code || error.cause?.code);
      let message = storage ? 'Key storage unavailable. Try again shortly.' : redact(error);
      if (typeof submitted === 'string' && submitted) message = message.split(submitted).join('[redacted]');
      return json(res, storage ? 503 : error.status || 400, { error: message });
    }
  };
}
