// Settings → Alarm log: every ring instance + the BLUEPRINT §1 metric (average snoozes per morning).

import { AlarmPlugin } from '../../core/bridge.js';
import { esc } from '../../core/dom.js';
import { formatClock } from '../../core/time.js';

const OUTCOME = {
  dismissed: 'Dismissed',
  missed: 'Missed',
  auto_silenced: 'Auto-silenced (15 min)',
  killed: 'Ended without dismiss',
};

/** Average snoozes per alarm over the last [days] days, plus counts. Pure — unit tested. */
export function summarize(logs, now = Date.now(), days = 14) {
  const since = now - days * 86_400_000;
  const recent = logs.filter((l) => l.firstRangAt >= since && l.label !== 'Test alarm');
  const snoozes = recent.reduce((n, l) => n + (l.snoozes || 0), 0);
  return {
    count: recent.length,
    avgSnoozes: recent.length ? Math.round((snoozes / recent.length) * 10) / 10 : null,
    dismissed: recent.filter((l) => l.outcome === 'dismissed').length,
    wakeFailed: recent.filter((l) => l.wakeCheck === 'failed').length,
  };
}

export function logScreen(el) {
  el.innerHTML = `
    <section class="screen" aria-labelledby="screen-title">
      <a class="back-link" href="#/settings" aria-label="Back to Settings">‹ Settings</a>
      <h1 id="screen-title">Alarm log</h1>
      <div class="stats" id="stats"></div>
      <ul class="log-list" id="log-list"><li class="empty">Loading…</li></ul>
    </section>`;

  (async () => {
    const logs = (await AlarmPlugin.getLogs().catch(() => [])).slice().reverse();
    const s = summarize(logs);
    el.querySelector('#stats').innerHTML = `
      <div class="stat"><span class="stat-n">${s.avgSnoozes ?? '–'}</span><span>avg snoozes / alarm (14 days, goal ≤ 1)</span></div>
      <div class="stat"><span class="stat-n">${s.count}</span><span>alarms rang</span></div>
      <div class="stat"><span class="stat-n">${s.wakeFailed}</span><span>missed wake-checks</span></div>`;
    const fmtDay = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    el.querySelector('#log-list').innerHTML = logs.length
      ? logs
          .slice(0, 60)
          .map((l) => {
            const d = new Date(l.firstRangAt);
            const took = l.dismissedAt ? Math.round((l.dismissedAt - l.firstRangAt) / 60_000) : null;
            return `<li class="log-item ${l.outcome}">
              <div><strong>${esc(l.label || 'Alarm')}</strong> · ${fmtDay.format(d)} ${formatClock(d)}</div>
              <div class="muted">${esc(OUTCOME[l.outcome] ?? l.outcome)} · ${l.snoozes} snooze${l.snoozes === 1 ? '' : 's'}
                ${took != null ? ` · up after ${took} min` : ''} · wake-check: ${esc(l.wakeCheck)}
                ${l.challengeFails ? ` · ${l.challengeFails} wrong answers` : ''}</div></li>`;
          })
          .join('')
      : '<li class="empty">No alarms have rung yet.</li>';
  })();
}
