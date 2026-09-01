import { useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from 'react';
import { Button, Spinner } from '../ui/primitives.js';

interface ComposerProps {
  onSend: (body?: string, attachmentKey?: string) => void;
  onAttach: (file: File) => Promise<string | null>;
  uploading?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export function Composer({ onSend, onAttach, uploading, disabled, placeholder }: ComposerProps) {
  const [draft, setDraft] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function resize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  function submit() {
    if (draft.trim().length === 0) return;
    onSend(draft, undefined);
    setDraft('');
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

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const key = await onAttach(file);
    if (key) onSend(draft.trim() || undefined, key);
    setDraft('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <form onSubmit={handleSubmit} className="border-t border-border-subtle bg-surface px-4 py-3">
      <div
        className="flex items-end gap-2 rounded-card border border-border-subtle bg-surface-raised px-2 py-1.5
          focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/25"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          disabled={disabled || uploading}
          className="hidden"
          id="composer-file"
        />
        <label
          htmlFor="composer-file"
          title="Attach an image"
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
          }}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder ?? 'Message'}
          aria-label="Message"
          className="max-h-40 flex-1 resize-none bg-transparent py-1.5 text-sm text-content outline-none
            placeholder:text-content-muted disabled:opacity-50"
        />

        <Button type="submit" disabled={disabled || uploading || draft.trim().length === 0} className="px-3 py-1.5">
          Send
        </Button>
      </div>
      <p className="mt-1 px-1 text-xs text-content-muted">
        <kbd className="font-sans">Enter</kbd> to send · <kbd className="font-sans">Shift+Enter</kbd> for a new line
      </p>
    </form>
  );
}
