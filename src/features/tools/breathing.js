// Breathing timer (BLUEPRINT §6.7): box 4-4-4-4, 4-7-8, custom; animated circle; cycle count.

import { subscribe } from '../../core/ticker.js';
import { loadState, saveState } from '../../core/store.js';
import { keepAwake } from '../../core/screen.js';
import * as M from './models.js';

const STEP_LABELS = ['In', 'Hold', 'Out', 'Hold'];

function load() {
  const s = loadState('breathing', {}) ?? {};
  return {
    pattern: Object.hasOwn(M.BREATHING, s.pattern ?? '') || s.pattern === 'custom' ? s.pattern : 'box',
    custom: M.sanitizeSteps(s.custom ?? [4, 2, 6, 0]),
    cycles: M.clamp(Math.round(Number(s.cycles) || 6), 1, 50),
  };
}

export function breathingScreen(el) {
  let st = load();
  const save = () => saveState('breathing', st);
  let run = null;
  let release = null;
  const steps = () => (st.pattern === 'custom' ? st.custom : M.BREATHING[st.pattern].steps);

  el.innerHTML = `
    <section class="screen tool" aria-labelledby="screen-title">
      <a class="back-link" href="#/tools" aria-label="Back to Tools">‹ Tools</a>
      <h1 id="screen-title">Breathing</h1>
      <div class="seg" role="tablist" aria-label="Pattern" id="pat">
        ${[['box', 'Box'], ['478', '4-7-8'], ['custom', 'Custom']].map(([v, l]) => `<button class="seg-btn" role="tab" data-v="${v}" aria-selected="${v === st.pattern}">${l}</button>`).join('')}
      </div>
      <div class="plan-grid" id="custom">
        ${STEP_LABELS.map((l, i) => `<label class="field">${l} (s)<input class="input" type="number" inputmode="numeric" data-i="${i}" min="${i % 2 ? 0 : 1}" max="20" value="${st.custom[i]}" /></label>`).join('')}
      </div>
      <label class="field">Cycles<input class="input" type="number" inputmode="numeric" id="cycles" min="1" max="50" value="${st.cycles}" /></label>
      <div class="breath-wrap" aria-hidden="true"><div class="breath-circle" id="circle"></div></div>
      <p class="breath-label" id="label" aria-live="polite">Ready</p>
      <p class="muted center" id="count"></p>
      <div class="bottom-actions"><button class="btn btn-round" id="go" aria-label="Start breathing">Start</button></div>
    </section>`;
  const $ = (s) => el.querySelector(s);

  function showPattern() {
    $('#custom').hidden = st.pattern !== 'custom';
    for (const b of el.querySelectorAll('#pat [data-v]')) b.setAttribute('aria-selected', String(b.dataset.v === st.pattern));
    $('#count').textContent = `${steps().filter(Boolean).join('-')} · ${st.cycles} cycles`;
  }
  $('#pat').addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b || run) return;
    st.pattern = b.dataset.v;
    save();
    showPattern();
  });
  $('#custom').addEventListener('input', () => {
    st.custom = M.sanitizeSteps([...el.querySelectorAll('#custom [data-i]')].map((i) => i.value));
    save();
    showPattern();
  });
  $('#cycles').addEventListener('input', (e) => {
    st.cycles = M.clamp(Math.round(Number(e.target.value) || 1), 1, 50);
    save();
    showPattern();
  });

  function stop(done = false) {
    run = null;
    release?.();
    release = null;
    $('#go').textContent = done ? 'Again' : 'Start';
    $('#go').setAttribute('aria-label', 'Start breathing');
    $('#label').textContent = done ? 'Well done' : 'Ready';
    $('#circle').style.transform = 'scale(0.5)';
    showPattern();
  }
  $('#go').addEventListener('click', () => {
    if (run) return stop();
    run = M.startRun();
    release = keepAwake('breathing');
    $('#go').textContent = 'Stop';
    $('#go').setAttribute('aria-label', 'Stop breathing');
  });

  const unsub = subscribe((now) => {
    if (!run) return;
    const b = M.breathAt(steps(), M.elapsed(run, now));
    if (b.cycle >= st.cycles) return stop(true);
    $('#circle').style.transform = `scale(${b.scale.toFixed(3)})`;
    $('#label').textContent = `${b.name} · ${Math.ceil(b.stepRemainingMs / 1000)}`;
    $('#count').textContent = `Cycle ${b.cycle + 1} of ${st.cycles}`;
  }, { fps: 30 });

  stop();
  return () => {
    unsub();
    release?.();
  };
}
