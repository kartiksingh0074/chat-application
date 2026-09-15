import { useState } from 'react';
import { useUsers, type DirectoryUser } from '../hooks/useUsers.js';
import { Avatar, EmptyState, Input, Spinner } from '../ui/primitives.js';
import { CheckIcon, CloseIcon } from '../ui/icons.js';

interface UserPickerProps {
  token: string;
  selected: DirectoryUser[];
  onToggle: (user: DirectoryUser) => void;
  multiple?: boolean;
}

export function UserPicker({ token, selected, onToggle, multiple = true }: UserPickerProps) {
  const [query, setQuery] = useState('');
  const { users, loading } = useUsers(token, query);
  const selectedIds = new Set(selected.map((u) => u.id));

  return (
    <div className="flex flex-col gap-2">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search people"
        aria-label="Search people"
      />

      {multiple && selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((u) => (
            <button
              key={u.id}
              onClick={() => onToggle(u)}
              className="flex items-center gap-1 rounded-full bg-brand-subtle px-2 py-1 text-xs font-medium text-brand"
            >
              {u.username} <CloseIcon size={12} strokeWidth={2.25} />
            </button>
          ))}
        </div>
      )}

      <div className="max-h-56 overflow-y-auto rounded-lg border border-border-subtle">
        {loading ? (
          <div className="flex justify-center py-6 text-content-muted">
            <Spinner />
          </div>
        ) : users.length === 0 ? (
          <EmptyState title="No people found" />
        ) : (
          <ul>
            {users.map((u) => {
              const isSelected = selectedIds.has(u.id);
              return (
                <li key={u.id}>
                  <button
                    onClick={() => onToggle(u)}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition
                      ${isSelected ? 'bg-brand-subtle text-brand' : 'text-content hover:bg-surface-sunken'}`}
                  >
                    <Avatar name={u.username} size={28} avatarKey={u.avatarKey} />
                    <span className="flex-1 truncate">{u.username}</span>
                    {isSelected && <CheckIcon size={16} strokeWidth={2.25} />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
