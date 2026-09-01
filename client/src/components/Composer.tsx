import { useRef, useState, type FormEvent } from 'react';

interface ComposerProps {
  onSend: (body?: string, attachmentKey?: string) => void;
  onAttach: (file: File) => Promise<string | null>;
  uploading?: boolean;
  uploadError?: string | null;
  disabled?: boolean;
}

export function Composer({ onSend, onAttach, uploading, uploadError, disabled }: ComposerProps) {
  const [draft, setDraft] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (draft.trim().length === 0) return;
    onSend(draft, undefined);
    setDraft('');
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const key = await onAttach(file);
    if (key) onSend(draft.trim() || undefined, key);
    setDraft('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <div style={{ padding: 8 }}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8 }}>
        <input
          style={{ flex: 1 }}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message"
          disabled={disabled}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          disabled={disabled || uploading}
          style={{ width: 180 }}
        />
        <button type="submit" disabled={disabled || uploading}>
          Send
        </button>
      </form>
      {uploading && <p style={{ margin: '4px 0 0', fontSize: 12, color: '#666' }}>Uploading...</p>}
      {uploadError && <p style={{ margin: '4px 0 0', fontSize: 12, color: 'red' }}>{uploadError}</p>}
    </div>
  );
}
