// Editor extras: challenge chain + difficulty, QR registration, wake-check, sunrise pre-alarm, snooze rules.

import { CHALLENGE_INFO } from '../challenges/rules.js';
import { openQrSetup } from './qrsetup.js';
import { AlarmPlugin } from '../../core/bridge.js';

const opt = (v, label, cur) => `<option value="${v}" ${String(v) === String(cur ?? '') ? 'selected' : ''}>${label}</option>`;

export function ensureExtra(a) {
  a.challenge = { chain: ['math'], level: 2, qrPayload: null, ...a.challenge };
  a.wakeCheck = { enabled: true, delayMin: 4, windowSec: 60, ...a.wakeCheck };
  a.snooze = { lengthMin: 5, max: 3, shrink: true, weeklyBudget: null, ...a.snooze };
}

const SUNRISE = [[0, 'Off'], [10, '10 min'], [15, '15 min'], [20, '20 min'], [30, '30 min']];

export function extraHtml(a) {
  return `
    <h3 class="form-section">Wake-up challenge</h3>
    <div class="chain-pick" role="group" aria-label="Challenges, in order">
      ${Object.entries(CHALLENGE_INFO)
        .map(([id, c]) => `<button type="button" class="chain-chip" data-ch="${id}" aria-pressed="false">
          <span class="chain-n" aria-hidden="true"></span>${c.name}</button>`)
        .join('')}
    </div>
    <p class="muted" id="chain-text"></p>
    <label class="field">Difficulty
      <select class="input" name="level">${[1, 2, 3, 4].map((l) => opt(l, `Level ${l} · ${['', 'easy (4 + 7)', 'medium (34 + 7)', 'harder (27 + 38)', 'hardest (7 × 8)'][l]}`, a.challenge.level)).join('')}</select></label>
    <div class="qr-row" data-show="qr">
      <span id="qr-state"></span>
      <button type="button" class="btn btn-ghost" data-act="qr" aria-label="Set up QR code">Set up QR code</button>
    </div>
    <h3 class="form-section">Wake-up check</h3>
    <label class="switch-row">Ask "Are you up?" after dismiss<input type="checkbox" role="switch" name="wcOn" ${a.wakeCheck.enabled ? 'checked' : ''} /></label>
    <label class="field" data-show="wc">Ask after
      <select class="input" name="wcDelay">${[2, 4, 6, 10].map((m) => opt(m, `${m} min`, a.wakeCheck.delayMin)).join('')}</select></label>
    <h3 class="form-section">Sunrise pre-alarm</h3>
    <div class="row"><label class="field grow">Silent light before the alarm
      <select class="input" name="sunrise">${SUNRISE.map(([v, l]) => opt(v, l, a.sunriseMin ?? 0)).join('')}</select></label>
      <button type="button" class="btn btn-ghost" data-act="sunrise" aria-label="Preview the sunrise light for 30 seconds">Preview</button></div>
    <p class="muted">Screen glows red → orange → white. Works when the phone faces you.</p>
    <h3 class="form-section">Snooze rules</h3>
    <label class="switch-row">Shorter snoozes, 3rd locked<input type="checkbox" role="switch" name="shrink" ${a.snooze.shrink ? 'checked' : ''} /></label>
    <label class="field">Weekly snooze budget
      <select class="input" name="budget">${[['', 'Off'], [1, '1'], [2, '2'], [3, '3'], [5, '5'], [7, '7']].map(([v, l]) => opt(v, l, a.snooze.weeklyBudget)).join('')}</select></label>`;
}

export function bindExtra(sheet, a) {
  const chainText = sheet.querySelector('#chain-text');
  function sync() {
    sheet.querySelectorAll('[data-ch]').forEach((b) => {
      const i = a.challenge.chain.indexOf(b.dataset.ch);
      b.setAttribute('aria-pressed', String(i >= 0));
      b.querySelector('.chain-n').textContent = i >= 0 ? `${i + 1}` : '';
    });
    chainText.textContent = a.challenge.chain.map((id) => CHALLENGE_INFO[id].name).join(' → ') || 'Pick at least one';
    const hasQr = a.challenge.chain.includes('qr');
    sheet.querySelector('[data-show=qr]').hidden = !hasQr;
    sheet.querySelector('#qr-state').textContent = a.challenge.qrPayload ? 'Code registered' : 'No code registered yet';
    sheet.querySelector('[data-show=wc]').hidden = !sheet.querySelector('[name=wcOn]').checked;
  }
  sheet.addEventListener('click', async (e) => {
    const chip = e.target.closest('[data-ch]');
    if (chip) {
      const id = chip.dataset.ch;
      const c = a.challenge.chain;
      a.challenge.chain = c.includes(id) ? c.filter((x) => x !== id) : c.length < 4 ? [...c, id] : c;
      if (id === 'qr' && a.challenge.chain.includes('qr') && !a.challenge.qrPayload) {
        a.challenge.qrPayload = (await openQrSetup(null)) ?? null;
      }
      sync();
    }
    if (e.target.closest('[data-act=sunrise]')) AlarmPlugin.previewSunrise(30).catch((err) => console.warn('[sunrise] preview failed', err));
    if (e.target.closest('[data-act=qr]')) {
      const p = await openQrSetup(a.challenge.qrPayload);
      if (p) a.challenge.qrPayload = p;
      sync();
    }
  });
  sheet.querySelector('[name=wcOn]').addEventListener('change', sync);
  sync();
}

export function readExtra(form, a) {
  return {
    challenge: { ...a.challenge, level: Number(form.level.value) },
    wakeCheck: { ...a.wakeCheck, enabled: form.wcOn.checked, delayMin: Number(form.wcDelay.value) },
    sunriseMin: Number(form.sunrise.value),
    snooze: {
      ...a.snooze,
      shrink: form.shrink.checked,
      weeklyBudget: form.budget.value === '' ? null : Number(form.budget.value),
    },
  };
}
