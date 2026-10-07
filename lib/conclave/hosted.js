import { createContextHandler } from './http.js';
import { ContextRepository, downloadRecord } from './context-repository.js';
import { ConclaveService } from './service.js';
import { requestCredentials, keyAvailability } from './credentials.js';
import { waitUntil as vercelWaitUntil } from '@vercel/functions';

// The deployment supplies its database connection; all saved-context operations
// use the same engine and fenced repository as local Conclave.
export function createHostedHandler({ database, serviceOptions = {}, waitUntil = vercelWaitUntil, onLoad }) {
  const diagnostics = onLoad || (process.env.CONCLAVE_LOAD_DIAGNOSTICS === 'on'
    ? metrics => console.info(JSON.stringify({ event: 'context_load', ...metrics })) : undefined);
  // Built per request: a signed-in user reaches only their own conversations.
  const scoped = user => {
    const options = { serviceOptions, onLoad: diagnostics, owner: user?.id };
    // Listing, creating and transcript reads reach no model and need no keys.
    const stored = () => new ContextRepository(database(), options);
    // The user's own keys, read once per request by operations that may reach a model.
    let keys;
    const credentials = () => (keys ||= requestCredentials(database, user));
    const repository = async () => new ContextRepository(database(), { ...options, credentials: await credentials() });
    const read = async (id, action) => (await repository()).run(id, false, action);
    const operations = {
      status: async () => {
        const own = await credentials();
        return { ...ConclaveService.prototype.status.call({
          availability: serviceOptions.availability || (own ? () => keyAvailability(own) : () => ({
            openai: !!process.env.OPENAI_API_KEY, anthropic: !!process.env.ANTHROPIC_API_KEY,
            jev: !!(process.env.JEV_API_KEY || process.env.TYPESAFE_API_KEY),
          })),
        }), available: !!process.env.DATABASE_URL, storage: 'postgres' };
      },
      list: () => stored().list(),
      create: title => stored().create(title),
      transcript: id => stored().transcript(id),
      imageFile: (id, eventId) => stored().imageFile(id, eventId),
      download: id => read(id, service => downloadRecord(service, id)),
    };
    for (const method of ['view', 'audit', 'jevAudit', 'memoryLinks', 'workspaceFile', 'sourceEvent', 'contextBundle', 'export', 'shareableExport', 'activity', 'clpFrames', 'clpBundle', 'clpQuery'])
      operations[method] = (id, ...args) => read(id, service => service[method](id, ...args));
    for (const method of ['name', 'saveDocument', 'uploadDocument', 'changeDocument', 'countTokens',
      'saveContext', 'saveState', 'saveMemory', 'memoryLifecycle', 'approveMemorySuppression', 'ask', 'remember', 'agentStart', 'agentStep', 'agentStop', 'clpRegisterFrame', 'clpAttest', 'clpRecord', 'clpLink'])
      operations[method] = async (id, ...args) => (await repository()).run(id, true, service => service[method](id, ...args));
    return operations;
  };
  const handler = createContextHandler(scoped);
  return (req, res) => {
    const pending = handler(req, res);
    // Cancellation can reclaim a Vercel invocation. Keep checkpoint flushing
    // and lease release alive while the Agent's signal aborts model/tool work.
    waitUntil(pending.catch(() => {}));
    return pending;
  };
}
