// Pure rules shared by the challenges, the ring screen and the browser mock.
// Escalation mirrors native Escalation.kt (BLUEPRINT §5.2); keep both in sync.

/** Seeded PRNG (mulberry32) so challenge generators are testable. Returns floats in [0, 1). */
export function rng(seed = Date.now()) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.int = (min, max) => min + Math.floor(next() * (max - min + 1)); // inclusive
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  return next;
}

export const SHRINK_CAP = 2;

export const escalation = {
  snoozeCap: (max, shrink) => (shrink ? Math.min(max, SHRINK_CAP) : max),
  snoozeLengthMin: (base, index, shrink) => (shrink && index >= 2 ? Math.max(1, Math.round(base * 0.6)) : base),
  challengeLevel: (base, snoozeCount, escalated) => Math.min(4, Math.max(1, base) + (escalated ? 1 : snoozeCount)),
  budgetLeft: (budget, used) => (budget == null ? null : Math.max(0, budget - used)),
  canSnooze(snoozeCount, max, shrink, escalated, budgetLeft) {
    const leftByCap = Math.max(0, this.snoozeCap(max, shrink) - snoozeCount);
    const left = budgetLeft == null ? leftByCap : Math.min(leftByCap, budgetLeft);
    if (escalated || leftByCap === 0) return { allowed: false, left: 0, reason: 'locked' };
    if (budgetLeft != null && budgetLeft <= 0) return { allowed: false, left: 0, reason: 'budget' };
    return { allowed: true, left, reason: null };
  },
};

/** Challenges that depend on hardware or a printed code can fall back (BLUEPRINT §5.3 escape hatch). */
export const HATCHABLE = new Set(['qr', 'steps', 'shake']);
export const ESCAPE_FAILS = 3;
export const ESCAPE_MS = 5 * 60_000;
export const ESCAPE_CHAIN = [
  { id: 'math', level: 4 },
  { id: 'type', level: 4 },
];

export function shouldEscape({ id, fails = 0, startedAt, now = Date.now(), unavailable = false }) {
  if (!HATCHABLE.has(id)) return false;
  return unavailable || fails >= ESCAPE_FAILS || now - startedAt >= ESCAPE_MS;
}

export const CHALLENGE_INFO = {
  math: { name: 'Math' },
  type: { name: 'Type a phrase' },
  memory: { name: 'Memory' },
  shake: { name: 'Shake' },
  qr: { name: 'Scan QR code' },
  steps: { name: 'Walk' },
};
