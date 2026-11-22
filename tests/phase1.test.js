import { describe, it, expect, vi, afterEach } from 'vitest';
import * as SW from '../src/features/stopwatch/model.js';
import * as T from '../src/features/timer/model.js';
import { zoneOffsetMin, relativeOffset, zoneParts, isValidZone } from '../src/features/clock/zones.js';
import { CITIES } from '../src/features/clock/cities.js';
import { formatStopwatch, formatUntil, formatHMS } from '../src/core/time.js';
import { subscribe } from '../src/core/ticker.js';

// The real bridge is Android-only; unit tests run the app code against the fake native plugin.
vi.mock('../src/core/bridge.js', async () => {
  const { createMockAlarmPlugin } = await import('./support/fake-alarm-plugin.js');
  return { AlarmPlugin: createMockAlarmPlugin() };
});

describe('stopwatch model', () => {
  it('accumulates across pause/resume and records laps', () => {
    let sw = SW.start(SW.createStopwatch(), 1000);
    sw = SW.lap(sw, 4000); // 3 s
    sw = SW.pause(sw, 5000); // 4 s total
    expect(SW.elapsed(sw, 99_999)).toBe(4000); // paused: time stands still
    sw = SW.start(sw, 10_000);
    sw = SW.lap(sw, 11_500); // total 5.5 s, split 2.5 s
    expect(sw.laps).toEqual([
      { totalMs: 3000, splitMs: 3000 },
      { totalMs: 5500, splitMs: 2500 },
    ]);
    expect(SW.extremes(sw.laps)).toEqual({ fastest: 1, slowest: 0 });
  });

  it('has no drift over 10 minutes of ticking (time is computed, not counted)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const sw = SW.start(SW.createStopwatch(), Date.now());
    let shown = 0;
    const off = subscribe((t) => (shown = SW.elapsed(sw, t)), { fps: 30 });
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    off();
    expect(Math.abs(shown - 10 * 60_000)).toBeLessThan(50);
    vi.useRealTimers();
  });

  it('formats laps as text and rejects bad saved data', () => {
    expect(SW.lapsText([{ totalMs: 61_230, splitMs: 61_230 }])).toBe('Lap 1\t01:01.23\t01:01.23');
    expect(SW.sanitize({ startedAt: 'x', accumulatedMs: -5, laps: [{ totalMs: 'a' }] })).toEqual(SW.createStopwatch());
  });
});

describe('timer model', () => {
  afterEach(() => vi.useRealTimers());

  it('runs, pauses, resumes and finishes from timestamps', () => {
    let t = T.start(T.createTimer(60_000, 'Tea'), 0);
    expect(T.remaining(t, 20_000)).toBe(40_000);
    t = T.pause(t, 20_000);
    expect(T.remaining(t, 500_000)).toBe(40_000);
    t = T.start(t, 100_000);
    expect(t.endAt).toBe(140_000);
    expect(T.settle(t, 139_999)).toBe(t);
    const done = T.settle(t, 140_000);
    expect(done.state).toBe('done');
    expect(T.remaining(done, 182_000)).toBe(-42_000); // overtime
  });

  it('+1 min works in every state', () => {
    const running = T.addMinute(T.start(T.createTimer(60_000), 0), 10_000);
    expect(running.endAt).toBe(120_000);
    const idle = T.addMinute(T.createTimer(60_000));
    expect(idle.remainingMs).toBe(120_000);
    const done = T.addMinute({ ...running, state: 'done' }, 500_000);
    expect(done).toMatchObject({ state: 'running', endAt: 560_000 });
  });

  it('three timers run together independently', () => {
    const ts = [10_000, 20_000, 30_000].map((d) => T.start(T.createTimer(d), 0));
    const at15 = ts.map((t) => T.settle(t, 15_000).state);
    expect(at15).toEqual(['done', 'running', 'running']);
  });

  it('sanitizes saved timers', () => {
    const good = T.createTimer(5000);
    expect(T.sanitize([good, { id: 1 }, null, { ...good, id: 'x', state: 'running', endAt: null }])).toEqual([good]);
    expect(T.sanitize('nope')).toEqual([]);
  });
});

describe('world clocks', () => {
  it('computes zone offsets with DST', () => {
    expect(zoneOffsetMin('Asia/Kolkata', Date.UTC(2026, 0, 1))).toBe(330);
    expect(zoneOffsetMin('Europe/London', Date.UTC(2026, 0, 15))).toBe(0);
    expect(zoneOffsetMin('Europe/London', Date.UTC(2026, 6, 15))).toBe(60);
    expect(zoneParts('Asia/Kolkata', Date.UTC(2026, 0, 1, 0, 0))).toMatchObject({ h: 5, m: 30 });
  });

  it('formats the offset relative to the device', () => {
    expect(relativeOffset(Intl.DateTimeFormat().resolvedOptions().timeZone)).toBe('±0');
  });

  it('bundles ~400+ valid cities', () => {
    expect(CITIES.length).toBeGreaterThan(400);
    expect(CITIES.every(([n, , z]) => n && isValidZone(z))).toBe(true);
    expect(CITIES.some(([n]) => n === 'Mumbai')).toBe(true);
  });
});

describe('formatters', () => {
  it('formats stopwatch, countdown-until and 12 h time', () => {
    expect(formatStopwatch(3_723_450)).toBe('1:02:03.45');
    expect(formatUntil((7 * 60 + 20) * 60_000)).toBe('7 h 20 m');
    expect(formatHMS(0, 5, 0, { hour12: true })).toBe('12:05');
    expect(formatHMS(13, 5, 9, { hour12: true, seconds: true })).toBe('1:05:09');
  });
});

describe('timer service', () => {
  it('fires the done handler without re-entering the ticker', async () => {
    vi.useFakeTimers();
    const err = vi.spyOn(console, 'error');
    const { timerService } = await import('../src/features/timer/service.js');
    const onDone = vi.fn();
    timerService.init(onDone);
    const t = timerService.add(2000, 'Quick');
    timerService.add(60_000, 'Long');
    await vi.advanceTimersByTimeAsync(2500);
    expect(onDone).toHaveBeenCalled();
    expect(timerService.list().find((x) => x.id === t.id).state).toBe('done');
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
    vi.useRealTimers();
  });
});
