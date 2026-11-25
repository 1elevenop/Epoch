// Event countdowns (BLUEPRINT §6.7): title + date → "47 days"; cards on Tools → Clock.
// Stored in settings (so export/import carries them), validated on every read (rule 6).

import { getSettings, setSetting } from '../../core/store.js';
import { esc } from '../../core/dom.js';
import { ic } from '../../core/icons.js';
import * as M from './models.js';
import { syncWidgets } from '../../core/widgets.js';

export const listCountdowns = () => M.sanitizeCountdowns(getSettings().countdowns);
const saveList = (list) => {
  setSetting('countdowns', M.sanitizeCountdowns(list));
  syncWidgets(); // event countdown widget
};

const localDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const pretty = (s) => new Date(`${s}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

function card(c, now, withActions) {
  const days = M.daysUntil(c.date, now);
  return `<li class="cd-card${days < 0 ? ' past' : ''}" data-id="${esc(c.id)}">
    <div class="cd-main"><strong>${esc(c.title)}</strong><span class="muted">${pretty(c.date)}</span></div>
    <span class="cd-days digits">${M.daysLabel(days)}</span>
    ${withActions ? `<label class="check cd-pin"><input type="checkbox" data-act="pin" ${c.onClock ? 'checked' : ''} aria-label="Show ${esc(c.title)} on the Clock tab" /> Clock</label>
      <button class="icon-btn" data-act="del" aria-label="Delete ${esc(c.title)}">${ic('close')}</button>` : ''}
  </li>`;
}

/** Tools → Clock cards (only those marked "Clock"). Returns a redraw function. */
export function mountCountdownCards(host) {
  const draw = (now = Date.now()) => {
    const list = M.sortCountdowns(listCountdowns().filter((c) => c.onClock), now);
    host.innerHTML = list.length ? `<ul class="cd-list" aria-label="Event countdowns">${list.map((c) => card(c, now, false)).join('')}</ul>` : '';
  };
  draw();
  return draw;
}

export function countdownsScreen(el) {
  el.innerHTML = `
    <section class="screen tool" aria-labelledby="screen-title">
      <a class="back-link" href="#/tools" aria-label="Back to Tools">Tools</a>
      <h1 id="screen-title">Event countdowns</h1>
      <form class="form" id="f" novalidate>
        <label class="field">Event<input class="input" name="title" maxlength="60" placeholder="e.g. Exams start" required /></label>
        <label class="field">Date<input class="input" type="date" name="date" min="1900-01-01" max="2200-12-31" required /></label>
        <p class="form-error" role="alert"></p>
        <button class="btn" aria-label="Add countdown">Add</button>
      </form>
      <ul class="cd-list" id="list" aria-label="Countdowns"></ul>
    </section>`;
  const form = el.querySelector('#f');
  const listEl = el.querySelector('#list');
  form.date.value = localDate(new Date(Date.now() + 7 * 86_400_000));

  const draw = () => {
    const list = M.sortCountdowns(listCountdowns());
    listEl.innerHTML = list.length ? list.map((c) => card(c, Date.now(), true)).join('') : '<li class="empty muted">No countdowns yet.</li>';
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = form.title.value.trim();
    const date = form.date.value;
    const err = !title ? 'Give the event a name' : !M.validDate(date) ? 'Pick a valid date' : listCountdowns().length >= 50 ? 'Up to 50 countdowns' : '';
    form.querySelector('.form-error').textContent = err;
    if (err) return;
    const id = globalThis.crypto?.randomUUID?.() ?? `cd${Date.now()}`;
    saveList([...listCountdowns(), { id, title, date, onClock: true }]);
    form.title.value = '';
    draw();
  });
  listEl.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    const id = e.target.closest('[data-id]')?.dataset.id;
    if (!act || !id) return;
    const list = listCountdowns();
    if (act === 'del') saveList(list.filter((c) => c.id !== id));
    if (act === 'pin') saveList(list.map((c) => (c.id === id ? { ...c, onClock: e.target.checked } : c)));
    draw();
  });
  draw();
}
