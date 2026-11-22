// Review after a session: planned vs actual, cycles, subtasks, leaves, parking lot → tasks, note, rating.

import { esc } from '../../core/dom.js';
import { loadState, saveState } from '../../core/store.js';
import { formatDuration } from '../../core/time.js';
import * as E from './engine.js';
import { saveSession, saveTask, newTask } from './data.js';

const REASON = { completed: 'Completed', done_early: 'Done early', interrupted: 'Interrupted', gave_up: 'Gave up' };

export function reviewScreen(el) {
  const s = loadState('focusLastSession', null);
  if (!s || typeof s.goal !== 'string') {
    location.hash = '#/focus';
    return;
  }
  const leaveMs = s.leaves.reduce((n, l) => n + l.durationMs, 0);
  let rating = s.review?.rating ?? 0;
  el.innerHTML = `
    <section class="screen" aria-labelledby="screen-title">
      <h1 id="screen-title">Session review</h1>
      <p class="lead">${esc(s.goal)}</p>
      <div class="stats two">
        <div class="stat"><span class="stat-n">${E.focusMinutes(s.segments)}/${E.plannedFocusMinutes(s.plan)}</span><span>focus min (actual / planned)</span></div>
        <div class="stat"><span class="stat-n">${E.cyclesDone(s.segments)}/${s.plan.cycles}</span><span>cycles done</span></div>
        <div class="stat"><span class="stat-n">${s.subtasksDone}</span><span>subtasks ticked</span></div>
        <div class="stat"><span class="stat-n">${s.leaves.length}</span><span>times you left (${formatDuration(leaveMs)})</span></div>
      </div>
      <p class="muted">Ended: ${esc(REASON[s.endReason] ?? s.endReason)}</p>
      <h2 class="section-title">Parking lot</h2>
      <ul class="list" id="park">${
        s.parkingLot.length
          ? s.parkingLot.map((p, i) => `<li class="list-item"><span>${esc(p.text)}</span><button class="btn btn-ghost" data-task="${i}" aria-label="Make a task from ${esc(p.text)}">→ Task</button></li>`).join('')
          : '<li class="empty">Nothing parked.</li>'
      }</ul>
      <label class="field">One-line note<input class="input" id="note" maxlength="200" value="${esc(s.review?.note ?? '')}" /></label>
      <div class="stars" role="radiogroup" aria-label="Rating">
        ${[1, 2, 3, 4, 5].map((n) => `<button class="star" role="radio" data-r="${n}" aria-label="${n} star${n > 1 ? 's' : ''}" aria-checked="false">★</button>`).join('')}
      </div>
      <button class="btn btn-round" data-act="save" aria-label="Save review">Save</button>
    </section>`;

  const stars = [...el.querySelectorAll('.star')];
  const drawStars = () => stars.forEach((b, i) => {
    b.classList.toggle('on', i < rating);
    b.setAttribute('aria-checked', String(i + 1 === rating));
  });
  drawStars();

  el.querySelector('.screen').addEventListener('click', async (e) => {
    const star = e.target.closest('[data-r]');
    if (star) {
      rating = Number(star.dataset.r);
      drawStars();
    }
    const tIdx = e.target.closest('[data-task]')?.dataset.task;
    if (tIdx != null) {
      await saveTask(newTask(s.parkingLot[Number(tIdx)].text, Date.now()));
      e.target.closest('[data-task]').replaceWith(Object.assign(document.createElement('span'), { textContent: '✓ added', className: 'muted' }));
    }
    if (e.target.closest('[data-act=save]')) {
      const done = { ...s, review: rating ? { note: el.querySelector('#note').value.trim().slice(0, 200), rating } : null };
      await saveSession(done);
      saveState('focusLastSession', null);
      location.hash = '#/focus';
    }
  });
}
