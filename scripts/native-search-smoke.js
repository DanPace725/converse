import { writeFileSync, mkdirSync } from 'node:fs';
import { Store } from '../lib/conclave/store.js';
import { WorkspaceHarness } from '../lib/conclave/workspace.js';
import { taskProvider, environment, redact } from '../lib/conclave/provider.js';

const directory = new URL('../docs/archive/2026-10-03/', import.meta.url);
const outcomes = await Promise.all(['openai', 'anthropic'].map(async name => {
  const key = name === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY';
  if (!environment(key)) return { provider: name, status: 'not_configured' };
  const store = new Store(undefined, { memory: true });
  const model = name === 'openai' ? 'gpt-6-luna' : 'claude-sonnet-5-5';
  try {
    const id = store.create();
    const provider = taskProvider(name, { requestSignal: AbortSignal.timeout(45000) });
    const h = new WorkspaceHarness(store, id, provider, { webSearch: true, model, reasoning: name === 'openai' ? 'low' : 'default', output: 4096 });
    h.addMessage('user', 'Check native search.');
    const result = await h.executeTool('web_search', { query: 'site:nodejs.org What is Node.js? Return one short sentence and an official source.', count: 2 }, []);
    if (!result.citations.length) throw Error('Live search produced no returned source URLs');
    const request = store.events(id).find(e => e.kind === 'inference_request');
    const response = store.events(id).find(e => e.kind === 'inference_response');
    return { provider: name, model, status: 'passed', native_searches: result.native_searches, citations: result.citations,
      evidence_scope: result.evidence_scope, saved_characters: store.source(id, result.source_event_id).content.length,
      response_status: response.metadata.status, reported_usage: response.metadata.usage,
      purpose: request.content, warnings: result.warnings };
  } catch (error) { return { provider: name, model, status: 'failed', error: redact(error) }; }
  finally { store.close(); }
}));
mkdirSync(directory, { recursive: true });
writeFileSync(new URL('native-search-live.json', directory), JSON.stringify({ checked_at: new Date().toISOString(), outcomes }, null, 2) + '\n');
console.log(JSON.stringify(outcomes, null, 2));
if (outcomes.some(r => r.status === 'failed')) process.exitCode = 1;
