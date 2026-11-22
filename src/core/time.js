// Time helpers. Rule D7: time is computed from timestamps, never counted.

export const now = () => Date.now();

export const pad2 = (n) => String(Math.trunc(n)).padStart(2, '0');

/** "HH:MM[:SS]" (24 h) or "h:MM[:SS]" (12 h, no AM/PM — see ampm()) from hour/minute/second. */
export function formatHMS(h, m, s, { seconds = false, hour12 = false } = {}) {
  const hh = hour12 ? String(h % 12 || 12) : pad2(h);
  const hm = `${hh}:${pad2(m)}`;
  return seconds ? `${hm}:${pad2(s)}` : hm;
}

export const ampm = (h) => (h < 12 ? 'AM' : 'PM');

export function formatClock(date, opts) {
  return formatHMS(date.getHours(), date.getMinutes(), date.getSeconds(), opts);
}

/** Stopwatch format: "MM:SS.cc" or "H:MM:SS.cc". */
export function formatStopwatch(ms) {
  const cs = Math.floor(ms / 10) % 100;
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const base = h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
  return `${base}.${pad2(cs)}`;
}

/** "7 h 20 m", "45 m", "< 1 m" for a positive duration. */
export function formatUntil(ms) {
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return '< 1 m';
  const h = Math.floor(mins / 60);
  const d = Math.floor(h / 24);
  if (d >= 1) return `${d} d ${h % 24} h`;
  return h ? `${h} h ${mins % 60} m` : `${mins} m`;
}

/** Duration in ms → "H:MM:SS" / "MM:SS"; negative values get a leading "−". */
export function formatDuration(ms) {
  const sign = ms < 0 ? '−' : '';
  const total = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${sign}${h}:${pad2(m)}:${pad2(s)}` : `${sign}${pad2(m)}:${pad2(s)}`;
}

/**
 * Display-only mirror of the native NextTrigger rule (native is the source of truth).
 * days: 0=Sun..6=Sat, [] = one-time (next occurrence of hour:minute).
 * Computed from the rule in local time, never "+24 h", so DST/timezone shifts are handled.
 */
export function nextTrigger({ hour, minute, days = [], skipNext = false, oneShotAt = null }, fromMs = Date.now()) {
  if (oneShotAt != null) return oneShotAt > fromMs ? oneShotAt : null;
  const from = new Date(fromMs);
  let skipped = !skipNext;
  for (let offset = 0; offset <= 14; offset++) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offset, hour, minute, 0, 0);
    if (d.getTime() <= fromMs) continue;
    if (days.length && !days.includes(d.getDay())) continue;
    if (!skipped) {
      skipped = true;
      continue;
    }
    return d.getTime();
  }
  return null;
}
