// Clock tab: digital or analog face, date, next alarm, world clocks, night mode.

import { subscribe } from '../../core/ticker.js';
import { formatClock, ampm, formatUntil } from '../../core/time.js';
import { getSettings, setSetting } from '../../core/store.js';
import { AlarmPlugin } from '../../core/bridge.js';
import { createAnalog } from './analog.js';
import { mountWorldClocks } from './worldclocks.js';
import { mountCountdownCards } from '../tools/countdowns.js';
import { openNightMode } from './nightmode.js';

export function clockScreen(el) {
  el.innerHTML = `
    <section class="screen" aria-labelledby="screen-title">
      <h1 id="screen-title" class="sr-only">Clock</h1>
      <div class="toolbar">
        <button class="btn btn-ghost" id="face-toggle"></button>
        <button class="btn btn-ghost" id="sec-toggle"></button>
        <button class="btn btn-ghost" id="night" aria-label="Night mode">☾ Night</button>
      </div>
      <div id="face" class="face-host"></div>
      <p class="sub" id="today"></p>
      <p class="sub next-alarm" id="next-alarm"></p>
      <div id="countdowns"></div>
      <div id="world"></div>
    </section>`;

  const faceHost = el.querySelector('#face');
  const dateEl = el.querySelector('#today');
  const nextEl = el.querySelector('#next-alarm');
  const faceBtn = el.querySelector('#face-toggle');
  const secBtn = el.querySelector('#sec-toggle');
  const dateFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const updateWorld = mountWorldClocks(el.querySelector('#world'));
  const drawCountdowns = mountCountdownCards(el.querySelector('#countdowns'));
  let cdDay = new Date().toDateString();

  let unsubFace = null;
  let closeNight = null;
  let nextAlarmAt = null;

  function mountFace() {
    unsubFace?.();
    const { clockFace, showSeconds } = getSettings();
    faceBtn.textContent = clockFace === 'analog' ? 'Digital' : 'Analog';
    faceBtn.setAttribute('aria-label', `Switch to ${faceBtn.textContent.toLowerCase()} face`);
    secBtn.hidden = clockFace === 'analog';
    secBtn.textContent = showSeconds ? 'Hide seconds' : 'Show seconds';

    if (clockFace === 'analog') {
      const update = createAnalog(faceHost);
      unsubFace = subscribe(update, { fps: 60 });
    } else {
      faceHost.innerHTML = `<p class="big-time digits" aria-label="Current time"><span id="now"></span><span id="ampm" class="ampm"></span></p>`;
      const timeEl = faceHost.querySelector('#now');
      const ampmEl = faceHost.querySelector('#ampm');
      unsubFace = subscribe(
        (t) => {
          const d = new Date(t);
          const { hour12 } = getSettings();
          timeEl.textContent = formatClock(d, { seconds: showSeconds, hour12 });
          ampmEl.textContent = hour12 ? ampm(d.getHours()) : '';
        },
        { fps: 4 },
      );
    }
  }

  async function loadNextAlarm() {
    try {
      const alarms = await AlarmPlugin.listAlarms();
      const times = alarms.filter((a) => a.enabled && a.nextTriggerAt).map((a) => a.nextTriggerAt);
      nextAlarmAt = times.length ? Math.min(...times) : null;
    } catch (err) {
      console.warn('[clock] could not read alarms', err);
      nextAlarmAt = null;
    }
  }

  const unsubSlow = subscribe(
    (t) => {
      dateEl.textContent = dateFmt.format(t);
      nextEl.textContent = nextAlarmAt && nextAlarmAt > t ? `⏰ Alarm in ${formatUntil(nextAlarmAt - t)}` : 'No alarms set';
      updateWorld(t);
      const day = new Date(t).toDateString();
      if (day !== cdDay) {
        cdDay = day; // "47 days" changes at midnight
        drawCountdowns(t);
      }
    },
    { fps: 2 },
  );

  faceBtn.addEventListener('click', () => {
    setSetting('clockFace', getSettings().clockFace === 'analog' ? 'digital' : 'analog');
    mountFace();
  });
  secBtn.addEventListener('click', () => {
    setSetting('showSeconds', !getSettings().showSeconds);
    mountFace();
  });
  el.querySelector('#night').addEventListener('click', () => {
    closeNight = openNightMode();
  });

  let listener = null;
  let alive = true;
  AlarmPlugin.addListener('alarmsChanged', loadNextAlarm).then((l) => (alive ? (listener = l) : l.remove()));
  loadNextAlarm();
  mountFace();

  return () => {
    alive = false;
    unsubFace?.();
    unsubSlow();
    closeNight?.();
    listener?.remove();
  };
}
