import { createI18n } from 'vue-i18n';
import zhCN from './locales/zh-CN';
import en from './locales/en';

const STORAGE_KEY = 'dmhub-locale';

function detectLocale(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && (saved === 'zh-CN' || saved === 'en')) return saved;
  } catch {}
  return navigator.language?.startsWith('zh') ? 'zh-CN' : 'en';
}

const i18n = createI18n({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: 'zh-CN',
  messages: {
    'zh-CN': zhCN,
    en,
  },
});

export function setLocale(locale: string) {
  (i18n.global.locale as any).value = locale;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {}
  document.documentElement.lang = locale === 'en' ? 'en' : 'zh-CN';
}

export function getLocale(): string {
  return (i18n.global.locale as any).value;
}

export default i18n;
