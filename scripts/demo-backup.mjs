// Builds an Epoch backup filled with neutral demo data for screenshots (RELEASE_PLAN §3).
// Validated with the app's own parseBackup before it is written.
// Usage: node scripts/demo-backup.mjs [out.json]   → import it in Settings → Backup.

import { writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

// The app's modules import CSS (fonts); Node cannot load it, so .css becomes an empty module here.
registerHooks({
  load: (url, ctx, next) => (url.endsWith('.css') ? { format: 'module', source: '', shortCircuit: true } : next(url, ctx)),
});
const { buildBackup, parseBackup } = await import('../src/features/settings/backup.js');

const now = Date.now();
const DAY = 86_400_000;
const MIN = 60_000;

const alarm = (id, hour, minute, days, label, extra = {}) => ({
  id, hour, minute, days, label, enabled: true,
  soundId: 'gentle_rise', vibrate: true, volume: 0.8, rampSec: 30,
  snooze: { lengthMin: 5, max: 2, shrink: true, weeklyBudget: 6 },
  challenge: { chain: ['math', 'memory'], level: 2, qrPayload: null },
  wakeCheck: { enabled: true, delayMin: 4, windowSec: 60 },
  sunriseMin: 10, deleteAfterUse: false, skipNext: false, oneShotAt: null,
  ...extra,
});

const alarms = [
  alarm('demo-a1', 6, 0, [1, 2, 3, 4, 5], 'Workday'),
  alarm('demo-a2', 7, 30, [6, 0], 'Weekend run', { soundId: 'gentle_marimba', challenge: { chain: ['steps'], level: 2, qrPayload: null } }),
  alarm('demo-a3', 5, 15, [2, 4], 'Gym', { soundId: 'hard_classic', challenge: { chain: ['shake', 'type'], level: 3, qrPayload: null } }),
  alarm('demo-a4', 14, 0, [], 'Power nap', { enabled: false, sunriseMin: 0, wakeCheck: { enabled: false, delayMin: 4, windowSec: 60 } }),
];

const alarmLogs = [];
for (let d = 1; d <= 10; d++) {
  const at = now - d * DAY;
  alarmLogs.push({
    instanceId: `demo-i${d}`, alarmId: 'demo-a1', scheduledFor: at, firstRangAt: at,
    outcome: d === 4 ? 'missed' : 'dismissed', snoozes: [0, 1, 0, 0, 2, 0, 0, 1, 0, 0][d - 1],
  });
}

const task = (id, title, order, done, subs = []) => ({
  id, title, order, done, archived: false, createdAt: now - 3 * DAY, completedAt: done ? now - DAY : null,
  subtasks: subs.map((t, i) => ({ id: `${id}-s${i}`, title: t, done: i === 0 })),
});
const tasks = [
  task('demo-t1', 'Write project report', 0, false, ['Outline', 'First draft', 'Charts']),
  task('demo-t2', 'Study chapter 5', 1, false),
  task('demo-t3', 'Practise guitar', 2, true),
];

const plan = { focusMin: 25, breakMin: 5, cycles: 4, longBreakMin: 15, longEvery: 4 };
const sessions = [];
for (let d = 0; d < 7; d++) {
  const blocks = [3, 4, 2, 4, 1, 3, 2][d];
  const start = now - d * DAY - 6 * 60 * MIN;
  const segments = [];
  let t = start;
  for (let i = 0; i < blocks; i++) {
    segments.push({ kind: 'focus', start: t, end: t + 25 * MIN, activeMs: 25 * MIN, completed: true });
    t += 25 * MIN;
    if (i < blocks - 1) { segments.push({ kind: 'break', start: t, end: t + 5 * MIN, activeMs: 5 * MIN, completed: true }); t += 5 * MIN; }
  }
  sessions.push({
    id: `demo-f${d}`, goal: d % 2 ? 'Study chapter 5' : 'Write project report', plan, taskIds: [d % 2 ? 'demo-t2' : 'demo-t1'],
    segments, leaves: d === 2 ? [{ at: start + 10 * MIN, durationMs: 40_000 }] : [], parkingLot: [],
    endReason: blocks === 4 ? 'completed' : 'done_early', review: { note: '', rating: 4 },
    startedAt: start, endedAt: t,
  });
}

const settings = {
  onboarded: true, onboardingSeen: true, theme: 'black',
  worldClocks: [{ name: 'London', zone: 'Europe/London' }, { name: 'New York', zone: 'America/New_York' }, { name: 'Tokyo', zone: 'Asia/Tokyo' }],
};

const data = buildBackup({ alarms, alarmLogs, tasks, sessions, settings }, now);
const parsed = parseBackup(JSON.stringify(data));
if (!parsed.ok) {
  console.error('Demo backup is invalid:\n' + parsed.errors.join('\n'));
  process.exit(1);
}
const out = process.argv[2] ?? 'epoch-demo-backup.json';
writeFileSync(out, JSON.stringify(data, null, 1));
console.log(`Wrote ${out}:`, parsed.counts);
