import i18next, { type TFunction } from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import en from './en.json';
import tr from './tr.json';

export type Locale = 'en' | 'tr';

export const LOCALES: readonly Locale[] = ['en', 'tr'] as const;
export const DEFAULT_LOCALE: Locale = 'en';

export const resources = {
  en: { translation: en },
  tr: { translation: tr },
} as const;

let initialised = false;

/**
 * i18next is configured with `{n}`-style placeholders, not the `{{n}}` default,
 * because that is what the design bundle's strings/*.json use and the keys are
 * copied verbatim from it.
 */
export function initI18n(locale: Locale = DEFAULT_LOCALE) {
  if (initialised) return i18next;
  initialised = true;
  void i18next.use(initReactI18next).init({
    resources,
    lng: locale,
    fallbackLng: DEFAULT_LOCALE,
    defaultNS: 'translation',
    interpolation: {
      escapeValue: false, // RN has no XSS surface; escaping would mangle copy
      prefix: '{',
      suffix: '}',
    },
    returnNull: false,
    compatibilityJSON: 'v4',
  });
  return i18next;
}

/** Current locale. Re-renders on `setLocale`. */
export function useLocale(): Locale {
  const { i18n } = useTranslation();
  const lng = (i18n.resolvedLanguage ?? i18n.language ?? DEFAULT_LOCALE) as string;
  return (LOCALES as readonly string[]).includes(lng) ? (lng as Locale) : DEFAULT_LOCALE;
}

export function setLocale(locale: Locale): Promise<TFunction> {
  return i18next.changeLanguage(locale) as unknown as Promise<TFunction>;
}

/** Non-hook accessor, loosely typed on purpose — key coverage grows per wave. */
export const t = (key: string, options?: Record<string, unknown>): string =>
  i18next.t(key, options as never) as unknown as string;

export { useTranslation };
export default i18next;
