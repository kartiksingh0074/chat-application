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
import { Spinner } from '../ui/primitives.js';
import { PaperclipIcon, SendIcon } from '../ui/icons.js';

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
  const [focused, setFocused] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const tooLong = draft.length > MAX_MESSAGE_LENGTH;
  const remaining = MAX_MESSAGE_LENGTH - draft.length;
  const canSend = draft.trim().length > 0 && !tooLong && !disabled && !uploading;

  function resize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
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

  // Enter sends, Shift+Enter makes a new line - the convention people expect,
  // so it no longer needs spelling out under the box.
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

  // The line under the box carries whatever matters most right now, so it never
  // stacks up: who is typing, else a tip about @bot while the box is focused and
  // empty. The length warning sits on the right when it applies.
  const showTip = focused && draft.length === 0 && !typingLabel;

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
      className="relative shrink-0 bg-surface px-3 pb-2 pt-1 sm:px-4"
    >
      {dragging && (
        <div
          className="pointer-events-none absolute inset-x-3 inset-y-1 z-10 flex items-center justify-center rounded-xl
            border-2 border-dashed border-brand bg-brand-subtle/90 text-sm font-medium text-brand sm:inset-x-4"
        >
          Drop to upload
        </div>
      )}

      <div
        className={`flex items-end gap-1 rounded-xl border bg-surface-raised p-1.5 transition focus-within:ring-2
          ${
            tooLong
              ? 'border-danger focus-within:ring-danger/20'
              : 'border-border-subtle focus-within:border-brand/50 focus-within:ring-brand/15'
          }`}
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
          aria-label="Attach a file"
          className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[20px]
            text-content-muted transition hover:bg-surface-sunken hover:text-content"
        >
          {uploading ? <Spinner /> : <PaperclipIcon />}
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
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          disabled={disabled}
          placeholder={placeholder ?? 'Message'}
          aria-label="Message"
          aria-invalid={tooLong || undefined}
          className="max-h-[200px] min-h-9 flex-1 resize-none bg-transparent px-1 py-2 text-[15px] leading-5
            text-content outline-none placeholder:text-content-muted disabled:opacity-50"
        />

        <button
          type="submit"
          disabled={!canSend}
          aria-label="Send message"
          title="Send"
          className={`flex size-9 shrink-0 items-center justify-center rounded-lg text-[18px] transition
            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand
            ${canSend ? 'bg-brand text-brand-content shadow-sm hover:bg-brand-hover' : 'text-content-muted/50'}`}
        >
          <SendIcon />
        </button>
      </div>

      <div className="flex min-h-5 items-center justify-between gap-3 px-1.5 pt-1 text-xs">
        <p className="min-w-0 truncate text-content-muted" aria-live="polite">
          {typingLabel ? (
            <span className="font-medium text-content">{typingLabel}</span>
          ) : showTip ? (
            <>
              Start with <span className="font-semibold text-brand">@bot</span> to ask about this
              room&rsquo;s history
            </>
          ) : null}
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
