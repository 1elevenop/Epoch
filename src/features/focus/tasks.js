// Tasks screen: tasks with subtasks, drag (handle) to reorder, archive completed (BLUEPRINT §6.5).

import { esc } from '../../core/dom.js';
import { toast } from '../../core/toast.js';
import { listTasks, saveTask, deleteTask, newTask, newSubtask, toggleSubtask, toggleTask, progressOf } from './data.js';

export function taskRow(t, { open = false } = {}) {
  const p = progressOf(t);
  return `<li class="task ${t.done ? 'done' : ''}" data-id="${esc(t.id)}">
    <div class="task-head">
      <button class="drag" aria-label="Drag to reorder ${esc(t.title)}">⋮⋮</button>
      <label class="check"><input type="checkbox" data-act="task" ${t.done ? 'checked' : ''} aria-label="${esc(t.title)} done" /></label>
      <button class="task-title" data-act="open" aria-expanded="${open}">${esc(t.title)}${p.total ? ` <span class="muted">${p.done}/${p.total}</span>` : ''}</button>
      <button class="icon-btn" data-act="del" aria-label="Delete ${esc(t.title)}">✕</button>
    </div>
    <ul class="subtasks" ${open ? '' : 'hidden'}>
      ${t.subtasks.map((s) => `<li><label class="check"><input type="checkbox" data-sub="${esc(s.id)}" ${s.done ? 'checked' : ''} /> <span>${esc(s.title)}</span></label></li>`).join('')}
      <li><form class="row" data-act="addsub"><input class="input" name="sub" maxlength="120" placeholder="Add subtask" aria-label="Add subtask to ${esc(t.title)}" />
        <button class="icon-btn primary" aria-label="Add subtask">+</button></form></li>
    </ul>
  </li>`;
}

export function tasksScreen(el) {
  let tasks = [];
  const open = new Set();
  el.innerHTML = `
    <section class="screen" aria-labelledby="screen-title">
      <a class="back-link" href="#/focus" aria-label="Back to Focus">‹ Focus</a>
      <h1 id="screen-title">Tasks</h1>
      <form class="row" id="add"><input class="input" name="title" maxlength="120" placeholder="New task" aria-label="New task" />
        <button class="btn" aria-label="Add task">Add</button></form>
      <ul class="tasks" id="list"></ul>
      <button class="btn btn-ghost" data-act="archive" aria-label="Archive completed tasks">Archive completed</button>
    </section>`;
  const list = el.querySelector('#list');
  const section = el.querySelector('.screen');

  async function load() {
    tasks = await listTasks();
    list.innerHTML = tasks.map((t) => taskRow(t, { open: open.has(t.id) })).join('') || '<li class="empty">No tasks yet.</li>';
  }
  const find = (e) => tasks.find((t) => t.id === e.target.closest('[data-id]')?.dataset.id);
  const put = async (t) => {
    await saveTask(t);
    await load();
  };

  el.querySelector('#add').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = e.target.title.value.trim();
    if (!title) return;
    e.target.title.value = '';
    await put(newTask(title, (tasks.at(-1)?.order ?? 0) + 1));
  });
  section.addEventListener('submit', async (e) => {
    if (e.target.dataset.act !== 'addsub') return;
    e.preventDefault();
    const t = find(e);
    const title = e.target.sub.value.trim();
    if (t && title) await put({ ...t, subtasks: [...t.subtasks, newSubtask(title)], done: false, completedAt: null });
  });
  section.addEventListener('change', async (e) => {
    const t = find(e);
    if (!t) return;
    if (e.target.dataset.act === 'task') await put(toggleTask(t));
    if (e.target.dataset.sub) await put(toggleSubtask(t, e.target.dataset.sub));
  });
  section.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    const t = find(e);
    if (act === 'open' && t) {
      open.has(t.id) ? open.delete(t.id) : open.add(t.id);
      await load();
    }
    if (act === 'del' && t) {
      await deleteTask(t.id);
      await load();
      toast(`Deleted ${t.title}`, { action: 'Undo', ms: 5000, onAction: () => put(t) });
    }
    if (act === 'archive') {
      const done = tasks.filter((x) => x.done);
      for (const x of done) await saveTask({ ...x, archived: true });
      await load();
      toast(`Archived ${done.length} task${done.length === 1 ? '' : 's'}`);
    }
  });
  enableDrag(list, async (fromId, toIndex) => {
    const moving = tasks.find((t) => t.id === fromId);
    const rest = tasks.filter((t) => t.id !== fromId);
    rest.splice(toIndex, 0, moving);
    for (const [i, t] of rest.entries()) if (t.order !== i) await saveTask({ ...t, order: i });
    await load();
  });
  load();
}

/** Drag a row by its ⋮⋮ handle; drop position is decided by the row midpoints. */
function enableDrag(list, onDrop) {
  let drag = null;
  list.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('.drag');
    if (!handle) return;
    const row = handle.closest('[data-id]');
    drag = { row, id: row.dataset.id, y0: e.clientY };
    row.classList.add('dragging');
    handle.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  list.addEventListener('pointermove', (e) => {
    if (drag) drag.row.style.transform = `translateY(${e.clientY - drag.y0}px)`;
  });
  const end = (e) => {
    if (!drag) return;
    const rows = [...list.querySelectorAll(':scope > [data-id]')].filter((r) => r !== drag.row);
    const index = rows.filter((r) => r.getBoundingClientRect().top + r.offsetHeight / 2 < e.clientY).length;
    drag.row.style.transform = '';
    drag.row.classList.remove('dragging');
    const id = drag.id;
    drag = null;
    onDrop(id, index);
  };
  list.addEventListener('pointerup', end);
  list.addEventListener('pointercancel', end);
}
