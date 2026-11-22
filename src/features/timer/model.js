// Timer model (BLUEPRINT §7): { id, label, durationMs, endAt|null, remainingMs, state }.
// While running, the truth is endAt; remaining = endAt − now (rule D7).

export const MAX_MS = 100 * 3600_000 - 1000; // 99:59:59

const newId = () => globalThis.crypto?.randomUUID?.() ?? `t${Date.now()}${Math.random().toString(36).slice(2, 8)}`;

export function createTimer(durationMs, label = '') {
  const d = clampDuration(durationMs);
  return { id: newId(), label: String(label).slice(0, 40), durationMs: d, endAt: null, remainingMs: d, state: 'idle' };
}

export const clampDuration = (ms) => Math.min(MAX_MS, Math.max(1000, Math.round(Number(ms) / 1000) * 1000 || 1000));

/** Remaining ms; negative once a timer is done (overtime). */
export function remaining(t, now = Date.now()) {
  return t.state === 'running' || t.state === 'done' ? t.endAt - now : t.remainingMs;
}

export function start(t, now = Date.now()) {
  if (t.state === 'running') return t;
  const rem = t.state === 'done' ? t.durationMs : t.remainingMs;
  return { ...t, state: 'running', endAt: now + rem, remainingMs: rem };
}

export function pause(t, now = Date.now()) {
  if (t.state !== 'running') return t;
  return { ...t, state: 'paused', remainingMs: Math.max(0, t.endAt - now), endAt: null };
}

export const reset = (t) => ({ ...t, state: 'idle', endAt: null, remainingMs: t.durationMs });

export function addMinute(t, now = Date.now()) {
  const MIN = 60_000;
  if (t.state === 'running') return { ...t, endAt: t.endAt + MIN, durationMs: t.durationMs + MIN };
  if (t.state === 'done') return { ...t, state: 'running', endAt: now + MIN, durationMs: MIN, remainingMs: MIN };
  return { ...t, remainingMs: clampDuration(t.remainingMs + MIN), durationMs: clampDuration(t.durationMs + MIN) };
}

/** Running timer whose end time has passed → done. Returns the same object if nothing changed. */
export function settle(t, now = Date.now()) {
  return t.state === 'running' && now >= t.endAt ? { ...t, state: 'done', remainingMs: 0 } : t;
}

export function progress(t, now = Date.now()) {
  if (t.state === 'done') return 1;
  return Math.min(1, Math.max(0, 1 - remaining(t, now) / t.durationMs));
}

/** Validates loaded data (rule 6): bad entries are dropped. */
export function sanitize(raw) {
  if (!Array.isArray(raw)) return [];
  const num = (v) => typeof v === 'number' && Number.isFinite(v);
  const STATES = ['idle', 'running', 'paused', 'done'];
  return raw
    .filter(
      (t) =>
        t &&
        typeof t.id === 'string' &&
        STATES.includes(t.state) &&
        num(t.durationMs) &&
        t.durationMs > 0 &&
        num(t.remainingMs) &&
        (t.state === 'running' || t.state === 'done' ? num(t.endAt) : true),
    )
    .map((t) => ({
      id: t.id,
      label: typeof t.label === 'string' ? t.label.slice(0, 40) : '',
      durationMs: t.durationMs,
      endAt: t.state === 'running' || t.state === 'done' ? t.endAt : null,
      remainingMs: Math.max(0, t.remainingMs),
      state: t.state,
    }));
}
