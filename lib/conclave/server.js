import { createServer } from 'node:http';
import { createConclaveHandler } from './local.js';
import { createHostedHandler } from './hosted.js';
import { getDatabase } from './database.js';
import { json, body, equal, session, identityRequired } from './access.js';

export async function startServer({ port = Number(process.env.PORT || 3212), host = '127.0.0.1',
  directory, service, database, serviceOptions } = {}) {
  const handler = database || (!service && process.env.DATABASE_URL)
    ? createHostedHandler({ database: database || (() => getDatabase().db), serviceOptions })
    : await createConclaveHandler({ directory, service });
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/api/session' && req.method === 'POST') {
      try {
        if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`)
          return json(res, 403, { error: 'Origin not allowed' });
        const input = await body(req);
        if (identityRequired()) return json(res, 400, { error: 'Password access is disabled while SESSION_SECRET is set.' });
        if (!process.env.APP_PASSWORD) return json(res, 200, { unlocked: true });
        if (!equal(input.password, process.env.APP_PASSWORD)) return json(res, 401, { error: 'Incorrect access password.' });
        res.setHeader('Set-Cookie', `converse_session=${session()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800`);
        return json(res, 200, { unlocked: true });
      } catch { return json(res, 400, { error: 'Invalid session request' }); }
    }
    if (path !== '/api/conclave') return json(res, 404, { error: 'Use /api/conclave' });
    await handler(req, res);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  server.on('close', () => handler.close?.());
  return server;
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/src/server.js')) {
  const server = await startServer();
  console.log(`Conclave API: http://127.0.0.1:${server.address().port}/api/conclave`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
}
