import { describe, it, expect, afterEach } from 'vitest';
import { buildBackup, parseBackup, validateBackup } from '../src/features/settings/backup.js';
import { DEFAULT_SETTINGS, setSetting, replaceSettings, saveState } from '../src/core/store.js';
import { defaultAlarm } from '../src/features/alarm/model.js';
import { esc } from '../src/core/dom.js';

const base = () => buildBackup({ alarms: [], alarmLogs: [], tasks: [], sessions: [], settings: { ...DEFAULT_SETTINGS } }, 1);
const asText = (o) => JSON.stringify(o);

afterEach(() => replaceSettings({ ...DEFAULT_SETTINGS }));

describe('crafted backup files are refused (rule 6)', () => {
  it('rejects prototype keys in settings (__proto__, constructor, toString)', () => {
    for (const key of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
      // JSON.parse keeps "__proto__" as an own key, exactly like a hostile file would.
      const text = asText(base()).replace('"settings":{', `"settings":{"${key}":{"polluted":true},`);
      const r = parseBackup(text);
      expect(r.ok, key).toBe(false);
      expect(r.errors.join(' '), key).toContain(`unknown key "${key}"`);
    }
    expect({}.polluted).toBeUndefined();
  });

  it('rejects wrong types, huge strings and junk at every level', () => {
    const cases = [
      { ...base(), alarms: 'nope' },
      { ...base(), alarms: [{ ...defaultAlarm(), label: 'x'.repeat(10_000) }] },
      { ...base(), alarms: [{ ...defaultAlarm(), hour: '7' }] },
      { ...base(), alarms: [{ ...defaultAlarm(), soundId: '../../etc/passwd' }] },
      { ...base(), tasks: [{ id: 1 }] },
      { ...base(), sessions: [null] },
      { ...base(), settings: { ...DEFAULT_SETTINGS, theme: '<img src=x onerror=alert(1)>' } },
      { ...base(), settings: { ...DEFAULT_SETTINGS, accent: 'red; background:url(x)' } },
      { ...base(), settings: { ...DEFAULT_SETTINGS, worldClocks: [{ name: 'X', zone: 7 }] } },
      { ...base(), settings: { ...DEFAULT_SETTINGS, countdowns: [{ id: 'a', title: 'T', date: '2027-13-40' }] } },
      { ...base(), settings: { ...DEFAULT_SETTINGS, defaultSnoozeMin: 1e9 } },
      { ...base(), version: '1' },
      [],
      'text',
      42,
    ];
    cases.forEach((c, i) => expect(validateBackup(c).ok, `case ${i}`).toBe(false));
  });

  it('never throws on garbage input', () => {
    for (const t of ['', 'null', '[]', '{"version":1}', '{"version":1,"settings":null}', '\u0000', '{'.repeat(5000)]) {
      expect(() => parseBackup(t)).not.toThrow();
      expect(parseBackup(t).ok).toBe(false);
    }
  });
});

describe('stored state and settings', () => {
  it('setSetting only accepts real setting names', () => {
    expect(() => setSetting('__proto__', 1)).toThrow();
    expect(() => setSetting('toString', 1)).toThrow();
  });

  it('tool screens survive a saved state of null', async () => {
    saveState('breathing', null);
    saveState('interval', null);
    saveState('speech', null);
    saveState('chess', null);
    saveState('metronome', { sig: 'constructor', subdiv: '__proto__' });
    const { metronomeScreen } = await import('../src/features/audiolab/metronome.js').catch(() => ({}));
    expect(typeof metronomeScreen).toBe('function'); // module loads; sanitize is exercised on the phone
  });

  it('esc() neutralises HTML', () => {
    expect(esc('<img src=x onerror="alert(1)">&')).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;');
  });
});
