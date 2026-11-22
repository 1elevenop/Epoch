// One shared animation loop. Subscribers get Date.now() and redraw from it (rule D7):
// the tick only decides *when* to repaint, never *what* the time is.

const subs = new Set();
let handle = null;

const hasRaf = typeof requestAnimationFrame === 'function';
const schedule = hasRaf ? (fn) => requestAnimationFrame(fn) : (fn) => setTimeout(fn, 16);
const cancel = hasRaf ? (h) => cancelAnimationFrame(h) : (h) => clearTimeout(h);

function loop() {
  handle = null;
  const t = Date.now();
  for (const sub of subs) {
    if (t - sub.last < sub.interval) continue;
    sub.last = t;
    try {
      sub.fn(t);
    } catch (err) {
      console.error('[ticker] subscriber failed', err);
    }
  }
  if (subs.size) handle = schedule(loop);
}

function start() {
  if (handle === null && subs.size) handle = schedule(loop);
}

function stop() {
  if (handle !== null) cancel(handle);
  handle = null;
}

/**
 * subscribe(fn, { fps }) → unsubscribe().
 * fps throttles calls (e.g. 1 for a clock, 30 for a stopwatch). fn is also called once right away.
 */
export function subscribe(fn, { fps = 60 } = {}) {
  const sub = { fn, interval: 1000 / fps, last: Date.now() };
  subs.add(sub);
  try {
    fn(sub.last);
  } catch (err) {
    console.error('[ticker] subscriber failed', err);
  }
  start();
  return () => {
    subs.delete(sub);
    if (!subs.size) stop();
  };
}

export const subscriberCount = () => subs.size;

// Pause while hidden; repaint immediately when visible again (times are recomputed, so nothing drifts).
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stop();
    } else {
      for (const sub of subs) sub.last = 0;
      start();
    }
  });
}
