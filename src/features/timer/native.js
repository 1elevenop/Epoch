// Mirrors in-app timers to native alarms so they ring when the app is closed (BLUEPRINT §6.3).
// Native only rings; the web stays the owner of timer state (rule 3: native schedules, web asks).

import { AlarmPlugin } from '../../core/bridge.js';

const PREFIX = 'timer:';
let nativeFailed = false;

/** True when the page must make the sound itself (native scheduling failed). */
export const webSound = () => nativeFailed;

export async function syncTimer(t) {
  const id = PREFIX + t.id;
  try {
    await AlarmPlugin.cancelTimer(id);
    if (t.state === 'running') await AlarmPlugin.scheduleTimer({ id, endAt: t.endAt, label: t.label || 'Timer' });
    nativeFailed = false;
  } catch (err) {
    nativeFailed = true;
    console.warn('[timer] native schedule failed, using in-app sound only', err);
  }
}

export const cancelNative = (id) => AlarmPlugin.cancelTimer(PREFIX + id).catch(() => {});
export const stopNativeRing = (id) => AlarmPlugin.stopTimerRing(PREFIX + id).catch(() => {});

/** Ids (without prefix) of finished timers that native already stopped (Stop on the lock screen). */
export async function stoppedNatively(doneTimers, now = Date.now()) {
  if (!doneTimers.length) return [];
  const s = await AlarmPlugin.getTimerState().catch(() => null);
  if (!s) return [];
  const live = new Set([...s.scheduled, ...s.ringing]);
  return doneTimers.filter((t) => now - t.endAt > 15_000 && !live.has(PREFIX + t.id)).map((t) => t.id);
}

export function onNativeStopped(cb) {
  AlarmPlugin.addListener('timerStopped', (e) => {
    if (e?.id?.startsWith(PREFIX)) cb(e.id.slice(PREFIX.length));
  }).catch(() => {});
}
