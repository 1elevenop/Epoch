import { describe, it, expect, vi, afterEach } from 'vitest';
import { rng, escalation, shouldEscape, ESCAPE_CHAIN } from '../src/features/challenges/rules.js';
import * as math from '../src/features/challenges/math.js';
import * as type from '../src/features/challenges/type.js';
import * as memory from '../src/features/challenges/memory.js';
import { createShakeCounter, shakeCount } from '../src/features/challenges/shake.js';
import { stepCount } from '../src/features/challenges/steps.js';
import { summarize } from '../src/features/alarm/log.js';
import { createMockAlarmPlugin } from './support/fake-alarm-plugin.js';
import { defaultAlarm, validateAlarm } from '../src/features/alarm/model.js';

describe('seeded randomness', () => {
  it('is repeatable for the same seed', () => {
    const a = rng(42);
    const b = rng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    const r = rng(1);
    for (let i = 0; i < 200; i++) {
      const n = r.int(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
    }
  });
});

describe('escalation (mirrors Escalation.kt)', () => {
  it('snooze lengths 5 then 3, third snooze locked (T9)', () => {
    expect(escalation.snoozeLengthMin(5, 1, true)).toBe(5);
    expect(escalation.snoozeLengthMin(5, 2, true)).toBe(3);
    expect(escalation.canSnooze(0, 3, true, false, null).allowed).toBe(true);
    expect(escalation.canSnooze(1, 3, true, false, null).allowed).toBe(true);
    expect(escalation.canSnooze(2, 3, true, false, null)).toEqual({ allowed: false, left: 0, reason: 'locked' });
  });
  it('weekly budget runs out', () => {
    expect(escalation.budgetLeft(null, 9)).toBeNull();
    expect(escalation.canSnooze(0, 3, true, false, escalation.budgetLeft(2, 2)).reason).toBe('budget');
  });
  it('challenge gets harder each snooze, max 4; escalated = one level up', () => {
    expect([0, 1, 2, 3].map((n) => escalation.challengeLevel(2, n, false))).toEqual([2, 3, 4, 4]);
    expect(escalation.challengeLevel(1, 0, true)).toBe(2); // missed wake-check: one level up, not the hardest
    expect(escalation.challengeLevel(4, 0, true)).toBe(4);
    expect(escalation.canSnooze(0, 3, true, true, null).allowed).toBe(false);
  });
});

describe('escape hatch', () => {
  const t0 = 1_000_000;
  it('triggers for qr/steps/shake after 3 fails, 5 min, or unavailable', () => {
    expect(shouldEscape({ id: 'qr', fails: 2, startedAt: t0, now: t0 + 1000 })).toBe(false);
    expect(shouldEscape({ id: 'qr', fails: 3, startedAt: t0, now: t0 + 1000 })).toBe(true);
    expect(shouldEscape({ id: 'steps', fails: 0, startedAt: t0, now: t0 + 5 * 60_000 })).toBe(true);
    expect(shouldEscape({ id: 'shake', startedAt: t0, now: t0, unavailable: true })).toBe(true);
  });
  it('never for math/type/memory, and falls back to math L4 + type 12 words', () => {
    expect(shouldEscape({ id: 'math', fails: 10, startedAt: t0, now: t0 + 10 * 60_000 })).toBe(false);
    expect(ESCAPE_CHAIN).toEqual([{ id: 'math', level: 4 }, { id: 'type', level: 4 }]);
    expect(type.wordCount(4)).toBe(12);
  });
});

describe('challenge generators', () => {
  it('math answers are correct for every level', () => {
    const r = rng(7);
    for (let level = 1; level <= 4; level++) {
      for (let i = 0; i < 50; i++) {
        const p = math.problem(level, r);
        const expr = p.text.replace(/×/g, '*');
        expect(Function(`return ${expr}`)()).toBe(p.answer);
      }
    }
    expect(math.problemCount(4)).toBe(3);
  });
  it('math ranges match the levels', () => {
    const r = rng(9);
    expect(math.problem(1, r).text).toMatch(/^\d \+ \d$/);
    expect(math.problem(2, r).text).toMatch(/^\d{2} \+ \d$/);
    expect(math.problem(3, r).text).toMatch(/^\d{2} \+ \d{2}$/);
    expect(math.problem(4, r).text).toMatch(/^\d × \d$/);
  });
  it('type phrases have 4/6/9/12 words and match exactly', () => {
    const r = rng(3);
    expect([1, 2, 3, 4].map((l) => type.phrase(l, r).split(' ').length)).toEqual([4, 6, 9, 12]);
    expect(type.matches('  apple   river ', 'apple river')).toBe(true);
    expect(type.matches('Apple river', 'apple river')).toBe(false);
  });
  it('memory patterns have the right length, fit the grid, no immediate repeats', () => {
    const r = rng(5);
    for (let level = 1; level <= 4; level++) {
      const p = memory.pattern(level, r);
      expect(p).toHaveLength(memory.patternLength(level));
      const cells = memory.gridSize(p.length) ** 2;
      expect(p.every((c) => c >= 0 && c < cells)).toBe(true);
      expect(p.every((c, i) => i === 0 || c !== p[i - 1])).toBe(true);
    }
    expect(memory.gridSize(8)).toBe(4);
  });
  it('shake counter needs force and debounces 250 ms', () => {
    const count = createShakeCounter();
    expect(count(5, 0)).toBe(false);
    expect(count(20, 0)).toBe(true);
    expect(count(20, 100)).toBe(false);
    expect(count(20, 260)).toBe(true);
    expect(shakeCount(4)).toBe(90);
    expect(stepCount(1)).toBe(20);
  });
});

describe('alarm validation', () => {
  it('needs a registered QR code when qr is in the chain', () => {
    const a = defaultAlarm();
    expect(validateAlarm({ ...a, challenge: { chain: ['qr', 'math'], level: 2, qrPayload: null } })).toContain('Register a QR code first');
    expect(validateAlarm({ ...a, challenge: { chain: ['qr'], level: 2, qrPayload: 'EPOCH-ab' } })).toEqual([]);
    expect(validateAlarm({ ...a, challenge: { chain: [], level: 2 } })).toContain('Pick 1–4 challenges');
  });
});

describe('mock: wake-check and escalation flow', () => {
  afterEach(() => vi.useRealTimers());

  async function ringingAlarm(extra = {}) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 23, 6, 59));
    const p = createMockAlarmPlugin();
    const a = await p.upsertAlarm({ ...defaultAlarm(), hour: 7, minute: 0, ...extra });
    await vi.advanceTimersByTimeAsync(60_000);
    return { p, a };
  }

  it('wake-check passed when confirmed in time', async () => {
    const { p, a } = await ringingAlarm();
    await p.dismiss(a.id, { fails: 1 });
    expect((await p.getRingState()).phase).toBe('WAKE_CHECK_PENDING');
    await vi.advanceTimersByTimeAsync(4 * 60_000);
    expect((await p.getRingState()).phase).toBe('WAKE_CHECK_PROMPT');
    await p.confirmAwake(a.id);
    expect(await p.getRingState()).toBeNull();
    expect((await p.getLogs())[0]).toMatchObject({ wakeCheck: 'passed', challengeFails: 1, outcome: 'dismissed' });
  });

  it('no tap → rings again with snooze locked (T12)', async () => {
    const { p, a } = await ringingAlarm();
    await p.dismiss(a.id);
    await vi.advanceTimersByTimeAsync(5 * 60_000 + 1000);
    const c = await p.getRingContext();
    expect(c.state).toMatchObject({ phase: 'RINGING', escalated: true, challengeLevel: 4 });
    expect(c.snoozeAllowed).toBe(false);
    expect((await p.getLogs())[0].wakeCheck).toBe('failed');
    await p.dismiss(a.id);
    expect(await p.getRingState()).toBeNull();
    expect(await p.getLogs()).toHaveLength(1);
  });

  it('snooze escalation: 5 min, 3 min, then locked (T9)', async () => {
    const { p, a } = await ringingAlarm({ wakeCheck: { enabled: false } });
    expect((await p.getRingContext()).nextSnoozeMin).toBe(5);
    await p.snooze(a.id);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    const c2 = await p.getRingContext();
    expect(c2.state.challengeLevel).toBe(3);
    expect(c2.nextSnoozeMin).toBe(3);
    await p.snooze(a.id);
    await vi.advanceTimersByTimeAsync(3 * 60_000);
    const c3 = await p.getRingContext();
    expect(c3.snoozeAllowed).toBe(false);
    expect(c3.state.challengeLevel).toBe(4);
    expect((await p.snooze(a.id)).allowed).toBe(false);
  });
});

describe('alarm log summary', () => {
  it('averages snoozes and ignores test alarms', () => {
    const now = Date.now();
    const logs = [
      { firstRangAt: now - 1000, snoozes: 2, outcome: 'dismissed', wakeCheck: 'passed', label: 'Work' },
      { firstRangAt: now - 2000, snoozes: 0, outcome: 'dismissed', wakeCheck: 'failed', label: 'Work' },
      { firstRangAt: now - 3000, snoozes: 9, outcome: 'dismissed', wakeCheck: 'off', label: 'Test alarm' },
      { firstRangAt: now - 30 * 86_400_000, snoozes: 9, outcome: 'missed', wakeCheck: 'off', label: 'Old' },
    ];
    expect(summarize(logs, now)).toEqual({ count: 2, avgSnoozes: 1, dismissed: 2, wakeFailed: 1 });
  });
});

describe('math answer check (bug: right answers reported wrong)', () => {
  it('accepts the exact answer, rejects others and junk', () => {
    expect(math.check('104', 104)).toBe(true);
    expect(math.check('0104', 104)).toBe(true);
    expect(math.check('105', 104)).toBe(false);
    expect(math.check('', 0)).toBe(false);
    expect(math.check('1e2', 100)).toBe(false);
  });
  it('every generated problem is solvable through check()', () => {
    const r = rng(11);
    for (let level = 1; level <= 4; level++) {
      for (let i = 0; i < 100; i++) {
        const p = math.problem(level, r);
        expect(math.check(String(p.answer), p.answer)).toBe(true);
      }
    }
  });
});
