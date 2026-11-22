import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildBackup, validateBackup, parseBackup, BACKUP_VERSION } from '../src/features/settings/backup.js';
import { createMockAlarmPlugin } from './support/fake-alarm-plugin.js';
import { defaultAlarm } from '../src/features/alarm/model.js';
import { newTask, newSubtask } from '../src/features/focus/data.js';
import { DEFAULT_SETTINGS } from '../src/core/store.js';
import * as E from '../src/features/focus/engine.js';

const alarm = (over = {}) => ({ ...defaultAlarm(), id: `a${Math.random().toString(36).slice(2)}`, ...over });
const task = () => {
  const t = newTask('Chapter 4');
  t.subtasks = [newSubtask('Read 4.1')];
  return t;
};
const session = () => {
  let run = E.createRun(E.DEFAULT_PLAN, 0);
  run = E.stop(run, 10 * 60_000);
  return {
    id: 's1', goal: 'Notes', plan: { ...E.DEFAULT_PLAN }, taskIds: [], segments: run.log, leaves: [{ at: 5, durationMs: 3000 }],
    parkingLot: [{ at: 6, text: 'email' }], subtasksDone: 1, endReason: 'done_early', review: { note: 'ok', rating: 4 }, startedAt: 0, endedAt: 600000,
  };
};
const log = () => ({ instanceId: 'i1', alarmId: 'a1', label: 'Wake', scheduledFor: 1, firstRangAt: 2, dismissedAt: 3, snoozes: 1, challengeFails: 0, wakeCheck: 'passed', outcome: 'dismissed' });
const good = () => buildBackup({ alarms: [alarm()], alarmLogs: [log()], tasks: [task()], sessions: [session()], settings: { ...DEFAULT_SETTINGS, theme: 'neon' } }, 123);

describe('backup validation (rule 6)', () => {
  it('accepts a complete backup', () => {
    const v = validateBackup(good());
    expect(v.errors).toEqual([]);
    expect(v).toMatchObject({ ok: true, counts: { alarms: 1, alarmLogs: 1, tasks: 1, sessions: 1 } });
    expect(good()).toMatchObject({ version: BACKUP_VERSION, exportedAt: 123 });
  });

  it('checks Audio Lab / Tools settings (countdowns, focus noise)', () => {
    const withSettings = (extra) => validateBackup({ ...good(), settings: { ...good().settings, ...extra } });
    expect(withSettings({ countdowns: [{ id: 'c1', title: 'Exams', date: '2027-03-01', onClock: true }], focusNoise: 'brown', focusNoiseVolume: 0.4 }).ok).toBe(true);
    expect(withSettings({ countdowns: [{ id: 'c1', title: 'Exams', date: '2027-02-30' }] }).errors).toContain('settings: countdowns');
    expect(withSettings({ focusNoise: 'purple' }).errors).toContain('settings: focusNoise');
    expect(withSettings({ focusNoiseVolume: 3 }).errors).toContain('settings: focusNoiseVolume');
  });

  it('rejects wrong version, missing parts and junk', () => {
    expect(validateBackup({ ...good(), version: 2 }).ok).toBe(false);
    expect(validateBackup({ ...good(), tasks: undefined }).errors).toContain('tasks is missing');
    expect(validateBackup(null).ok).toBe(false);
    expect(parseBackup('{not json').errors).toEqual(['The file is not valid JSON']);
  });

  it('checks every record', () => {
    const b = good();
    b.alarms.push(alarm({ hour: 25 }));
    b.alarmLogs.push({ ...log(), outcome: 'teleported' });
    b.tasks.push({ ...task(), title: 5 });
    b.sessions.push({ ...session(), id: 's2', review: { note: '', rating: 9 } });
    b.settings.theme = 'nope';
    b.settings.hacker = true;
    const v = validateBackup(b);
    expect(v.ok).toBe(false);
    expect(v.errors).toEqual(expect.arrayContaining(['alarm 2: Hour must be 0–23', 'log 2: outcome', 'task 2: title', 'session 2: review', 'settings: theme', 'settings: unknown key "hacker"']));
  });

  it('rejects duplicate ids', () => {
    const b = good();
    b.alarms.push({ ...b.alarms[0] });
    expect(validateBackup(b).errors).toContain('duplicate alarm ids');
  });

  it('parseBackup returns data only when valid', () => {
    expect(parseBackup(JSON.stringify(good())).data.alarms).toHaveLength(1);
    expect(parseBackup(JSON.stringify({ ...good(), version: 9 })).data).toBeNull();
  });
});

describe('export → wipe → import (Phase 5 acceptance, native-side mock)', () => {
  afterEach(() => vi.useRealTimers());

  it('restores alarms and logs exactly', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 22, 12, 0));
    const before = createMockAlarmPlugin();
    await before.upsertAlarm({ ...defaultAlarm(), id: 'work', hour: 6, minute: 30, days: [1, 2, 3, 4, 5], label: 'Work' });
    await before.upsertAlarm({ ...defaultAlarm(), id: 'gym', hour: 7, minute: 15, days: [6], label: 'Gym', enabled: false });
    const exported = await before.exportAlarms();
    const file = JSON.stringify(buildBackup({ ...exported, tasks: [], sessions: [], settings: DEFAULT_SETTINGS }));

    const after = createMockAlarmPlugin(); // "wiped" app
    const parsed = parseBackup(file);
    expect(parsed.ok).toBe(true);
    const r = await after.importAlarms(parsed.data.alarms, parsed.data.alarmLogs);
    expect(r).toMatchObject({ alarms: 2, scheduled: 1 });
    const restored = (await after.listAlarms()).sort((a, b) => a.id.localeCompare(b.id));
    expect(restored.map((a) => [a.id, a.label, a.enabled, a.days])).toEqual([
      ['gym', 'Gym', false, [6]],
      ['work', 'Work', true, [1, 2, 3, 4, 5]],
    ]);
    expect(restored.find((a) => a.id === 'work').nextTriggerAt).toBe(new Date(2026, 10, 23, 6, 30).getTime());
  });

  it('refuses to import while an alarm is ringing', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 22, 6, 59));
    const p = createMockAlarmPlugin();
    await p.upsertAlarm({ ...defaultAlarm(), hour: 7, minute: 0 });
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(p.importAlarms([], [])).rejects.toMatchObject({ code: 'BUSY' });
  });
});
