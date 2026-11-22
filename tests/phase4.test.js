import { describe, it, expect } from 'vitest';
import * as E from '../src/features/focus/engine.js';
import { toggleSubtask, newTask, newSubtask, toggleTask, streak, heatmap, summary, minutesByDay } from '../src/features/focus/data.js';

const MIN = 60_000;
const plan = { focusMin: 25, breakMin: 5, cycles: 4, longBreakMin: 15, longEvery: 2 };

describe('pomodoro engine', () => {
  it('builds the segment sequence with long breaks in the right place', () => {
    const kinds = E.buildSequence(plan).map((s) => s.kind);
    expect(kinds).toEqual(['focus', 'break', 'focus', 'long_break', 'focus', 'break', 'focus']);
    expect(E.buildSequence(E.DEFAULT_PLAN).map((s) => s.kind)).toEqual(['focus', 'break', 'focus', 'break', 'focus', 'break', 'focus']);
    expect(E.buildSequence({ ...plan, cycles: 1 })).toHaveLength(1);
  });

  it('pause/resume keeps the total correct', () => {
    let r = E.createRun(plan, 0);
    expect(E.current(r, 10 * MIN).remainingMs).toBe(15 * MIN);
    r = E.pause(r, 10 * MIN);
    expect(E.current(r, 40 * MIN).remainingMs).toBe(15 * MIN); // time stands still while paused
    expect(E.current(r, 40 * MIN).endAt).toBeNull();
    r = E.resume(r, 40 * MIN);
    expect(E.current(r, 50 * MIN).remainingMs).toBe(5 * MIN);
    expect(E.current(r, 50 * MIN).endAt).toBe(55 * MIN);
    r = E.advance(r, 55 * MIN);
    expect(r.log[0]).toMatchObject({ kind: 'focus', activeMs: 25 * MIN, completed: true });
    expect(E.current(r, 55 * MIN)).toMatchObject({ kind: 'break', remainingMs: 5 * MIN, focusNumber: 1 });
  });

  it('counts focus number, minutes and finishes', () => {
    let r = E.createRun({ ...plan, cycles: 2 }, 0);
    r = E.advance(r, 25 * MIN);
    r = E.advance(r, 30 * MIN);
    expect(E.current(r, 30 * MIN).focusNumber).toBe(2);
    r = E.stop(r, 40 * MIN); // ended early, 10 of 25 min
    expect(E.isFinished(r)).toBe(true);
    expect(E.focusMinutes(r.log)).toBe(35);
    expect(E.cyclesDone(r.log)).toBe(1);
    expect(E.plannedFocusMinutes({ ...plan, cycles: 2 })).toBe(50);
  });

  it('validates plans and saved runs', () => {
    expect(E.validatePlan(E.DEFAULT_PLAN)).toEqual([]);
    expect(E.validatePlan({ ...plan, focusMin: 0 })).toContain('Focus must be 1–180 min');
    expect(E.sanitizeRun({ plan, index: 'x' })).toBeNull();
    expect(E.sanitizeRun(E.createRun(plan, 5)).seq).toHaveLength(7);
  });
});

describe('tasks', () => {
  it('auto-completes when all subtasks are ticked, and undoes', () => {
    let t = newTask('Chapter 4');
    t.subtasks = [newSubtask('Read 4.1'), newSubtask('Read 4.2')];
    t = toggleSubtask(t, t.subtasks[0].id, 1);
    expect(t.done).toBe(false);
    t = toggleSubtask(t, t.subtasks[1].id, 2);
    expect(t).toMatchObject({ done: true, completedAt: 2 });
    t = toggleSubtask(t, t.subtasks[1].id, 3);
    expect(t).toMatchObject({ done: false, completedAt: null });
    expect(toggleTask(t, 9)).toMatchObject({ done: true, completedAt: 9 });
  });
});

describe('focus stats', () => {
  const day = (d, h = 9) => new Date(2026, 10, d, h).getTime();
  const session = (d, minutes, completed = true, leaves = 0) => ({
    startedAt: day(d),
    leaves: Array(leaves).fill({}),
    segments: [{ kind: 'focus', start: day(d), activeMs: minutes * MIN, completed }],
  });

  it('streak counts consecutive days with a completed block', () => {
    const s = [session(20, 25), session(21, 25), session(22, 25)];
    expect(streak(s, day(22, 20))).toBe(3);
    expect(streak(s, day(23, 8))).toBe(3); // today not done yet
    expect(streak(s, day(24, 8))).toBe(0);
    expect(streak([session(21, 10, false)], day(21, 20))).toBe(0);
  });

  it('minutes per day, heatmap and summary', () => {
    const s = [session(22, 25, true, 2), session(22, 10, false, 0), session(15, 50)];
    expect(minutesByDay(s)['2026-11-22']).toBe(35);
    const h = heatmap(s, day(22, 20));
    expect(h).toHaveLength(84);
    expect(h.find((c) => new Date(c.date).getDate() === 22 && new Date(c.date).getMonth() === 10).minutes).toBe(35);
    const sum = summary(s, [{ completedAt: day(21) }], day(22, 20));
    expect(sum).toMatchObject({ todayMin: 35, weekMin: 35, tasksDoneWeek: 1, avgLeaves: 0.7, sessionsWeek: 2 });
  });
});
