import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatDuration, formatClock, nextTrigger } from '../src/core/time.js';
import { subscribe, subscriberCount } from '../src/core/ticker.js';
import { createMockAlarmPlugin } from './support/fake-alarm-plugin.js';
import { getSettings, setSetting, DEFAULT_SETTINGS } from '../src/core/store.js';

const at = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();

describe('time', () => {
  it('formats durations, including overtime', () => {
    expect(formatDuration(65_000)).toBe('01:05');
    expect(formatDuration(3_661_000)).toBe('1:01:01');
    expect(formatDuration(-42_000)).toBe('−00:42');
  });

  it('formats clock time', () => {
    expect(formatClock(new Date(2026, 0, 1, 7, 5, 9), { seconds: true })).toBe('07:05:09');
  });

  it('one-time alarm already passed today → tomorrow', () => {
    // 2026-11-22 is a Sunday
    expect(nextTrigger({ hour: 6, minute: 0 }, at(2026, 11, 22, 8))).toBe(at(2026, 11, 23, 6));
  });

  it('repeat days cross the week boundary', () => {
    // Saturday 23:00, alarm Mon only → Monday
    expect(nextTrigger({ hour: 6, minute: 30, days: [1] }, at(2026, 11, 28, 23))).toBe(at(2026, 11, 30, 6, 30));
  });

  it('skipNext jumps one occurrence', () => {
    expect(nextTrigger({ hour: 6, minute: 0, days: [1, 2], skipNext: true }, at(2026, 11, 22, 8))).toBe(
      at(2026, 11, 24, 6),
    );
  });
});

describe('ticker', () => {
  it('calls subscribers with Date.now() and unsubscribes cleanly', async () => {
    const seen = [];
    const off = subscribe((t) => seen.push(t), { fps: 60 });
    expect(seen).toHaveLength(1);
    await new Promise((r) => setTimeout(r, 80));
    off();
    expect(seen.length).toBeGreaterThan(1);
    expect(subscriberCount()).toBe(0);
  });

  it('keeps running when one subscriber throws', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    let calls = 0;
    const offBad = subscribe(() => {
      throw new Error('boom');
    });
    const offGood = subscribe(() => calls++);
    await new Promise((r) => setTimeout(r, 50));
    offBad();
    offGood();
    expect(calls).toBeGreaterThan(1);
    err.mockRestore();
  });
});

describe('bridge mock', () => {
  afterEach(() => vi.useRealTimers());

  it('upserts, lists, toggles and deletes alarms', async () => {
    const p = createMockAlarmPlugin();
    const a = await p.upsertAlarm({ hour: 7, minute: 0, label: 'Wake' });
    expect(a.id).toBeTruthy();
    expect(a.nextTriggerAt).toBeGreaterThan(Date.now());
    expect(await p.listAlarms()).toHaveLength(1);
    expect((await p.setEnabled(a.id, false)).nextTriggerAt).toBeNull();
    await p.deleteAlarm(a.id);
    expect(await p.listAlarms()).toHaveLength(0);
  });

  it('rejects invalid alarms', async () => {
    const p = createMockAlarmPlugin();
    await expect(p.upsertAlarm({ hour: '7', minute: 0 })).rejects.toThrow();
  });

  it('rings at the trigger time and supports snooze + dismiss', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(at(2026, 11, 22, 6, 59));
    const p = createMockAlarmPlugin();
    const started = vi.fn();
    await p.addListener('ringStarted', started);
    const a = await p.upsertAlarm({ hour: 7, minute: 0, snooze: { lengthMin: 5, max: 1 }, wakeCheck: { enabled: false } });

    await vi.advanceTimersByTimeAsync(60_000);
    expect(started).toHaveBeenCalledTimes(1);
    expect((await p.getRingState()).phase).toBe('RINGING');

    expect((await p.snooze(a.id)).allowed).toBe(true);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(started).toHaveBeenCalledTimes(2);
    expect((await p.snooze(a.id)).allowed).toBe(false); // max reached

    await p.dismiss(a.id);
    expect(await p.getRingState()).toBeNull();
  });
});

describe('settings', () => {
  it('falls back to defaults and stores known keys only', () => {
    expect(getSettings().lastTab).toBe(DEFAULT_SETTINGS.lastTab);
    setSetting('lastTab', 'timer');
    expect(getSettings().lastTab).toBe('timer');
    expect(() => setSetting('nope', 1)).toThrow();
  });
});
