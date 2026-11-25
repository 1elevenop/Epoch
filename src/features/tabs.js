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

import { tabIcon } from '../core/icons.js';

const ICONS = Object.fromEntries(['alarm', 'timer', 'stopwatch', 'focus', 'tools', 'audio'].map((n) => [n, tabIcon(n)]));

export const TABS = [
  { id: 'alarm', label: 'Alarm', icon: ICONS.alarm, render: alarmScreen },
  { id: 'timer', label: 'Timer', icon: ICONS.timer, render: timerScreen },
  { id: 'stopwatch', label: 'Stopwatch', icon: ICONS.stopwatch, render: stopwatchScreen },
  { id: 'focus', label: 'Focus', icon: ICONS.focus, render: focusHome },
  { id: 'tools', label: 'Tools', icon: ICONS.tools, render: toolsScreen },
  { id: 'audio', label: 'Audio Lab', icon: ICONS.audio, render: labScreen },
];

export const DEFAULT_TAB = 'alarm';

/** The tab to open when the URL names no screen. A saved tab that no longer exists (clock, more) falls back. */
export const homeTab = (last) => (TABS.some((t) => t.id === last) ? last : DEFAULT_TAB);

/** Screens reached by link, not by a tab. `tab` is the tab that stays highlighted. */
export const PAGES = [
  { id: 'reliability', tab: null, render: reliabilityScreen },
  { id: 'onboarding', tab: null, render: onboardingScreen, hideTabbar: true },
  { id: 'ring', tab: null, render: ringScreen, hideTabbar: true },
  { id: 'tasks', tab: 'focus', render: tasksScreen },
  { id: 'focus-setup', tab: 'focus', render: setupScreen },
  { id: 'focus-run', tab: 'focus', render: runScreen, hideTabbar: true },
  { id: 'focus-review', tab: 'focus', render: reviewScreen },
  { id: 'focus-stats', tab: 'focus', render: statsScreen },
  { id: 'settings', tab: null, render: settingsScreen },
  { id: 'log', tab: null, render: logScreen },
  { id: 'audio-metronome', tab: 'audio', render: metronomeScreen },
  { id: 'audio-tone', tab: 'audio', render: toneScreen },
  { id: 'audio-noise', tab: 'audio', render: noiseScreen },
  { id: 'audio-tuner', tab: 'audio', render: tunerScreen },
  { id: 'audio-binaural', tab: 'audio', render: binauralScreen },
  { id: 'tool-clock', tab: 'tools', render: clockScreen },
  { id: 'tool-interval', tab: 'tools', render: intervalScreen },
  { id: 'tool-breathing', tab: 'tools', render: breathingScreen },
  { id: 'tool-countdowns', tab: 'tools', render: countdownsScreen },
  { id: 'tool-chess', tab: 'tools', render: chessScreen, hideTabbar: true },
  { id: 'tool-speech', tab: 'tools', render: speechScreen },
];
