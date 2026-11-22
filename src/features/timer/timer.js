// Timer tab: preset chips, custom wheel input, list of running/paused/done timers.

import { subscribe } from '../../core/ticker.js';
import { formatDuration } from '../../core/time.js';
import { unlock } from '../../core/audio.js';
import { esc } from '../../core/dom.js';
import { timerService } from './service.js';
import { createWheel } from './wheel.js';
import * as T from './model.js';
import { setBigSource, bigButton } from '../bigdisplay/bigdisplay.js';
import { timerView } from '../bigdisplay/sources.js';

const PRESETS = [1, 3, 5, 10, 25];
const RING_R = 26;
const RING_C = 2 * Math.PI * RING_R;

function card(t) {
  const name = esc(t.label || 'Timer');
  const running = t.state === 'running';
  return `
    <li class="timer-card state-${t.state}" data-id="${esc(t.id)}">
      <svg class="ring" viewBox="0 0 60 60" aria-hidden="true">
        <circle cx="30" cy="30" r="${RING_R}" class="ring-bg"/>
        <circle cx="30" cy="30" r="${RING_R}" class="ring-fg" stroke-dasharray="${RING_C}"/>
      </svg>
      <div class="timer-main">
        <span class="timer-left digits" role="timer"></span>
        <span class="timer-label">${name} · ${formatDuration(t.durationMs)}</span>
      </div>
      <div class="timer-actions">
        <button class="icon-btn" data-act="plus" aria-label="Add 1 minute to ${name}">+1</button>
        <button class="icon-btn" data-act="reset" aria-label="Reset ${name}">↺</button>
        <button class="icon-btn primary" data-act="${running ? 'pause' : 'start'}"
          aria-label="${running ? 'Pause' : 'Start'} ${name}">${running ? '❚❚' : '▶'}</button>
        <button class="icon-btn" data-act="remove" aria-label="Delete ${name}">✕</button>
      </div>
    </li>`;
}

export function timerScreen(el) {
  el.innerHTML = `
    <section class="screen" aria-labelledby="screen-title">
      <div class="screen-head"><h1 id="screen-title">Timer</h1>${bigButton('Big display for timers')}</div>
      <ul class="timer-list" id="timer-list"></ul>
      <div class="card new-timer">
        <div class="chips" role="group" aria-label="Quick start">
          ${PRESETS.map((m) => `<button class="chip" data-min="${m}" aria-label="Start ${m} minute timer">${m} min</button>`).join('')}
        </div>
        <div class="wheels" id="wheels"></div>
        <input class="input" id="timer-label" maxlength="40" placeholder="Label (optional)" aria-label="Timer label" />
        <button class="btn btn-round" id="timer-start" aria-label="Start custom timer">Start</button>
      </div>
    </section>`;

  const listEl = el.querySelector('#timer-list');
  const wheelsEl = el.querySelector('#wheels');
  const hours = createWheel(wheelsEl, { max: 99, value: 0, label: 'Hours' });
  const mins = createWheel(wheelsEl, { max: 59, value: 5, label: 'Minutes' });
  const secs = createWheel(wheelsEl, { max: 59, value: 0, label: 'Seconds' });
  const labelInput = el.querySelector('#timer-label');

  function render(timers) {
    listEl.innerHTML = timers.map(card).join('');
    tick(Date.now());
  }

  function tick(now) {
    const byId = new Map(timerService.list().map((t) => [t.id, t]));
    listEl.querySelectorAll('.timer-card').forEach((li) => {
      const t = byId.get(li.dataset.id);
      if (!t) return;
      const rem = T.remaining(t, now);
      // Count up to whole seconds so "00:01" shows until the very end.
      li.querySelector('.timer-left').textContent = formatDuration(rem > 0 ? Math.ceil(rem / 1000) * 1000 : rem);
      li.querySelector('.ring-fg').style.strokeDashoffset = String(RING_C * T.progress(t, now));
    });
  }

  // Listen on the section (re-created each visit), not on the shared #view element.
  el.querySelector('.screen').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-min]');
    if (chip) {
      unlock();
      timerService.add(Number(chip.dataset.min) * 60_000, `${chip.dataset.min} min`);
      return;
    }
    if (e.target.closest('#timer-start')) {
      const ms = (hours.value * 3600 + mins.value * 60 + secs.value) * 1000;
      if (ms < 1000) {
        labelInput.placeholder = 'Pick a duration first';
        return;
      }
      unlock();
      timerService.add(ms, labelInput.value.trim());
      labelInput.value = '';
      return;
    }
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const id = btn.closest('[data-id]').dataset.id;
    unlock();
    const act = btn.dataset.act;
    if (act === 'plus') timerService.addMinute(id);
    else if (act === 'remove') timerService.remove(id);
    else timerService[act](id);
  });

  const unsubList = timerService.subscribe(render);
  render(timerService.list());
  const unsubTick = subscribe(tick, { fps: 4 });
  setBigSource({ kind: 'timer', read: (now) => timerView(timerService.list(), now) });
  return () => {
    setBigSource(null);
    unsubList();
    unsubTick();
  };
}
