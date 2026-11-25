// The running focus session: engine run + session record (goal, tasks, leaves, parking lot).
// Saved in localStorage so it survives app restarts; a native alarm rings at every phase end,
// so the alert still sounds when the app is closed (BLUEPRINT §11 Phase 4 acceptance).

import { Capacitor } from '@capacitor/core';
import { AlarmPlugin } from '../../core/bridge.js';
import { loadState, saveState, getSettings } from '../../core/store.js';
import * as E from './engine.js';
import { saveSession } from './data.js';

const KEY = 'focusSession';
const TIMER_ID = 'focus';
const LABEL = { focus: 'Focus block done — time for a break', break: 'Break over — back to focus', long_break: 'Long break over — back to focus' };
/** Shown while the phase runs (widget, ongoing notification); LABEL is shown when it ends. */
const TITLE = { focus: 'Focus', break: 'Break', long_break: 'Long break' };

let state = sanitize(loadState(KEY, null));
const listeners = new Set();

function sanitize(raw) {
  if (!raw?.session || typeof raw.session.goal !== 'string') return null;
  const run = E.sanitizeRun(raw.run);
  return run ? { run, session: raw.session } : null;
}

function commit(next) {
  state = next;
  saveState(KEY, state);
  listeners.forEach((fn) => fn(state));
  syncAlarm();
}

/** Keeps exactly one native alarm at the current segment's end (none while paused / finished). */
async function syncAlarm() {
  try {
    await AlarmPlugin.cancelTimer(TIMER_ID);
    const cur = state && E.current(state.run);
    if (cur && cur.endAt && cur.endAt > Date.now()) {
      await AlarmPlugin.scheduleTimer({ id: TIMER_ID, endAt: cur.endAt, label: LABEL[cur.kind], title: TITLE[cur.kind] });
    }
  } catch (err) {
    console.warn('[focus] native phase alarm failed', err);
  }
}

/**
 * Do Not Disturb for the session (BLUEPRINT §6.5). Native only restores DND if Epoch turned it on
 * and nobody changed it since. Failures never block the session.
 */
export function setDnd(on) {
  return AlarmPlugin.setFocusDnd?.(on).catch((err) => console.warn('[focus] DND', on ? 'on' : 'off', err?.code ?? err));
}

export const focus = {
  get: () => state,
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  start({ goal, plan, taskIds }, now = Date.now()) {
    const session = {
      id: globalThis.crypto?.randomUUID?.() ?? `s${now}`,
      goal: goal.trim().slice(0, 120),
      plan: { ...plan },
      taskIds: [...taskIds],
      segments: [],
      leaves: [],
      parkingLot: [],
      subtasksDone: 0,
      endReason: null,
      review: null,
      startedAt: now,
      endedAt: null,
    };
    commit({ run: E.createRun(plan, now), session });
    if (getSettings().focusDnd) setDnd(true);
  },
  pause: () => state && commit({ ...state, run: E.pause(state.run) }),
  resume: () => state && commit({ ...state, run: E.resume(state.run) }),
  /** Next segment (after a phase ends, or "skip break"). Stops the phase-end ring. */
  next(now = Date.now()) {
    if (!state) return;
    AlarmPlugin.stopTimerRing(TIMER_ID).catch(() => {});
    const run = E.advance(state.run, now);
    if (E.isFinished(run)) return this.finish('completed', run, now);
    commit({ ...state, run });
  },
  addParking(text) {
    const t = text.trim().slice(0, 200);
    if (state && t) commit({ ...state, session: { ...state.session, parkingLot: [...state.session.parkingLot, { at: Date.now(), text: t }] } });
  },
  countSubtask(delta) {
    if (state) commit({ ...state, session: { ...state.session, subtasksDone: Math.max(0, state.session.subtasksDone + delta) } });
  },
  addLeave(at, durationMs) {
    if (state && durationMs >= 2000) commit({ ...state, session: { ...state.session, leaves: [...state.session.leaves, { at, durationMs }] } });
  },
  /** Ends the session, saves it (review filled in later) and returns it. */
  async finish(reason, run = state?.run, now = Date.now()) {
    if (!state) return null;
    AlarmPlugin.stopTimerRing(TIMER_ID).catch(() => {});
    const finalRun = E.stop(run, now);
    const session = { ...state.session, segments: finalRun.log, endReason: reason, endedAt: now };
    commit(null);
    setDnd(false);
    saveState('focusLastSession', session);
    await saveSession(session).catch((err) => console.warn('[focus] save failed', err));
    return session;
  },
};

// ---------- leave detection (BLUEPRINT §6.5): count how often and how long you left the app ----------

let leftAt = null;
function onActive(active) {
  if (!state || state.run.pausedAt) {
    leftAt = null;
    return;
  }
  const cur = E.current(state.run);
  if (!active && cur?.kind === 'focus') leftAt = Date.now();
  if (active && leftAt) {
    focus.addLeave(leftAt, Date.now() - leftAt);
    leftAt = null;
  }
}

export async function installLeaveDetection() {
  if (Capacitor.isNativePlatform()) {
    const { App } = await import('@capacitor/app');
    App.addListener('appStateChange', ({ isActive }) => onActive(isActive));
  } else if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => onActive(!document.hidden));
  }
}
