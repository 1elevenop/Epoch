// Copies the data the home-screen widgets show but native does not own (world clocks, event
// countdowns, the 12/24 h setting) to the native side. Called at app start and after every change.

import { AlarmPlugin } from './bridge.js';
import { getSettings } from './store.js';

export function syncWidgets() {
  const s = getSettings();
  const worldClocks = (Array.isArray(s.worldClocks) ? s.worldClocks : []).map(({ name, zone }) => ({ name, zone }));
  const countdowns = (Array.isArray(s.countdowns) ? s.countdowns : []).map(({ title, date }) => ({ title, date }));
  return AlarmPlugin.setWidgetData?.({ worldClocks, countdowns, hour12: s.hour12 === true }).catch((err) => console.warn('[widgets] sync failed', err?.code ?? err));
}
