// Interval / HIIT timer (BLUEPRINT §6.7): work / rest / rounds / sets / rest between sets,
// Tabata preset, 3-2-1 beeps (+ optional voice), green work / red rest, saved presets.
// Beeps are scheduled on the audio clock from the known segment times (look-ahead), not from ticks.

import { subscribe } from '../../core/ticker.js';
import { loadState, saveState } from '../../core/store.js';
import { formatDuration } from '../../core/time.js';
import { keepAwake } from '../../core/screen.js';
import { getCtx, unlock, beepAt } from '../../core/audio.js';
import { esc } from '../../core/dom.js';
import * as M from './models.js';

const FIELDS = [
  ['work', 'Work (s)', 1, 3600],
  ['rest', 'Rest (s)', 0, 3600],
  ['rounds', 'Rounds', 1, 99],
  ['sets', 'Sets', 1, 20],
  ['setRest', 'Rest between sets (s)', 0, 3600],
  ['prep', 'Get ready (s)', 0, 60],
];
const KIND = { prep: 'Get ready', work: 'Work', rest: 'Rest', setRest: 'Set rest' };
const say = (text) => {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.1;
    globalThis.speechSynthesis?.speak(u);
  } catch {
    // no voice on this device: beeps only
  }
};

function loadAll() {
  const s = loadState('interval', {}) ?? {};
  return {
    plan: M.sanitizePlan(s.plan ?? M.TABATA),
    presets: (Array.isArray(s.presets) ? s.presets : []).slice(0, 20).map(M.sanitizePlan),
    voice: s.voice === true,
    run: M.sanitizeRun(s.run),
  };
}

export function intervalScreen(el) {
  let st = loadAll();
  const save = () => saveState('interval', st);
  let release = null;
  let scheduled = new Set(); // cue keys already sent to the audio clock
  let spoken = new Set();

  el.innerHTML = `
    <section class="screen tool" aria-labelledby="screen-title">
      <a class="back-link" href="#/tools" aria-label="Back to Tools">‹ Tools</a>
      <h1 id="screen-title">Interval timer</h1>
      <div id="setup">
        <div class="chips" id="presets" role="group" aria-label="Presets"></div>
        <form class="form plan-grid" id="f" novalidate>
          ${FIELDS.map(([k, l, lo, hi]) => `<label class="field">${l}<input class="input" type="number" inputmode="numeric" name="${k}" min="${lo}" max="${hi}" /></label>`).join('')}
        </form>
        <p class="muted" id="total"></p>
        <label class="check"><input type="checkbox" id="voice" /> Voice countdown (if the phone has a voice)</label>
        <div class="row"><input class="input grow" id="pname" maxlength="40" placeholder="Preset name" aria-label="Preset name" />
          <button class="btn btn-secondary" id="savep" aria-label="Save as preset">Save</button></div>
        <div class="bottom-actions"><button class="btn btn-round" id="start" aria-label="Start interval timer">Start</button></div>
      </div>
      <div id="live" class="iv-live" hidden>
        <p class="iv-kind" id="kind"></p>
        <p class="iv-time digits" id="time" role="timer"></p>
        <p class="iv-meta" id="meta"></p>
        <p class="iv-next muted" id="next"></p>
        <div class="bottom-actions">
          <button class="btn btn-round btn-secondary" id="stop" aria-label="Stop interval timer">Stop</button>
          <button class="btn btn-round" id="pause" aria-label="Pause">Pause</button>
        </div>
      </div>
    </section>`;
  const $ = (s) => el.querySelector(s);
  const form = $('#f');
  const section = el.querySelector('.tool');

  function fillForm() {
    for (const [k] of FIELDS) form[k].value = st.plan[k];
    $('#pname').value = st.plan.name === 'Custom' ? '' : st.plan.name;
    $('#voice').checked = st.voice;
    showTotal();
  }
  function readForm() {
    st.plan = M.sanitizePlan({ ...Object.fromEntries(FIELDS.map(([k]) => [k, form[k].value])), name: $('#pname').value || 'Custom' });
    save();
    showTotal();
  }
  function showTotal() {
    $('#total').textContent = `Total ${formatDuration(M.totalMs(M.segments(st.plan)))}`;
  }
  function drawPresets() {
    const all = [M.TABATA, ...st.presets];
    $('#presets').innerHTML = all
      .map((p, i) => `<button class="chip" data-p="${i}" aria-label="Load preset ${esc(p.name)}">${esc(p.name)}</button>${i ? `<button class="chip chip-x" data-del="${i - 1}" aria-label="Delete preset ${esc(p.name)}">×</button>` : ''}`)
      .join('');
  }

  $('#presets').addEventListener('click', (e) => {
    const p = e.target.closest('[data-p]');
    const d = e.target.closest('[data-del]');
    if (p) {
      st.plan = M.sanitizePlan([M.TABATA, ...st.presets][Number(p.dataset.p)]);
      save();
      fillForm();
    }
    if (d) {
      st.presets.splice(Number(d.dataset.del), 1);
      save();
      drawPresets();
    }
  });
  form.addEventListener('input', readForm);
  $('#voice').addEventListener('change', (e) => {
    st.voice = e.target.checked;
    save();
  });
  $('#savep').addEventListener('click', () => {
    readForm();
    const name = $('#pname').value.trim();
    if (!name) return $('#pname').focus();
    st.presets = [...st.presets.filter((p) => p.name !== name), { ...st.plan, name }].slice(-20);
    save();
    drawPresets();
  });

  function showMode() {
    const live = !!st.run;
    $('#setup').hidden = live;
    $('#live').hidden = !live;
    document.body.classList.toggle('no-tabbar', live);
    if (live && !release) release = keepAwake('interval');
    if (!live && release) {
      release();
      release = null;
    }
    if (!live) section.dataset.kind = '';
  }

  function start() {
    readForm();
    unlock();
    st.run = M.startRun();
    scheduled = new Set();
    spoken = new Set();
    save();
    showMode();
  }
  function stop() {
    st.run = null;
    save();
    showMode();
  }
  $('#start').addEventListener('click', start);
  $('#stop').addEventListener('click', stop);
  $('#pause').addEventListener('click', () => {
    st.run = M.isPaused(st.run) ? M.resumeRun(st.run) : M.pauseRun(st.run);
    scheduled = new Set(); // paused: re-plan beeps from the new timeline
    save();
  });

  // Beeps for cues in the next 0.6 s go onto the audio clock at their exact time.
  function scheduleCues(segs, ms) {
    const ctx = getCtx();
    if (!ctx || M.isPaused(st.run)) return;
    for (const c of M.cues(segs)) {
      const key = `${c.at}:${c.kind}`;
      if (c.at < ms - 50 || c.at > ms + 600 || scheduled.has(key)) continue;
      scheduled.add(key);
      const at = ctx.currentTime + Math.max(0, (c.at - ms) / 1000);
      if (c.kind === 'tick') beepAt(ctx, at, 880, 0.1, 0.3);
      else if (c.kind === 'go') beepAt(ctx, at, c.next === 'work' ? 1320 : 660, 0.45, 0.35);
      else for (let i = 0; i < 3; i++) beepAt(ctx, at + i * 0.3, 1320, 0.2, 0.35);
      if (st.voice && !spoken.has(key)) {
        spoken.add(key);
        const text = c.kind === 'tick' ? String(c.n) : c.kind === 'end' ? 'Done' : KIND[c.next];
        setTimeout(() => say(text), Math.max(0, c.at - ms));
      }
    }
  }

  const unsub = subscribe((now) => {
    if (!st.run) return;
    const segs = M.segments(st.plan);
    const ms = M.elapsed(st.run, now);
    const at = M.intervalAt(segs, ms);
    scheduleCues(segs, ms);
    if (at.done) {
      section.dataset.kind = 'done';
      $('#kind').textContent = 'Done';
      $('#time').textContent = formatDuration(M.totalMs(segs));
      $('#meta').textContent = `${st.plan.rounds * st.plan.sets} rounds`;
      $('#next').textContent = '';
      $('#pause').hidden = true;
      return;
    }
    $('#pause').hidden = false;
    const paused = M.isPaused(st.run);
    $('#pause').textContent = paused ? 'Resume' : 'Pause';
    $('#pause').setAttribute('aria-label', $('#pause').textContent);
    section.dataset.kind = at.seg.kind;
    $('#kind').textContent = `${KIND[at.seg.kind]}${paused ? ' · paused' : ''}`;
    $('#time').textContent = formatDuration(Math.ceil(at.remainingMs / 1000) * 1000);
    $('#meta').textContent = at.seg.kind === 'prep' ? '' : `Round ${at.seg.round}/${st.plan.rounds}${st.plan.sets > 1 ? ` · Set ${at.seg.set}/${st.plan.sets}` : ''}`;
    const nx = segs[at.index + 1];
    $('#next').textContent = nx ? `Next: ${KIND[nx.kind]} ${nx.secs} s` : 'Last round';
  }, { fps: 10 });

  fillForm();
  drawPresets();
  showMode();
  queueMicrotask(showMode); // the router sets the tab bar after render
  return () => {
    unsub();
    release?.();
    document.body.classList.remove('no-tabbar');
  };
}
