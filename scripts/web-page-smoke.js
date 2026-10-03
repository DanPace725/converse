import { writeFileSync } from 'node:fs';
import { fetchPublicPage } from '../lib/conclave/web-page.js';
import { hash } from '../lib/conclave/store.js';

const page = await fetchPublicPage('https://nodejs.org/en/about');
if (!page.content.includes('Node.js') || !page.content.includes('Trademark Policy')) throw Error('Expected beginning and footer evidence missing');
const evidence = { checked_at: new Date().toISOString(), source_url: page.source_url, title: page.title,
  response_bytes: page.bytes, extracted_characters: page.content.length, response_hash: hash(page.raw), text_hash: hash(page.content),
  beginning: page.content.slice(0, 300), ending: page.content.slice(-300), limitations: page.limitations,
  scope: 'Live public HTTP retrieval and extraction only; model continuation is fixture tested.' };
writeFileSync('docs/archive/2026-10-03/web-page-live.json', JSON.stringify(evidence,null,2) + '\n');
console.log(JSON.stringify(evidence,null,2));
