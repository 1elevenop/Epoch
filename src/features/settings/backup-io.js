// Gathers everything for a backup and applies a validated one (native alarms first, then web data).

import { AlarmPlugin } from '../../core/bridge.js';
import { db, getSettings, replaceSettings } from '../../core/store.js';
import { applyTheme, normalizeThemeId } from '../../core/theme.js';
import { buildBackup } from './backup.js';
import { syncWidgets } from '../../core/widgets.js';

export async function collectBackup() {
  const { alarms, alarmLogs } = await AlarmPlugin.exportAlarms();
  const [tasks, sessions] = await Promise.all([db.getAll('tasks').catch(() => []), db.getAll('sessions').catch(() => [])]);
  return buildBackup({ alarms, alarmLogs, tasks: tasks ?? [], sessions: sessions ?? [], settings: getSettings() });
}

export function backupFileName(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `epoch-backup-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.json`;
}

/** Writes a validated backup. Native alarms go first: if Android refuses them, nothing else changes. */
export async function applyBackup(data) {
  const native = await AlarmPlugin.importAlarms(data.alarms, data.alarmLogs);
  await db.clear('tasks');
  for (const t of data.tasks) await db.put('tasks', t);
  await db.clear('sessions');
  for (const s of data.sessions) await db.put('sessions', s);
  if (data.settings) {
    const theme = normalizeThemeId(data.settings.theme) ?? 'black';
    const s = replaceSettings({ ...data.settings, theme, onboardingSeen: true });
    applyTheme(s.theme, s.accent);
    await AlarmPlugin.setTimerSound(s.timerSound).catch(() => {}); // native rings timers with the app closed
    await syncWidgets();
  }
  return { ...native, tasks: data.tasks.length, sessions: data.sessions.length };
}
