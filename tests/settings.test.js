import { describe, it, expect, afterEach } from 'vitest';
import { defaultAlarm, validateAlarm } from '../src/features/alarm/model.js';
import { setSetting, DEFAULT_SETTINGS, replaceSettings } from '../src/core/store.js';
import { buildBackup, validateBackup } from '../src/features/settings/backup.js';
import { createMockAlarmPlugin } from './support/fake-alarm-plugin.js';

afterEach(() => replaceSettings({ ...DEFAULT_SETTINGS }));

describe('defaults for new alarms (Settings → Alarms & timers)', () => {
  it('uses the chosen snooze length and challenge', () => {
    expect(defaultAlarm().snooze.lengthMin).toBe(5);
    expect(defaultAlarm().challenge.chain).toEqual(['math']);
    setSetting('defaultSnoozeMin', 10);
    setSetting('defaultChallenge', 'memory');
    const a = defaultAlarm();
    expect(a.snooze.lengthMin).toBe(10);
    expect(a.challenge.chain).toEqual(['memory']);
    expect(validateAlarm(a)).toEqual([]);
  });

  it('falls back to safe defaults when a stored value is bad', () => {
    setSetting('defaultSnoozeMin', 999);
    setSetting('defaultChallenge', 'qr'); // QR needs a registered code per alarm
    const a = defaultAlarm();
    expect(a.snooze.lengthMin).toBe(5);
    expect(a.challenge.chain).toEqual(['math']);
  });
});

describe('backup checks the new settings (rule 6)', () => {
  const backup = (extra) =>
    buildBackup({ alarms: [], alarmLogs: [], tasks: [], sessions: [], settings: { ...DEFAULT_SETTINGS, ...extra } }, 1);
  it('accepts valid values and rejects bad ones', () => {
    expect(validateBackup(backup({ defaultSnoozeMin: 7, defaultChallenge: 'type', timerSound: 'gentle_bells' })).ok).toBe(true);
    expect(validateBackup(backup({ defaultSnoozeMin: 0 })).errors).toContain('settings: defaultSnoozeMin');
    expect(validateBackup(backup({ defaultChallenge: 'qr' })).errors).toContain('settings: defaultChallenge');
    expect(validateBackup(backup({ timerSound: 'airhorn' })).errors).toContain('settings: timerSound');
  });
});

describe('timer sound on the native side', () => {
  it('stores known sounds and refuses unknown ones', async () => {
    const p = createMockAlarmPlugin();
    await p.setTimerSound('hard_siren');
    expect(p.timerSound).toBe('hard_siren');
    await expect(p.setTimerSound('airhorn')).rejects.toMatchObject({ code: 'INVALID' });
    expect(p.timerSound).toBe('hard_siren');
  });
});
