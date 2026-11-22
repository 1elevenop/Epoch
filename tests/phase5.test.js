import { describe, it, expect } from 'vitest';
import { diff } from '../src/features/bigdisplay/digits.js';
import { TRANSITIONS, transitionById } from '../src/features/bigdisplay/transitions/index.js';
import { SEGMENTS } from '../src/features/bigdisplay/transitions/fx.js';
import { THEMES, contrast, themeById, onAccent } from '../src/core/theme.js';
import { timerView, stopwatchView, focusView, pickTimer } from '../src/features/bigdisplay/sources.js';
import * as T from '../src/features/timer/model.js';
import * as SW from '../src/features/stopwatch/model.js';
import * as E from '../src/features/focus/engine.js';

const MIN = 60_000;

describe('digit diff', () => {
  it('reports only changed characters', () => {
    expect(diff('12:34', '12:35')).toEqual({ rebuild: false, changed: [{ i: 4, from: '4', to: '5' }] });
    expect(diff('19:59', '20:00').changed.map((c) => c.i)).toEqual([0, 1, 3, 4]);
    expect(diff('12:34', '12:34').changed).toEqual([]);
  });
  it('rebuilds when the layout changes (59:59 → 1:00:00, first draw)', () => {
    expect(diff('59:59', '1:00:00').rebuild).toBe(true);
    expect(diff(null, '00:00').rebuild).toBe(true);
  });
});

describe('transitions', () => {
  it('has 9 styles, each with set and change', () => {
    expect(TRANSITIONS.map((t) => t.id)).toEqual(['flip', 'glitch', 'odometer', 'scramble', 'nixie', 'holo', 'particles', 'liquid', 'segment']);
    for (const t of TRANSITIONS) {
      expect(typeof t.set).toBe('function');
      expect(typeof t.change).toBe('function');
      expect(t.name).toBeTruthy();
    }
    expect(transitionById('nope').id).toBe('flip');
  });
  it('7-segment table is right', () => {
    expect(SEGMENTS[8]).toBe('abcdefg');
    expect(SEGMENTS[1]).toBe('bc');
    expect(Object.keys(SEGMENTS)).toHaveLength(10);
  });
});

describe('themes', () => {
  const REQUIRED = ['bg', 'surface', 'raised', 'border', 'text', 'text2', 'accent', 'glow'];
  it('12 themes with all tokens and unique ids', () => {
    expect(THEMES).toHaveLength(12);
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(12);
    for (const t of THEMES) for (const k of REQUIRED) expect(t.t[k], `${t.id}.${k}`).toBeTruthy();
    expect(themeById('missing').id).toBe('oled');
  });
  it('text contrast ≥ 4.5:1 on background and surface (rule 9)', () => {
    for (const t of THEMES) {
      const surface = t.t.solidSurface ?? t.t.surface;
      expect(contrast(t.t.text, t.t.bg), `${t.id} text/bg`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.t.text, surface), `${t.id} text/surface`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.t.text2, t.t.bg), `${t.id} text2/bg`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(onAccent(t, t.t.accent), t.t.accent), `${t.id} button text`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('big display sources', () => {
  it('timer: shows the soonest timer, overtime in red', () => {
    const a = T.start(T.createTimer(10 * MIN, 'Tea'), 0);
    const b = T.start(T.createTimer(5 * MIN, 'Eggs'), 0);
    expect(pickTimer([a, b], 0).label).toBe('Eggs');
    expect(timerView([a, b], 60_500)).toMatchObject({ text: '04:00', over: false });
    const done = T.settle(b, 5 * MIN);
    const v = timerView([a, done], 5 * MIN + 42_000);
    expect(v).toMatchObject({ text: '−00:42', over: true });
    expect(v.label).toMatch(/Eggs · time's up · \+1 more/);
    expect(timerView([], 0).label).toBe('No timer running');
  });
  it('stopwatch: hundredths are the fast digits', () => {
    const sw = SW.start(SW.createStopwatch(), 0);
    const v = stopwatchView(sw, 61_230);
    expect(v.text).toBe('01:01.23');
    expect(v.fastFrom).toBe(6);
  });
  it('focus: remaining time and phase label', () => {
    const state = { run: E.createRun({ focusMin: 25, breakMin: 5, cycles: 4, longBreakMin: 15, longEvery: 4 }, 0) };
    expect(focusView(state, 10 * MIN)).toMatchObject({ text: '15:00', label: 'Focus · 1 of 4' });
    expect(focusView(null, 0).label).toBe('No session');
  });
});
