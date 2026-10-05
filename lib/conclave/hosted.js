import { createContextHandler } from './http.js';
import { ContextRepository, downloadRecord } from './context-repository.js';
import { ConclaveService } from './service.js';
import { waitUntil as vercelWaitUntil } from '@vercel/functions';

// The deployment supplies its database connection; all saved-context operations
// use the same engine and fenced repository as local Conclave.
export function createHostedHandler({ database, serviceOptions = {}, waitUntil = vercelWaitUntil, onLoad }) {
  const diagnostics = onLoad || (process.env.CONCLAVE_LOAD_DIAGNOSTICS === 'on'
    ? metrics => console.info(JSON.stringify({ event: 'context_load', ...metrics })) : undefined);
  const repository = () => new ContextRepository(database(), { serviceOptions, onLoad: diagnostics });
  const read = (id, action) => repository().run(id, false, action);
  const operations = {
    status: () => ({ ...ConclaveService.prototype.status.call({
      availability: serviceOptions.availability || (() => ({
        openai: !!process.env.OPENAI_API_KEY, anthropic: !!process.env.ANTHROPIC_API_KEY,
        jev: !!(process.env.JEV_API_KEY || process.env.TYPESAFE_API_KEY),
      })),
    }), available: !!process.env.DATABASE_URL, storage: 'postgres' }),
    list: () => repository().list(),
    create: title => repository().create(title),
    transcript: id => repository().transcript(id),
    download: id => read(id, service => downloadRecord(service, id)),
  };
  for (const method of ['view', 'audit', 'jevAudit', 'workspaceFile', 'sourceEvent', 'contextBundle', 'export', 'shareableExport', 'activity', 'clpFrames', 'clpBundle', 'clpQuery'])
    operations[method] = (id, ...args) => read(id, service => service[method](id, ...args));
  for (const method of ['name', 'saveDocument', 'uploadDocument', 'changeDocument', 'countTokens',
    'saveContext', 'saveState', 'saveMemory', 'memoryLifecycle', 'ask', 'remember', 'agentStart', 'agentStep', 'agentStop', 'clpRegisterFrame', 'clpAttest', 'clpRecord', 'clpLink'])
    operations[method] = (id, ...args) => repository().run(id, true, service => service[method](id, ...args));
  const handler = createContextHandler(operations);
  return (req, res) => {
    const pending = handler(req, res);
    // Cancellation can reclaim a Vercel invocation. Keep checkpoint flushing
    // and lease release alive while the Agent's signal aborts model/tool work.
    waitUntil(pending.catch(() => {}));
    return pending;
  };
}
