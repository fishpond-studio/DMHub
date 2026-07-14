import { ref } from 'vue';

export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'dmhub-theme';

function getSystemPreference(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.remove('light', 'dark');

  if (theme === 'system') {
    root.classList.add(getSystemPreference());
  } else {
    root.classList.add(theme);
  }
}

export function useTheme() {
  const currentTheme = ref<Theme>('system');
  const resolvedTheme = ref<'light' | 'dark'>('light');

  function setTheme(theme: Theme) {
    currentTheme.value = theme;
    localStorage.setItem(STORAGE_KEY, theme);
    applyTheme(theme);
    resolvedTheme.value = theme === 'system' ? getSystemPreference() : theme;
  }

  function initTheme() {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    const theme = stored || 'system';
    currentTheme.value = theme;
    applyTheme(theme);
    resolvedTheme.value = theme === 'system' ? getSystemPreference() : theme;

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (currentTheme.value === 'system') {
        applyTheme('system');
        resolvedTheme.value = e.matches ? 'dark' : 'light';
      }
    });
  }

  return { currentTheme, resolvedTheme, setTheme, initTheme };
}
