// Settings (BLUEPRINT §6.8): Black / Light, accent, big-display transitions (live previews), general.

import { esc } from '../../core/dom.js';
import { getSettings, setSetting } from '../../core/store.js';
import { THEMES, ACCENTS, applyTheme, themeById } from '../../core/theme.js';
import { TRANSITIONS, createDigits } from '../bigdisplay/digits.js';
import { pad2 } from '../../core/time.js';
import { backupHtml, bindBackup } from './backup-ui.js';
import { alarmDefaultsHtml, bindAlarmDefaults } from './alarm-defaults-ui.js';
import { syncWidgets } from '../../core/widgets.js';

const SCREENS = [
  ['timer', 'Timer'],
  ['stopwatch', 'Stopwatch'],
  ['focus', 'Focus'],
];
const APP_VERSION = '1.0.0';

export function settingsScreen(el) {
  const s = getSettings();
  let target = 'timer';
  el.innerHTML = `
    <section class="screen settings" aria-labelledby="screen-title">
      <a class="back-link" href="#/${s.lastTab}" aria-label="Back">‹ Back</a>
      <h1 id="screen-title">Settings</h1>

      <h2 class="section-title">Theme</h2>
      <div class="seg" role="radiogroup" aria-label="Theme">
        ${THEMES.map((t) => `<button class="seg-btn" role="radio" data-theme-id="${t.id}" aria-checked="${t.id === themeById(s.theme).id}">${t.name}</button>`).join('')}
      </div>

      <h2 class="section-title">Accent colour</h2>
      <div class="swatches" role="radiogroup" aria-label="Accent colour">
        <button class="swatch auto ${s.accent ? '' : 'on'}" data-accent="" role="radio" aria-checked="${!s.accent}" aria-label="Theme default">A</button>
        ${ACCENTS.map((c) => `<button class="swatch ${s.accent === c ? 'on' : ''}" data-accent="${c}" style="--c:${c}" role="radio" aria-checked="${s.accent === c}" aria-label="Accent ${c}"></button>`).join('')}
      </div>

      <h2 class="section-title">Big display transitions</h2>
      <p class="muted">Turn the phone sideways on Timer, Stopwatch or Focus (or tap ⤢). Choose a screen, then tap a style.</p>
      <div class="seg" role="tablist" aria-label="Screen">
        ${SCREENS.map(([id, l]) => `<button class="seg-btn" role="tab" data-target="${id}" aria-selected="${id === target}">${l}</button>`).join('')}
      </div>
      <div class="tr-grid" id="transitions">
        ${TRANSITIONS.map((t) => `<button class="tr-card" data-tr="${t.id}" aria-label="Transition ${esc(t.name)}">
            <span class="tr-preview" data-preview="${t.id}"></span>
            <span class="tr-name">${esc(t.name)}</span><span class="tr-used"></span></button>`).join('')}
      </div>

      <h2 class="section-title">General</h2>
      <label class="switch-row">24-hour clock<input type="checkbox" role="switch" data-set="hour24" ${s.hour12 ? '' : 'checked'} /></label>
      <label class="switch-row">Haptics<input type="checkbox" role="switch" data-set="haptics" ${s.haptics ? 'checked' : ''} /></label>
      <label class="field">Week starts on
        <select class="input" data-set="weekStart"><option value="1" ${s.weekStart === 1 ? 'selected' : ''}>Monday</option>
        <option value="0" ${s.weekStart === 0 ? 'selected' : ''}>Sunday</option></select></label>
      ${alarmDefaultsHtml(s)}
      ${backupHtml()}
      <h2 class="section-title">Help</h2>
      <a class="list-item link" href="#/reliability"><span>Reliability</span><span>›</span></a>
      <a class="list-item link" href="#/log"><span>Alarm log</span><span>›</span></a>
      <a class="list-item link" href="#/onboarding"><span>Setup guide</span><span>›</span></a>
      <p class="muted">Epoch ${APP_VERSION} · offline, no account.</p>
    </section>`;

  // ---- live previews ----
  const previews = TRANSITIONS.map((t, i) => ({
    d: createDigits(el.querySelector(`[data-preview="${t.id}"]`), t.id),
    n: 10 + i * 7,
  }));
  previews.forEach((p) => p.d.update(pad2(p.n % 100)));
  let tick = 0;
  const timer = setInterval(() => {
    tick += 1;
    previews.forEach((p, i) => {
      if ((tick + i) % 2) return; // stagger: half the cards change each beat
      p.n += 1;
      p.d.update(pad2(p.n % 100));
    });
    el.querySelectorAll('.tt-digits').forEach((d) => (d.textContent = `12:${pad2((34 + tick) % 60)}`));
  }, 900);

  function markUsed() {
    const bt = getSettings().bigTransition;
    el.querySelectorAll('[data-tr]').forEach((c) => {
      const users = SCREENS.filter(([id]) => bt[id] === c.dataset.tr).map(([, l]) => l);
      c.querySelector('.tr-used').textContent = users.join(' · ');
      c.classList.toggle('selected', bt[target] === c.dataset.tr);
      c.setAttribute('aria-pressed', String(bt[target] === c.dataset.tr));
    });
    el.querySelectorAll('[data-target]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.target === target)));
  }
  markUsed();

  const section = el.querySelector('.settings');
  bindBackup(section);
  section.addEventListener('click', (e) => {
    const th = e.target.closest('[data-theme-id]');
    if (th) {
      setSetting('theme', th.dataset.themeId);
      applyTheme(th.dataset.themeId, getSettings().accent);
      el.querySelectorAll('[data-theme-id]').forEach((b) => b.setAttribute('aria-checked', String(b === th)));
    }
    const ac = e.target.closest('[data-accent]');
    if (ac) {
      const c = ac.dataset.accent || null;
      setSetting('accent', c);
      applyTheme(getSettings().theme, c);
      el.querySelectorAll('[data-accent]').forEach((b) => {
        b.classList.toggle('on', b === ac);
        b.setAttribute('aria-checked', String(b === ac));
      });
    }
    const tg = e.target.closest('[data-target]');
    if (tg) {
      target = tg.dataset.target;
      markUsed();
    }
    const tr = e.target.closest('[data-tr]');
    if (tr) {
      setSetting('bigTransition', { ...getSettings().bigTransition, [target]: tr.dataset.tr });
      markUsed();
    }
  });
  section.addEventListener('change', (e) => {
    const k = e.target.dataset.set;
    if (k === 'hour24') {
      setSetting('hour12', !e.target.checked);
      syncWidgets(); // widgets show times in the app's format
    }
    if (k === 'haptics') setSetting('haptics', e.target.checked);
    if (k === 'weekStart') setSetting('weekStart', Number(e.target.value));
  });

  const stopPreview = bindAlarmDefaults(el.querySelector('.settings'));
  return () => {
    stopPreview();
    clearInterval(timer);
    previews.forEach((p) => p.d.destroy());
  };
}

export { themeById };
