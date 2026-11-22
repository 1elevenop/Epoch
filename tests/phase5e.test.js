import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defaultAlarm, validateAlarm } from '../src/features/alarm/model.js';

vi.mock('../src/core/bridge.js', async () => {
  const { createMockAlarmPlugin } = await import('./support/fake-alarm-plugin.js');
  return { AlarmPlugin: createMockAlarmPlugin() };
});

const { AlarmPlugin } = await import('../src/core/bridge.js');
const { focus } = await import('../src/features/focus/session.js');
const { setSetting } = await import('../src/core/store.js');

const plan = { focusMin: 25, breakMin: 5, cycles: 1, longBreakMin: 15, longEvery: 4 };
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('sunrise pre-alarm validation', () => {
  it('accepts 0–60 whole minutes only', () => {
    expect(validateAlarm({ ...defaultAlarm(), sunriseMin: 15 })).toEqual([]);
    expect(validateAlarm({ ...defaultAlarm(), sunriseMin: 0 })).toEqual([]);
    expect(validateAlarm({ ...defaultAlarm(), sunriseMin: 61 })).toContain('Sunrise must be 0–60 min');
    expect(validateAlarm({ ...defaultAlarm(), sunriseMin: 2.5 })).toContain('Sunrise must be 0–60 min');
  });
});

describe('Do Not Disturb during focus', () => {
  beforeEach(async () => {
    if (focus.get()) await focus.finish('gave_up');
    Object.assign(AlarmPlugin.dnd, { access: true, owned: false, filter: 'all' });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('turns DND on at start and gives the normal mode back at the end', async () => {
    setSetting('focusDnd', true);
    focus.start({ goal: 'Study', plan, taskIds: [] });
    await flush();
    expect(AlarmPlugin.dnd).toMatchObject({ owned: true, filter: 'priority' });
    await focus.finish('done_early');
    expect(AlarmPlugin.dnd).toMatchObject({ owned: false, filter: 'all' });
  });

  it('leaves DND alone when the switch is off or the owner already had DND on', async () => {
    setSetting('focusDnd', false);
    focus.start({ goal: 'Study', plan, taskIds: [] });
    await flush();
    expect(AlarmPlugin.dnd.filter).toBe('all');
    await focus.finish('done_early');

    setSetting('focusDnd', true);
    AlarmPlugin.dnd.filter = 'alarms'; // owner's own DND
    focus.start({ goal: 'Study', plan, taskIds: [] });
    await focus.finish('done_early');
    expect(AlarmPlugin.dnd.filter).toBe('alarms');
  });

  it('does not undo a change the owner made during the session', async () => {
    setSetting('focusDnd', true);
    focus.start({ goal: 'Study', plan, taskIds: [] });
    await flush();
    AlarmPlugin.dnd.filter = 'all'; // owner switched DND off by hand
    await focus.finish('done_early');
    expect(AlarmPlugin.dnd).toMatchObject({ owned: false, filter: 'all' });
  });

  it('a missing permission never blocks the session', async () => {
    setSetting('focusDnd', true);
    AlarmPlugin.dnd.access = false;
    focus.start({ goal: 'Study', plan, taskIds: [] });
    await flush();
    expect(focus.get()).toBeTruthy();
    expect(AlarmPlugin.dnd.filter).toBe('all');
    await focus.finish('done_early');
  });
});
