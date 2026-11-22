// Focus setup: one-line goal (required), plan (25/5/4/15), pick or create tasks.

import { esc } from '../../core/dom.js';
import { loadState, saveState, getSettings, setSetting } from '../../core/store.js';
import { DEFAULT_PLAN, validatePlan } from './engine.js';
import { listTasks, saveTask, newTask, progressOf } from './data.js';
import { focus } from './session.js';
import { unlock } from '../../core/audio.js';
import { AlarmPlugin } from '../../core/bridge.js';

const FIELDS = [
  ['focusMin', 'Focus (min)', 1, 180],
  ['breakMin', 'Break (min)', 1, 60],
  ['cycles', 'Cycles', 1, 12],
  ['longBreakMin', 'Long break (min)', 1, 90],
  ['longEvery', 'Long break every', 1, 12],
];

export function setupScreen(el) {
  if (focus.get()) {
    location.hash = '#/focus-run';
    return;
  }
  const plan = { ...DEFAULT_PLAN, ...loadState('focusPlan', {}) };
  const picked = new Set();
  const noise = getSettings();
  el.innerHTML = `
    <section class="screen" aria-labelledby="screen-title">
      <a class="back-link" href="#/focus" aria-label="Back to Focus">‹ Focus</a>
      <h1 id="screen-title">New focus session</h1>
      <form class="form" id="f" novalidate>
        <label class="field">Session goal (required)
          <input class="input" name="goal" maxlength="120" required placeholder="e.g. Finish chapter 4 notes" /></label>
        <div class="plan-grid">
          ${FIELDS.map(([k, l, lo, hi]) => `<label class="field">${l}<input class="input" type="number" inputmode="numeric" name="${k}" min="${lo}" max="${hi}" value="${plan[k]}" /></label>`).join('')}
        </div>
        <div class="plan-grid">
          <label class="field">Background noise<select class="input" name="noise" aria-label="Background noise during focus blocks">
            ${[['off', 'Off'], ['brown', 'Brown'], ['pink', 'Pink'], ['white', 'White']].map(([v, l]) => `<option value="${v}" ${v === noise.focusNoise ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="field">Noise volume<input type="range" name="noiseVol" min="0.05" max="1" step="0.05" value="${noise.focusNoiseVolume}" aria-label="Background noise volume" /></label>
        </div>
        <label class="switch-row">Do Not Disturb during the session<input type="checkbox" role="switch" name="dnd" ${noise.focusDnd ? 'checked' : ''} /></label>
        <div class="row dnd-hint" id="dnd-hint" hidden><span class="muted">WAKE11 needs Do Not Disturb access once: tap Allow, find WAKE11 near the bottom of the list and turn it on.</span>
          <button type="button" class="btn btn-ghost" data-act="dnd-access" aria-label="Allow Do Not Disturb access in Android settings">Allow</button></div>
        <h3 class="form-section">Tasks for this session</h3>
        <ul class="pick" id="pick"><li class="empty">Loading…</li></ul>
        <div class="row"><input class="input" name="newTask" maxlength="120" placeholder="New task" aria-label="New task" />
          <button type="button" class="icon-btn primary" data-act="add" aria-label="Add task">+</button></div>
        <p class="form-error" role="alert"></p>
        <button class="btn btn-round" data-act="start" aria-label="Start session">Start</button>
      </form>
    </section>`;
  const form = el.querySelector('#f');
  const pick = el.querySelector('#pick');

  async function load() {
    const tasks = (await listTasks()).filter((t) => !t.done);
    pick.innerHTML = tasks.length
      ? tasks
          .map((t) => {
            const p = progressOf(t);
            return `<li><label class="check"><input type="checkbox" value="${esc(t.id)}" ${picked.has(t.id) ? 'checked' : ''} />
              <span>${esc(t.title)}${p.total ? ` <span class="muted">${p.done}/${p.total}</span>` : ''}</span></label></li>`;
          })
          .join('')
      : '<li class="empty">No open tasks. Add one below, or start without.</li>';
  }

  pick.addEventListener('change', (e) => (e.target.checked ? picked.add(e.target.value) : picked.delete(e.target.value)));
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'add') {
      const title = form.newTask.value.trim();
      if (!title) return;
      const t = newTask(title, Date.now());
      await saveTask(t);
      picked.add(t.id);
      form.newTask.value = '';
      load();
    }
    if (act === 'dnd-access') AlarmPlugin.openDndAccess().catch(() => {});
    if (act === 'start') {
      const p = Object.fromEntries(FIELDS.map(([k]) => [k, Number(form[k].value)]));
      const errors = validatePlan(p);
      const goal = form.goal.value.trim();
      if (!goal) errors.unshift('Write a one-line goal');
      if (errors.length) {
        el.querySelector('.form-error').textContent = errors.join('. ');
        return;
      }
      unlock();
      saveState('focusPlan', p);
      setSetting('focusDnd', form.dnd.checked);
      setSetting('focusNoise', form.noise.value);
      setSetting('focusNoiseVolume', Number(form.noiseVol.value));
      focus.start({ goal, plan: p, taskIds: [...picked] });
      location.hash = '#/focus-run';
    }
  });
  // DND access: show the "Allow" hint while the switch is on and Android has not granted access.
  const hint = el.querySelector('#dnd-hint');
  async function checkDnd() {
    if (!form.dnd.checked) return (hint.hidden = true);
    const st = await AlarmPlugin.dndStatus().catch(() => ({ access: false }));
    hint.hidden = !!st.access;
  }
  form.dnd.addEventListener('change', checkDnd);
  const onVisible = () => document.visibilityState === 'visible' && checkDnd(); // back from Settings
  document.addEventListener('visibilitychange', onVisible);
  checkDnd();
  load();
  form.goal.focus();
  return () => document.removeEventListener('visibilitychange', onVisible);
}
