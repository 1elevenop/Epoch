// Stopwatch tab: display at 30 fps, laps with split + total, fastest green / slowest red, copy laps.

import { subscribe } from '../../core/ticker.js';
import { formatStopwatch } from '../../core/time.js';
import { loadState, saveState } from '../../core/store.js';
import * as SW from './model.js';
import { setBigSource, bigButton } from '../bigdisplay/bigdisplay.js';
import { stopwatchView } from '../bigdisplay/sources.js';

let sw = SW.sanitize(loadState('stopwatch'));

function commit(next) {
  sw = next;
  saveState('stopwatch', sw);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export function stopwatchScreen(el) {
  el.innerHTML = `
    <section class="screen sw" aria-labelledby="screen-title">
      <div class="screen-head"><h1 id="screen-title" class="sr-only">Stopwatch</h1><span></span>${bigButton('Big display for the stopwatch')}</div>
      <p class="sw-time digits" id="sw-time" role="timer" aria-live="off"></p>
      <div class="lap-head" id="lap-head" hidden>
        <span>Lap</span><span>Split</span><span>Total</span>
      </div>
      <ol class="laps" id="laps" aria-label="Laps"></ol>
      <div class="bottom-actions">
        <button class="btn btn-round btn-secondary" id="sw-left"></button>
        <button class="btn btn-ghost" id="sw-copy" aria-label="Copy laps as text">Copy laps</button>
        <button class="btn btn-round" id="sw-right"></button>
      </div>
    </section>`;

  const timeEl = el.querySelector('#sw-time');
  const lapsEl = el.querySelector('#laps');
  const lapHead = el.querySelector('#lap-head');
  const left = el.querySelector('#sw-left');
  const right = el.querySelector('#sw-right');
  const copyBtn = el.querySelector('#sw-copy');

  function renderButtons() {
    const running = SW.isRunning(sw);
    const idle = !running && SW.elapsed(sw) === 0;
    right.textContent = running ? 'Pause' : idle ? 'Start' : 'Resume';
    right.classList.toggle('btn-danger', running);
    left.textContent = running ? 'Lap' : 'Reset';
    left.disabled = idle;
    copyBtn.hidden = sw.laps.length === 0;
    for (const b of [left, right]) b.setAttribute('aria-label', b.textContent);
  }

  // The running lap (current, not yet recorded) shows as the top row.
  function renderLaps(now = Date.now()) {
    const { fastest, slowest } = SW.extremes(sw.laps);
    const rows = sw.laps.map((l, i) => {
      const cls = i === fastest ? 'fast' : i === slowest ? 'slow' : '';
      return `<li class="lap ${cls}"><span>${i + 1}</span><span class="digits">${formatStopwatch(l.splitMs)}</span>
        <span class="digits">${formatStopwatch(l.totalMs)}</span></li>`;
    });
    if (sw.laps.length) {
      const total = SW.elapsed(sw, now);
      const prev = sw.laps[sw.laps.length - 1].totalMs;
      rows.push(`<li class="lap current"><span>${sw.laps.length + 1}</span><span class="digits" id="cur-split">${formatStopwatch(total - prev)}</span>
        <span class="digits" id="cur-total">${formatStopwatch(total)}</span></li>`);
    }
    lapsEl.innerHTML = rows.reverse().join('');
    lapHead.hidden = sw.laps.length === 0;
  }

  left.addEventListener('click', () => {
    commit(SW.isRunning(sw) ? SW.lap(sw) : SW.reset());
    renderButtons();
    renderLaps();
  });
  right.addEventListener('click', () => {
    commit(SW.isRunning(sw) ? SW.pause(sw) : SW.start(sw));
    renderButtons();
  });
  copyBtn.addEventListener('click', async () => {
    const ok = await copyText(SW.lapsText(sw.laps));
    copyBtn.textContent = ok ? 'Copied' : 'Copy failed';
    setTimeout(() => (copyBtn.textContent = 'Copy laps'), 1500);
  });

  renderButtons();
  renderLaps();

  setBigSource({ kind: 'stopwatch', read: (now) => stopwatchView(sw, now) });
  const unsub = subscribe(
    (t) => {
      const total = SW.elapsed(sw, t);
      timeEl.textContent = formatStopwatch(total);
      if (sw.laps.length) {
        const prev = sw.laps[sw.laps.length - 1].totalMs;
        const split = el.querySelector('#cur-split');
        if (split) split.textContent = formatStopwatch(total - prev);
        const tot = el.querySelector('#cur-total');
        if (tot) tot.textContent = formatStopwatch(total);
      }
    },
    { fps: 30 },
  );
  return () => {
    setBigSource(null);
    unsub();
  };
}
