export function exportFilename(title, exportedAt, extension = 'json') {
  const name = String(title || 'Conversation').normalize('NFC')
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '-')
    .replace(/\s+/g, ' ').replace(/^[ .]+|[ .]+$/g, '')
    .slice(0, 100).replace(/[ .]+$/g, '') || 'Conversation';
  return `${name}_${new Date(exportedAt).toISOString().replace(/[:.]/g, '-')}.${extension}`;
}
