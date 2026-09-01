import { useState, type FormEvent } from 'react';

interface ComposerProps {
  onSend: (body: string) => void;
  disabled?: boolean;
}

export function Composer({ onSend, disabled }: ComposerProps) {
  const [draft, setDraft] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (draft.trim().length === 0) return;
    onSend(draft);
    setDraft('');
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, padding: 8 }}>
      <input
        style={{ flex: 1 }}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Type a message"
        disabled={disabled}
      />
      <button type="submit" disabled={disabled}>
        Send
      </button>
    </form>
  );
}
