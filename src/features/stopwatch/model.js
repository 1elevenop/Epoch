// Stopwatch model (BLUEPRINT §6.4): { startedAt|null, accumulatedMs, laps: [{ totalMs, splitMs }] }.
// Pure functions; elapsed time is always computed from timestamps.

import { formatStopwatch } from '../../core/time.js';

export const createStopwatch = () => ({ startedAt: null, accumulatedMs: 0, laps: [] });

export const isRunning = (sw) => sw.startedAt !== null;

export const elapsed = (sw, now = Date.now()) =>
  sw.accumulatedMs + (sw.startedAt !== null ? Math.max(0, now - sw.startedAt) : 0);

export function start(sw, now = Date.now()) {
  return isRunning(sw) ? sw : { ...sw, startedAt: now };
}

export function pause(sw, now = Date.now()) {
  return isRunning(sw) ? { ...sw, startedAt: null, accumulatedMs: elapsed(sw, now) } : sw;
}

export const reset = () => createStopwatch();

export function lap(sw, now = Date.now()) {
  if (!isRunning(sw)) return sw;
  const totalMs = elapsed(sw, now);
  const prev = sw.laps.length ? sw.laps[sw.laps.length - 1].totalMs : 0;
  return { ...sw, laps: [...sw.laps, { totalMs, splitMs: totalMs - prev }] };
}

/** Indexes of the fastest and slowest lap (only meaningful with 2+ laps). */
export function extremes(laps) {
  if (laps.length < 2) return { fastest: -1, slowest: -1 };
  let fastest = 0;
  let slowest = 0;
  laps.forEach((l, i) => {
    if (l.splitMs < laps[fastest].splitMs) fastest = i;
    if (l.splitMs > laps[slowest].splitMs) slowest = i;
  });
  return { fastest, slowest };
}

export function lapsText(laps) {
  return laps
    .map((l, i) => `Lap ${i + 1}\t${formatStopwatch(l.splitMs)}\t${formatStopwatch(l.totalMs)}`)
    .join('\n');
}

/** Validates a loaded object; returns a clean stopwatch or a fresh one. */
export function sanitize(raw) {
  const num = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  if (!raw || typeof raw !== 'object') return createStopwatch();
  const laps = Array.isArray(raw.laps) ? raw.laps.filter((l) => l && num(l.totalMs) && num(l.splitMs)) : [];
  return {
    startedAt: num(raw.startedAt) ? raw.startedAt : null,
    accumulatedMs: num(raw.accumulatedMs) ? raw.accumulatedMs : 0,
    laps,
  };
}
