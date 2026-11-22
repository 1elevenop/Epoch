// Pomodoro engine (BLUEPRINT §6.5). Pure functions over a plain object; time is computed from
// timestamps (D7). A run is a fixed sequence of segments; pause time is excluded from elapsed.

export const DEFAULT_PLAN = Object.freeze({ focusMin: 25, breakMin: 5, cycles: 4, longBreakMin: 15, longEvery: 4 });

export function validatePlan(p) {
  const ok = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  const errors = [];
  if (!ok(p.focusMin, 1, 180)) errors.push('Focus must be 1–180 min');
  if (!ok(p.breakMin, 1, 60)) errors.push('Break must be 1–60 min');
  if (!ok(p.cycles, 1, 12)) errors.push('Cycles must be 1–12');
  if (!ok(p.longBreakMin, 1, 90)) errors.push('Long break must be 1–90 min');
  if (!ok(p.longEvery, 1, 12)) errors.push('Long break every 1–12 cycles');
  return errors;
}

/** focus, break, focus, … — a long break after every `longEvery` cycles; no break after the last focus. */
export function buildSequence(plan) {
  const seq = [];
  for (let c = 1; c <= plan.cycles; c++) {
    seq.push({ kind: 'focus', ms: plan.focusMin * 60_000, cycle: c });
    if (c === plan.cycles) break;
    const long = c % plan.longEvery === 0;
    seq.push({ kind: long ? 'long_break' : 'break', ms: (long ? plan.longBreakMin : plan.breakMin) * 60_000, cycle: c });
  }
  return seq;
}

export function createRun(plan, now = Date.now()) {
  return { plan: { ...plan }, seq: buildSequence(plan), index: 0, segStart: now, pausedAt: null, pausedMs: 0, log: [] };
}

export const isPaused = (run) => run.pausedAt !== null;
export const isFinished = (run) => run.index >= run.seq.length;

/** Elapsed time inside the current segment, pauses excluded. */
export function elapsed(run, now = Date.now()) {
  if (isFinished(run)) return 0;
  return Math.max(0, (run.pausedAt ?? now) - run.segStart - run.pausedMs);
}

export function current(run, now = Date.now()) {
  if (isFinished(run)) return null;
  const seg = run.seq[run.index];
  const el = elapsed(run, now);
  return {
    ...seg,
    index: run.index,
    elapsedMs: el,
    remainingMs: seg.ms - el,
    progress: Math.min(1, el / seg.ms),
    over: el >= seg.ms,
    focusNumber: run.seq.slice(0, run.index + 1).filter((s) => s.kind === 'focus').length,
    endAt: isPaused(run) ? null : run.segStart + run.pausedMs + seg.ms,
  };
}

export function pause(run, now = Date.now()) {
  return isPaused(run) || isFinished(run) ? run : { ...run, pausedAt: now };
}

export function resume(run, now = Date.now()) {
  return isPaused(run) ? { ...run, pausedMs: run.pausedMs + (now - run.pausedAt), pausedAt: null } : run;
}

/** Ends the current segment (completed = full length reached) and starts the next one. */
export function advance(run, now = Date.now()) {
  if (isFinished(run)) return run;
  const seg = run.seq[run.index];
  const el = elapsed(run, now);
  const entry = { kind: seg.kind, start: run.segStart, end: now, activeMs: Math.min(el, seg.ms), completed: el >= seg.ms };
  return { ...run, index: run.index + 1, segStart: now, pausedAt: null, pausedMs: 0, log: [...run.log, entry] };
}

/** Stops the run now; the running segment is logged as not completed unless it was over. */
export function stop(run, now = Date.now()) {
  return isFinished(run) ? run : { ...advance(run, now), index: run.seq.length };
}

export const focusMinutes = (log) => Math.round(log.filter((s) => s.kind === 'focus').reduce((n, s) => n + s.activeMs, 0) / 60_000);
export const cyclesDone = (log) => log.filter((s) => s.kind === 'focus' && s.completed).length;
export const plannedFocusMinutes = (plan) => plan.focusMin * plan.cycles;

/** Validates a saved run (rule 6); returns null if unusable. */
export function sanitizeRun(raw) {
  if (!raw || typeof raw !== 'object' || !raw.plan || validatePlan(raw.plan).length) return null;
  const num = (v) => typeof v === 'number' && Number.isFinite(v);
  if (!num(raw.index) || !num(raw.segStart) || !num(raw.pausedMs)) return null;
  if (raw.pausedAt !== null && !num(raw.pausedAt)) return null;
  return { ...raw, seq: buildSequence(raw.plan), log: Array.isArray(raw.log) ? raw.log : [] };
}
