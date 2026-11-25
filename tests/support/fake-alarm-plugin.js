// Test double for the native AlarmPlugin (setTimeout-based), unit tests only — never shipped.
// Mirrors native behaviour: escalation, weekly budget, wake-check, logs.

import { nextTrigger } from '../../src/core/time.js';
import { escalation } from '../../src/features/challenges/rules.js';

export const EVENTS = ['ringStarted', 'ringStopped', 'alarmsChanged', 'step', 'timerDone', 'timerStopped'];
const WEEK = 7 * 24 * 3600_000;

export function createMockAlarmPlugin({ clock = () => Date.now() } = {}) {
  const alarms = new Map();
  const ringTimeouts = new Map();
  const listeners = Object.fromEntries(EVENTS.map((e) => [e, new Set()]));
  const logs = [];
  let ringState = null;
  let wcTimer = null;
  const timerTimeouts = new Map();

  const emit = (event, data) => listeners[event].forEach((cb) => cb(data));
  const clone = (v) => (v == null ? v : structuredClone(v));
  const err = (msg, code) => Object.assign(new Error(msg), { code });
  const isRepeating = (a) => a.days?.length > 0 && a.oneShotAt == null;
  const snoozeOf = (a) => ({ lengthMin: 5, max: 3, shrink: true, weeklyBudget: null, ...a.snooze });
  const usedThisWeek = () => logs.filter((l) => l.firstRangAt >= clock() - WEEK).reduce((n, l) => n + l.snoozes, 0);

  function arm(alarm, from = clock()) {
    clearTimeout(ringTimeouts.get(alarm.id));
    ringTimeouts.delete(alarm.id);
    alarm.nextTriggerAt = alarm.enabled ? nextTrigger(alarm, from) : null;
    if (alarm.nextTriggerAt == null) return;
    const delay = Math.max(0, alarm.nextTriggerAt - clock());
    if (delay > 2 ** 31 - 1) return; // setTimeout limit (~24.8 days); fine for a mock
    ringTimeouts.set(alarm.id, setTimeout(() => fireRegular(alarm.id), delay));
  }

  function fireRegular(id) {
    const a = alarms.get(id);
    if (!a) return;
    const scheduledFor = a.nextTriggerAt;
    if (isRepeating(a)) {
      a.skipNext = false;
      arm(a, clock() + 1000);
    } else {
      Object.assign(a, { enabled: false, oneShotAt: null, nextTriggerAt: null });
    }
    emit('alarmsChanged', {});
    const t = clock();
    startRing({
      alarmId: id, instanceId: `${id}-${t}`, phase: 'RINGING', firstRangAt: t, scheduledFor: scheduledFor ?? t,
      snoozeCount: 0, nextRingAt: null, escalated: false, wakeCheckAt: null, challengeFails: 0,
      challengeLevel: escalation.challengeLevel(a.challenge?.level ?? 1, 0, false),
    });
  }

  function startRing(state) {
    ringState = state;
    emit('ringStarted', clone(ringState));
  }

  function log(rs, outcome, wakeCheck) {
    const a = alarms.get(rs.alarmId);
    logs.push({
      instanceId: rs.instanceId, alarmId: rs.alarmId, label: a?.label ?? '', scheduledFor: rs.scheduledFor,
      firstRangAt: rs.firstRangAt, dismissedAt: outcome === 'dismissed' ? clock() : null, snoozes: rs.snoozeCount,
      challengeFails: rs.challengeFails, wakeCheck, outcome,
    });
  }
  const updateLog = (id, fields) => Object.assign(logs.findLast((l) => l.instanceId === id) ?? {}, fields);

  function finish(alarmId, reason) {
    const a = alarms.get(alarmId);
    if (a?.deleteAfterUse && !isRepeating(a) && !a.enabled) alarms.delete(alarmId);
    ringState = null;
    emit('ringStopped', { alarmId, reason });
    emit('alarmsChanged', {});
  }

  function context() {
    if (!ringState) return null;
    const a = alarms.get(ringState.alarmId);
    if (!a) return null;
    const s = snoozeOf(a);
    const budget = escalation.budgetLeft(s.weeklyBudget, usedThisWeek() + ringState.snoozeCount);
    const check = escalation.canSnooze(ringState.snoozeCount, s.max, s.shrink, ringState.escalated, budget);
    return {
      state: clone(ringState), alarm: clone(a), snoozeAllowed: check.allowed, snoozesLeft: check.left,
      snoozeLockReason: check.reason, budgetLeft: budget,
      nextSnoozeMin: escalation.snoozeLengthMin(s.lengthMin, ringState.snoozeCount + 1, s.shrink),
    };
  }

  return {
    async listAlarms() {
      return [...alarms.values()].map(clone);
    },
    async upsertAlarm(input) {
      if (!input || !Number.isInteger(input.hour) || !Number.isInteger(input.minute)) {
        throw err('hour and minute must be integers', 'INVALID');
      }
      if (input.challenge?.chain?.includes('qr') && !input.challenge.qrPayload) throw err('register a QR code first', 'INVALID');
      const t = clock();
      const prev = alarms.get(input.id);
      const alarm = { days: [], label: '', enabled: true, skipNext: false, ...prev, ...clone(input), id: input.id || crypto.randomUUID(), createdAt: prev?.createdAt ?? t, updatedAt: t };
      alarms.set(alarm.id, alarm);
      arm(alarm);
      emit('alarmsChanged', {});
      return clone(alarm);
    },
    async deleteAlarm(id) {
      clearTimeout(ringTimeouts.get(id));
      alarms.delete(id);
      emit('alarmsChanged', {});
    },
    async setEnabled(id, on) {
      const a = alarms.get(id);
      if (!a) throw err(`Alarm not found: ${id}`, 'NOT_FOUND');
      a.enabled = !!on;
      a.updatedAt = clock();
      arm(a);
      emit('alarmsChanged', {});
      return clone(a);
    },
    async getRingState() {
      return clone(ringState);
    },
    async getRingContext() {
      return context();
    },
    async snooze(id) {
      const c = context();
      if (!c || c.state.alarmId !== id || c.state.phase !== 'RINGING' || !c.snoozeAllowed) return { allowed: false, nextRingAt: null, snoozesLeft: 0 };
      const count = ringState.snoozeCount + 1;
      const nextRingAt = clock() + c.nextSnoozeMin * 60_000;
      ringState = { ...ringState, phase: 'SNOOZED', snoozeCount: count, nextRingAt };
      emit('ringStopped', { alarmId: id, reason: 'snoozed' });
      setTimeout(() => {
        const a = alarms.get(id);
        startRing({ ...ringState, phase: 'RINGING', nextRingAt: null, challengeLevel: escalation.challengeLevel(a?.challenge?.level ?? 1, count, false) });
      }, nextRingAt - clock());
      return { allowed: true, nextRingAt, snoozesLeft: c.snoozesLeft - 1 };
    },
    async dismiss(id, proof = null) {
      if (!ringState || ringState.alarmId !== id || !['RINGING', 'SNOOZED'].includes(ringState.phase)) return;
      const rs = { ...ringState, challengeFails: ringState.challengeFails + (proof?.fails ?? 0) };
      const a = alarms.get(id);
      const wc = a?.wakeCheck ?? { enabled: true, delayMin: 4, windowSec: 60 };
      if (rs.escalated) updateLog(rs.instanceId, { outcome: 'dismissed', dismissedAt: clock(), challengeFails: rs.challengeFails });
      else log(rs, 'dismissed', wc.enabled ? 'pending' : 'off');
      if (!wc.enabled || rs.escalated) return finish(id, 'dismissed');
      ringState = { ...rs, phase: 'WAKE_CHECK_PENDING', wakeCheckAt: clock() + (wc.delayMin ?? 4) * 60_000 };
      emit('ringStopped', { alarmId: id, reason: 'dismissed' });
      wcTimer = setTimeout(() => {
        ringState = { ...ringState, phase: 'WAKE_CHECK_PROMPT', wakeCheckAt: clock() + (wc.windowSec ?? 60) * 1000 };
        emit('ringStarted', clone(ringState));
        wcTimer = setTimeout(() => {
          updateLog(rs.instanceId, { wakeCheck: 'failed' });
          startRing({ ...ringState, phase: 'RINGING', escalated: true, challengeLevel: 4, wakeCheckAt: null });
        }, (wc.windowSec ?? 60) * 1000);
      }, (wc.delayMin ?? 4) * 60_000);
    },
    async confirmAwake() {
      if (!ringState?.phase?.startsWith('WAKE_CHECK')) return { ok: false };
      clearTimeout(wcTimer);
      updateLog(ringState.instanceId, { wakeCheck: 'passed' });
      finish(ringState.alarmId, 'wake_check_passed');
      return { ok: true };
    },
    async getLogs() {
      return clone(logs);
    },
    async exportAlarms() {
      return { alarms: [...alarms.values()].map(clone), alarmLogs: clone(logs) };
    },
    async importAlarms(list, logList = []) {
      if (ringState) throw err('An alarm is ringing or snoozed — finish it first.', 'BUSY');
      for (const a of alarms.values()) clearTimeout(ringTimeouts.get(a.id));
      alarms.clear();
      for (const a of list) {
        const copy = clone(a);
        alarms.set(copy.id, copy);
        arm(copy);
      }
      logs.splice(0, logs.length, ...clone(logList));
      emit('alarmsChanged', {});
      return { alarms: list.length, alarmLogs: logList.length, scheduled: [...alarms.values()].filter((a) => a.nextTriggerAt).length };
    },
    // Browser: download / file input stand in for the Android system file picker.
    async saveFile(name, text) {
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: name });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return { saved: true };
    },
    async openFile() {
      return new Promise((resolve) => {
        const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json' });
        input.onchange = async () => resolve(input.files[0] ? await input.files[0].text() : null);
        input.click();
      });
    },
    async requestNotifications() {
      return { granted: true };
    },
    async requestUnlock() {
      return { unlocked: true };
    },
    async ringReady() {},
    async startSteps() {},
    async stopSteps() {},
    // In the browser the page itself plays the sound; the mock only reports when a timer ends.
    async scheduleTimer({ id, endAt, label = '' }) {
      if (!id || !(endAt > 0)) throw err('id and endAt are required', 'INVALID');
      clearTimeout(timerTimeouts.get(id));
      timerTimeouts.set(id, setTimeout(() => emit('timerDone', { id, label }), Math.max(0, endAt - clock())));
    },
    async cancelTimer(id) {
      clearTimeout(timerTimeouts.get(id));
      timerTimeouts.delete(id);
    },
    async getTimerState() {
      return { scheduled: [...timerTimeouts.keys()], ringing: [] };
    },
    async stopTimerRing(id = null) {
      emit('timerStopped', { id });
    },
    async setImmersive() {},
    async getReliabilityStatus() {
      return { exactAlarm: true, fullScreenIntent: true, notifications: true, batteryUnrestricted: true, manufacturer: 'web-mock', model: 'browser', sdk: 0 };
    },
    async openSetting(which) {
      console.info(`[bridge mock] openSetting(${which}) — only works on the phone`);
    },
    async previewSound() {},
    async stopPreview() {},
    timerSound: 'hard_classic',
    async setTimerSound(id) {
      if (!['gentle_bells', 'gentle_rise', 'gentle_marimba', 'hard_classic', 'hard_siren', 'hard_buzzer'].includes(id)) throw Object.assign(new Error('unknown soundId'), { code: 'INVALID' });
      this.timerSound = id;
    },
    widgetData: null,
    async setWidgetData(d) {
      this.widgetData = d;
    },
    async previewSunrise() {},
    dnd: { access: true, owned: false, filter: 'all' },
    async dndStatus() { return { access: this.dnd.access, owned: this.dnd.owned }; },
    async openDndAccess() {},
    // Mirrors FocusDnd.kt: only turns DND off again if Epoch turned it on and nobody changed it.
    async setFocusDnd(on) {
      const d = this.dnd;
      if (on) {
        if (!d.access) throw Object.assign(new Error('denied'), { code: 'DND_ACCESS_DENIED' });
        if (d.owned) return { result: 'on' };
        if (d.filter !== 'all') return { result: 'already' };
        d.owned = true;
        d.filter = 'priority';
        return { result: 'on' };
      }
      if (!d.owned) return { restored: false };
      d.owned = false;
      if (d.filter !== 'priority') return { restored: false };
      d.filter = 'all';
      return { restored: true };
    },
    async addListener(event, cb) {
      if (!listeners[event]) throw new Error(`Unknown event: ${event}`);
      listeners[event].add(cb);
      return { remove: async () => listeners[event].delete(cb) };
    },
  };
}
