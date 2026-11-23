// Settings → Backup: export to a file, import from a file (validated, confirm before replacing).

import { esc } from '../../core/dom.js';
import { getSettings, setSetting } from '../../core/store.js';
import { toast } from '../../core/toast.js';
import { AlarmPlugin } from '../../core/bridge.js';
import { showError } from '../alarm/alarm.js';
import { parseBackup } from './backup.js';
import { collectBackup, applyBackup, backupFileName } from './backup-io.js';

const n = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

export const backupHtml = () => {
  const last = getSettings().lastBackupAt;
  return `
    <h2 class="section-title">Backup</h2>
    <p class="muted" id="bk-last">${last ? `Last export: ${esc(new Date(last).toLocaleString())}` : 'No export yet.'} Alarms, alarm log, tasks, focus sessions and settings in one JSON file.</p>
    <div class="row"><button class="btn" data-bk="export" aria-label="Export backup to a file">Export</button>
      <button class="btn btn-ghost" data-bk="import" aria-label="Import backup from a file">Import</button></div>
    <div id="bk-box" aria-live="polite"></div>`;
};

export function bindBackup(root) {
  const box = root.querySelector('#bk-box');
  root.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-bk]')?.dataset.bk;
    if (!act) return;
    try {
      if (act === 'export') {
        const data = await collectBackup();
        const r = await AlarmPlugin.saveFile(backupFileName(), JSON.stringify(data, null, 1));
        if (!r?.saved) return toast('Export cancelled');
        setSetting('lastBackupAt', data.exportedAt);
        root.querySelector('#bk-last').textContent = `Last export: ${new Date(data.exportedAt).toLocaleString()}. Saved ${n(data.alarms.length, 'alarm')}, ${n(data.tasks.length, 'task')}, ${n(data.sessions.length, 'session')}.`;
        toast('Backup saved');
      }
      if (act === 'import') {
        const text = await AlarmPlugin.openFile();
        if (text == null) return toast('Import cancelled');
        const parsed = parseBackup(text);
        if (!parsed.ok) {
          box.innerHTML = `<div class="card banner danger" role="alert"><strong>This file can't be imported</strong>
            <ul class="steps">${parsed.errors.slice(0, 8).map((x) => `<li>${esc(x)}</li>`).join('')}</ul><span>Nothing was changed.</span></div>`;
          return;
        }
        const c = parsed.counts;
        box.innerHTML = `<div class="card banner" role="alertdialog" aria-label="Confirm import">
          <strong>Replace everything with this backup?</strong>
          <span>${n(c.alarms, 'alarm')} · ${n(c.alarmLogs, 'log entry').replace('entrys', 'entries')} · ${n(c.tasks, 'task')} · ${n(c.sessions, 'focus session')} · settings.
          Exported ${esc(new Date(parsed.data.exportedAt).toLocaleString())}. Your current data will be replaced.</span>
          <div class="row"><button class="btn btn-danger" data-bk="confirm" aria-label="Replace with backup">Replace</button>
          <button class="btn btn-ghost" data-bk="cancel" aria-label="Cancel import">Cancel</button></div></div>`;
        box._data = parsed.data;
      }
      if (act === 'cancel') box.innerHTML = '';
      if (act === 'confirm' && box._data) {
        const r = await applyBackup(box._data);
        box._data = null;
        box.innerHTML = `<div class="card banner"><strong>Restored</strong><span>${n(r.alarms, 'alarm')} (${r.scheduled} scheduled), ${n(r.alarmLogs, 'log entry').replace('entrys', 'entries')}, ${n(r.tasks, 'task')}, ${n(r.sessions, 'session')}.</span></div>`;
        toast('Backup restored');
      }
    } catch (err) {
      showError(err);
    }
  });
}
