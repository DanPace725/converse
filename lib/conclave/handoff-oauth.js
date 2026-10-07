import { randomBytes, createHash, createCipheriv, createDecipheriv } from 'node:crypto';
import { InvalidGrantError, InvalidScopeError, InvalidTargetError, InvalidClientMetadataError, InvalidTokenError, InvalidRequestError } from '@modelcontextprotocol/sdk/server/auth/errors.js';

const random = () => randomBytes(32).toString('base64url');
export const tokenHash = value => createHash('sha256').update(String(value)).digest('hex');
const hour = 3600000, month = 30 * 86400000;
export const handoffScopes = ['handoffs:read', 'handoffs:write'];
const encode = (data, secret) => {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', createHash('sha256').update(secret).digest(), iv);
  const bytes = Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final()]);
  return [iv, cipher.getAuthTag(), bytes].map(x => x.toString('base64url')).join('.');
};
const decode = (data, secret) => {
  const [iv, tag, bytes] = data.split('.').map(x => Buffer.from(x, 'base64url'));
  const cipher = createDecipheriv('aes-256-gcm', createHash('sha256').update(secret).digest(), iv);
  cipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([cipher.update(bytes), cipher.final()]).toString());
};

export class HandoffOAuthProvider {
  constructor(records, { origin, secret, emailAllowed }) {
    this.records = records; this.origin = origin; this.resource = `${origin}/mcp`;
    this.secret = secret; this.emailAllowed = emailAllowed;
    this.clientsStore = {
      getClient: async id => {
        const saved = await records.get(`client:${id}`);
        if (!saved) return undefined;
        try { return decode(saved.encrypted, secret); } catch { return undefined; }
      },
      registerClient: async client => {
        if (client.redirect_uris.length > 8 || client.client_name?.length > 160 || client.scope?.length > 300)
          throw new InvalidClientMetadataError('Client metadata is too large');
        for (const uri of client.redirect_uris) {
          const url = new URL(uri);
          if (uri.length > 2000 || url.username || url.password || url.hash ||
              (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))))
            throw new InvalidClientMetadataError('Use HTTPS or a loopback callback without credentials or fragments');
        }
        if (!['none', 'client_secret_post'].includes(client.token_endpoint_auth_method || 'client_secret_post'))
          throw new InvalidClientMetadataError('Unsupported client authentication');
        await records.put(`client:${client.client_id}`, { encrypted: encode(client, secret) }, Date.now() + 365 * 86400000);
        return client;
      },
    };
  }
  target(resource, required = true) {
    if ((!resource && required) || (resource && resource.href !== this.resource))
      throw new InvalidTargetError('The resource must be this Conclave MCP endpoint');
  }
  scopes(scopes) {
    const selected = scopes?.length ? [...new Set(scopes)] : handoffScopes;
    if (selected.some(x => !handoffScopes.includes(x)) || !selected.includes('handoffs:read'))
      throw new InvalidScopeError('Request handoffs:read and optionally handoffs:write');
    return selected;
  }
  async authorize(client, params, res) {
    this.target(params.resource);
    const scopes = this.scopes(params.scopes);
    if (!/^[A-Za-z0-9_-]{43}$/.test(params.codeChallenge) || (params.state?.length || 0) > 1000)
      throw new InvalidRequestError('Invalid authorization parameters');
    const pending = random(), nonce = random();
    await this.records.put(`pending:${tokenHash(pending)}`, {
      clientId: client.client_id, clientName: client.client_name || 'Unnamed app',
      redirectUri: params.redirectUri, state: params.state, codeChallenge: params.codeChallenge,
      resource: this.resource, scopes, nonceHash: tokenHash(nonce),
    }, Date.now() + 10 * 60000);
    res.cookie('conclave_connect', nonce, { httpOnly: true, secure: this.origin.startsWith('https:'), sameSite: 'lax', path: '/connect', maxAge: 600000 });
    res.redirect(302, `/connect?request=${pending}`);
  }
  async pending(request, nonce) {
    if (!request || !nonce) throw new InvalidRequestError('Start the connection again from your app');
    const data = await this.records.get(`pending:${tokenHash(request)}`);
    if (!data || data.nonceHash !== tokenHash(nonce)) throw new InvalidRequestError('Connection request expired; start again');
    return data;
  }
  async approve(request, nonce, user, approved) {
    if (!user?.id || !this.emailAllowed(user.email)) throw new InvalidRequestError('Sign in to an allowed Conclave account');
    return this.records.atomic(`pending:${tokenHash(request)}`, async tx => {
      const key = `pending:${tokenHash(request)}`, data = await this.records.get(key, tx);
      if (!data || data.nonceHash !== tokenHash(nonce)) throw new InvalidRequestError('Connection request expired; start again');
      await this.records.remove(key, tx);
      const redirect = new URL(data.redirectUri);
      redirect.searchParams.set('iss', new URL(this.origin).href);
      if (data.state !== undefined) redirect.searchParams.set('state', data.state);
      if (!approved) { redirect.searchParams.set('error', 'access_denied'); return redirect.href; }
      const grant = random(), code = random(), expires = Date.now() + month;
      const grantData = { owner: user.id, email: user.email, clientId: data.clientId, clientName: data.clientName,
        scopes: data.scopes, resource: this.resource, createdAt: new Date().toISOString(), expires, revoked: false,
        sessionEpoch: tokenHash(this.secret) };
      await this.records.put(`grant:${grant}`, grantData, expires, user.id, tx);
      await this.records.put(`code:${tokenHash(code)}`, { ...data, grant, owner: user.id }, Date.now() + 5 * 60000, null, tx);
      redirect.searchParams.set('code', code);
      return redirect.href;
    });
  }
  async challengeForAuthorizationCode(client, code) {
    const data = await this.records.get(`code:${tokenHash(code)}`);
    if (!data || data.clientId !== client.client_id) throw new InvalidGrantError('Invalid or expired code');
    return data.codeChallenge;
  }
  async grant(id, client, tx = this.records.pool) {
    const data = await this.records.get(`grant:${id}`, tx);
    if (!data || data.revoked || data.resource !== this.resource || data.sessionEpoch !== tokenHash(this.secret) ||
        (client && data.clientId !== client.client_id) || !this.emailAllowed(data.email))
      throw new InvalidGrantError('Connection expired or revoked; reconnect the app');
    return data;
  }
  async issue(grantId, grant, tx) {
    const access = random(), refresh = random(), now = Date.now();
    const data = { grant: grantId, clientId: grant.clientId, scopes: grant.scopes, resource: this.resource };
    await this.records.put(`access:${tokenHash(access)}`, { ...data, expiresAt: Math.floor((now + hour) / 1000) }, now + hour, null, tx);
    await this.records.put(`refresh:${tokenHash(refresh)}`, data, grant.expires, null, tx);
    return { access_token: access, token_type: 'Bearer', expires_in: 3600, refresh_token: refresh, scope: grant.scopes.join(' ') };
  }
  async exchangeAuthorizationCode(client, code, _verifier, redirectUri, resource) {
    this.target(resource);
    return this.records.atomic(`code:${tokenHash(code)}`, async tx => {
      const key = `code:${tokenHash(code)}`, data = await this.records.get(key, tx);
      if (!data || data.clientId !== client.client_id || redirectUri !== data.redirectUri)
        throw new InvalidGrantError('Code, client or redirect does not match');
      const grant = await this.grant(data.grant, client, tx);
      await this.records.remove(key, tx);
      return this.issue(data.grant, grant, tx);
    });
  }
  async exchangeRefreshToken(client, refresh, scopes, resource) {
    this.target(resource, false);
    return this.records.atomic(`refresh:${tokenHash(refresh)}`, async tx => {
      const key = `refresh:${tokenHash(refresh)}`, data = await this.records.get(key, tx);
      if (!data || data.clientId !== client.client_id) throw new InvalidGrantError('Invalid refresh token');
      const grant = await this.grant(data.grant, client, tx);
      if (scopes && (scopes.length !== grant.scopes.length || scopes.some(x => !grant.scopes.includes(x))))
        throw new InvalidScopeError('Reconnect to change permissions');
      await this.records.remove(key, tx);
      return this.issue(data.grant, grant, tx);
    });
  }
  async verifyAccessToken(token) {
    const data = await this.records.get(`access:${tokenHash(token)}`);
    if (!data || data.resource !== this.resource) throw new InvalidTokenError('Invalid access token');
    let grant;
    try { grant = await this.grant(data.grant); } catch { throw new InvalidTokenError('Connection expired or revoked'); }
    return { token, clientId: grant.clientId, scopes: grant.scopes, expiresAt: data.expiresAt,
      resource: new URL(this.resource), extra: { owner: grant.owner, grant: data.grant } };
  }
  async revokeGrant(id, owner) {
    return this.records.atomic(`grant:${id}`, async tx => {
      const grant = await this.records.get(`grant:${id}`, tx);
      if (!grant || grant.owner !== owner) throw new InvalidRequestError('Connection not found');
      await this.records.put(`grant:${id}`, { ...grant, revoked: true }, grant.expires, owner, tx);
    });
  }
  async revokeToken(client, request) {
    for (const kind of ['access', 'refresh']) {
      const data = await this.records.get(`${kind}:${tokenHash(request.token)}`);
      if (data?.clientId === client.client_id) {
        const grant = await this.grant(data.grant, client).catch(() => null);
        if (grant) await this.revokeGrant(data.grant, grant.owner);
      }
    }
  }
}
