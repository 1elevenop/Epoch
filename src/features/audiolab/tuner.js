// Tuner (BLUEPRINT §6.6): microphone → autocorrelation pitch → note + cents meter.
// The mic is never connected to the speakers. Android asks for RECORD_AUDIO on first use.

import { subscribe } from '../../core/ticker.js';
import { getCtx, unlock } from '../../core/audio.js';
import { detectPitch, noteFromFreq, smoothPitch } from './dsp.js';
import { header } from './ui.js';

const ERRORS = {
  NotAllowedError: 'Microphone permission denied. Allow it in Android Settings → Apps → Epoch → Permissions.',
  NotFoundError: 'No microphone found.',
  NotReadableError: 'The microphone is busy in another app.',
};

export function tunerScreen(el) {
  let mic = null; // { stream, src, analyser, buf }
  const recent = [];
  let a4 = 440;

  el.innerHTML = `
    <section class="screen lab" aria-labelledby="screen-title">
      ${header('Tuner')}
      <div class="tuner" aria-live="polite">
        <p class="tuner-note digits" id="note">—</p>
        <div class="tuner-meter" aria-hidden="true"><span class="tuner-zero"></span><span class="tuner-needle" id="needle"></span></div>
        <p class="muted center" id="detail">Tap Start and play a note</p>
      </div>
      <label class="field">A4 (Hz)<input class="input" type="number" id="a4" min="400" max="480" value="440" aria-label="Reference pitch A4 in hertz" /></label>
      <p class="form-error" id="err" role="alert"></p>
      <div class="bottom-actions"><button class="btn btn-round" id="go" aria-label="Start tuner">Start</button></div>
    </section>`;
  const $ = (s) => el.querySelector(s);

  async function start() {
    $('#err').textContent = '';
    const ctx = getCtx();
    if (!ctx || !navigator.mediaDevices?.getUserMedia) {
      $('#err').textContent = 'This device cannot record audio here.';
      return;
    }
    unlock();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      if (!el.isConnected) return stream.getTracks().forEach((t) => t.stop()); // left the screen meanwhile
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096; // ~93 ms at 44.1 kHz: enough periods for low E (82 Hz)
      src.connect(analyser);
      mic = { stream, src, analyser, buf: new Float32Array(analyser.fftSize), ctx };
      $('#go').textContent = 'Stop';
      $('#go').setAttribute('aria-label', 'Stop tuner');
      $('#detail').textContent = 'Listening…';
    } catch (err) {
      $('#err').textContent = ERRORS[err?.name] ?? `Microphone error: ${err?.message ?? err}`;
    }
  }

  function stop() {
    if (!mic) return;
    mic.src.disconnect();
    mic.stream.getTracks().forEach((t) => t.stop());
    mic = null;
    recent.length = 0;
    $('#go').textContent = 'Start';
    $('#go').setAttribute('aria-label', 'Start tuner');
    $('#note').textContent = '—';
    $('#detail').textContent = 'Tap Start and play a note';
    $('#needle').style.left = '';
    $('#needle').className = 'tuner-needle';
  }

  $('#go').addEventListener('click', () => (mic ? stop() : start()));
  $('#a4').addEventListener('change', (e) => {
    a4 = Math.min(480, Math.max(400, Number(e.target.value) || 440));
    e.target.value = a4;
  });

  const unsub = subscribe(() => {
    if (!mic) return;
    mic.analyser.getFloatTimeDomainData(mic.buf);
    const f = detectPitch(mic.buf, mic.ctx.sampleRate, { minHz: 40, maxHz: 1800 });
    const hz = smoothPitch(recent, f);
    const n = hz && noteFromFreq(hz, a4);
    if (!n) return;
    $('#note').textContent = `${n.name}${n.octave}`;
    $('#detail').textContent = `${hz.toFixed(1)} Hz · ${n.cents >= 0 ? '+' : ''}${n.cents} cents`;
    const needle = $('#needle');
    needle.style.left = `calc(${50 + n.cents}% - 4px)`; // track is 100 cents wide
    needle.className = `tuner-needle ${Math.abs(n.cents) <= 5 ? 'in-tune' : ''}`;
  }, { fps: 20 });

  return () => {
    stop();
    unsub();
  };
}
