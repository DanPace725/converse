import { createHostedHandoffApp } from '../lib/conclave/handoff-hosted.js';
import { identity, emailAllowed, json } from '../lib/access.js';
import { getDatabase } from '../lib/database.js';

// Vercel must pass the stream to Express/SDK, including form-encoded token
// requests. All routing destinations share this one function.
export const config = { api: { bodyParser: false } };
let app;
export default function handler(req, res) {
  if (!process.env.CONCLAVE_MCP_ORIGIN) return json(res, 503, { error: 'Conclave online handoffs are not enabled yet.' });
  try {
    const url = new URL(req.url, process.env.CONCLAVE_MCP_ORIGIN);
    // Explicit rewrite marker works whether the host passes the original URL
    // or the destination URL. It cannot choose an arbitrary Express route.
    const route = url.searchParams.get('__mcp_path');
    if (route) {
      if (!['mcp', 'authorize', 'token', 'register', 'revoke', 'connect',
        '.well-known/oauth-authorization-server', '.well-known/oauth-protected-resource/mcp'].includes(route))
        return json(res, 404, { error: 'Not found' });
      url.searchParams.delete('__mcp_path');
      req.url = '/' + route + url.search;
    }
    app ||= createHostedHandoffApp({ pool: getDatabase().pool, origin: process.env.CONCLAVE_MCP_ORIGIN,
      secret: process.env.SESSION_SECRET, identity, emailAllowed });
    return app(req, res);
  } catch { return json(res, 503, { error: 'Conclave online handoff configuration is incomplete.' }); }
}
