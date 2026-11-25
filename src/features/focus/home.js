// Focus tab: resume a running session, start a new one, links to tasks and stats, recent sessions.

import { esc } from '../../core/dom.js';
import { focus } from './session.js';
import { listSessions } from './data.js';
import * as E from './engine.js';
import { formatDuration } from '../../core/time.js';

export function focusHome(el) {
  const st = focus.get();
  const cur = st && E.current(st.run);
  el.innerHTML = `
    <section class="screen" aria-labelledby="screen-title">
      <h1 id="screen-title">Focus</h1>
      ${
        cur
          ? `<a class="card banner" href="#/focus-run"><strong>Session running: ${esc(st.session.goal)}</strong>
             <span>${cur.kind === 'focus' ? 'Focus' : 'Break'} · ${formatDuration(Math.max(0, cur.remainingMs))} left — tap to open</span></a>`
          : `<a class="btn btn-round focus-start" href="#/focus-setup" aria-label="Start a focus session">Start focus session</a>`
      }
      <div class="row-links">
        <a class="list-item link" href="#/tasks"><span>Tasks</span></a>
        <a class="list-item link" href="#/focus-stats"><span>Stats</span></a>
      </div>
      <h2 class="section-title">Recent sessions</h2>
      <ul class="log-list" id="recent"><li class="empty">Loading…</li></ul>
    </section>`;

  listSessions().then((sessions) => {
    const fmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    el.querySelector('#recent').innerHTML = sessions.length
      ? sessions
          .slice(0, 8)
          .map(
            (s) => `<li class="log-item ${s.endReason === 'completed' ? '' : s.endReason === 'done_early' ? 'partial' : 'missed'}">
              <div><strong>${esc(s.goal)}</strong> · ${fmt.format(s.startedAt)}</div>
              <div class="muted">${E.focusMinutes(s.segments)} of ${E.plannedFocusMinutes(s.plan)} min · ${E.cyclesDone(s.segments)} cycles ·
                ${s.leaves.length} ${s.leaves.length === 1 ? 'leave' : 'leaves'}${s.review ? ` · rated ${s.review.rating}/5` : ''}</div></li>`,
          )
          .join('')
      : '<li class="empty">No sessions yet. Start your first one above.</li>';
  });
}
