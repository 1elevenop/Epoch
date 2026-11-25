import { describe, it, expect } from 'vitest';
import { sanitizeBg, isValidBg, checkImageFile, BG_MAX_BYTES } from '../src/core/background.js';
import { validateBackup } from '../src/features/settings/backup.js';
import { THEMES, contrast } from '../src/core/theme.js';

describe('backgrounds', () => {
  it('sanitizes anything to theme / colour / image', () => {
    expect(sanitizeBg(null)).toEqual({ mode: 'theme', color: '#000000', dim: 0.4 });
    expect(sanitizeBg({ mode: 'image', color: '#ABCDEF', dim: 0.2 })).toEqual({ mode: 'image', color: '#abcdef', dim: 0.2 });
    expect(sanitizeBg({ mode: 'video', color: 'red', dim: 5 })).toEqual({ mode: 'theme', color: '#000000', dim: 0.4 });
  });
  it('import accepts only clean background settings', () => {
    expect(isValidBg({ mode: 'color', color: '#112233', dim: 0 })).toBe(true);
    expect(isValidBg({ mode: 'color', color: '#112233', dim: 0, url: 'x' })).toBe(false);
    expect(isValidBg({ mode: 'gif', color: '#112233', dim: 0 })).toBe(false);
    expect(isValidBg([])).toBe(false);
  });
  it('checks picked files by type and size', () => {
    expect(checkImageFile({ type: 'image/jpeg', size: 1000 })).toBeNull();
    expect(checkImageFile({ type: 'image/png', size: 1000 })).toBeNull();
    expect(checkImageFile({ type: 'image/svg+xml', size: 10 })).toMatch(/JPEG/);
    expect(checkImageFile({ type: 'image/png', size: BG_MAX_BYTES + 1 })).toMatch(/100 MB/);
    expect(checkImageFile(null)).toMatch(/No file/);
  });
  it('backups carry both background settings and reject bad ones', () => {
    const base = { version: 1, alarms: [], alarmLogs: [], tasks: [], sessions: [] };
    const good = validateBackup({ ...base, settings: { bgApp: { mode: 'image', color: '#000000', dim: 0.4 }, bgBig: { mode: 'color', color: '#f5332c', dim: 0 } } });
    expect(good.errors).toEqual([]);
    const bad = validateBackup({ ...base, settings: { bgBig: { mode: 'image', color: 'javascript:1', dim: 0.4 } } });
    expect(bad.ok).toBe(false);
  });
  it('scarlet / black / creme palette keeps text readable', () => {
    for (const t of THEMES) expect(contrast(t.t.text, t.t.bg)).toBeGreaterThanOrEqual(7);
  });
});
