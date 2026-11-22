// Metronome (BLUEPRINT §6.6). Look-ahead scheduler: a 25 ms JS loop schedules clicks 100 ms
// ahead on the audio clock (ctx.currentTime). Sounds are never triggered from the JS timer itself.

import { subscribe } from '../../core/ticker.js';
import { loadState, saveState } from '../../core/store.js';
import { createClock, tapTempo, clamp, SIGNATURES, SUBDIVISIONS, BPM_MIN, BPM_MAX, DEFAULT_VOLUME, volumeToGain } from './dsp.js';
import { output } from './output.js';
import { header, seg, bindSeg, volumeField, bindVolume } from './ui.js';

const CLICK = { accent: [1600, 1], mid: [1250, 0.8], beat: [1000, 0.7], sub: [750, 0.4] };

function sanitize(s) {
  return {
    bpm: clamp(Math.round(Number(s?.bpm) || 100), BPM_MIN, BPM_MAX),
    sig: s?.sig in SIGNATURES ? s.sig : '4/4',
    subdiv: s?.subdiv in SUBDIVISIONS ? s.subdiv : 'none',
    volume: clamp(Number(s?.volume ?? DEFAULT_VOLUME) || 0, 0, 1),
  };
}

function click(ctx, dest, time, level, volume) {
  const [freq, amp] = CLICK[level];
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.frequency.value = freq;
  const peak = Math.max(0.0001, volumeToGain(volume) * 2 * amp);
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(peak, time + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);
  osc.connect(g).connect(dest);
  osc.start(time);
  osc.stop(time + 0.05);
}

export function metronomeScreen(el) {
  let st = sanitize(loadState('metronome'));
  const save = () => saveState('metronome', st);
  let run = null; // { clock, timer, ctx, out }
  const pulses = []; // { time, n, level } waiting to be drawn
  const taps = [];

  el.innerHTML = `
    <section class="screen lab" aria-labelledby="screen-title">
      ${header('Metronome')}
      <div class="met-dots" id="dots" aria-hidden="true"></div>
      <p class="met-bpm digits"><output id="bpm-out" aria-live="polite">${st.bpm}</output> <span class="muted">BPM</span></p>
      <div class="row lab-row">
        <button class="icon-btn" data-step="-1" aria-label="1 BPM slower">−</button>
        <input type="range" id="bpm" min="${BPM_MIN}" max="${BPM_MAX}" step="1" value="${st.bpm}" aria-label="Tempo in BPM" />
        <button class="icon-btn" data-step="1" aria-label="1 BPM faster">+</button>
      </div>
      ${seg('sig', Object.keys(SIGNATURES).map((s) => [s, s]), st.sig, 'Time signature')}
      ${seg('subdiv', [['none', '♩'], ['eighths', '♫'], ['triplets', '3'], ['sixteenths', '16']], st.subdiv, 'Subdivision')}
      ${volumeField('vol', st.volume)}
      <div class="bottom-actions">
        <button class="btn btn-round btn-secondary" id="tap" aria-label="Tap tempo">Tap</button>
        <button class="btn btn-round" id="play" aria-label="Start metronome">Start</button>
      </div>
    </section>`;
  const $ = (s) => el.querySelector(s);
  const playBtn = $('#play');

  function drawDots() {
    $('#dots').innerHTML = Array.from({ length: SIGNATURES[st.sig].beats }, (_, i) => `<span class="met-dot" data-i="${i}"></span>`).join('');
  }

  function setBpm(v) {
    st.bpm = clamp(Math.round(v), BPM_MIN, BPM_MAX);
    $('#bpm').value = st.bpm;
    $('#bpm-out').textContent = st.bpm;
    run?.clock.set({ bpm: st.bpm });
    save();
  }

  function start() {
    const o = output();
    if (!o) return;
    const subdiv = SUBDIVISIONS[st.subdiv];
    const clock = createClock({ bpm: st.bpm, sig: st.sig, subdiv, startAt: o.ctx.currentTime + 0.06 });
    const pump = () => {
      for (const t of clock.pump(o.ctx.currentTime)) {
        click(o.ctx, o.out, t.time, t.level, st.volume);
        if (t.level !== 'sub') pulses.push({ ...t, beat: Math.floor(t.n / SUBDIVISIONS[st.subdiv]) % SIGNATURES[st.sig].beats });
      }
    };
    pump();
    run = { clock, timer: setInterval(pump, 25), ...o };
    playBtn.textContent = 'Stop';
    playBtn.setAttribute('aria-label', 'Stop metronome');
    playBtn.classList.add('btn-danger');
  }

  function stop() {
    if (!run) return;
    clearInterval(run.timer);
    run = null;
    pulses.length = 0;
    playBtn.textContent = 'Start';
    playBtn.setAttribute('aria-label', 'Start metronome');
    playBtn.classList.remove('btn-danger');
    for (const d of el.querySelectorAll('.met-dot')) d.className = 'met-dot';
  }

  playBtn.addEventListener('click', () => (run ? stop() : start()));
  $('#bpm').addEventListener('input', (e) => setBpm(Number(e.target.value)));
  for (const b of el.querySelectorAll('[data-step]')) b.addEventListener('click', () => setBpm(st.bpm + Number(b.dataset.step)));
  $('#tap').addEventListener('click', () => {
    taps.push(performance.now());
    if (taps.length > 8) taps.shift();
    const bpm = tapTempo(taps);
    if (bpm) setBpm(bpm);
  });
  bindSeg(el, 'sig', (v) => {
    st.sig = v;
    save();
    drawDots();
    run?.clock.set({ sig: v });
  });
  bindSeg(el, 'subdiv', (v) => {
    st.subdiv = v;
    save();
    run?.clock.set({ subdiv: SUBDIVISIONS[v] });
  });
  bindVolume(el, 'vol', (v) => {
    st.volume = v;
    save();
  });
  drawDots();

  // Visual pulse: light the dot whose click time has passed on the audio clock.
  const unsub = subscribe(() => {
    if (!run) return;
    const now = run.ctx.currentTime;
    let hit = null;
    while (pulses.length && pulses[0].time <= now) hit = pulses.shift();
    if (!hit) return;
    for (const d of el.querySelectorAll('.met-dot')) {
      const on = Number(d.dataset.i) === hit.beat;
      d.className = `met-dot${on ? ` on ${hit.level}` : ''}`;
    }
  });

  return () => {
    stop();
    unsub();
  };
}
