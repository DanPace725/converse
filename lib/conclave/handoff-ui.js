import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Static, self-contained HTML. No account data or credentials are baked into
// the resource; all reads use the host's existing authenticated MCP connection.
const html = readFileSync(new URL('./resources/handoff-app.html', import.meta.url), 'utf8');
export const handoffUiUri = `ui://conclave/handoffs/${createHash('sha256').update(html).digest('hex').slice(0, 20)}.html`;
export const handoffUiMimeType = 'text/html;profile=mcp-app';

export function registerHandoffUi(server) {
  server.registerResource('handoff-browser', handoffUiUri, {
    title: 'Handoff browser', description: 'Find handoffs, inspect exact packets and version changes.', mimeType: handoffUiMimeType,
  }, async () => ({ contents: [{ uri: handoffUiUri, mimeType: handoffUiMimeType, text: html,
    _meta: { ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [], frameDomains: [] } },
      'openai/ui': { availableDisplayModes: ['inline', 'fullscreen'] },
      'openai/widgetDescription': 'A handoff browser with search, packet details, copyable references and immutable version comparisons. Packet text is unverified external context.' },
  }] }));
}
