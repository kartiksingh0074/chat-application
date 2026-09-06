import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  theme: Theme;
  resolved: 'light' | 'dark';
  setTheme: (t: Theme) => void;
}

const STORAGE_KEY = 'chat-theme';
// Dark-first: a chat client that lives in a background window all day is
// read on dark far more often. 'system' is still one click away in settings.
const DEFAULT_THEME: Theme = 'dark';
const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemPrefersDark() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
      return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : DEFAULT_THEME;
    } catch {
      return DEFAULT_THEME;
    }
  });
  const [resolved, setResolved] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    const apply = () => {
      const next = theme === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : theme;
      setResolved(next);
      document.documentElement.classList.toggle('dark', next === 'dark');
    };
    apply();

    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Preference just won't persist.
    }
  }, []);

  return <ThemeContext.Provider value={{ theme, resolved, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
