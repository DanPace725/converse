import { readFileSync } from 'node:fs';
export const appGuide = readFileSync(new URL('../../public/app-guide.md', import.meta.url), 'utf8');
