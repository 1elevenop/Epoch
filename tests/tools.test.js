import { describe, it, expect } from 'vitest';
import * as M from '../src/features/tools/models.js';

const S = 1000;

describe('run clock', () => {
  it('pauses and resumes from timestamps', () => {
    let r = M.startRun(0);
    expect(M.elapsed(r, 5 * S)).toBe(5 * S);
    r = M.pauseRun(r, 5 * S);
    expect(M.elapsed(r, 60 * S)).toBe(5 * S);
    r = M.resumeRun(r, 60 * S);
    expect(M.elapsed(r, 62 * S)).toBe(7 * S);
  });
  it('rejects broken stored runs', () => {
    expect(M.sanitizeRun({ startedAt: 10, pausedAt: null, pausedMs: 0 }, 100)).toBeTruthy();
    expect(M.sanitizeRun({ startedAt: 500, pausedMs: 0 }, 100)).toBeNull(); // in the future
    expect(M.sanitizeRun({ startedAt: 'x' })).toBeNull();
    expect(M.sanitizeRun({ startedAt: 10, pausedAt: 5, pausedMs: 0 }, 100)).toBeNull();
  });
});

describe('interval / HIIT', () => {
  it('Tabata = 10 s prep + 8 × (20 work / 10 rest) without a trailing rest', () => {
    const segs = M.segments(M.TABATA);
    expect(segs.length).toBe(1 + 8 + 7);
    expect(segs.filter((s) => s.kind === 'work').length).toBe(8);
    expect(segs.at(-1).kind).toBe('work');
    expect(M.totalMs(segs)).toBe((10 + 8 * 20 + 7 * 10) * S);
  });
  it('uses rest-between-sets between sets only', () => {
    const segs = M.segments({ prep: 0, work: 30, rest: 15, rounds: 3, sets: 2, setRest: 90 });
    expect(segs.map((s) => s.kind).join(',')).toBe('work,rest,work,rest,work,setRest,work,rest,work,rest,work');
    expect(segs[5].secs).toBe(90);
    expect(segs[6]).toMatchObject({ set: 2, round: 1 });
  });
  it('finds the current segment and the end', () => {
    const segs = M.segments(M.TABATA);
    expect(M.intervalAt(segs, 0)).toMatchObject({ index: 0, remainingMs: 10 * S });
    expect(M.intervalAt(segs, 10 * S).seg).toMatchObject({ kind: 'work', round: 1 });
    expect(M.intervalAt(segs, 35 * S)).toMatchObject({ remainingMs: 5 * S });
    expect(M.intervalAt(segs, 35 * S).seg.kind).toBe('rest');
    expect(M.intervalAt(segs, M.totalMs(segs)).done).toBe(true);
  });
  it('cues 3-2-1 before each change and a final end cue', () => {
    const segs = M.segments({ prep: 5, work: 20, rest: 2, rounds: 2, sets: 1 });
    const c = M.cues(segs);
    expect(c.filter((x) => x.at === 5 * S)[0]).toMatchObject({ kind: 'go', next: 'work' });
    expect(c.filter((x) => x.kind === 'tick' && x.at < 5 * S).map((x) => x.n)).toEqual([3, 2, 1]);
    // a 2 s rest only gets the "1" tick
    expect(c.filter((x) => x.kind === 'tick' && x.at > 25 * S && x.at < 27 * S).map((x) => x.n)).toEqual([1]);
    expect(c.at(-1)).toMatchObject({ kind: 'end', at: M.totalMs(segs) });
  });
  it('sanitizes plans', () => {
    expect(M.sanitizePlan({ work: -5, rounds: 1000, name: '' })).toMatchObject({ work: 1, rounds: 99, name: 'Custom' });
  });
});

describe('breathing', () => {
  it('walks through the box pattern and grows/shrinks the circle', () => {
    const st = M.BREATHING.box.steps;
    expect(M.breathAt(st, 0)).toMatchObject({ cycle: 0, step: 0, name: 'Breathe in', scale: 0.5 });
    expect(M.breathAt(st, 2 * S).scale).toBeCloseTo(0.75, 5);
    expect(M.breathAt(st, 5 * S)).toMatchObject({ step: 1, scale: 1, stepRemainingMs: 3 * S });
    expect(M.breathAt(st, 10 * S).step).toBe(2);
    expect(M.breathAt(st, 17 * S)).toMatchObject({ cycle: 1, step: 0 });
  });
  it('4-7-8 skips the empty last hold', () => {
    const st = M.BREATHING['478'].steps;
    expect(M.breathAt(st, 11 * S).step).toBe(2);
    expect(M.breathAt(st, 19 * S)).toMatchObject({ cycle: 1, step: 0 });
  });
});

describe('event countdowns', () => {
  const now = new Date(2026, 10, 22, 23, 30).getTime(); // 22 Nov 2026, late evening
  it('counts calendar days, not 24 h blocks', () => {
    expect(M.daysUntil('2026-11-22', now)).toBe(0);
    expect(M.daysUntil('2026-11-23', now)).toBe(1);
    expect(M.daysUntil('2027-01-08', now)).toBe(47);
    expect(M.daysUntil('2026-11-19', now)).toBe(-3);
    expect([0, 1, -1, 47, -3].map(M.daysLabel)).toEqual(['Today', 'Tomorrow', 'Yesterday', '47 days', '3 days ago']);
  });
  it('validates and sorts', () => {
    expect(M.validDate('2026-02-30')).toBe(false);
    expect(M.validDate('2028-02-29')).toBe(true);
    const list = M.sanitizeCountdowns([
      { id: 'a', title: 'Past', date: '2026-11-01' },
      { id: 'b', title: 'Far', date: '2027-06-01' },
      { id: 'c', title: 'Soon', date: '2026-11-25', onClock: false },
      { id: 'd', title: '', date: '2026-12-01' },
      { id: 'e', title: 'Bad', date: 'tomorrow' },
      null,
    ]);
    expect(list.map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(list[2].onClock).toBe(false);
    expect(M.sortCountdowns(list, now).map((c) => c.title)).toEqual(['Soon', 'Far', 'Past']);
  });
});

describe('chess clock', () => {
  it('runs the opponent after a tap, adds increment, flags at zero', () => {
    let c = M.newChess(3, 2);
    c = M.chessTap(c, 0, 0); // side 0 taps first → side 1 runs
    expect(c.active).toBe(1);
    c = M.chessTap(c, 1, 10 * S);
    expect(c.left[1]).toBe(180 * S - 10 * S + 2 * S);
    expect(c.active).toBe(0);
    expect(c.moves).toEqual([0, 1]);
    expect(M.chessTap(c, 1, 11 * S)).toBe(c); // wrong side tapping does nothing
    c = M.chessPause(c, 20 * S);
    expect(M.chessLeft(c, 0, 999 * S)).toBe(170 * S);
    c = M.chessResume(c, 1000 * S);
    expect(M.chessFlag(c, 1100 * S)).toBeNull();
    const f = M.chessFlag(c, 1170 * S);
    expect(f).toMatchObject({ flag: 0 });
    expect(f.left[0]).toBe(0);
    expect(M.chessTap(f, 0, 1200 * S)).toBe(f);
  });
});

describe('speech timer', () => {
  it('goes green → yellow → red', () => {
    expect(M.speechColor(4 * 60 * S, 5, 7)).toBe('green');
    expect(M.speechColor(5 * 60 * S, 5, 7)).toBe('yellow');
    expect(M.speechColor(8 * 60 * S, 5, 7)).toBe('red');
  });
});
