import { guard, json, body } from '../lib/access.js';
import { redact } from '../lib/providers.js';
import { conversationTitle } from '../lib/titles.js';
import { requestKeys } from '../lib/keys.js';

export default async function handler(req, res) {
  if (!guard(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'POST required' });
  try {
    const input = await body(req);
    const result = await conversationTitle(input, { signal: AbortSignal.timeout(30000), keys: await requestKeys(req) });
    return json(res, 200, result);
  } catch (error) { return json(res, 400, { error: redact(error) }); }
}
