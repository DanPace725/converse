import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, relative } from 'node:path';

export function checkEngine(root = fileURLToPath(new URL('../', import.meta.url))) {
  const manifest = JSON.parse(readFileSync(resolve(root, 'lib/conclave/manifest.json'), 'utf8'));
  const managed = new Set(manifest.files.map(record => record.target));
  for (const record of manifest.files) {
    const path = resolve(root, record.target), suffix = relative(root, path);
    if (!suffix || suffix.startsWith('..')) throw Error('Invalid migration manifest path');
    const hash = createHash('sha256').update(readFileSync(path)).digest('hex');
    if (hash !== record.sha256) throw Error(`Engine differs from Conclave migration: ${record.target}. Change Conclave first, then run sync:converse.`);
  }
  for (const entry of readdirSync(resolve(root, 'lib/conclave')))
    if (entry.endsWith('.js') && !managed.has('lib/conclave/' + entry))
      throw Error(`Engine module missing from Conclave migration: ${entry}`);
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  for (const [name, range] of Object.entries(manifest.dependencies))
    if (pkg.dependencies?.[name] !== range) throw Error(`Conclave dependency differs: ${name}`);
  return manifest.files.length;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Conclave migration verified: ${checkEngine()} files`);
}
