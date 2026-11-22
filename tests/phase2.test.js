import { describe, it, expect, vi, afterEach } from 'vitest';
import { nextTrigger } from '../src/core/time.js';
import { createMockAlarmPlugin } from './support/fake-alarm-plugin.js';
import { defaultAlarm, oneShotAlarm, describeDays, validateAlarm, isRepeating, errorText } from '../src/features/alarm/model.js';
import { oemSteps } from '../src/features/settings/reliability.js';

const at = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();

describe('nextTrigger mirror (matches native NextTrigger)', () => {
  it('uses oneShotAt when set', () => {
    expect(nextTrigger({ hour: 6, minute: 0, oneShotAt: 5000 }, 1000)).toBe(5000);
    expect(nextTrigger({ hour: 6, minute: 0, oneShotAt: 500 }, 1000)).toBeNull();
  });
  it('exactly-now rolls to tomorrow', () => {
    expect(nextTrigger({ hour: 6, minute: 0 }, at(2026, 11, 22, 6, 0))).toBe(at(2026, 11, 23, 6, 0));
  });
  it('Sunday is 0', () => {
    expect(nextTrigger({ hour: 7, minute: 0, days: [0] }, at(2026, 11, 21, 12))).toBe(at(2026, 11, 22, 7));
  });
});

describe('alarm model', () => {
  it('describes repeat days', () => {
    expect(describeDays([])).toBe('Once');
    expect(describeDays([0, 1, 2, 3, 4, 5, 6])).toBe('Every day');
    expect(describeDays([1, 2, 3, 4, 5])).toBe('Weekdays');
    expect(describeDays([0, 6])).toBe('Weekends');
    expect(describeDays([3, 1])).toBe('Mon, Wed');
  });

  it('validates input before it reaches native', () => {
    expect(validateAlarm(defaultAlarm())).toEqual([]);
    expect(validateAlarm({ ...defaultAlarm(), hour: 24 })).toContain('Hour must be 0–23');
    expect(validateAlarm({ ...defaultAlarm(), soundId: 'nope' })).toContain('Unknown sound');
    expect(validateAlarm({ ...defaultAlarm(), days: [7] })).toContain('Bad repeat days');
  });

  it('builds one-shot nap/test alarms that delete themselves', () => {
    const a = oneShotAlarm(10_000, 'Test alarm', 1_000_000);
    expect(a).toMatchObject({ oneShotAt: 1_010_000, deleteAfterUse: true, label: 'Test alarm', rampSec: 5 });
    expect(isRepeating(a)).toBe(false);
  });

  it('maps error codes to readable text', () => {
    expect(errorText({ code: 'EXACT_ALARM_DENIED' })).toMatch(/Reliability/);
  });

  it('picks Samsung battery steps', () => {
    expect(oemSteps('samsung').steps.join(' ')).toMatch(/Never sleeping apps/);
    expect(oemSteps('Google').name).toBe('Google');
  });
});

describe('bridge mock alarm flow', () => {
  afterEach(() => vi.useRealTimers());

  it('test alarm rings in 10 s, logs on dismiss and deletes itself', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(at(2026, 11, 22, 9, 0));
    const p = createMockAlarmPlugin();
    const started = vi.fn();
    await p.addListener('ringStarted', started);
    await p.upsertAlarm(oneShotAlarm(10_000, 'Test alarm'));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(started).toHaveBeenCalledTimes(1);
    const { alarmId } = await p.getRingState();
    await p.dismiss(alarmId);
    expect(await p.listAlarms()).toHaveLength(0);
    const logs = await p.getLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ label: 'Test alarm', outcome: 'dismissed', snoozes: 0 });
  });

  it('one-time alarm switches off after it fires; repeating alarm re-arms', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(at(2026, 11, 22, 6, 59)); // Sunday
    const p = createMockAlarmPlugin();
    const once = await p.upsertAlarm({ ...defaultAlarm(), hour: 7, minute: 0, days: [] });
    const daily = await p.upsertAlarm({ ...defaultAlarm(), hour: 7, minute: 0, days: [0, 1, 2, 3, 4, 5, 6] });
    await vi.advanceTimersByTimeAsync(60_000);
    const list = await p.listAlarms();
    expect(list.find((a) => a.id === once.id).enabled).toBe(false);
    expect(list.find((a) => a.id === daily.id).nextTriggerAt).toBe(at(2026, 11, 23, 7, 0));
  });
});
