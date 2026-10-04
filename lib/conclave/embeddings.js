import { createHash } from 'node:crypto';
import { environment } from './provider.js';

export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIMENSIONS = 1536;
export const EMBEDDING_POLICY = 'source-chunks-v1';
export const embeddingKey = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function validVector(value) {
  return Array.isArray(value) && value.length === EMBEDDING_DIMENSIONS
    && value.every(Number.isFinite) && value.some(n => n !== 0);
}

export class OpenAIEmbeddingProvider {
  constructor({ apiKey, fetchImpl = fetch } = {}) {
    this.name = 'openai';
    this.model = EMBEDDING_MODEL;
    this.key = apiKey || environment('OPENAI_API_KEY');
    this.fetch = fetchImpl;
    if (!this.key) throw Error('OPENAI_API_KEY not configured for embeddings');
  }

  async embed(input, { signal } = {}) {
    if (!Array.isArray(input) || !input.length || input.length > 33
      || input.some(s => typeof s !== 'string' || !s.trim() || s.length > 2000))
      throw Error('Embedding inputs exceed the bounded batch');
    const response = await this.fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST', headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, input, dimensions: EMBEDDING_DIMENSIONS, encoding_format: 'float' }),
      signal: AbortSignal.any([AbortSignal.timeout(8000), ...(signal ? [signal] : [])]),
    });
    // Arbitrary provider error bodies may echo credentials or submitted text.
    if (!response.ok) throw Error(`OpenAI embeddings ${response.status}: request failed`);
    const data = await response.json();
    if (data.model !== this.model || !Array.isArray(data.data) || data.data.length !== input.length
      || !Number.isSafeInteger(data.usage?.total_tokens) || data.usage.total_tokens < 0)
      throw Error('Invalid embedding response or missing usage');
    const vectors = Array(input.length);
    for (const item of data.data) {
      if (!Number.isSafeInteger(item.index) || item.index < 0 || item.index >= input.length
        || vectors[item.index] || !validVector(item.embedding)) throw Error('Invalid embedding vector/index');
      vectors[item.index] = item.embedding;
    }
    return { vectors, model: data.model, usage: { input_tokens: data.usage.total_tokens, output_tokens: 0 } };
  }
}
