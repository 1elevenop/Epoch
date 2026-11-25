// Speech timer (BLUEPRINT §6.7): counts up; green → yellow → red at set times, then overtime.

import { subscribe } from '../../core/ticker.js';
import { loadState, saveState } from '../../core/store.js';
import { formatDuration } from '../../core/time.js';
import { keepAwake } from '../../core/screen.js';
import { getCtx, unlock, beepAt } from '../../core/audio.js';
import * as M from './models.js';

function load() {
  const s = loadState('speech', {}) ?? {};
  const yellow = M.clamp(Math.round(Number(s.yellow) || 5), 1, 180);
  return { yellow, red: M.clamp(Math.round(Number(s.red) || 7), yellow + 1, 181), run: M.sanitizeRun(s.run) };
}

export function speechScreen(el) {
  let st = load();
  const save = () => saveState('speech', st);
  let release = null;
  let lastColor = null;

  el.innerHTML = `
    <section class="screen tool speech" aria-labelledby="screen-title">
      <a class="back-link" href="#/tools" aria-label="Back to Tools">Tools</a>
      <h1 id="screen-title">Speech timer</h1>
      <div class="plan-grid" id="cfg">
        <label class="field">Yellow at (min)<input class="input" type="number" inputmode="numeric" id="yellow" min="1" max="180" value="${st.yellow}" /></label>
        <label class="field">Red at (min)<input class="input" type="number" inputmode="numeric" id="red" min="2" max="181" value="${st.red}" /></label>
      </div>
      <p class="speech-time digits" id="time" role="timer">0:00</p>
      <p class="speech-note" id="note" aria-live="polite"></p>
      <div class="bottom-actions">
        <button class="btn btn-round btn-secondary" id="reset" aria-label="Reset">Reset</button>
        <button class="btn btn-round" id="go" aria-label="Start">Start</button>
      </div>
    </section>`;
  const $ = (s) => el.querySelector(s);
  const section = el.querySelector('.speech');

  const readCfg = () => {
    st.yellow = M.clamp(Math.round(Number($('#yellow').value) || 5), 1, 180);
    st.red = M.clamp(Math.round(Number($('#red').value) || st.yellow + 1), st.yellow + 1, 181);
    save();
  };
  $('#cfg').addEventListener('change', () => {
    readCfg();
    $('#red').value = st.red;
  });

  function buttons() {
    const running = st.run && !M.isPaused(st.run);
    $('#go').textContent = running ? 'Pause' : st.run ? 'Resume' : 'Start';
    $('#go').setAttribute('aria-label', $('#go').textContent);
    $('#cfg').hidden = !!st.run;
    if (st.run && !release) release = keepAwake('speech');
    if (!st.run && release) {
      release();
      release = null;
    }
  }
  $('#go').addEventListener('click', () => {
    unlock();
    readCfg();
    st.run = !st.run ? M.startRun() : M.isPaused(st.run) ? M.resumeRun(st.run) : M.pauseRun(st.run);
    save();
    buttons();
  });
  $('#reset').addEventListener('click', () => {
    st.run = null;
    lastColor = null;
    save();
    buttons();
  });

  const unsub = subscribe((now) => {
    const ms = M.elapsed(st.run, now);
    const color = st.run ? M.speechColor(ms, st.yellow, st.red) : '';
    section.dataset.color = color;
    $('#time').textContent = formatDuration(Math.floor(ms / 1000) * 1000);
    const over = ms - st.red * 60_000;
    $('#note').textContent = !st.run ? `Green until ${st.yellow} min, yellow until ${st.red} min` : over > 0 ? `Over by ${formatDuration(Math.floor(over / 1000) * 1000)}` : color === 'yellow' ? 'Start wrapping up' : '';
    if (lastColor && color !== lastColor && color && !M.isPaused(st.run)) {
      const ctx = getCtx();
      if (ctx) beepAt(ctx, ctx.currentTime + 0.02, color === 'red' ? 660 : 990, 0.3, 0.3);
    }
    lastColor = color;
  }, { fps: 5 });

  buttons();
  return () => {
    unsub();
    release?.();
  };
}
