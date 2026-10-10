import express from 'express';
import { readFileSync } from 'node:fs';
import { HandoffRepository } from './handoff-repository.js';

const assets = new Map(['index.html', 'app.js', 'app.css', 'graph.js', 'graph.css'].map(name =>
  [name, readFileSync(new URL(`./resources/dashboard/${name}`, import.meta.url), 'utf8')]));
const policy = "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
const invalid = () => { throw Object.assign(Error('Invalid dashboard request'), { code: 'invalid_input' }); };

// Read-only browser adapter over the same owner-scoped packet operations as MCP.
// No browser bearer tokens, model calls, new tables, or packet writes.
export function createHandoffDashboard({ pool, origin, identity, repository = owner => new HandoffRepository(pool, owner) }) {
  const router = express.Router(), host = new URL(origin).host;
  router.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin', 'Content-Security-Policy': policy });
    if (req.headers.host !== host || (req.headers.origin && req.headers.origin !== origin) || req.headers['sec-fetch-site'] === 'cross-site')
      return res.status(403).json({ error: 'forbidden' });
    if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).set('Allow', 'GET, HEAD').json({ error: 'read_only' });
    const user = identity(req);
    if (!user?.id) return req.path.startsWith('/api/') ? res.status(401).json({ error: 'sign_in_required' }) : res.redirect(303, '/');
    res.locals.owner = user.id; next();
  });
  router.get(['/', '/app.js', '/app.css', '/graph.js', '/graph.css'], (req, res) => {
    const name = req.path === '/' ? 'index.html' : req.path.slice(1);
    res.type(name.endsWith('.js') ? 'js' : name.endsWith('.css') ? 'css' : 'html').send(assets.get(name));
  });
  router.get('/api/:operation', async (req, res) => {
    try {
      const fields = { find: ['query', 'offset', 'project'], get: ['handoff_id', 'revision', 'format'], graph: ['project'],
        history: ['handoff_id', 'offset'], compare: ['handoff_id', 'from_revision', 'to_revision'] };
      const operation = req.params.operation, allowed = Object.hasOwn(fields, operation) ? fields[operation] : null;
      if (!allowed) return res.status(404).json({ error: 'not_found' });
      const input = {};
      for (const [key, value] of Object.entries(req.query)) {
        if (!allowed.includes(key) || typeof value !== 'string') invalid();
        if (['offset', 'revision', 'from_revision', 'to_revision'].includes(key)) {
          if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) invalid();
          input[key] = Number(value);
        } else input[key] = value;
      }
      if (operation === 'find' || operation === 'history') input.limit = 10;
      if (operation === 'get' || operation === 'compare') input.max_characters = 128000;
      res.json(await repository(res.locals.owner)[operation](input));
    } catch (error) {
      const statuses = { invalid_input: 400, not_found: 404, capacity: 413 };
      res.status(statuses[error.code] || 503).json({ error: statuses[error.code] ? error.code : 'unavailable' });
    }
  });
  router.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  return router;
}
