export function exportFilename(conversation, exportedAt, extension = 'json') {
  const id = String(conversation).replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${id}_${new Date(exportedAt).toISOString().replace(/[:.]/g, '-')}.${extension}`;
}
