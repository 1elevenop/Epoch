// Alarm tab: list (toggle, swipe-to-delete with 5 s undo), quick nap alarms, 10-second test alarm.

import { AlarmPlugin } from '../../core/bridge.js';
import { subscribe } from '../../core/ticker.js';
import { esc } from '../../core/dom.js';
import { formatHMS, ampm, formatUntil } from '../../core/time.js';
import { getSettings } from '../../core/store.js';
import { toast } from '../../core/toast.js';
import { describeDays, oneShotAlarm, errorText } from './model.js';
import { openEditor } from './editor.js';
import { attachSwipe } from './swipe.js';
import { ensureNotifications } from '../../core/permissions.js';
import { emptyRow } from '../../core/mascot.js';

/** Shows a bridge error; permission errors get a one-tap fix. */
export function showError(err) {
  if (err?.code === 'NOTIFICATIONS_DENIED') {
    toast(errorText(err), { action: 'Allow', onAction: ensureNotifications, ms: 8000 });
  } else if (err?.code === 'EXACT_ALARM_DENIED') {
    toast(errorText(err), { action: 'Fix', onAction: () => (location.hash = '#/reliability'), ms: 8000 });
  } else {
    toast(errorText(err), { ms: 6000 });
  }
}

const NAPS = [
  [10 * 60_000, '+10 min'],
  [30 * 60_000, '+30 min'],
  [60 * 60_000, '+1 h'],
];

export async function startTestAlarm() {
  try {
    await AlarmPlugin.upsertAlarm(oneShotAlarm(10_000, 'Test alarm'));
    toast('Test alarm rings in 10 seconds. Lock the phone now.', { ms: 6000 });
    return true;
  } catch (err) {
    showError(err);
    return false;
  }
}

function row(a) {
  const { hour12 } = getSettings();
  const time = formatHMS(a.hour, a.minute, 0, { hour12 });
  const name = esc(a.label || 'Alarm');
  const meta = a.oneShotAt ? 'Once' : describeDays(a.days) + (a.skipNext ? ' · next skipped' : '');
  return `
    <li class="alarm-row ${a.enabled ? '' : 'off'}" data-id="${esc(a.id)}">
      <div class="swipe-bg" aria-hidden="true">Delete</div>
      <div class="swipe-fg">
        <button class="alarm-main" data-act="edit" aria-label="Edit ${name} at ${time}">
          <span class="alarm-time digits">${time}${hour12 ? `<small>${ampm(a.hour)}</small>` : ''}</span>
          <span class="alarm-meta">${name} · ${esc(meta)}</span>
          <span class="alarm-next" data-next="${a.nextTriggerAt ?? ''}"></span>
        </button>
        <label class="toggle" aria-label="${name} ${a.enabled ? 'on' : 'off'}">
          <input type="checkbox" role="switch" data-act="toggle" ${a.enabled ? 'checked' : ''} />
          <span class="toggle-ui" aria-hidden="true"></span>
        </label>
      </div>
    </li>`;
}

export function alarmScreen(el) {
  el.innerHTML = `
    <section class="screen" aria-labelledby="screen-title">
      <div class="section-head">
        <h1 id="screen-title">Alarm</h1>
        <button class="btn" data-act="new" aria-label="New alarm">+ New</button>
      </div>
      <div id="setup-banner"></div>
      <div class="chips" role="group" aria-label="Quick nap alarm">
        ${NAPS.map(([ms, l]) => `<button class="chip" data-nap="${ms}" aria-label="Nap alarm ${l}">${l}</button>`).join('')}
        <button class="chip" data-act="test" aria-label="Test alarm in 10 seconds">Test (10 s)</button>
      </div>
      <ul class="alarm-list" id="alarm-list" aria-label="Alarms"></ul>
    </section>`;
  const section = el.querySelector('.screen');
  const list = el.querySelector('#alarm-list');
  let alarms = [];

  async function checkSetup() {
    const banner = el.querySelector('#setup-banner');
    const s = await AlarmPlugin.getReliabilityStatus().catch(() => null);
    if (s && (!s.notifications || !s.exactAlarm)) {
      banner.innerHTML = `<div class="card banner danger" role="alert">
        <strong>${!s.notifications ? 'Notifications are off' : 'Exact alarms are blocked'}</strong>
        <span>Alarms can't show their stop screen. New alarms are blocked until this is fixed.</span>
        <button class="btn" data-act="fix-perm" aria-label="Fix permission">${!s.notifications ? 'Allow notifications' : 'Fix'}</button></div>`;
    } else if (!getSettings().onboarded) {
      banner.innerHTML = `<a class="card banner" href="#/onboarding">
        <strong>Finish setup</strong><span>Check permissions and run the lock-screen test.</span></a>`;
    } else {
      banner.innerHTML = '';
    }
    return s;
  }

  async function load() {
    try {
      alarms = await AlarmPlugin.listAlarms();
    } catch (err) {
      showError(err);
      alarms = [];
    }
    alarms.sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
    list.innerHTML = alarms.length
      ? alarms.map(row).join('')
      : emptyRow('No alarms. Tap “+ New” or a nap chip.', 'snooze');
    list.querySelectorAll('.alarm-row').forEach((li) => attachSwipe(li, () => remove(li.dataset.id)));
    tick(Date.now());
  }

  function tick(now) {
    list.querySelectorAll('[data-next]').forEach((s) => {
      const at = Number(s.dataset.next);
      s.textContent = at > now ? `in ${formatUntil(at - now)}` : 'Off';
    });
  }

  async function remove(id) {
    const a = alarms.find((x) => x.id === id);
    if (!a) return;
    try {
      await AlarmPlugin.deleteAlarm(id);
      toast(`Deleted ${a.label || 'alarm'}`, {
        action: 'Undo',
        ms: 5000,
        onAction: () => AlarmPlugin.upsertAlarm({ ...a, nextTriggerAt: null }).catch((e) => showError(e)),
      });
    } catch (err) {
      showError(err);
    }
  }

  section.addEventListener('click', async (e) => {
    const nap = e.target.closest('[data-nap]');
    if (nap) {
      try {
        await AlarmPlugin.upsertAlarm(oneShotAlarm(Number(nap.dataset.nap), 'Nap'));
        toast(`Nap alarm set (${nap.textContent})`);
      } catch (err) {
        showError(err);
      }
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    const id = e.target.closest('[data-id]')?.dataset.id;
    if (act === 'new') openEditor(null);
    if (act === 'test') startTestAlarm();
    if (act === 'fix-perm') {
      const s = await AlarmPlugin.getReliabilityStatus().catch(() => null);
      if (s && !s.notifications) await ensureNotifications();
      else location.hash = '#/reliability';
      checkSetup();
    }
    if (act === 'edit') openEditor(alarms.find((a) => a.id === id), { onDelete: (a) => remove(a.id) });
  });
  section.addEventListener('change', async (e) => {
    if (e.target.dataset.act !== 'toggle') return;
    const id = e.target.closest('[data-id]').dataset.id;
    try {
      await AlarmPlugin.setEnabled(id, e.target.checked);
    } catch (err) {
      e.target.checked = !e.target.checked;
      showError(err);
    }
  });

  let listener = null;
  let alive = true;
  AlarmPlugin.addListener('alarmsChanged', load).then((l) => (alive ? (listener = l) : l.remove()));
  const onVisible = () => {
    if (document.hidden) return;
    load();
    checkSetup();
  };
  document.addEventListener('visibilitychange', onVisible);
  load();
  checkSetup();
  const unsub = subscribe(tick, { fps: 1 });

  return () => {
    alive = false;
    listener?.remove();
    document.removeEventListener('visibilitychange', onVisible);
    unsub();
  };
}
