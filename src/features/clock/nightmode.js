// Night mode: black screen, dim red digits, moved a few pixels every minute (burn-in protection),
// screen kept on. Tap anywhere to leave.

import { subscribe } from '../../core/ticker.js';
import { formatClock } from '../../core/time.js';
import { getSettings } from '../../core/store.js';
import { keepAwake } from '../../core/screen.js';

export function openNightMode() {
  const el = document.createElement('div');
  el.className = 'night';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Night mode. Tap to exit.');
  el.innerHTML = `<div class="night-time digits" aria-live="off"></div>
                  <div class="night-hint">Tap to exit</div>`;
  document.body.append(el);
  const timeEl = el.querySelector('.night-time');
  const hint = el.querySelector('.night-hint');
  setTimeout(() => hint.classList.add('fade'), 2500);

  const release = keepAwake('night');
  let lastMinute = -1;
  const unsub = subscribe(
    (t) => {
      const d = new Date(t);
      timeEl.textContent = formatClock(d, { hour12: getSettings().hour12 });
      if (d.getMinutes() !== lastMinute) {
        lastMinute = d.getMinutes();
        const dx = Math.round((Math.random() - 0.5) * 24);
        const dy = Math.round((Math.random() - 0.5) * 24);
        timeEl.style.transform = `translate(${dx}px, ${dy}px)`;
      }
    },
    { fps: 1 },
  );

  function close() {
    unsub();
    release();
    el.remove();
    window.removeEventListener('hashchange', close);
  }
  el.addEventListener('click', close);
  window.addEventListener('hashchange', close);
  return close;
}
