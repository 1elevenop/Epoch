// Binaural beats (BLUEPRINT §6.6): left ear = carrier − beat/2, right ear = carrier + beat/2.

import { loadState, saveState } from '../../core/store.js';
import { clamp, DEFAULT_VOLUME } from './dsp.js';
import { output, fadeGain, setVolume, fadeOut } from './output.js';
import { header, seg, bindSeg, volumeField, bindVolume } from './ui.js';

const PRESETS = [['2', 'Delta 2'], ['6', 'Theta 6'], ['10', 'Alpha 10'], ['18', 'Beta 18']];

function sanitize(s) {
  return {
    carrier: clamp(Number(s?.carrier) || 200, 60, 1000),
    beat: clamp(Number(s?.beat) || 10, 0.5, 40),
    volume: clamp(Number(s?.volume ?? DEFAULT_VOLUME) || 0, 0, 1),
  };
}

export function binauralScreen(el) {
  let st = sanitize(loadState('binaural'));
  const save = () => saveState('binaural', st);
  let play = null; // { ctx, left, right, gain }

  el.innerHTML = `
    <section class="screen lab" aria-labelledby="screen-title">
      ${header('Binaural beats', 'Experimental — evidence for effects is weak.')}
      <p class="card lab-note" role="note">🎧 Headphones required: each ear gets a different tone.</p>
      <label class="field">Carrier <output id="c-out">${st.carrier} Hz</output>
        <input type="range" id="carrier" min="60" max="1000" step="1" value="${st.carrier}" aria-label="Carrier frequency in hertz" /></label>
      <label class="field">Beat <output id="b-out">${st.beat} Hz</output>
        <input type="range" id="beat" min="0.5" max="40" step="0.5" value="${st.beat}" aria-label="Beat frequency in hertz" /></label>
      ${seg('preset', PRESETS, String(st.beat), 'Beat presets')}
      <p class="muted center" id="ears"></p>
      ${volumeField('vol', st.volume)}
      <div class="bottom-actions"><button class="btn btn-round" id="play" aria-label="Play binaural beat">Play</button></div>
    </section>`;
  const $ = (s) => el.querySelector(s);

  function apply() {
    const l = st.carrier - st.beat / 2;
    const r = st.carrier + st.beat / 2;
    $('#c-out').textContent = `${st.carrier} Hz`;
    $('#b-out').textContent = `${st.beat} Hz`;
    $('#ears').textContent = `Left ${l} Hz · Right ${r} Hz`;
    if (play) {
      play.left.frequency.setTargetAtTime(l, play.ctx.currentTime, 0.02);
      play.right.frequency.setTargetAtTime(r, play.ctx.currentTime, 0.02);
    }
    save();
  }

  function start() {
    const o = output();
    if (!o) return;
    const { ctx } = o;
    const gain = fadeGain(ctx, st.volume);
    const merger = ctx.createChannelMerger(2);
    const left = ctx.createOscillator();
    const right = ctx.createOscillator();
    left.connect(merger, 0, 0);
    right.connect(merger, 0, 1);
    merger.connect(gain).connect(o.out);
    left.start();
    right.start();
    play = { ctx, left, right, gain };
    apply();
    setPlaying(true);
  }

  function stop() {
    if (!play) return;
    const p = play;
    play = null;
    fadeOut(p.ctx, p.gain, () => {
      p.left.stop();
      p.right.stop();
    });
    setPlaying(false);
  }

  function setPlaying(on) {
    $('#play').textContent = on ? 'Stop' : 'Play';
    $('#play').setAttribute('aria-label', on ? 'Stop binaural beat' : 'Play binaural beat');
    $('#play').classList.toggle('btn-danger', on);
  }

  $('#play').addEventListener('click', () => (play ? stop() : start()));
  $('#carrier').addEventListener('input', (e) => {
    st.carrier = Number(e.target.value);
    apply();
  });
  $('#beat').addEventListener('input', (e) => {
    st.beat = Number(e.target.value);
    apply();
  });
  bindSeg(el, 'preset', (v) => {
    st.beat = Number(v);
    $('#beat').value = st.beat;
    apply();
  });
  bindVolume(el, 'vol', (v) => {
    st.volume = v;
    save();
    if (play) setVolume(play.ctx, play.gain, v);
  });
  apply();

  return stop;
}
