import { fileURLToPath } from 'node:url';
import { createConclaveHandler as createHandler } from './conclave/local.js';

// Preserve Converse's existing local SQLite location. Hosted deployment uses
// its own PostgreSQL connection and never imports the sibling checkout.
export function createConclaveHandler(options = {}) {
  return createHandler({
    directory: process.env.CONCLAVE_DATA_DIR || fileURLToPath(new URL('../../CLA/conclave/.conclave', import.meta.url)),
    ...options,
  });
}
