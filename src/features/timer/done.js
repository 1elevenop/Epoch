// Full-screen "Done" overlay for finished timers: overtime counter, in-app sound, Stop / +1 min.

import { subscribe } from '../../core/ticker.js';
import { formatDuration } from '../../core/time.js';
import { startAlertLoop } from '../../core/audio.js';
import { esc } from '../../core/dom.js';
import { timerService } from './service.js';
import * as T from './model.js';
import { webSound } from './native.js';

let overlay = null;

export function showDone() {
  if (overlay) return;
  const el = document.createElement('div');
  el.className = 'done-overlay';
  el.setAttribute('role', 'alertdialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Timer finished');
  el.innerHTML = `<h2 class="done-title">Time's up</h2><ul class="done-list"></ul>
    <button class="btn btn-round btn-danger done-stop-all" aria-label="Stop all finished timers">Stop</button>`;
  document.body.append(el);
  const list = el.querySelector('.done-list');
  // On the phone the native timer alarm makes the sound; the page only shows the overtime.
  const stopSound = webSound() ? startAlertLoop() : () => {};
  if (webSound()) navigator.vibrate?.([400, 200, 400]);

  function render(timers) {
    const done = timers.filter((t) => t.state === 'done');
    if (!done.length) return close();
    list.innerHTML = done
      .map(
        (t) => `<li class="done-item" data-id="${esc(t.id)}">
          <span class="done-label">${esc(t.label || 'Timer')}</span>
          <span class="done-over digits" aria-label="Overtime"></span>
          <span class="done-actions">
            <button class="btn btn-secondary" data-act="plus" aria-label="Add 1 minute to ${esc(t.label || 'timer')}">+1 min</button>
            <button class="btn btn-danger" data-act="stop" aria-label="Stop ${esc(t.label || 'timer')}">Stop</button>
          </span></li>`,
      )
      .join('');
    tick(Date.now());
  }

  function tick(now) {
    const byId = new Map(timerService.list().map((t) => [t.id, t]));
    list.querySelectorAll('.done-item').forEach((li) => {
      const t = byId.get(li.dataset.id);
      if (t) li.querySelector('.done-over').textContent = formatDuration(T.remaining(t, now));
    });
  }

  el.addEventListener('click', (e) => {
    if (e.target.closest('.done-stop-all')) {
      timerService.list().filter((t) => t.state === 'done').forEach((t) => timerService.reset(t.id));
      return;
    }
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const id = btn.closest('[data-id]').dataset.id;
    if (btn.dataset.act === 'stop') timerService.reset(id);
    else timerService.addMinute(id);
  });

  const unsubList = timerService.subscribe(render);
  const unsubTick = subscribe(tick, { fps: 4 });

  function close() {
    stopSound();
    unsubList();
    unsubTick();
    el.remove();
    overlay = null;
  }

  overlay = { close };
  render(timerService.list());
  el.querySelector('.done-stop-all').focus();
}
