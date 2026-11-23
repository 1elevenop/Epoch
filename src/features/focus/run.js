// Running focus screen (BLUEPRINT §6.5): fullscreen, immersive, screen kept on.

import { esc } from '../../core/dom.js';
import { subscribe } from '../../core/ticker.js';
import { formatDuration } from '../../core/time.js';
import { keepAwake } from '../../core/screen.js';
import { AlarmPlugin } from '../../core/bridge.js';
import { toast } from '../../core/toast.js';
import * as E from './engine.js';
import { focus } from './session.js';
import { listTasks, saveTask, toggleSubtask, toggleTask, progressOf } from './data.js';
import { setBigSource, bigButton } from '../bigdisplay/bigdisplay.js';
import { focusView } from '../bigdisplay/sources.js';
import { getSettings } from '../../core/store.js';
import { syncAmbient } from '../audiolab/mixer.js';

const R = 110;
const C = 2 * Math.PI * R;
const BREAK_TIPS = ['Stand up and stretch', 'Drink a glass of water', 'Look at something 6 m away', 'Breathe: 4 in, 4 hold, 4 out, 4 hold', 'Walk around the room'];
const KIND = { focus: 'Focus', break: 'Break', long_break: 'Long break' };

export function runScreen(el) {
  if (!focus.get()) {
    location.hash = '#/focus';
    return;
  }
  const release = keepAwake('focus');
  AlarmPlugin.setImmersive?.(true).catch(() => {});
  let tasks = [];
  let shownKey = '';
  let skipArmed = false;
  const { focusNoise, focusNoiseVolume } = getSettings(); // chosen on the setup screen

  el.innerHTML = `<section class="screen focus-run" aria-labelledby="screen-title">
      <div class="screen-head"><p class="focus-goal" id="screen-title"></p>${bigButton('Big display for the session')}</div>
      <div class="ring-wrap">
        <svg viewBox="0 0 240 240" class="focus-ring" aria-hidden="true">
          <circle cx="120" cy="120" r="${R}" class="fr-bg"/><circle cx="120" cy="120" r="${R}" class="fr-fg" stroke-dasharray="${C}"/>
        </svg>
        <div class="ring-text"><p class="focus-time digits" role="timer"></p><p class="focus-phase"></p></div>
      </div>
      <div id="phase-box"></div>
      <ul class="focus-tasks" id="tasks"></ul>
      <div class="focus-actions">
        <button class="btn btn-ghost" data-act="park" aria-label="Parking lot: note a stray thought">Parking lot</button>
        <button class="btn btn-secondary" data-act="pause"></button>
        <button class="btn btn-ghost hold" data-act="end" aria-label="Hold for 2 seconds to end the session early"><span class="hold-fill"></span>End</button>
      </div>
    </section>`;
  const section = el.querySelector('.focus-run');
  const $ = (s) => el.querySelector(s);

  async function loadTasks() {
    const ids = focus.get()?.session.taskIds ?? [];
    tasks = (await listTasks()).filter((t) => ids.includes(t.id));
    drawTasks();
  }

  function drawTasks() {
    $('#tasks').innerHTML = tasks
      .map((t) => {
        const p = progressOf(t);
        const firstOpen = t.subtasks.find((s) => !s.done)?.id;
        return `<li data-id="${esc(t.id)}"><label class="check task-line"><input type="checkbox" data-act="task" ${t.done ? 'checked' : ''} />
          <strong>${esc(t.title)}</strong>${p.total ? `<span class="muted">${p.done}/${p.total}</span>` : ''}</label>
          <ul>${t.subtasks.map((s) => `<li class="${s.id === firstOpen ? 'current' : ''}"><label class="check"><input type="checkbox" data-sub="${esc(s.id)}" ${s.done ? 'checked' : ''} /> ${esc(s.title)}</label></li>`).join('')}</ul></li>`;
      })
      .join('');
  }

  function draw(now) {
    const st = focus.get();
    if (!st) return;
    const cur = E.current(st.run, now);
    $('#screen-title').textContent = `Goal: ${st.session.goal}`;
    section.dataset.kind = cur.kind;
    const paused = E.isPaused(st.run);
    syncAmbient(cur.kind === 'focus' && !paused && !cur.over, focusNoise, focusNoiseVolume); // §6.5: focus only, off in breaks
    $('.focus-time').textContent = formatDuration(cur.over ? 0 : Math.ceil(cur.remainingMs / 1000) * 1000);
    $('.focus-phase').textContent = `${KIND[cur.kind]}${cur.kind === 'focus' ? ` · ${cur.focusNumber} of ${st.run.plan.cycles}` : ''}${paused ? ' · paused' : ''}`;
    $('.fr-fg').style.strokeDashoffset = String(C * (1 - cur.progress));
    const pb = $('[data-act=pause]');
    pb.textContent = paused ? 'Resume' : 'Pause';
    pb.setAttribute('aria-label', pb.textContent);

    const key = `${cur.index}:${cur.over}`;
    if (key === shownKey) return;
    shownKey = key;
    const last = cur.index === st.run.seq.length - 1;
    if (cur.over) {
      $('#phase-box').innerHTML = `<div class="card phase-done" role="alert">
        <strong>${cur.kind === 'focus' ? 'Focus block done' : 'Break over'}</strong>
        <button class="btn" data-act="next" aria-label="${last ? 'Finish session' : cur.kind === 'focus' ? 'Start break' : 'Start focus'}">${last ? 'Finish session' : cur.kind === 'focus' ? 'Start break' : 'Start focus'}</button></div>`;
    } else if (cur.kind !== 'focus') {
      skipArmed = false;
      $('#phase-box').innerHTML = `<div class="card break-tip"><span>Suggestion: ${esc(BREAK_TIPS[cur.index % BREAK_TIPS.length])}</span>
        <button class="btn btn-ghost" data-act="skip" aria-label="Skip break">Skip break</button></div>`;
    } else {
      $('#phase-box').innerHTML = '';
    }
  }

  // ---- tasks ----
  section.addEventListener('change', async (e) => {
    const li = e.target.closest('[data-id]');
    const t = tasks.find((x) => x.id === li?.dataset.id);
    if (!t) return;
    let next;
    if (e.target.dataset.sub) {
      next = toggleSubtask(t, e.target.dataset.sub);
      focus.countSubtask(e.target.checked ? 1 : -1);
      navigator.vibrate?.(15);
      if (next.done && !t.done) toast(`${t.title} complete`, { action: 'Undo', onAction: () => save({ ...next, done: false, completedAt: null }) });
    } else {
      next = toggleTask(t);
    }
    save(next);
  });
  async function save(t) {
    tasks = tasks.map((x) => (x.id === t.id ? t : x));
    drawTasks();
    await saveTask(t);
  }

  // ---- buttons ----
  section.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    const st = focus.get();
    if (!st) return;
    if (act === 'pause') E.isPaused(st.run) ? focus.resume() : focus.pause();
    if (act === 'next') goNext();
    if (act === 'skip') {
      if (!skipArmed) {
        skipArmed = true;
        e.target.textContent = 'Tap again to skip';
        return;
      }
      goNext();
    }
    if (act === 'park') openParking();
  });

  async function goNext() {
    const wasLast = focus.get().run.index === focus.get().run.seq.length - 1;
    shownKey = '';
    if (wasLast) {
      await focus.next();
      location.hash = '#/focus-review';
    } else focus.next();
  }

  // ---- exit friction: hold 2 s, then pick a reason ----
  const endBtn = $('[data-act=end]');
  let holdTimer = null;
  const startHold = () => {
    endBtn.classList.add('holding');
    holdTimer = setTimeout(chooseReason, 2000);
  };
  const cancelHold = () => {
    endBtn.classList.remove('holding');
    clearTimeout(holdTimer);
  };
  endBtn.addEventListener('pointerdown', startHold);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => endBtn.addEventListener(ev, cancelHold));
  endBtn.addEventListener('keydown', (e) => e.key === 'Enter' && chooseReason()); // keyboard users: no hold

  function chooseReason() {
    cancelHold();
    $('#phase-box').innerHTML = `<div class="card" role="dialog" aria-label="Why are you ending?"><strong>Why end now?</strong>
      <div class="chips">${[['done_early', 'Done early'], ['interrupted', 'Interrupted'], ['gave_up', 'Gave up']]
        .map(([v, l]) => `<button class="chip" data-reason="${v}">${l}</button>`).join('')}
        <button class="chip" data-reason="">Keep going</button></div></div>`;
    $('#phase-box').querySelectorAll('[data-reason]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!b.dataset.reason) {
          shownKey = '';
          return draw(Date.now());
        }
        await focus.finish(b.dataset.reason);
        location.hash = '#/focus-review';
      }),
    );
  }

  function openParking() {
    const sheet = document.createElement('div');
    sheet.className = 'sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-label', 'Parking lot');
    const items = focus.get().session.parkingLot;
    sheet.innerHTML = `<div class="sheet-head"><h2 class="sheet-title">Parking lot</h2>
      <button class="btn btn-ghost" data-x aria-label="Close parking lot">Done</button></div>
      <p class="muted">Park a stray thought and get back to work. You can turn it into a task later.</p>
      <form class="row"><input class="input" name="t" maxlength="200" placeholder="Thought…" aria-label="Thought" autocomplete="off" />
        <button class="icon-btn primary" aria-label="Save thought">+</button></form>
      <ul class="list">${items.map((i) => `<li class="list-item"><span>${esc(i.text)}</span></li>`).join('')}</ul>`;
    document.body.append(sheet);
    sheet.querySelector('input').focus();
    sheet.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      focus.addParking(e.target.t.value);
      sheet.remove();
    });
    sheet.querySelector('[data-x]').addEventListener('click', () => sheet.remove());
  }

  const unsubTick = subscribe(draw, { fps: 4 });
  const unsubState = focus.subscribe((st) => {
    if (!st) return;
    shownKey = '';
    draw(Date.now());
  });
  loadTasks();
  setBigSource({ kind: 'focus', read: (now) => focusView(focus.get(), now) });

  return () => {
    setBigSource(null);
    unsubTick();
    unsubState();
    syncAmbient(false);
    release();
    AlarmPlugin.setImmersive?.(false).catch(() => {});
    document.querySelectorAll('.sheet').forEach((s) => s.remove());
  };
}

