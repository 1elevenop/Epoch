// Asks for notification permission; if Android won't show the prompt any more, opens app settings.

import { AlarmPlugin } from './bridge.js';

export async function ensureNotifications() {
  const r = await AlarmPlugin.requestNotifications().catch(() => ({ granted: false }));
  if (!r.granted) await AlarmPlugin.openSetting('notifications').catch(() => {});
  return !!r.granted;
}
