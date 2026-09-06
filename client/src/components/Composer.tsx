import {
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { MAX_MESSAGE_LENGTH } from '@chat-application/shared';
import { Button, Spinner } from '../ui/primitives.js';

interface ComposerProps {
  onSend: (body?: string, attachmentKey?: string) => void;
  onAttach: (file: File) => Promise<string | null>;
  onTyping?: () => void;
  onStopTyping?: () => void;
  typingLabel?: string;
  uploading?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

// Start warning with enough room left to finish a thought, rather than at the
// moment the send would already have failed.
const COUNTER_VISIBLE_FROM = MAX_MESSAGE_LENGTH - 400;

export function Composer({
  onSend,
  onAttach,
  onTyping,
  onStopTyping,
  typingLabel,
  uploading,
  disabled,
  placeholder,
}: ComposerProps) {
  const [draft, setDraft] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const tooLong = draft.length > MAX_MESSAGE_LENGTH;
  const remaining = MAX_MESSAGE_LENGTH - draft.length;
  const canSend = draft.trim().length > 0 && !tooLong;

  function resize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  function submit() {
    if (!canSend) return;
    onSend(draft, undefined);
    setDraft('');
    onStopTyping?.();
    requestAnimationFrame(resize);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    submit();
  }

  // Enter sends, Shift+Enter makes a new line - the convention people expect.
  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  /** One path for every way a file arrives: picker, drop, or paste. */
  async function attachAndSend(file: File) {
    const key = await onAttach(file);
    if (!key) return;
    onSend(draft.trim() || undefined, key);
    setDraft('');
    onStopTyping?.();
    requestAnimationFrame(resize);
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) await attachAndSend(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleDrop(e: DragEvent<HTMLFormElement>) {
    e.preventDefault();
    setDragging(false);
    if (disabled || uploading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) await attachAndSend(file);
  }

  async function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    if (disabled || uploading) return;
    // Only intercept when the clipboard actually holds a file. A normal text
    // paste has no items of kind 'file' and must fall through untouched.
    const item = Array.from(e.clipboardData.items).find((i) => i.kind === 'file');
    const file = item?.getAsFile();
    if (!file) return;
    e.preventDefault();
    await attachAndSend(file);
  }

  return (
    <form
      onSubmit={handleSubmit}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled && !uploading) setDragging(true);
      }}
      onDragLeave={(e) => {
        // Ignore the events fired while crossing between child elements.
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setDragging(false);
      }}
      onDrop={handleDrop}
      className="relative border-t border-border-subtle bg-surface px-4 py-3"
    >
      {dragging && (
        <div
          className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-card
            border-2 border-dashed border-brand bg-brand-subtle/80 text-sm font-medium text-brand"
        >
          Drop to upload
        </div>
      )}

      <div
        className={`flex items-end gap-2 rounded-card border bg-surface-raised px-2 py-1.5
          focus-within:ring-2 focus-within:ring-brand/25
          ${tooLong ? 'border-danger focus-within:border-danger' : 'border-border-subtle focus-within:border-brand'}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileChange}
          disabled={disabled || uploading}
          className="hidden"
          id="composer-file"
        />
        <label
          htmlFor="composer-file"
          title="Attach a file"
          className="cursor-pointer rounded-lg px-2 py-1.5 text-content-muted transition hover:bg-surface-sunken hover:text-content"
        >
          {uploading ? <Spinner /> : '📎'}
        </label>

        <textarea
          ref={textareaRef}
          rows={1}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            resize();
            if (e.target.value.trim().length > 0) onTyping?.();
            else onStopTyping?.();
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          disabled={disabled}
          placeholder={placeholder ?? 'Message'}
          aria-label="Message"
          aria-invalid={tooLong || undefined}
          className="max-h-40 flex-1 resize-none bg-transparent py-1.5 text-sm text-content outline-none
            placeholder:text-content-muted disabled:opacity-50"
        />

        <Button type="submit" disabled={disabled || uploading || !canSend} className="px-3 py-1.5">
          Send
        </Button>
      </div>

      <div className="mt-1 flex items-baseline justify-between gap-3 px-1 text-xs">
        {/* The typing line replaces the hint rather than stacking, so the
            composer never changes height as people start and stop. */}
        <p className="min-w-0 truncate text-content-muted" aria-live="polite">
          {typingLabel ? (
            <span className="text-content">{typingLabel}</span>
          ) : (
            <>
              <kbd className="font-sans">Enter</kbd> to send ·{' '}
              <kbd className="font-sans">Shift+Enter</kbd> for a new line
            </>
          )}
        </p>
        {draft.length >= COUNTER_VISIBLE_FROM && (
          <p
            aria-live="polite"
            className={`shrink-0 tabular-nums ${tooLong ? 'font-medium text-danger' : 'text-content-muted'}`}
          >
            {tooLong ? `${-remaining} over limit` : `${remaining} left`}
          </p>
        )}
      </div>
    </form>
  );
}
