// Settings → Alarms & timers (BLUEPRINT §6.8): default snooze length and challenge for new
// alarms, and the sound finished timers play. The timer sound is mirrored to native, which rings
// timers while the app is closed (D2: native owns ringing).

import { esc } from '../../core/dom.js';
import { getSettings, setSetting } from '../../core/store.js';
import { AlarmPlugin } from '../../core/bridge.js';
import { SOUNDS, DEFAULT_CHALLENGES, SNOOZE_CHOICES } from '../alarm/model.js';
import { CHALLENGE_INFO } from '../challenges/rules.js';

const opt = (v, label, cur) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(label)}</option>`;

export function alarmDefaultsHtml(s = getSettings()) {
  return `
      <h2 class="section-title">Alarms &amp; timers</h2>
      <label class="field">Default snooze length (new alarms)
        <select class="input" data-ad="snooze">${SNOOZE_CHOICES.map((m) => opt(m, `${m} min`, s.defaultSnoozeMin)).join('')}</select></label>
      <label class="field">Default challenge (new alarms)
        <select class="input" data-ad="challenge">${DEFAULT_CHALLENGES.map((id) => opt(id, `${CHALLENGE_INFO[id].icon} ${CHALLENGE_INFO[id].name}`, s.defaultChallenge)).join('')}</select></label>
      <div class="row"><label class="field grow">Timer sound
        <select class="input" data-ad="timerSound">${SOUNDS.map((x) => opt(x.id, `${x.name} (${x.group.toLowerCase()})`, s.timerSound)).join('')}</select></label>
        <button type="button" class="btn btn-ghost" data-ad-act="preview" aria-label="Play the timer sound">▶ Play</button></div>
      <p class="muted" id="ad-msg" role="status"></p>`;
}

/** Copies the saved timer sound to native (after import, or if native lost it). */
export function syncTimerSound() {
  return AlarmPlugin.setTimerSound(getSettings().timerSound).catch((err) => console.warn('[settings] timer sound', err?.code ?? err));
}

/** Wires the section; returns a cleanup that stops a playing preview. */
export function bindAlarmDefaults(root) {
  const msg = root.querySelector('#ad-msg');
  let playing = false;
  const stop = () => {
    if (playing) AlarmPlugin.stopPreview().catch(() => {});
    playing = false;
  };
  root.addEventListener('change', async (e) => {
    const k = e.target.dataset.ad;
    if (!k) return;
    if (k === 'snooze') setSetting('defaultSnoozeMin', Number(e.target.value));
    if (k === 'challenge') setSetting('defaultChallenge', e.target.value);
    if (k === 'timerSound') {
      const prev = getSettings().timerSound;
      try {
        await AlarmPlugin.setTimerSound(e.target.value); // native first: if it refuses, nothing changes
        setSetting('timerSound', e.target.value);
        msg.textContent = '';
      } catch (err) {
        e.target.value = prev;
        msg.textContent = `Could not change the timer sound: ${err?.message ?? err}`;
      }
    }
  });
  root.addEventListener('click', (e) => {
    if (!e.target.closest('[data-ad-act=preview]')) return;
    stop();
    AlarmPlugin.previewSound(getSettings().timerSound, 0.6).then(() => (playing = true)).catch((err) => (msg.textContent = err?.message ?? String(err)));
  });
  return stop;
}
