import { readFileSync } from 'node:fs';
export const appGuide = readFileSync(new URL('./resources/app-guide.md', import.meta.url), 'utf8');
