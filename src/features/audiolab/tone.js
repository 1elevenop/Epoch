// Tone generator (BLUEPRINT §6.6): 4 waveforms, 20 Hz–20 kHz log slider + numeric input,
// fine ±1 Hz, note picker with adjustable A4, sweep (linear/log), 20 ms fades, limiter.

import { subscribe } from '../../core/ticker.js';
import { loadState, saveState } from '../../core/store.js';
import * as D from './dsp.js';
import { output, fadeGain, setVolume, fadeOut } from './output.js';
import { header, seg, bindSeg, volumeField, bindVolume } from './ui.js';

const WAVES = [['sine', 'Sine'], ['square', 'Square'], ['sawtooth', 'Saw'], ['triangle', 'Triangle']];
const NOTE_OPTIONS = Array.from({ length: 8 * 12 }, (_, i) => i + 24); // C1 … B8

function sanitize(s) {
  const n = (v, lo, hi, d) => D.clamp(Number.isFinite(Number(v)) ? Number(v) : d, lo, hi);
  return {
    freq: n(s?.freq, D.F_MIN, D.F_MAX, 440),
    wave: WAVES.some(([w]) => w === s?.wave) ? s.wave : 'sine',
    a4: n(s?.a4, 400, 480, 440),
    volume: n(s?.volume, 0, 1, D.DEFAULT_VOLUME),
    sweepStart: n(s?.sweepStart, D.F_MIN, D.F_MAX, 100),
    sweepEnd: n(s?.sweepEnd, D.F_MIN, D.F_MAX, 1000),
    sweepSecs: n(s?.sweepSecs, 1, 600, 10),
    sweepMode: s?.sweepMode === 'lin' ? 'lin' : 'log',
  };
}

const fmtHz = (f) => (f >= 1000 ? `${(f / 1000).toFixed(f >= 10000 ? 1 : 2)} kHz` : `${f.toFixed(f < 100 ? 1 : 0)} Hz`);

export function toneScreen(el) {
  let st = sanitize(loadState('tone'));
  const save = () => saveState('tone', st);
  let play = null; // { ctx, osc, gain, sweep: { at, dur, start, end, mode } | null }

  el.innerHTML = `
    <section class="screen lab" aria-labelledby="screen-title">
      ${header('Tone generator')}
      <p class="met-bpm digits"><output id="f-out" aria-live="polite"></output></p>
      <p class="muted center" id="f-note"></p>
      <input type="range" id="f-slider" min="0" max="1" step="0.0005" aria-label="Frequency (logarithmic)" />
      <div class="row lab-row">
        <button class="icon-btn" data-fine="-1" aria-label="1 hertz lower">−1</button>
        <input class="input" type="number" id="f-num" min="${D.F_MIN}" max="${D.F_MAX}" step="0.1" inputmode="decimal" aria-label="Frequency in hertz" />
        <button class="icon-btn" data-fine="1" aria-label="1 hertz higher">+1</button>
      </div>
      <div class="row lab-row">
        <label class="field grow">Note<select class="input" id="note" aria-label="Pick a note">
          <option value="">—</option>${NOTE_OPTIONS.map((m) => `<option value="${m}">${D.NOTE_NAMES[m % 12]}${Math.floor(m / 12) - 1}</option>`).join('')}</select></label>
        <label class="field">A4 (Hz)<input class="input" type="number" id="a4" min="400" max="480" step="1" value="${st.a4}" aria-label="Reference pitch A4 in hertz" /></label>
      </div>
      ${seg('wave', WAVES, st.wave, 'Waveform')}
      ${volumeField('vol', st.volume)}
      <p class="lab-warn" id="warn" role="alert"></p>
      <details class="card lab-sweep"><summary>Sweep</summary>
        <div class="plan-grid">
          <label class="field">Start (Hz)<input class="input" type="number" id="sw-start" min="20" max="20000" value="${st.sweepStart}" /></label>
          <label class="field">End (Hz)<input class="input" type="number" id="sw-end" min="20" max="20000" value="${st.sweepEnd}" /></label>
          <label class="field">Seconds<input class="input" type="number" id="sw-secs" min="1" max="600" value="${st.sweepSecs}" /></label>
        </div>
        ${seg('mode', [['log', 'Logarithmic'], ['lin', 'Linear']], st.sweepMode, 'Sweep curve')}
        <button class="btn btn-secondary" id="sweep" aria-label="Start sweep">Start sweep</button>
      </details>
      <div class="bottom-actions"><button class="btn btn-round" id="play" aria-label="Play tone">Play</button></div>
    </section>`;
  const $ = (s) => el.querySelector(s);

  function showFreq(f, fromSlider = false) {
    $('#f-out').textContent = fmtHz(f);
    const n = D.noteFromFreq(f, st.a4);
    $('#f-note').textContent = n ? `${n.name}${n.octave} ${n.cents >= 0 ? '+' : ''}${n.cents} ¢` : '';
    if (!fromSlider) $('#f-slider').value = D.freqToPos(f);
    if (document.activeElement !== $('#f-num')) $('#f-num').value = Math.round(f * 10) / 10;
    $('#warn').textContent = D.safetyWarning(f, st.volume);
  }

  function setFreq(f, fromSlider = false) {
    st.freq = D.clamp(f, D.F_MIN, D.F_MAX);
    save();
    if (play) {
      play.sweep = null;
      play.osc.frequency.cancelScheduledValues(play.ctx.currentTime);
      play.osc.frequency.setTargetAtTime(st.freq, play.ctx.currentTime, 0.01);
    }
    showFreq(st.freq, fromSlider);
  }

  function start(freq = st.freq) {
    const o = output();
    if (!o) return null;
    const osc = o.ctx.createOscillator();
    osc.type = st.wave;
    osc.frequency.value = freq;
    const gain = fadeGain(o.ctx, st.volume);
    osc.connect(gain).connect(o.out);
    osc.start();
    play = { ctx: o.ctx, osc, gain, sweep: null };
    setPlaying(true);
    return play;
  }

  function stop() {
    if (!play) return;
    const p = play;
    play = null;
    fadeOut(p.ctx, p.gain, () => p.osc.stop());
    setPlaying(false);
    showFreq(st.freq);
  }

  function setPlaying(on) {
    $('#play').textContent = on ? 'Stop' : 'Play';
    $('#play').setAttribute('aria-label', on ? 'Stop tone' : 'Play tone');
    $('#play').classList.toggle('btn-danger', on);
  }

  function startSweep() {
    const read = (id, lo, hi) => D.clamp(Number($(id).value) || lo, lo, hi);
    st.sweepStart = read('#sw-start', 20, 20000);
    st.sweepEnd = read('#sw-end', 20, 20000);
    st.sweepSecs = read('#sw-secs', 1, 600);
    save();
    stop();
    const p = start(st.sweepStart);
    if (!p) return;
    const at = p.ctx.currentTime;
    const f = p.osc.frequency;
    f.setValueAtTime(st.sweepStart, at);
    if (st.sweepMode === 'log') f.exponentialRampToValueAtTime(st.sweepEnd, at + st.sweepSecs);
    else f.linearRampToValueAtTime(st.sweepEnd, at + st.sweepSecs);
    p.sweep = { at, dur: st.sweepSecs, start: st.sweepStart, end: st.sweepEnd, mode: st.sweepMode };
  }

  $('#play').addEventListener('click', () => (play ? stop() : start()));
  $('#f-slider').addEventListener('input', (e) => setFreq(D.posToFreq(Number(e.target.value)), true));
  $('#f-num').addEventListener('change', (e) => setFreq(Number(e.target.value) || st.freq));
  for (const b of el.querySelectorAll('[data-fine]')) b.addEventListener('click', () => setFreq(Math.round(st.freq) + Number(b.dataset.fine)));
  $('#note').addEventListener('change', (e) => e.target.value && setFreq(D.freqFromMidi(Number(e.target.value), st.a4)));
  $('#a4').addEventListener('change', (e) => {
    st.a4 = D.clamp(Number(e.target.value) || 440, 400, 480);
    e.target.value = st.a4;
    save();
    const m = $('#note').value;
    if (m) setFreq(D.freqFromMidi(Number(m), st.a4));
    else showFreq(st.freq);
  });
  bindSeg(el, 'wave', (v) => {
    st.wave = v;
    save();
    if (play) play.osc.type = v;
  });
  bindSeg(el, 'mode', (v) => {
    st.sweepMode = v;
    save();
  });
  bindVolume(el, 'vol', (v) => {
    st.volume = v;
    save();
    if (play) setVolume(play.ctx, play.gain, v);
    $('#warn').textContent = D.safetyWarning(play?.sweep ? Math.max(play.sweep.start, play.sweep.end) : st.freq, v);
  });
  $('#sweep').addEventListener('click', startSweep);
  showFreq(st.freq);

  // During a sweep, show the frequency that is playing right now (computed from the audio clock).
  const unsub = subscribe(() => {
    if (!play?.sweep) return;
    const s = play.sweep;
    const t = play.ctx.currentTime - s.at;
    $('#f-out').textContent = fmtHz(D.sweepFreq(s.start, s.end, s.dur, t, s.mode));
    $('#warn').textContent = D.safetyWarning(Math.max(s.start, s.end), st.volume);
    if (t >= s.dur) {
      st.freq = s.end;
      save();
      play.sweep = null;
      showFreq(st.freq);
    }
  }, { fps: 15 });

  return () => {
    stop();
    unsub();
  };
}
