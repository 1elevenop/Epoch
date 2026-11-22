// Export / import (BLUEPRINT §7): { version, exportedAt, alarms, alarmLogs, tasks, sessions, settings }.
// Import validates the version and every field first and writes nothing unless all of it is valid (rule 6).

import { validateAlarm, SOUNDS, DEFAULT_CHALLENGES } from '../alarm/model.js';
import { validatePlan } from '../focus/engine.js';
import { DEFAULT_SETTINGS } from '../../core/store.js';
import { sanitizeCountdowns } from '../tools/models.js';
import { THEMES } from '../../core/theme.js';
import { TRANSITIONS } from '../bigdisplay/transitions/index.js';

export const BACKUP_VERSION = 1;

const isStr = (v, max = 500) => typeof v === 'string' && v.length <= max;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isNumOrNull = (v) => v === null || isNum(v);
const isBool = (v) => typeof v === 'boolean';
const isArr = Array.isArray;

export function buildBackup({ alarms, alarmLogs, tasks, sessions, settings }, now = Date.now()) {
  return { version: BACKUP_VERSION, exportedAt: now, app: 'WAKE11', alarms, alarmLogs, tasks, sessions, settings };
}

function checkAlarm(a, i, err) {
  if (!a || typeof a !== 'object') return err(`alarm ${i}: not an object`);
  if (!isStr(a.id, 64) || !a.id) err(`alarm ${i}: id`);
  for (const e of validateAlarm({ ...a, snooze: a.snooze ?? { lengthMin: 5, max: 3 } })) err(`alarm ${i}: ${e}`);
  if (!isBool(a.enabled)) err(`alarm ${i}: enabled`);
  if (a.oneShotAt != null && !isNum(a.oneShotAt)) err(`alarm ${i}: oneShotAt`);
}

const OUTCOMES = new Set(['dismissed', 'missed', 'auto_silenced', 'killed']);
function checkLog(l, i, err) {
  if (!l || !isStr(l.instanceId, 80) || !isStr(l.alarmId, 80)) return err(`log ${i}: ids`);
  if (!isNum(l.firstRangAt) || !isNum(l.scheduledFor)) err(`log ${i}: times`);
  if (!OUTCOMES.has(l.outcome)) err(`log ${i}: outcome`);
  if (!Number.isInteger(l.snoozes) || l.snoozes < 0) err(`log ${i}: snoozes`);
}

function checkTask(t, i, err) {
  if (!t || !isStr(t.id, 80) || !t.id) return err(`task ${i}: id`);
  if (!isStr(t.title, 120)) err(`task ${i}: title`);
  if (!isBool(t.done) || !isBool(t.archived)) err(`task ${i}: done/archived`);
  if (!isNum(t.order) || !isNum(t.createdAt) || !isNumOrNull(t.completedAt)) err(`task ${i}: numbers`);
  if (!isArr(t.subtasks) || t.subtasks.some((s) => !s || !isStr(s.id, 80) || !isStr(s.title, 120) || !isBool(s.done))) err(`task ${i}: subtasks`);
}

const KINDS = new Set(['focus', 'break', 'long_break']);
const REASONS = new Set(['completed', 'done_early', 'interrupted', 'gave_up', null]);
function checkSession(s, i, err) {
  if (!s || !isStr(s.id, 80) || !s.id) return err(`session ${i}: id`);
  if (!isStr(s.goal, 120)) err(`session ${i}: goal`);
  if (!s.plan || validatePlan(s.plan).length) err(`session ${i}: plan`);
  if (!isArr(s.taskIds) || s.taskIds.some((x) => !isStr(x, 80))) err(`session ${i}: taskIds`);
  if (!isArr(s.segments) || s.segments.some((g) => !g || !KINDS.has(g.kind) || !isNum(g.start) || !isNumOrNull(g.end) || !isBool(g.completed))) err(`session ${i}: segments`);
  if (!isArr(s.leaves) || s.leaves.some((l) => !l || !isNum(l.at) || !isNum(l.durationMs))) err(`session ${i}: leaves`);
  if (!isArr(s.parkingLot) || s.parkingLot.some((p) => !p || !isNum(p.at) || !isStr(p.text, 200))) err(`session ${i}: parking lot`);
  if (!REASONS.has(s.endReason ?? null)) err(`session ${i}: endReason`);
  if (s.review != null && (!isStr(s.review.note, 200) || ![1, 2, 3, 4, 5].includes(s.review.rating))) err(`session ${i}: review`);
  if (!isNum(s.startedAt) || !isNumOrNull(s.endedAt ?? null)) err(`session ${i}: times`);
}

const THEME_IDS = new Set(THEMES.map((t) => t.id));
const TR_IDS = new Set(TRANSITIONS.map((t) => t.id));
/** Keeps only known settings with the right type; unknown keys are an error (rule 6). */
function checkSettings(s, err) {
  if (!s || typeof s !== 'object' || isArr(s)) return err('settings: not an object');
  for (const [k, v] of Object.entries(s)) {
    if (!(k in DEFAULT_SETTINGS)) {
      err(`settings: unknown key "${k}"`);
      continue;
    }
    const def = DEFAULT_SETTINGS[k];
    if (k === 'accent') {
      if (v !== null && !/^#[0-9a-f]{6}$/i.test(v)) err('settings: accent');
    } else if (k === 'theme') {
      if (!THEME_IDS.has(v)) err('settings: theme');
    } else if (k === 'bigTransition') {
      if (!v || typeof v !== 'object' || Object.entries(v).some(([kk, vv]) => !['timer', 'stopwatch', 'focus'].includes(kk) || !TR_IDS.has(vv))) err('settings: bigTransition');
    } else if (k === 'worldClocks') {
      if (!isArr(v) || v.some((c) => !c || !isStr(c.name, 80) || !isStr(c.zone, 64))) err('settings: worldClocks');
    } else if (k === 'defaultSnoozeMin') {
      if (!Number.isInteger(v) || v < 1 || v > 60) err('settings: defaultSnoozeMin');
    } else if (k === 'defaultChallenge') {
      if (!DEFAULT_CHALLENGES.includes(v)) err('settings: defaultChallenge');
    } else if (k === 'timerSound') {
      if (!SOUNDS.some((x) => x.id === v)) err('settings: timerSound');
    } else if (k === 'countdowns') {
      if (!isArr(v) || sanitizeCountdowns(v).length !== v.length) err('settings: countdowns');
    } else if (k === 'focusNoise') {
      if (!['off', 'white', 'pink', 'brown'].includes(v)) err('settings: focusNoise');
    } else if (k === 'focusNoiseVolume') {
      if (typeof v !== 'number' || !(v >= 0 && v <= 1)) err('settings: focusNoiseVolume');
    } else if (typeof v !== typeof def) {
      err(`settings: ${k}`);
    }
  }
}

/** Returns { ok, errors, counts }. Pure — unit tested. */
export function validateBackup(data) {
  const errors = [];
  const err = (m) => errors.length < 50 && errors.push(m);
  if (!data || typeof data !== 'object') return { ok: false, errors: ['Not a WAKE11 backup file'], counts: null };
  if (data.version !== BACKUP_VERSION) err(`Unsupported backup version: ${data.version}`);
  for (const k of ['alarms', 'alarmLogs', 'tasks', 'sessions']) if (!isArr(data[k])) err(`${k} is missing`);
  if (errors.length) return { ok: false, errors, counts: null };
  data.alarms.forEach((a, i) => checkAlarm(a, i + 1, err));
  data.alarmLogs.forEach((l, i) => checkLog(l, i + 1, err));
  data.tasks.forEach((t, i) => checkTask(t, i + 1, err));
  data.sessions.forEach((s, i) => checkSession(s, i + 1, err));
  checkSettings(data.settings, err);
  const ids = (arr) => new Set(arr.map((x) => x.id)).size === arr.length;
  if (!ids(data.alarms)) err('duplicate alarm ids');
  if (!ids(data.tasks)) err('duplicate task ids');
  if (!ids(data.sessions)) err('duplicate session ids');
  const counts = { alarms: data.alarms.length, alarmLogs: data.alarmLogs.length, tasks: data.tasks.length, sessions: data.sessions.length };
  return { ok: errors.length === 0, errors, counts };
}

/** Parses file text; never throws. */
export function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { data: null, ok: false, errors: ['The file is not valid JSON'], counts: null };
  }
  const v = validateBackup(data);
  return { ...v, data: v.ok ? data : null };
}
