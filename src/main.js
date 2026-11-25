// Boot, hash router, tab bar.

import { TABS, PAGES } from './features/tabs.js';
import { getSettings, setSetting } from './core/store.js';
import { timerService } from './features/timer/service.js';
import { showDone } from './features/timer/done.js';
import { installLeaveDetection, focus, setDnd } from './features/focus/session.js';
import { applyTheme } from './core/theme.js';
import { installBigDisplay } from './features/bigdisplay/bigdisplay.js';
import { syncTimerSound } from './features/settings/alarm-defaults-ui.js';
import { syncWidgets } from './core/widgets.js';
import { AlarmPlugin } from './core/bridge.js';

applyTheme(getSettings().theme, getSettings().accent);

const view = document.getElementById('view');
const tabbar = document.getElementById('tabbar');

let cleanup = null;
let current = null;

function renderTabbar() {
  tabbar.innerHTML = TABS.map(
    (t) => `
      <button class="tab" role="tab" id="tab-${t.id}" data-tab="${t.id}"
              aria-controls="view" aria-selected="false" aria-label="${t.label}">
        ${t.icon}<span>${t.label}</span>
      </button>`,
  ).join('');
  tabbar.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (btn) navigate(btn.dataset.tab);
  });
}

function screenFromHash() {
  const id = location.hash.replace(/^#\/?/, '').split('?')[0];
  const tab = TABS.find((t) => t.id === id);
  if (tab) return { ...tab, tab: tab.id, isTab: true };
  const page = PAGES.find((p) => p.id === id);
  return page ? { ...page, isTab: false } : null;
}

export function navigate(id) {
  if (location.hash !== `#/${id}`) location.hash = `#/${id}`;
  else route();
}

function route() {
  const screen = screenFromHash();
  if (!screen) {
    navigate(getSettings().lastTab);
    return;
  }
  if (screen.id === current) return;
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;
  current = screen.id;

  for (const btn of tabbar.querySelectorAll('[data-tab]')) {
    btn.setAttribute('aria-selected', String(btn.dataset.tab === screen.tab));
  }
  view.setAttribute('aria-labelledby', screen.isTab ? `tab-${screen.id}` : 'screen-title');
  try {
    cleanup = screen.render(view) ?? null;
  } catch (err) {
    console.error(`[router] failed to render ${screen.id}`, err);
    view.textContent = 'Something went wrong on this screen.';
  }
  document.body.classList.toggle('no-tabbar', !!screen.hideTabbar);
  view.scrollTop = 0;
  window.scrollTo(0, 0);
  if (screen.isTab) setSetting('lastTab', screen.id);
}

// Inside the native ring screen the WebView opens straight at #/ring: no onboarding, no timer alerts.
const ringMode = location.hash.startsWith('#/ring');
document.body.classList.toggle('ring-mode', ringMode);

renderTabbar();
window.addEventListener('hashchange', route);
if (!ringMode && !getSettings().onboardingSeen) location.hash = '#/onboarding';
else if (!ringMode && focus.get()) location.hash = '#/focus-run'; // reopen straight into a running session
route();
// The ring WebView never shows timer alerts (its hash can change to #/ring after boot).
if (!ringMode) timerService.init((done) => !location.hash.startsWith('#/ring') && showDone(done));
if (!ringMode) installLeaveDetection();
// App was killed mid-session? Give back the phone's normal mode (native only acts if Epoch set DND).
if (!ringMode && !focus.get()) setDnd(false);
if (!ringMode) syncTimerSound();
if (!ringMode) syncWidgets();
if (!ringMode) installBigDisplay(() => current);

// Wake-up check: if the notification was swiped away, opening the app still shows "Are you up?".
async function showWakeCheck() {
  const c = await AlarmPlugin.getRingContext().catch(() => null);
  if (c?.state?.phase === 'WAKE_CHECK_PROMPT' && !location.hash.startsWith('#/ring')) location.hash = '#/ring';
}
if (!ringMode) {
  showWakeCheck();
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && showWakeCheck());
  AlarmPlugin.addListener('ringStarted', showWakeCheck).catch(() => {});
}
