// Noise screen (BLUEPRINT §6.6): white / pink / brown mix, master volume, sleep fade-out timer.
// The sleep timer is a timestamp (rule 2); the fade itself is scheduled on the audio clock.

import { subscribe } from '../../core/ticker.js';
import { loadState, saveState } from '../../core/store.js';
import { formatDuration } from '../../core/time.js';
import { clamp, NOISE_KINDS, DEFAULT_VOLUME } from './dsp.js';
import { createMixer } from './mixer.js';
import { header, seg, bindSeg, volumeField, bindVolume } from './ui.js';

const SLEEP = [[0, 'Off'], [15, '15 min'], [30, '30'], [60, '60'], [90, '90']];
const FADE_SECS = 60;
const LABEL = { white: 'White · bright hiss', pink: 'Pink · soft rain', brown: 'Brown · deep rumble' };

function sanitize(s) {
  const lv = s?.levels ?? {};
  return {
    levels: Object.fromEntries(NOISE_KINDS.map((k) => [k, clamp(Number(lv[k] ?? (k === 'pink' ? 1 : 0)) || 0, 0, 1)])),
    volume: clamp(Number(s?.volume ?? DEFAULT_VOLUME) || 0, 0, 1),
    sleepMin: SLEEP.some(([m]) => m === s?.sleepMin) ? s.sleepMin : 0,
  };
}

export function noiseScreen(el) {
  let st = sanitize(loadState('noise'));
  const save = () => saveState('noise', st);
  let mixer = null;
  let endAt = 0; // sleep timer end (ms timestamp), 0 = none

  el.innerHTML = `
    <section class="screen lab" aria-labelledby="screen-title">
      ${header('Noise')}
      ${NOISE_KINDS.map((k) => volumeField(`lv-${k}`, st.levels[k], LABEL[k])).join('')}
      ${volumeField('vol', st.volume, 'Master volume')}
      <p class="muted">Sleep fade-out</p>
      ${seg('sleep', SLEEP, st.sleepMin, 'Sleep fade-out timer')}
      <p class="met-bpm digits small" id="left" aria-live="off"></p>
      <div class="bottom-actions"><button class="btn btn-round" id="play" aria-label="Play noise">Play</button></div>
    </section>`;
  const $ = (s) => el.querySelector(s);

  function armSleep() {
    endAt = st.sleepMin && mixer ? Date.now() + st.sleepMin * 60_000 : 0;
    if (!mixer) return;
    if (endAt) mixer.scheduleFadeOut((endAt - Date.now()) / 1000, FADE_SECS, st.volume);
    else mixer.cancelFadeOut(st.volume);
  }

  function start() {
    mixer = createMixer(st.volume);
    if (!mixer) return;
    for (const k of NOISE_KINDS) mixer.setLevel(k, st.levels[k]);
    armSleep();
    setPlaying(true);
  }

  function stop() {
    mixer?.stop();
    mixer = null;
    endAt = 0;
    $('#left').textContent = '';
    setPlaying(false);
  }

  function setPlaying(on) {
    $('#play').textContent = on ? 'Stop' : 'Play';
    $('#play').setAttribute('aria-label', on ? 'Stop noise' : 'Play noise');
    $('#play').classList.toggle('btn-danger', on);
  }

  $('#play').addEventListener('click', () => (mixer ? stop() : start()));
  for (const k of NOISE_KINDS) {
    bindVolume(el, `lv-${k}`, (v) => {
      st.levels[k] = v;
      save();
      mixer?.setLevel(k, v);
    });
  }
  bindVolume(el, 'vol', (v) => {
    st.volume = v;
    save();
    if (!mixer) return;
    mixer.setVolume(v);
    if (endAt) mixer.scheduleFadeOut((endAt - Date.now()) / 1000, FADE_SECS, v);
  });
  bindSeg(el, 'sleep', (v) => {
    st.sleepMin = Number(v);
    save();
    armSleep();
  });

  const unsub = subscribe((now) => {
    if (!endAt) return;
    const left = endAt - now;
    if (left <= 0) return stop();
    $('#left').textContent = `Fades out in ${formatDuration(Math.ceil(left / 1000) * 1000)}`;
  }, { fps: 4 });

  return () => {
    stop();
    unsub();
  };
}
