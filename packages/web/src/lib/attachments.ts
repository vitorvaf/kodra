const DATA_MIME_EXT: Record<string, string> = {
  'application/json': '.json',
  'text/plain': '.txt',
  'text/xml': '.xml',
  'application/xml': '.xml',
};

// Sniff by extension when the clipboard exposes type empty (common in file managers)
const DATA_EXT_MIME: Record<string, string> = {
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.xml': 'text/xml',
};

/** MIME effective for upload (file.type or sniff by extension); null if unsupported. */
export function resolveUploadContentType(file: { type: string; name?: string }): string | null {
  const type = file.type.trim().toLowerCase();
  if (type.startsWith('image/')) return type;
  if (DATA_MIME_EXT[type]) return type;
  if (type) return null;

  const name = file.name?.trim().toLowerCase() ?? '';
  const dot = name.lastIndexOf('.');
  if (dot === -1) return null;
  return DATA_EXT_MIME[name.slice(dot)] ?? null;
}

/** Classifies a clipboard File by upload support. */
export function classifyPastedFile(file: { type: string; name?: string }): 'image' | 'data' | null {
  if (file.type.startsWith('image/')) return 'image';
  const contentType = resolveUploadContentType(file);
  return contentType && DATA_MIME_EXT[contentType] ? 'data' : null;
}
