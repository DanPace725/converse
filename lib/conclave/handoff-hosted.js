import express from 'express';
import { createHmac } from 'node:crypto';
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { HandoffRepository, McpRecordStore } from './handoff-repository.js';
import { HandoffOAuthProvider, handoffScopes } from './handoff-oauth.js';
import { createHandoffMcpServer } from './handoff-mcp-server.js';

const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const cookie = req => (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('conclave_connect='))?.slice(17);
const page = (res, title, content) => res.type('html').send(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><link rel="stylesheet" href="/styles.css"><main><h1>${escape(title)}</h1>${content}</main></html>`);
const policy = redirectUri => {
  const callback = redirectUri ? new URL(redirectUri).origin : '';
  // Stored callbacks have already passed client/redirect validation. Do not let
  // an unusual hostname turn into an additional CSP directive or source.
  if (callback && (!/^https?:\/\//.test(callback) || /[\s;'"\\]/.test(callback))) throw Error('Invalid callback origin');
  return `default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'${callback ? ' ' + callback : ''}`;
};

export function createHostedHandoffApp({ pool, origin, secret, identity, emailAllowed, accountName = 'Converse' }) {
  const signIn = `<p><a href="/" target="_blank" rel="noopener">Sign in to ${escape(accountName)}</a> in another tab using the account you want to share between apps. Then return here and continue.</p>`;
  const url = new URL(origin);
  if (url.origin !== origin || (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) || url.username || url.password)
    throw Error('Configure a fixed HTTPS CONCLAVE_MCP_ORIGIN without a path');
  if (!secret || secret.length < 32) throw Error('Identity sessions require a strong SESSION_SECRET');
  const records = new McpRecordStore(pool);
  const provider = new HandoffOAuthProvider(records, { origin, secret, emailAllowed });
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    // Preserve Origin on native same-origin consent forms; hide external referrers.
    res.set('Referrer-Policy', 'same-origin');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Content-Security-Policy', policy());
    if (req.headers.host !== url.host) return res.status(403).json({ error: 'Host not allowed' });
    next();
  });
  // SDK rate limits protect each warm instance. This durable global ceiling
  // also bounds registration abuse across serverless instances during the pilot.
  app.use('/register', async (req, res, next) => {
    try {
      const allowed = await records.atomic('registration-budget', async tx => {
        const key = 'budget:registration', now = Date.now();
        const old = await records.get(key, tx) || { count: 0, until: now + 3600000 };
        if (old.count >= 100) return false;
        await records.put(key, { ...old, count: old.count + 1 }, old.until, null, tx);
        return true;
      });
      if (!allowed) return res.status(429).json({ error: 'too_many_requests' });
      next();
    } catch (error) { next(error); }
  });
  app.use(mcpAuthRouter({ provider, issuerUrl: new URL(origin), resourceServerUrl: new URL(provider.resource),
    scopesSupported: handoffScopes, resourceName: 'Conclave handoffs' }));
  app.use('/connect', express.urlencoded({ extended: false, limit: '8kb' }));
  const csrf = req => createHmac('sha256', secret).update(req.headers.cookie || '').digest('base64url');
  app.get('/connect', async (req, res) => {
    const user = identity(req);
    if (req.query.request) {
      const pending = await provider.pending(String(req.query.request), cookie(req));
      if (!user) return page(res, 'Connect Conclave', `${signIn}<p><a href="/connect?request=${escape(req.query.request)}">Continue after signing in</a></p>`);
      // Chromium checks form-action on the subsequent OAuth redirect too.
      // Allow only this validated client's callback on its approval document.
      res.set('Content-Security-Policy', policy(pending.redirectUri));
      return page(res, 'Allow this app to use your handoffs?', `<p>Signed in as ${escape(user.email)}.</p><p>App name (provided by the app): <strong>${escape(pending.clientName)}</strong>. Callback host: ${escape(new URL(pending.redirectUri).host)}.</p><p>This app can read ${pending.scopes.includes('handoffs:write') ? 'and save' : ''} your Conclave handoff packets. It cannot access your Converse chats, canonical memory, or model API keys. This connection expires in 30 days. You can revoke it here.</p><form method="post" action="/connect"><input type="hidden" name="request" value="${escape(req.query.request)}"><input type="hidden" name="csrf" value="${csrf(req)}"><button name="decision" value="allow">Allow connection</button><button name="decision" value="deny">Cancel</button></form>`);
    }
    if (!user) return page(res, 'Conclave connections', `${signIn}<p><a href="/connect">Continue after signing in</a></p>`);
    const grants = (await records.list(user.id)).filter(row => !row.data.revoked);
    page(res, 'Conclave connections', `<p>Signed in as ${escape(user.email)}. Signing out of ${escape(accountName)} does not disconnect your apps. Use Revoke below to block a connection immediately; saved packets remain.</p>${grants.length ? grants.map(row => `<form method="post" action="/connect"><p>${escape(row.data.clientName)} — ${escape(row.data.scopes.join(', '))} — connected ${escape(row.data.createdAt)}</p><input type="hidden" name="grant" value="${escape(row.key.slice(6))}"><input type="hidden" name="csrf" value="${csrf(req)}"><button>Revoke connection</button></form>`).join('') : '<p>No active connections.</p>'}`);
  });
  app.post('/connect', async (req, res) => {
    const user = identity(req);
    if (!user || req.headers.origin !== origin || req.body.csrf !== csrf(req)) {
      res.status(403);
      return page(res, 'Start the app connection again', `<p>This approval page changed or your sign-in expired. Return to your AI app and start Connect again.</p>${signIn}<p><a href="/connect">Review existing connections</a></p>`);
    }
    if (req.body.grant) {
      await provider.revokeGrant(String(req.body.grant), user.id);
      return res.redirect(303, '/connect');
    }
    if (!['allow', 'deny'].includes(req.body.decision)) return res.status(400).send('Invalid decision');
    const redirect = await provider.approve(String(req.body.request || ''), cookie(req), user, req.body.decision === 'allow');
    res.set('Content-Security-Policy', policy(redirect));
    res.clearCookie('conclave_connect', { path: '/connect' });
    res.redirect(303, redirect);
  });
  app.use('/mcp', (req, res, next) => {
    // Cloud connectors normally omit Origin. Browser clients use the same
    // origin; arbitrary websites cannot turn this into a browser relay.
    if (req.headers.origin && req.headers.origin !== origin) return res.status(403).json({ error: 'Origin not allowed' });
    next();
  }, requireBearerAuth({ verifier: provider, requiredScopes: ['handoffs:read'],
    expectedResource: provider.resource, resourceMetadataUrl: `${origin}/.well-known/oauth-protected-resource/mcp` }));
  app.post('/mcp', express.json({ limit: '100kb' }), async (req, res) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return res.status(400).json({ error: 'One JSON-RPC object required' });
    const service = new HandoffRepository(pool, req.auth.extra.owner);
    const server = createHandoffMcpServer(service, { write: req.auth.scopes.includes('handoffs:write'), oauth: true });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.once('close', () => { void server.close().catch(() => {}); });
    try { await server.connect(transport); await transport.handleRequest(req, res, req.body); }
    catch { if (!res.headersSent) res.status(500).json({ error: 'Conclave could not complete this request' }); }
  });
  app.all('/mcp', (_req, res) => res.set('Allow', 'POST').status(405).json({ error: 'Use POST' }));
  app.use((_req, res) => res.status(404).send('Not found'));
  app.use((error, _req, res, _next) => {
    if (res.headersSent) return;
    const status = error.type === 'entity.too.large' ? 413 : error.type === 'entity.parse.failed' ? 400 : error.errorCode ? 400 : 503;
    res.status(status).json({ error: error.errorCode || 'service_unavailable', message: error.errorCode ? error.message : 'Conclave could not complete this request' });
  });
  return app;
}
