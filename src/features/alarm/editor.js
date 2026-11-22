// Alarm editor sheet. Phase 2 fields only; challenge, wake-check and sunrise come in later phases.

import { AlarmPlugin } from '../../core/bridge.js';
import { esc } from '../../core/dom.js';
import { pad2 } from '../../core/time.js';
import { SOUNDS, WEEK, defaultAlarm, validateAlarm, errorText } from './model.js';
import { ensureExtra, extraHtml, bindExtra, readExtra } from './editor-extra.js';

const opt = (v, label, cur) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${label}</option>`;

export function openEditor(existing, { onDelete } = {}) {
  const a = structuredClone(existing ?? defaultAlarm());
  ensureExtra(a);
  const sheet = document.createElement('div');
  sheet.className = 'sheet editor';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', existing ? 'Edit alarm' : 'New alarm');
  sheet.innerHTML = `
    <div class="sheet-head">
      <button class="btn btn-ghost" data-act="cancel" aria-label="Cancel">Cancel</button>
      <h2 class="sheet-title">${existing ? 'Edit alarm' : 'New alarm'}</h2>
      <button class="btn" data-act="save" aria-label="Save alarm">Save</button>
    </div>
    <form class="form" novalidate>
      <input class="time-input digits" type="time" name="time" required aria-label="Alarm time"
             value="${pad2(a.hour)}:${pad2(a.minute)}" />
      <fieldset class="days" aria-label="Repeat days">
        ${WEEK.map(([v, n]) => `<button type="button" class="day-chip" data-day="${v}" aria-pressed="${a.days.includes(v)}">${n.slice(0, 2)}</button>`).join('')}
      </fieldset>
      <label class="field">Label<input class="input" name="label" maxlength="60" value="${esc(a.label)}" /></label>
      <label class="field">Sound
        <span class="row"><select class="input" name="soundId">
          ${['Gentle', 'Hard'].map((g) => `<optgroup label="${g}">${SOUNDS.filter((s) => s.group === g).map((s) => opt(s.id, s.name, a.soundId)).join('')}</optgroup>`).join('')}
        </select><button type="button" class="icon-btn" data-act="preview" aria-label="Preview sound">▶</button></span>
      </label>
      <label class="field">Volume <output name="volOut">${Math.round(a.volume * 100)} %</output>
        <input type="range" name="volume" min="10" max="100" step="5" value="${Math.round(a.volume * 100)}" aria-label="Volume" /></label>
      <label class="field">Volume ramp
        <select class="input" name="rampSec">${[0, 10, 30, 60, 120].map((s) => opt(s, s ? `${s} s` : 'Off', a.rampSec)).join('')}</select></label>
      <label class="switch-row">Vibrate<input type="checkbox" role="switch" name="vibrate" ${a.vibrate ? 'checked' : ''} /></label>
      <label class="field">Snooze length
        <select class="input" name="snoozeLen">${[1, 3, 5, 10, 15].map((m) => opt(m, `${m} min`, a.snooze.lengthMin)).join('')}</select></label>
      <label class="field">Max snoozes
        <select class="input" name="snoozeMax">${[0, 1, 2, 3, 5].map((m) => opt(m, m ? String(m) : 'No snooze', a.snooze.max)).join('')}</select></label>
      ${extraHtml(a)}
      <h3 class="form-section">Other</h3>
      <label class="switch-row" data-show="once">Delete after it rings<input type="checkbox" role="switch" name="deleteAfterUse" ${a.deleteAfterUse ? 'checked' : ''} /></label>
      <label class="switch-row" data-show="repeat">Skip next occurrence<input type="checkbox" role="switch" name="skipNext" ${a.skipNext ? 'checked' : ''} /></label>
      <p class="form-error" role="alert"></p>
      ${existing ? '<button type="button" class="btn btn-danger" data-act="delete" aria-label="Delete alarm">Delete alarm</button>' : ''}
    </form>`;
  document.body.append(sheet);

  const form = sheet.querySelector('form');
  const errEl = sheet.querySelector('.form-error');
  let previewing = false;

  const syncVisibility = () => {
    const repeating = a.days.length > 0;
    sheet.querySelector('[data-show=once]').hidden = repeating;
    sheet.querySelector('[data-show=repeat]').hidden = !repeating;
  };
  syncVisibility();
  bindExtra(sheet, a);

  function read() {
    const [h, m] = (form.time.value || '').split(':').map(Number);
    return {
      ...a,
      hour: h,
      minute: m,
      label: form.label.value.trim(),
      soundId: form.soundId.value,
      volume: Number(form.volume.value) / 100,
      rampSec: Number(form.rampSec.value),
      vibrate: form.vibrate.checked,
      ...readExtra(form, a),
      snooze: { ...readExtra(form, a).snooze, lengthMin: Number(form.snoozeLen.value), max: Number(form.snoozeMax.value) },
      deleteAfterUse: a.days.length ? false : form.deleteAfterUse.checked,
      skipNext: a.days.length ? form.skipNext.checked : false,
      oneShotAt: null, // editing time makes it a normal alarm again
      enabled: true,
    };
  }

  function close() {
    if (previewing) AlarmPlugin.stopPreview().catch(() => {});
    sheet.remove();
    window.removeEventListener('hashchange', close);
  }

  form.volume.addEventListener('input', () => (form.volOut.value = `${form.volume.value} %`));
  form.addEventListener('submit', (e) => e.preventDefault());

  sheet.addEventListener('click', async (e) => {
    const day = e.target.closest('[data-day]');
    if (day) {
      const v = Number(day.dataset.day);
      a.days = a.days.includes(v) ? a.days.filter((d) => d !== v) : [...a.days, v].sort();
      day.setAttribute('aria-pressed', String(a.days.includes(v)));
      syncVisibility();
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'cancel') close();
    if (act === 'preview') {
      try {
        if (previewing) await AlarmPlugin.stopPreview();
        else await AlarmPlugin.previewSound(form.soundId.value, Number(form.volume.value) / 100);
        previewing = !previewing;
        e.target.closest('[data-act]').textContent = previewing ? '■' : '▶';
      } catch (err) {
        errEl.textContent = errorText(err);
      }
    }
    if (act === 'delete') {
      close();
      onDelete?.(existing);
    }
    if (act === 'save') {
      const next = read();
      const errors = validateAlarm(next);
      if (errors.length) {
        errEl.textContent = errors.join('. ');
        return;
      }
      try {
        await AlarmPlugin.upsertAlarm(next);
        close();
      } catch (err) {
        errEl.textContent = errorText(err);
      }
    }
  });
  window.addEventListener('hashchange', close);
  form.time.focus();
}
