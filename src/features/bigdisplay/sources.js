// What the big display shows for each screen. Pure functions of (state, now) — unit tested.

import { formatDuration, formatStopwatch } from '../../core/time.js';
import * as T from '../timer/model.js';
import * as SW from '../stopwatch/model.js';
import * as E from '../focus/engine.js';

const ceilSec = (ms) => (ms > 0 ? Math.ceil(ms / 1000) * 1000 : ms);

/** The timer that matters most: finished (overtime) first, then the one ending soonest, then paused. */
export function pickTimer(timers, now) {
  const done = timers.filter((t) => t.state === 'done').sort((a, b) => a.endAt - b.endAt)[0];
  if (done) return done;
  const running = timers.filter((t) => t.state === 'running').sort((a, b) => a.endAt - b.endAt)[0];
  return running ?? timers.find((t) => t.state === 'paused') ?? null;
}

export function timerView(timers, now) {
  const t = pickTimer(timers, now);
  if (!t) return { text: '00:00', label: 'No timer running', progress: null, over: false };
  const rem = T.remaining(t, now);
  const others = timers.filter((x) => x !== t && (x.state === 'running' || x.state === 'done')).length;
  return {
    text: formatDuration(ceilSec(rem)),
    label: `${t.label || 'Timer'}${t.state === 'paused' ? ' · paused' : ''}${t.state === 'done' ? " · time's up" : ''}${others ? ` · +${others} more` : ''}`,
    progress: T.progress(t, now),
    over: t.state === 'done',
  };
}

export function stopwatchView(sw, now) {
  const text = formatStopwatch(SW.elapsed(sw, now));
  return {
    text,
    label: `${SW.isRunning(sw) ? 'Stopwatch' : 'Stopwatch · paused'}${sw.laps.length ? ` · lap ${sw.laps.length + 1}` : ''}`,
    progress: null,
    over: false,
    fastFrom: text.length - 2, // hundredths change 30×/s: light swap only
  };
}

const KIND = { focus: 'Focus', break: 'Break', long_break: 'Long break' };

export function focusView(state, now) {
  const cur = state && E.current(state.run, now);
  if (!cur) return { text: '00:00', label: 'No session', progress: null, over: false };
  const paused = E.isPaused(state.run);
  return {
    text: formatDuration(cur.over ? 0 : ceilSec(cur.remainingMs)),
    label: `${KIND[cur.kind]}${cur.kind === 'focus' ? ` · ${cur.focusNumber} of ${state.run.plan.cycles}` : ''}${paused ? ' · paused' : ''}${cur.over ? ' · done' : ''}`,
    progress: cur.progress,
    over: false,
  };
}
