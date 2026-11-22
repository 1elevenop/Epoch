// Reliability screen: permission/battery status with "Fix" buttons and phone-maker steps.

import { AlarmPlugin } from '../../core/bridge.js';
import { esc } from '../../core/dom.js';
import { toast } from '../../core/toast.js';
import { startTestAlarm } from '../alarm/alarm.js';

const OEM_STEPS = {
  samsung: [
    'Settings → Battery → Background usage limits → Never sleeping apps → add WAKE11.',
    'Settings → Apps → WAKE11 → Battery → Unrestricted.',
    'Make sure WAKE11 is NOT in "Sleeping apps" or "Deep sleeping apps".',
    'Recent apps → tap the WAKE11 icon → Keep open (lock it).',
  ],
  xiaomi: ['Security app → Autostart → enable WAKE11.', 'App info → Battery saver → No restrictions.', 'Lock WAKE11 in recent apps.'],
  default: ['App info → Battery → Unrestricted / Not optimized.', 'Allow the app to start automatically if your phone has an Autostart setting.', 'Lock WAKE11 in recent apps if your launcher supports it.'],
};

export const ITEMS = [
  ['exactAlarm', 'Exact alarms', 'Needed to ring at the exact minute.', 'exactAlarm'],
  ['fullScreenIntent', 'Full-screen alarm', 'Shows the alarm over the lock screen.', 'fullScreen'],
  ['notifications', 'Notifications', 'The ringing alarm is shown as a notification.', 'notifications'],
  ['batteryUnrestricted', 'Battery: unrestricted', 'Stops Android from delaying or killing WAKE11.', 'battery'],
];

export function oemSteps(manufacturer = '') {
  const m = manufacturer.toLowerCase();
  if (m.includes('samsung')) return { name: 'Samsung', slug: 'samsung', steps: OEM_STEPS.samsung };
  if (/xiaomi|redmi|poco/.test(m)) return { name: 'Xiaomi', slug: 'xiaomi', steps: OEM_STEPS.xiaomi };
  return { name: manufacturer || 'your phone', slug: m || '', steps: OEM_STEPS.default };
}

export function statusList(status, items = ITEMS) {
  return items
    .map(([key, title, why, setting]) => {
      const ok = !!status?.[key];
      return `<li class="rel-item ${ok ? 'ok' : 'bad'}">
        <span class="rel-icon" aria-hidden="true">${ok ? '✓' : '!'}</span>
        <span class="rel-text"><strong>${title}</strong><span>${ok ? 'OK' : why}</span></span>
        ${ok ? '' : `<button class="btn btn-ghost" data-setting="${setting}" aria-label="Fix ${title}">Fix</button>`}
      </li>`;
    })
    .join('');
}

export function reliabilityScreen(el) {
  el.innerHTML = `
    <section class="screen" aria-labelledby="screen-title">
      <a class="back-link" href="#/more" aria-label="Back to More">‹ More</a>
      <h1 id="screen-title">Reliability</h1>
      <p class="sub left">These settings decide whether alarms ring when the phone is locked, asleep or on battery saver.</p>
      <ul class="rel-list" id="rel-list"><li class="empty">Checking…</li></ul>
      <div class="card" id="oem"></div>
      <div class="card">
        <h2>Never force-stop WAKE11</h2>
        <p>"Force stop" in App info cancels every alarm until you open the app again. Android does this by design; no app can prevent it.</p>
      </div>
      <button class="btn" data-act="test" aria-label="Run a 10 second test alarm">Run 10-second test alarm</button>
      <button class="btn btn-ghost" data-setting="appDetails" aria-label="Open app info">Open app info</button>
    </section>`;
  const section = el.querySelector('.screen');

  async function refresh() {
    try {
      const s = await AlarmPlugin.getReliabilityStatus();
      el.querySelector('#rel-list').innerHTML = statusList(s);
      const oem = oemSteps(s.manufacturer);
      el.querySelector('#oem').innerHTML = `
        <h2>${esc(oem.name)} battery steps</h2>
        <ol class="steps">${oem.steps.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>
        <p><a href="https://dontkillmyapp.com/${esc(oem.slug)}" target="_blank" rel="noopener">More help on dontkillmyapp.com</a></p>
        <p class="muted">${esc(s.model ?? '')} · Android SDK ${esc(s.sdk ?? '?')}</p>`;
    } catch (err) {
      el.querySelector('#rel-list').innerHTML = `<li class="empty">Could not read status: ${esc(err.message)}</li>`;
    }
  }

  section.addEventListener('click', async (e) => {
    const s = e.target.closest('[data-setting]')?.dataset.setting;
    if (s === 'notifications') {
      const r = await AlarmPlugin.requestNotifications().catch(() => ({ granted: false }));
      if (!r.granted) await AlarmPlugin.openSetting('notifications');
      refresh();
    } else if (s) {
      AlarmPlugin.openSetting(s).catch((err) => toast(err.message));
    }
    if (e.target.closest('[data-act=test]')) startTestAlarm();
  });
  const onVisible = () => !document.hidden && refresh();
  document.addEventListener('visibilitychange', onVisible);
  refresh();
  return () => document.removeEventListener('visibilitychange', onVisible);
}
