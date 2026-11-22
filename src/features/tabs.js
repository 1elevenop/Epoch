// Tab definitions and link-only pages (routes without a tab).

import { clockScreen } from './clock/clock.js';
import { stopwatchScreen } from './stopwatch/stopwatch.js';
import { timerScreen } from './timer/timer.js';
import { alarmScreen } from './alarm/alarm.js';
import { reliabilityScreen } from './settings/reliability.js';
import { onboardingScreen } from './settings/onboarding.js';
import { ringScreen } from '../ring/ring.js';
import { logScreen } from './alarm/log.js';
import { focusHome } from './focus/home.js';
import { settingsScreen } from './settings/settings.js';
import { tasksScreen } from './focus/tasks.js';
import { setupScreen } from './focus/setup.js';
import { runScreen } from './focus/run.js';
import { reviewScreen } from './focus/review.js';
import { statsScreen } from './focus/stats.js';
import { labScreen } from './audiolab/lab.js';
import { metronomeScreen } from './audiolab/metronome.js';
import { toneScreen } from './audiolab/tone.js';
import { noiseScreen } from './audiolab/noise.js';
import { tunerScreen } from './audiolab/tuner.js';
import { binauralScreen } from './audiolab/binaural.js';
import { toolsScreen } from './tools/hub.js';
import { intervalScreen } from './tools/interval.js';
import { breathingScreen } from './tools/breathing.js';
import { countdownsScreen } from './tools/countdowns.js';
import { chessScreen } from './tools/chess.js';
import { speechScreen } from './tools/speech.js';

const icon = (paths) => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;

const ICONS = {
  clock: icon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  alarm: icon('<circle cx="12" cy="13" r="7"/><path d="M12 10v3l2 1.5M5 4 2.5 6.5M19 4l2.5 2.5"/>'),
  timer: icon('<circle cx="12" cy="14" r="7"/><path d="M12 14V10M10 3h4"/>'),
  stopwatch: icon('<circle cx="12" cy="14" r="7"/><path d="M12 14l3-3M12 3v4M17.5 6.5l1.5-1.5"/>'),
  focus: icon('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.8"/>'),
  more: icon('<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>'),
};

function moreScreen(el) {
  el.innerHTML = `
    <section class="screen" aria-labelledby="screen-title">
      <h1 id="screen-title">More</h1>
      <ul class="list">
        <li><a class="list-item link" href="#/audio"><span>Audio Lab</span><span>Metronome, tone, noise, tuner ›</span></a></li>
        <li><a class="list-item link" href="#/tools"><span>Tools</span><span>Interval, breathing, countdowns ›</span></a></li>
        <li><a class="list-item link" href="#/settings"><span>Settings</span><span>Themes & big display ›</span></a></li>
        <li><a class="list-item link" href="#/reliability"><span>Reliability</span><span>Permissions & battery ›</span></a></li>
        <li><a class="list-item link" href="#/focus-stats"><span>Focus stats</span><span>Minutes & streak ›</span></a></li>
        <li><a class="list-item link" href="#/log"><span>Alarm log</span><span>Snoozes & wake-ups ›</span></a></li>
        <li><a class="list-item link" href="#/onboarding"><span>Setup guide</span><span>Run again ›</span></a></li>
      </ul>
    </section>`;
}

export const TABS = [
  { id: 'clock', label: 'Clock', icon: ICONS.clock, render: clockScreen },
  { id: 'alarm', label: 'Alarm', icon: ICONS.alarm, render: alarmScreen },
  { id: 'timer', label: 'Timer', icon: ICONS.timer, render: timerScreen },
  { id: 'stopwatch', label: 'Stopwatch', icon: ICONS.stopwatch, render: stopwatchScreen },
  { id: 'focus', label: 'Focus', icon: ICONS.focus, render: focusHome },
  { id: 'more', label: 'More', icon: ICONS.more, render: moreScreen },
];

/** Screens reached by link, not by a tab. `tab` is the tab that stays highlighted. */
export const PAGES = [
  { id: 'reliability', tab: 'more', render: reliabilityScreen },
  { id: 'onboarding', tab: null, render: onboardingScreen, hideTabbar: true },
  { id: 'ring', tab: null, render: ringScreen, hideTabbar: true },
  { id: 'tasks', tab: 'focus', render: tasksScreen },
  { id: 'focus-setup', tab: 'focus', render: setupScreen },
  { id: 'focus-run', tab: 'focus', render: runScreen, hideTabbar: true },
  { id: 'focus-review', tab: 'focus', render: reviewScreen },
  { id: 'focus-stats', tab: 'focus', render: statsScreen },
  { id: 'settings', tab: 'more', render: settingsScreen },
  { id: 'log', tab: 'more', render: logScreen },
  { id: 'audio', tab: 'more', render: labScreen },
  { id: 'audio-metronome', tab: 'more', render: metronomeScreen },
  { id: 'audio-tone', tab: 'more', render: toneScreen },
  { id: 'audio-noise', tab: 'more', render: noiseScreen },
  { id: 'audio-tuner', tab: 'more', render: tunerScreen },
  { id: 'audio-binaural', tab: 'more', render: binauralScreen },
  { id: 'tools', tab: 'more', render: toolsScreen },
  { id: 'tool-interval', tab: 'more', render: intervalScreen },
  { id: 'tool-breathing', tab: 'more', render: breathingScreen },
  { id: 'tool-countdowns', tab: 'more', render: countdownsScreen },
  { id: 'tool-chess', tab: 'more', render: chessScreen, hideTabbar: true },
  { id: 'tool-speech', tab: 'more', render: speechScreen },
];
