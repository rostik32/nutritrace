// Install console.* wrappers BEFORE any other import logs anything,
// so the in-app diagnostic-log buffer captures the full app lifecycle.
import { mount } from 'svelte';
import { setAppVersion } from './lib/log-capture.js';
import { APP_VERSION } from './lib/version.js';
import { installRequestIdFetch } from './lib/request-id-fetch.js';
setAppVersion(APP_VERSION);
installRequestIdFetch();
import { startViewportProbe } from './lib/viewport-probe.js';
startViewportProbe();
// Exposed for iconUrl() in platform.js: appended to every icon <img>
// src as ?v=<version> so a shipped icon fix isn't hidden behind the
// browser's aggressive PNG cache on the next boot.
if (typeof window !== 'undefined') window.__NT_VERSION__ = APP_VERSION;

import './styles/tokens.css';
import './styles/base.css';
import './styles/typography.css';
import './styles/animations.css';
import './styles/buttons.css';
import './styles/forms.css';
// Last, so its rules win over the layouts they move off a crease.
import './styles/fold.css';
import App from './App.svelte';
import { DB } from './lib/db.js';
import { initI18n } from './i18n/index.js';
import { setNutritionTranslator } from './lib/nutrition.js';
import { t } from './lib/i18n-t.js';

// Pick browser-detected locale for first paint; the App-level subscription to
// the `language` store flips it to the user's saved preference once that loads.
initI18n();
// Nutrient names follow the app language (nutrition.js can't import
// svelte-i18n itself: the server shares that file).
setNutritionTranslator((key, english) => t(key, null, english));

// Sync system theme changes when appearance = 'system'
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
  const appearance = localStorage.getItem('wl_appearance') || 'system';
  if (appearance === 'system') {
    document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
    const meta = document.getElementById('theme-color-meta');
    if (meta) meta.content = e.matches ? '#0A0B0F' : '#F5F7FA';
  }
});

// Boot
DB.init()
  .then(async () => {
    // Load cached image map before app renders — ensures resolveAssetUrl() has the map
    // ready on first paint (local SQLite read, no server dependency, ~5ms)
    const { isNative } = await import('./lib/platform.js');
    if (isNative) {
      const { loadImageMap } = await import('./lib/platform.js');
      await loadImageMap();
    }
    mount(App, { target: document.getElementById('app') });
  })
  .catch(async err => {
    console.error('DB init failed:', err);
    // Messages load asynchronously; give them a moment, English otherwise.
    try {
      const { waitLocale } = await import('svelte-i18n');
      await Promise.race([waitLocale(), new Promise(r => setTimeout(r, 1500))]);
    } catch { /* English fallback below */ }
    document.getElementById('app').innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                  height:100dvh;padding:32px;text-align:center;gap:16px;font-family:sans-serif;">
        <span style="font-size:48px">⚠️</span>
        <h2 style="color:#F0F2F8">${t('boot.db_error_title', null, 'Database Error')}</h2>
        <p style="color:rgba(240,242,248,0.6);max-width:300px">
          ${t('boot.db_error_body', null, 'Could not open the local database. Try closing other tabs or clearing site data.')}
        </p>
        <button onclick="location.reload()"
          style="padding:12px 24px;border-radius:12px;background:#4FFFB0;
                 color:#0A0B0F;font-weight:600;border:none;cursor:pointer;font-size:15px;">
          ${t('boot.retry', null, 'Retry')}
        </button>
      </div>`;
  });
