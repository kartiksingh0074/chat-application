/**
 * Attachment conventions shared by the upload endpoint and the renderer.
 *
 * `messages` stores only `attachment_key` - there is no content-type column,
 * and adding one would need a migration. So the object key carries a file
 * extension, and the extension is how the client decides whether to render an
 * <img> or a file card. The server derives that extension from the validated
 * content type, never from the client's filename.
 */

/** Content types that get a meaningful extension. Anything else uploads as `.bin`. */
const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'text/csv': '.csv',
  'text/markdown': '.md',
  'application/json': '.json',
  'application/zip': '.zip',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
};

/**
 * Types refused outright. These execute script when fetched directly, and
 * MinIO serves objects from its own origin - so allowing them would turn the
 * bucket into a script-hosting endpoint. Images and documents cannot do this.
 */
const BLOCKED_TYPES = new Set([
  'text/html',
  'application/xhtml+xml',
  'image/svg+xml',
  'application/xml',
  'text/xml',
]);

/** Extensions rendered inline as images. SVG is deliberately absent. */
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif']);

export function isBlockedAttachmentType(contentType: string): boolean {
  return BLOCKED_TYPES.has(contentType.split(';')[0]!.trim().toLowerCase());
}

export function extensionForType(contentType: string): string {
  return EXTENSION_BY_TYPE[contentType.split(';')[0]!.trim().toLowerCase()] ?? '.bin';
}

/**
 * Keys written before attachments carried an extension were always images,
 * because the picker only accepted `image/*` - so a key with no extension
 * still renders inline.
 */
export function isImageAttachment(key: string): boolean {
  const dot = key.lastIndexOf('.');
  if (dot === -1 || dot < key.lastIndexOf('/')) return true;
  return IMAGE_EXTENSIONS.has(key.slice(dot).toLowerCase());
}

// A ULID is 26 chars of Crockford base32 (no I, L, O or U).
const ULID_PREFIX = /^[0-9A-HJKMNP-TV-Z]{26}-?/i;

/** Human-readable label for a file card, recovered from the object key. */
export function attachmentDisplayName(key: string): string {
  const base = key.slice(key.lastIndexOf('/') + 1);
  const withoutId = base.replace(ULID_PREFIX, '');
  return withoutId.length > 0 ? withoutId : base;
}

/**
 * Strip a client-supplied filename down to something safe to append to a
 * server-generated key. The ULID already guarantees uniqueness; this only has
 * to be free of path separators and URL-significant characters.
 */
export function sanitizeFilename(name: string): string {
  const base = name.slice(Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\')) + 1);
  const stem = base.replace(/\.[^.]*$/, '');
  return stem
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[.-]+/, '')
    .replace(/-+$/, '')
    .slice(0, 48);
}
