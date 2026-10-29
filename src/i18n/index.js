import { register, init, getLocaleFromNavigator, locale } from 'svelte-i18n';
import { get } from 'svelte/store';

// Languages with a dedicated locale file. As contributors add translations,
// register them here and add an entry to AVAILABLE_LOCALES so the language
// picker in Settings → Regional & Units shows the new option.
register('en', () => import('./en.json'));
register('fr', () => import('./fr.json'));
register('de', () => import('./de.json'));
register('es', () => import('./es.json'));
register('ru', () => import('./ru.json'));
register('uk', () => import('./uk.json'));

export const AVAILABLE_LOCALES = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' },
  { code: 'ru', label: 'Русский' },
  { code: 'uk', label: 'Українська' },
];

export function initI18n(initialLocale) {
  init({
    fallbackLocale: 'en',
    initialLocale: initialLocale || pickInitialLocale(),
    // Log missing-key warnings to the browser console only in dev — in
    // production builds they'd spam the console for users running a locale
    // that isn't fully translated yet.
    warnOnMissingMessages: !!import.meta.env.DEV,
  });
}

function pickInitialLocale() {
  const nav = getLocaleFromNavigator();
  if (!nav) return 'en';
  const short = nav.split('-')[0];
  return AVAILABLE_LOCALES.some(l => l.code === short) ? short : 'en';
}

// Locale for Intl date formatting (weekday and month names), so dates follow
// the app language instead of the browser's. Pass it where the code would
// otherwise pass `undefined`: d.toLocaleDateString(intlLocale(), { ... }).
export function intlLocale() {
  return get(locale) || undefined;
}
