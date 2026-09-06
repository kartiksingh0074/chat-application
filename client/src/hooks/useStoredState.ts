import { useCallback, useState } from 'react';

/**
 * State that survives a reload, for view preferences only - which sidebar
 * sections are open, whether the member panel is showing. Storage can throw in
 * a private window, so every access is guarded and the default is used instead.
 */
export function useStoredState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  });

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        try {
          localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          // The preference just won't persist.
        }
        return resolved;
      });
    },
    [key],
  );

  return [value, update] as const;
}
