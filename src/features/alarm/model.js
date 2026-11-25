// Alarm helpers for the web UI. Native validates again and owns the data (D2).

import { getSettings } from '../../core/store.js';

export const SOUNDS = [
  { id: 'gentle_bells', name: 'Soft bells', group: 'Gentle' },
  { id: 'gentle_rise', name: 'Rising tone', group: 'Gentle' },
  { id: 'gentle_marimba', name: 'Marimba', group: 'Gentle' },
  { id: 'hard_classic', name: 'Classic beep', group: 'Hard' },
  { id: 'hard_siren', name: 'Siren', group: 'Hard' },
  { id: 'hard_buzzer', name: 'Buzzer', group: 'Hard' },
];

/** Display order Mon..Sun; values are 0=Sun..6=Sat. */
export const WEEK = [
  [1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun'],
];

/** Challenges a new alarm may start with (Settings → Default challenge). QR needs its own code. */
export const DEFAULT_CHALLENGES = ['math', 'type', 'memory', 'shake', 'steps'];
export const SNOOZE_CHOICES = [3, 5, 7, 10, 15];

export function defaultAlarm(now = new Date()) {
  const d = new Date(now.getTime() + 60 * 60_000);
  const s = getSettings();
  const snoozeMin = Number.isInteger(s.defaultSnoozeMin) && s.defaultSnoozeMin >= 1 && s.defaultSnoozeMin <= 60 ? s.defaultSnoozeMin : 5;
  const challenge = DEFAULT_CHALLENGES.includes(s.defaultChallenge) ? s.defaultChallenge : 'math';
  return {
    hour: d.getHours(),
    minute: d.getMinutes() - (d.getMinutes() % 5),
    days: [],
    label: '',
    enabled: true,
    soundId: 'gentle_bells',
    vibrate: true,
    volume: 0.8,
    rampSec: 30,
    snooze: { lengthMin: snoozeMin, max: 3, shrink: true, weeklyBudget: null },
    // Blueprint default is qr → math L2; QR needs a registered code, so new alarms start with math L2
    // and the editor offers to add QR.
    challenge: { chain: [challenge], level: 2, qrPayload: null },
    wakeCheck: { enabled: true, delayMin: 4, windowSec: 60 },
    sunriseMin: 0,
    deleteAfterUse: false,
    skipNext: false,
    oneShotAt: null,
  };
}

/** Nap / test alarm that rings once at a fixed moment and deletes itself. */
export function oneShotAlarm(ms, label, now = Date.now()) {
  const at = new Date(now + ms);
  return {
    ...defaultAlarm(),
    hour: at.getHours(),
    minute: at.getMinutes(),
    label,
    oneShotAt: now + ms,
    deleteAfterUse: true,
    rampSec: ms < 60_000 ? 5 : 30,
    challenge: { chain: ['math'], level: 1, qrPayload: null },
    wakeCheck: { enabled: false, delayMin: 4, windowSec: 60 },
  };
}

export const isRepeating = (a) => a.days?.length > 0 && a.oneShotAt == null;

export function describeDays(days = []) {
  const set = new Set(days);
  if (set.size === 0) return 'Once';
  if (set.size === 7) return 'Every day';
  if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return 'Weekdays';
  if (set.size === 2 && set.has(0) && set.has(6)) return 'Weekends';
  return WEEK.filter(([v]) => set.has(v)).map(([, n]) => n).join(', ');
}

/** Light client-side check so the form can show errors before calling native. */
export function validateAlarm(a) {
  const errors = [];
  if (!Number.isInteger(a.hour) || a.hour < 0 || a.hour > 23) errors.push('Hour must be 0–23');
  if (!Number.isInteger(a.minute) || a.minute < 0 || a.minute > 59) errors.push('Minute must be 0–59');
  if (!Array.isArray(a.days) || a.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) errors.push('Bad repeat days');
  if (!SOUNDS.some((s) => s.id === a.soundId)) errors.push('Unknown sound');
  if (!(a.volume >= 0 && a.volume <= 1)) errors.push('Volume must be 0–100 %');
  if (!(a.snooze?.lengthMin >= 1 && a.snooze.lengthMin <= 60)) errors.push('Snooze length must be 1–60 min');
  if (!(Number.isInteger(a.sunriseMin ?? 0) && (a.sunriseMin ?? 0) >= 0 && (a.sunriseMin ?? 0) <= 60)) errors.push('Sunrise must be 0–60 min');
  if (!(a.snooze?.max >= 0 && a.snooze.max <= 10)) errors.push('Max snoozes must be 0–10');
  if (typeof a.label !== 'string' || a.label.length > 60) errors.push('Label is too long');
  const ch = a.challenge;
  if (ch) {
    if (!Array.isArray(ch.chain) || ch.chain.length < 1 || ch.chain.length > 4) errors.push('Pick 1–4 challenges');
    if (!(ch.level >= 1 && ch.level <= 4)) errors.push('Difficulty must be 1–4');
    if (ch.chain?.includes('qr') && !ch.qrPayload) errors.push('Register a QR code first');
  }
  const b = a.snooze?.weeklyBudget;
  if (b != null && !(b >= 0 && b <= 50)) errors.push('Weekly snooze budget must be 0–50');
  return errors;
}

/** Friendly text for bridge errors (rule 5 error codes). */
export function errorText(err) {
  switch (err?.code) {
    case 'EXACT_ALARM_DENIED':
      return 'Exact alarms are blocked. Open Settings → Reliability to fix it.';
    case 'NOTIFICATIONS_DENIED':
      return 'Notifications are off, so an alarm could not show its stop screen. Allow notifications first.';
    case 'INVALID':
      return `Invalid alarm: ${err.message}`;
    case 'NOT_FOUND':
      return 'That alarm no longer exists.';
    default:
      return err?.message || 'Something went wrong.';
  }
}
