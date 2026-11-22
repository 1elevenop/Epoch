// World clocks: list of saved cities + a searchable city picker.

import { syncWidgets } from '../../core/widgets.js';
import { CITIES } from './cities.js';
import { zoneParts, relativeOffset, relativeDay, isDaytime, isValidZone } from './zones.js';
import { formatHMS, ampm } from '../../core/time.js';
import { getSettings, setSetting } from '../../core/store.js';
import { esc } from '../../core/dom.js';

const saved = () => getSettings().worldClocks.filter((c) => c && isValidZone(c.zone));

export function mountWorldClocks(host) {
  host.innerHTML = `
    <div class="section-head">
      <h2 class="section-title">World clocks</h2>
      <button class="btn btn-ghost" id="wc-add" aria-label="Add city">+ Add city</button>
    </div>
    <ul class="list" id="wc-list"></ul>`;
  const list = host.querySelector('#wc-list');

  function render() {
    const items = saved();
    list.innerHTML = items.length
      ? items
          .map(
            (c, i) => `
        <li class="list-item wc-item" data-i="${i}">
          <span class="wc-dot" aria-hidden="true"></span>
          <span class="wc-main"><span class="wc-name">${esc(c.name)}</span>
            <span class="wc-meta"></span></span>
          <span class="wc-time digits"></span>
          <button class="icon-btn" data-remove="${i}" aria-label="Remove ${esc(c.name)}">✕</button>
        </li>`,
          )
          .join('')
      : `<li class="empty">No cities yet.</li>`;
    update(Date.now());
  }

  function update(t) {
    const { hour12 } = getSettings();
    const items = saved();
    list.querySelectorAll('.wc-item').forEach((li) => {
      const c = items[Number(li.dataset.i)];
      if (!c) return;
      const p = zoneParts(c.zone, t);
      li.querySelector('.wc-time').textContent = formatHMS(p.h, p.m, p.s, { hour12 }) + (hour12 ? ` ${ampm(p.h)}` : '');
      li.querySelector('.wc-meta').textContent = `${relativeDay(c.zone, t)}, ${relativeOffset(c.zone, t)}`;
      const dot = li.querySelector('.wc-dot');
      dot.classList.toggle('day', isDaytime(p.h));
      dot.title = isDaytime(p.h) ? 'Day' : 'Night';
    });
  }

  host.addEventListener('click', (e) => {
    if (e.target.closest('#wc-add')) openPicker(host, (city) => {
      const list = saved();
      if (!list.some((c) => c.zone === city.zone && c.name === city.name)) {
        setSetting('worldClocks', [...list, city]);
        syncWidgets();
      }
      render();
    });
    const rm = e.target.closest('[data-remove]');
    if (rm) {
      const list = saved();
      list.splice(Number(rm.dataset.remove), 1);
      setSetting('worldClocks', list);
        syncWidgets();
      render();
    }
  });

  render();
  return update;
}

function openPicker(host, onPick) {
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', 'Add city');
  sheet.innerHTML = `
    <div class="sheet-head">
      <input class="input" id="city-q" type="search" placeholder="Search city" aria-label="Search city"
             autocomplete="off" autocapitalize="words" />
      <button class="btn btn-ghost" id="city-close" aria-label="Close">Cancel</button>
    </div>
    <ul class="list sheet-list" id="city-results"></ul>`;
  document.body.append(sheet);
  const q = sheet.querySelector('#city-q');
  const results = sheet.querySelector('#city-results');

  const show = () => {
    const term = q.value.trim().toLowerCase();
    const hits = CITIES.filter(([n, r, z]) => !term || n.toLowerCase().includes(term) || z.toLowerCase().includes(term)).slice(0, 60);
    results.innerHTML = hits
      .map(
        ([n, r, z], i) => `<li><button class="list-item city-row" data-k="${i}" aria-label="Add ${esc(n)}">
          <span>${esc(n)}</span><span>${esc(r)} · ${esc(relativeOffset(z))}</span></button></li>`,
      )
      .join('') || '<li class="empty">No match.</li>';
    results.dataset.hits = JSON.stringify(hits.map(([n, , z]) => ({ name: n, zone: z })));
  };

  const close = () => {
    sheet.remove();
    window.removeEventListener('hashchange', close);
  };
  sheet.addEventListener('click', (e) => {
    if (e.target.closest('#city-close')) return close();
    const row = e.target.closest('[data-k]');
    if (row) {
      onPick(JSON.parse(results.dataset.hits)[Number(row.dataset.k)]);
      close();
    }
  });
  q.addEventListener('input', show);
  window.addEventListener('hashchange', close);
  show();
  q.focus();
}
