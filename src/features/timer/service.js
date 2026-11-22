// App-wide timer state. Runs on every tab (not only the Timer screen) so a finished timer
// alerts wherever you are. Every change is mirrored to a native alarm so it also rings when closed.

import { subscribe } from '../../core/ticker.js';
import { loadState, saveState } from '../../core/store.js';
import * as T from './model.js';
import { syncTimer, cancelNative, stoppedNatively, onNativeStopped } from './native.js';

let timers = T.sanitize(loadState('timers', []));
const listeners = new Set();
let onDone = () => {};
let unsubTick = null;

const persist = () => saveState('timers', timers);
const notify = () => listeners.forEach((fn) => fn(timers));

function check(now) {
  let changed = false;
  timers = timers.map((t) => {
    const next = T.settle(t, now);
    if (next !== t) changed = true;
    return next;
  });
  if (changed) {
    persist();
    notify();
  }
  if (timers.some((t) => t.state === 'done')) onDone(timers.filter((t) => t.state === 'done'));
  syncTicker();
}

let subscribing = false;

function syncTicker() {
  if (subscribing) return; // subscribe() calls check() at once; don't re-enter
  const needed = timers.some((t) => t.state === 'running');
  if (needed && !unsubTick) {
    subscribing = true;
    try {
      unsubTick = subscribe(check, { fps: 4 });
    } finally {
      subscribing = false;
    }
    if (!timers.some((t) => t.state === 'running')) syncTicker();
  }
  if (!needed && unsubTick) {
    unsubTick();
    unsubTick = null;
  }
}

function update(id, fn) {
  timers = timers.map((t) => (t.id === id ? fn(t) : t));
  persist();
  notify();
  check(Date.now());
  const t = timers.find((x) => x.id === id);
  if (t) syncTimer(t);
}

/** Finished timers that were already stopped on the native "Time's up" screen go back to idle. */
async function reconcile() {
  const ids = await stoppedNatively(timers.filter((t) => t.state === 'done'));
  if (!ids.length) return;
  timers = timers.map((t) => (ids.includes(t.id) ? T.reset(t) : t));
  persist();
  notify();
}

export const timerService = {
  list: () => timers,
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  /** Register the "timer finished" handler (the Done overlay) and run a first check. */
  init(doneHandler) {
    onDone = doneHandler;
    onNativeStopped((id) => {
      if (timers.some((t) => t.id === id && t.state === 'done')) update(id, T.reset);
    });
    reconcile().finally(() => check(Date.now()));
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => !document.hidden && reconcile());
    }
  },
  add(durationMs, label, { autostart = true } = {}) {
    let t = T.createTimer(durationMs, label);
    if (autostart) t = T.start(t);
    timers = [...timers, t];
    persist();
    notify();
    check(Date.now());
    syncTimer(t);
    return t;
  },
  start: (id) => update(id, (t) => T.start(t)),
  pause: (id) => update(id, (t) => T.pause(t)),
  reset: (id) => update(id, T.reset),
  addMinute: (id) => update(id, (t) => T.addMinute(t)),
  remove(id) {
    cancelNative(id);
    timers = timers.filter((t) => t.id !== id);
    persist();
    notify();
    check(Date.now());
  },
};
