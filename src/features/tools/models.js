// Pure models for the extra tools (BLUEPRINT §6.7). Time is always computed from
// timestamps (rule 2): a "run" is { startedAt, pausedAt, pausedMs }.

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const int = (v, lo, hi, d) => clamp(Math.round(Number.isFinite(Number(v)) ? Number(v) : d), lo, hi);

// ---------- run clock ----------
export const startRun = (now = Date.now()) => ({ startedAt: now, pausedAt: null, pausedMs: 0 });
export const elapsed = (r, now = Date.now()) => (r ? (r.pausedAt ?? now) - r.startedAt - r.pausedMs : 0);
export const pauseRun = (r, now = Date.now()) => (r && r.pausedAt == null ? { ...r, pausedAt: now } : r);
export const resumeRun = (r, now = Date.now()) => (r && r.pausedAt != null ? { ...r, pausedAt: null, pausedMs: r.pausedMs + now - r.pausedAt } : r);
export const isPaused = (r) => !!r && r.pausedAt != null;
/** Validates a stored run (rule 6); returns null when it is not usable. */
export function sanitizeRun(r, now = Date.now()) {
  if (!r || typeof r !== 'object') return null;
  const ok = (v) => Number.isFinite(v) && v >= 0;
  if (!ok(r.startedAt) || r.startedAt > now || !ok(r.pausedMs)) return null;
  if (r.pausedAt != null && (!ok(r.pausedAt) || r.pausedAt < r.startedAt)) return null;
  return { startedAt: r.startedAt, pausedAt: r.pausedAt ?? null, pausedMs: r.pausedMs };
}

// ---------- interval / HIIT ----------
export const TABATA = { name: 'Tabata', prep: 10, work: 20, rest: 10, rounds: 8, sets: 1, setRest: 60 };

export function sanitizePlan(p) {
  return {
    name: String(p?.name ?? 'Custom').trim().slice(0, 40) || 'Custom',
    prep: int(p?.prep, 0, 60, 10),
    work: int(p?.work, 1, 3600, 20),
    rest: int(p?.rest, 0, 3600, 10),
    rounds: int(p?.rounds, 1, 99, 8),
    sets: int(p?.sets, 1, 20, 1),
    setRest: int(p?.setRest, 0, 3600, 60),
  };
}

/** Plan → list of segments { kind: prep|work|rest|setRest, secs, round, set, startMs }. */
export function segments(plan) {
  const p = sanitizePlan(plan);
  const out = [];
  const push = (kind, secs, round, set) => secs > 0 && out.push({ kind, secs, round, set });
  push('prep', p.prep, 0, 1);
  for (let s = 1; s <= p.sets; s++) {
    for (let r = 1; r <= p.rounds; r++) {
      push('work', p.work, r, s);
      const lastRound = r === p.rounds;
      if (!lastRound) push('rest', p.rest, r, s);
      else if (s < p.sets) push('setRest', p.setRest, r, s);
    }
  }
  let t = 0;
  for (const seg of out) {
    seg.startMs = t;
    t += seg.secs * 1000;
  }
  return out;
}

export const totalMs = (segs) => (segs.length ? segs.at(-1).startMs + segs.at(-1).secs * 1000 : 0);

/** Where we are at elapsed ms: { index, seg, remainingMs, done }. */
export function intervalAt(segs, ms) {
  if (ms >= totalMs(segs)) return { index: segs.length, seg: null, remainingMs: 0, done: true };
  let i = segs.length - 1;
  while (i > 0 && segs[i].startMs > ms) i--;
  const seg = segs[i];
  return { index: i, seg, remainingMs: seg.startMs + seg.secs * 1000 - ms, done: false };
}

/** Cue times (ms from start): 3-2-1 short beeps before each segment change, long beep at the change. */
export function cues(segs) {
  const out = [];
  for (let i = 1; i <= segs.length; i++) {
    const at = i < segs.length ? segs[i].startMs : totalMs(segs);
    const prevSecs = segs[i - 1].secs;
    for (const s of [3, 2, 1]) if (prevSecs > s) out.push({ at: at - s * 1000, kind: 'tick', n: s });
    out.push({ at, kind: i < segs.length ? 'go' : 'end', next: segs[i]?.kind ?? null });
  }
  return out;
}

// ---------- breathing ----------
export const BREATHING = {
  box: { name: 'Box 4-4-4-4', steps: [4, 4, 4, 4] },
  '478': { name: '4-7-8', steps: [4, 7, 8, 0] },
};
const STEP_NAMES = ['Breathe in', 'Hold', 'Breathe out', 'Hold'];

export const sanitizeSteps = (s) => [0, 1, 2, 3].map((i) => int(s?.[i], i % 2 ? 0 : 1, 20, 4));

/** { cycle (0-based), step, name, stepRemainingMs, scale 0.5..1 } at elapsed ms. */
export function breathAt(steps, ms) {
  const cycleMs = steps.reduce((a, b) => a + b, 0) * 1000;
  const cycle = Math.floor(ms / cycleMs);
  let t = ms - cycle * cycleMs;
  let step = 0;
  while (step < 3 && t >= steps[step] * 1000) t -= steps[step++] * 1000;
  const len = steps[step] * 1000;
  const k = len ? t / len : 1;
  const ease = (x) => 0.5 - Math.cos(Math.PI * x) / 2;
  const scale = step === 0 ? 0.5 + 0.5 * ease(k) : step === 1 ? 1 : step === 2 ? 1 - 0.5 * ease(k) : 0.5;
  return { cycle, step, name: STEP_NAMES[step], stepRemainingMs: len - t, scale };
}

// ---------- event countdowns ----------
/** Whole calendar days from today (local) to a YYYY-MM-DD date. */
export function daysUntil(dateStr, now = Date.now()) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const target = Date.UTC(y, m - 1, d);
  const n = new Date(now);
  const today = Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
  return Math.round((target - today) / 86_400_000);
}

export function daysLabel(days) {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return days > 0 ? `${days} days` : `${-days} days ago`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export function validDate(s) {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d && y >= 1900 && y <= 2200;
}

/** Stored countdown list → only valid entries (rule 6). */
export function sanitizeCountdowns(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((c) => c && typeof c.id === 'string' && c.id.length <= 64 && typeof c.title === 'string' && c.title.trim() && c.title.length <= 60 && validDate(c.date))
    .map((c) => ({ id: c.id, title: c.title.trim(), date: c.date, onClock: c.onClock !== false }))
    .slice(0, 50);
}

/** Sorted for display: upcoming first (soonest first), then past (most recent first). */
export function sortCountdowns(list, now = Date.now()) {
  return [...list].sort((a, b) => {
    const da = daysUntil(a.date, now);
    const db = daysUntil(b.date, now);
    if (da >= 0 && db >= 0) return da - db;
    if (da < 0 && db < 0) return db - da;
    return da < 0 ? 1 : -1;
  });
}

// ---------- chess / game clock ----------
export function newChess(baseMin, incSec) {
  const base = int(baseMin, 1, 180, 5) * 60_000;
  return { base, inc: int(incSec, 0, 60, 0) * 1000, left: [base, base], moves: [0, 0], active: null, since: null, flag: null };
}

/** Remaining ms for side i at time now. */
export const chessLeft = (c, i, now = Date.now()) => Math.max(0, c.left[i] - (c.active === i && c.since != null ? now - c.since : 0));

/** Player `side` taps their clock: their time stops (+ increment), the other side runs. */
export function chessTap(c, side, now = Date.now()) {
  if (c.flag != null) return c;
  if (c.active === null) return { ...c, active: 1 - side, since: now }; // first tap starts the opponent
  if (c.active !== side || c.since == null) return c;
  const left = [...c.left];
  const used = now - c.since;
  if (used >= left[side]) return chessFlag(c, now) ?? c;
  left[side] = left[side] - used + c.inc;
  const moves = [...c.moves];
  moves[side]++;
  return { ...c, left, moves, active: 1 - side, since: now };
}

/** Returns a flagged state when the running side is out of time, else null. */
export function chessFlag(c, now = Date.now()) {
  if (c.active == null || c.since == null || c.flag != null) return null;
  if (chessLeft(c, c.active, now) > 0) return null;
  const left = [...c.left];
  left[c.active] = 0;
  return { ...c, left, flag: c.active, since: null };
}

export function chessPause(c, now = Date.now()) {
  if (c.active == null || c.since == null) return c;
  const left = [...c.left];
  left[c.active] = chessLeft(c, c.active, now);
  return { ...c, left, since: null };
}
export const chessResume = (c, now = Date.now()) => (c.active != null && c.since == null && c.flag == null ? { ...c, since: now } : c);

// ---------- speech timer ----------
/** green → yellow at yellowMin → red at redMin; overtime after redMin. */
export function speechColor(ms, yellowMin, redMin) {
  if (ms >= redMin * 60_000) return 'red';
  if (ms >= yellowMin * 60_000) return 'yellow';
  return 'green';
}
