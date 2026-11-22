// Tasks + focus sessions in IndexedDB (BLUEPRINT §7), plus pure helpers for stats (unit tested).

import { db } from '../../core/store.js';

const uid = () => globalThis.crypto?.randomUUID?.() ?? `id${Date.now()}${Math.random().toString(36).slice(2, 8)}`;

// ---------- tasks ----------

export function newTask(title, order = 0) {
  return { id: uid(), title: title.trim().slice(0, 120), done: false, order, subtasks: [], createdAt: Date.now(), completedAt: null, archived: false };
}

export const newSubtask = (title) => ({ id: uid(), title: title.trim().slice(0, 120), done: false });

/** Ticks a subtask; the task completes when all subtasks are done, and un-completes otherwise. */
export function toggleSubtask(task, subId, now = Date.now()) {
  const subtasks = task.subtasks.map((s) => (s.id === subId ? { ...s, done: !s.done } : s));
  const all = subtasks.length > 0 && subtasks.every((s) => s.done);
  return { ...task, subtasks, done: all, completedAt: all ? task.completedAt ?? now : null };
}

export function toggleTask(task, now = Date.now()) {
  const done = !task.done;
  return { ...task, done, completedAt: done ? now : null };
}

export const progressOf = (task) => ({ done: task.subtasks.filter((s) => s.done).length, total: task.subtasks.length });

export async function listTasks({ archived = false } = {}) {
  const all = (await db.getAll('tasks').catch(() => [])) ?? [];
  return all.filter((t) => !!t.archived === archived).sort((a, b) => a.order - b.order);
}

export const saveTask = (task) => db.put('tasks', task);
export const deleteTask = (id) => db.delete('tasks', id);

// ---------- sessions ----------

export async function listSessions() {
  const all = (await db.getAll('sessions').catch(() => [])) ?? [];
  return all.sort((a, b) => b.startedAt - a.startedAt);
}

export const saveSession = (s) => db.put('sessions', s);

// ---------- stats (pure) ----------

const dayKey = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

const focusMsOf = (s) => (s.segments || []).filter((g) => g.kind === 'focus').reduce((n, g) => n + (g.activeMs || 0), 0);

/** Focus minutes per local day: { 'Y-M-D': minutes }. */
export function minutesByDay(sessions) {
  const out = {};
  for (const s of sessions) {
    for (const g of s.segments || []) {
      if (g.kind !== 'focus') continue;
      const k = dayKey(g.start);
      out[k] = (out[k] || 0) + (g.activeMs || 0) / 60_000;
    }
  }
  for (const k of Object.keys(out)) out[k] = Math.round(out[k]);
  return out;
}

/** Days in a row (ending today or yesterday) with at least one completed focus block. */
export function streak(sessions, now = Date.now()) {
  const days = new Set();
  for (const s of sessions) for (const g of s.segments || []) if (g.kind === 'focus' && g.completed) days.add(dayKey(g.start));
  const d = new Date(now);
  let count = 0;
  if (!days.has(dayKey(d.getTime()))) d.setDate(d.getDate() - 1); // today not done yet: streak can still continue
  while (days.has(dayKey(d.getTime()))) {
    count += 1;
    d.setDate(d.getDate() - 1);
  }
  return count;
}

/** 12 weeks × 7 days of minutes for the heatmap, oldest first, weeks starting Monday. */
export function heatmap(sessions, now = Date.now(), weeks = 12) {
  const mins = minutesByDay(sessions);
  const end = new Date(now);
  const mondayOffset = (end.getDay() + 6) % 7;
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - mondayOffset - (weeks - 1) * 7);
  const cells = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    cells.push({ date: d.getTime(), minutes: d > end ? null : mins[dayKey(d.getTime())] || 0 });
  }
  return cells;
}

export function summary(sessions, tasks, now = Date.now()) {
  const today = dayKey(now);
  const weekAgo = now - 7 * 86_400_000;
  const mins = minutesByDay(sessions);
  const weekSessions = sessions.filter((s) => s.startedAt >= weekAgo);
  return {
    todayMin: mins[today] || 0,
    weekMin: Math.round(weekSessions.reduce((n, s) => n + focusMsOf(s), 0) / 60_000),
    streak: streak(sessions, now),
    tasksDoneWeek: tasks.filter((t) => t.completedAt && t.completedAt >= weekAgo).length,
    avgLeaves: sessions.length ? Math.round((sessions.reduce((n, s) => n + (s.leaves?.length || 0), 0) / sessions.length) * 10) / 10 : 0,
    sessionsWeek: weekSessions.length,
  };
}
