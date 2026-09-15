import { attachmentDisplayName, isImageAttachment } from '@chat-application/shared';
import { attachmentUrl } from '../config.js';
import { FileIcon } from '../ui/icons.js';

interface AttachmentProps {
  attachmentKey: string;
  onOpenImage: (url: string) => void;
}

/**
 * Images open in the lightbox; everything else renders as a file card that
 * downloads. Which one it is comes from the key's extension - `messages` has
 * no content-type column, so the server puts the type in the key.
 */
export function Attachment({ attachmentKey, onOpenImage }: AttachmentProps) {
  const url = attachmentUrl(attachmentKey);

  if (isImageAttachment(attachmentKey)) {
    return (
      <button
        onClick={() => onOpenImage(url)}
        className="mt-1 block overflow-hidden rounded-card border border-border-subtle
          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <img
          src={url}
          alt="Attachment"
          loading="lazy"
          className="max-h-72 max-w-xs object-cover"
        />
      </button>
    );
  }

  const name = attachmentDisplayName(attachmentKey);
  const extension = name.slice(name.lastIndexOf('.') + 1).toUpperCase();

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      download
      className="mt-1 inline-flex max-w-xs items-center gap-3 rounded-card border border-border-subtle
        bg-surface-raised px-3 py-2 transition hover:bg-surface-sunken
        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand/12 text-[22px] text-brand"
      >
        <FileIcon />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-content">{name}</span>
        <span className="block text-xs text-content-muted">{extension.slice(0, 5) || 'File'} · Download</span>
      </span>
    </a>
  );
}
