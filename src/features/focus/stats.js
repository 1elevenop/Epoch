// Focus stats: today/week minutes, streak, 12-week heatmap, tasks per week, average leaves.

import { listSessions, listTasks, summary, heatmap } from './data.js';

const level = (m) => (m == null ? 'future' : m === 0 ? 'l0' : m < 25 ? 'l1' : m < 60 ? 'l2' : m < 120 ? 'l3' : 'l4');

export function statsScreen(el) {
  el.innerHTML = `
    <section class="screen" aria-labelledby="screen-title">
      <a class="back-link" href="#/focus" aria-label="Back to Focus">‹ Focus</a>
      <h1 id="screen-title">Focus stats</h1>
      <div class="stats two" id="cards"></div>
      <h2 class="section-title">Last 12 weeks</h2>
      <div class="heatmap" id="heat" role="img" aria-label="Focus minutes per day, last 12 weeks"></div>
      <p class="muted">Columns are weeks (Mon–Sun top to bottom). Darker = more focus minutes.</p>
    </section>`;

  (async () => {
    const [sessions, open, archived] = await Promise.all([listSessions(), listTasks(), listTasks({ archived: true })]);
    const s = summary(sessions, [...open, ...archived]);
    el.querySelector('#cards').innerHTML = [
      [s.todayMin, 'focus min today'],
      [s.weekMin, 'focus min, 7 days'],
      [s.streak, `day streak`],
      [s.sessionsWeek, 'sessions, 7 days (goal ≥ 5)'],
      [s.tasksDoneWeek, 'tasks done, 7 days'],
      [s.avgLeaves, 'avg leaves / session'],
    ]
      .map(([n, l]) => `<div class="stat"><span class="stat-n">${n}</span><span>${l}</span></div>`)
      .join('');
    const fmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
    el.querySelector('#heat').innerHTML = heatmap(sessions)
      .map((c) => `<span class="hm ${level(c.minutes)}" title="${fmt.format(c.date)}: ${c.minutes ?? 0} min"></span>`)
      .join('');
  })();
}
