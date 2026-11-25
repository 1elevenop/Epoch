import { describe, it, expect } from 'vitest';
import { TABS, PAGES, homeTab } from '../src/features/tabs.js';

describe('navigation (Epoch 2.0)', () => {
  it('has the six Epoch tabs in order', () => {
    expect(TABS.map((t) => t.id)).toEqual(['alarm', 'timer', 'stopwatch', 'focus', 'tools', 'audio']);
  });
  it('falls back to Alarm for removed or unknown saved tabs', () => {
    expect(homeTab('clock')).toBe('alarm');
    expect(homeTab('more')).toBe('alarm');
    expect(homeTab(undefined)).toBe('alarm');
    expect(homeTab('stopwatch')).toBe('stopwatch');
  });
  it('every page points at an existing tab or none', () => {
    const ids = new Set(TABS.map((t) => t.id));
    for (const p of PAGES) expect(p.tab === null || ids.has(p.tab)).toBe(true);
  });
  it('keeps the clock reachable as a Tools page', () => {
    expect(PAGES.find((p) => p.id === 'tool-clock')?.tab).toBe('tools');
  });
});
