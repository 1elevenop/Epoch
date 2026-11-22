// Web storage: IndexedDB for records (tasks, sessions, stats cache), localStorage for UI settings only.
// Native SharedPreferences owns alarms (rule D2) — nothing alarm-related is stored here.

const DB_NAME = 'wake';
const DB_VERSION = 1;
const STORES = ['tasks', 'sessions', 'stats'];

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB open blocked'));
  });
  dbPromise.catch(() => (dbPromise = null));
  return dbPromise;
}

async function run(storeName, mode, fn) {
  if (!STORES.includes(storeName)) throw new Error(`Unknown store: ${storeName}`);
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const req = fn(tx.objectStore(storeName));
    let result;
    if (req) req.onsuccess = () => (result = req.result);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  });
}

export const db = {
  get: (store, id) => run(store, 'readonly', (s) => s.get(id)),
  getAll: (store) => run(store, 'readonly', (s) => s.getAll()),
  put: (store, value) => run(store, 'readwrite', (s) => s.put(value)),
  delete: (store, id) => run(store, 'readwrite', (s) => s.delete(id)),
  clear: (store) => run(store, 'readwrite', (s) => s.clear()),
};

// ---------- Settings (localStorage, with in-memory fallback) ----------

const SETTINGS_KEY = 'wake.settings';

export const DEFAULT_SETTINGS = Object.freeze({
  lastTab: 'clock',
  hour12: false,
  showSeconds: true,
  haptics: true,
  clockFace: 'digital', // 'digital' | 'analog'
  worldClocks: [], // [{ name, zone }]
  onboarded: false,
  onboardingSeen: false,
  theme: 'oled',
  accent: null, // null = the theme's own accent
  weekStart: 1, // 1 = Monday, 0 = Sunday
  bigTransition: { timer: 'flip', stopwatch: 'odometer', focus: 'nixie' },
  lastBackupAt: 0,
  focusNoise: 'off', // ambient noise during focus blocks: 'off' | 'white' | 'pink' | 'brown'
  focusNoiseVolume: 0.3,
  defaultSnoozeMin: 5, // new alarms
  defaultChallenge: 'math', // new alarms (QR needs a code per alarm, so not offered)
  timerSound: 'hard_classic', // finished timers; mirrored to native
  focusDnd: false, // Do Not Disturb during focus sessions
  countdowns: [], // [{ id, title, date: 'YYYY-MM-DD', onClock }]
});

let memory = null;

function readRaw() {
  try {
    return globalThis.localStorage?.getItem(SETTINGS_KEY) ?? memory;
  } catch {
    return memory;
  }
}

function writeRaw(value) {
  memory = value;
  try {
    globalThis.localStorage?.setItem(SETTINGS_KEY, value);
  } catch {
    // Private mode / storage disabled: keep the in-memory copy.
  }
}

export function getSettings() {
  try {
    const parsed = JSON.parse(readRaw() || '{}');
    return { ...DEFAULT_SETTINGS, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

// ---------- Small UI state (stopwatch, in-app timers) ----------
// Timestamps only, so a reload or app restart resumes with correct times (rule D7).

const memState = new Map();

export function loadState(key, fallback) {
  try {
    const raw = globalThis.localStorage?.getItem(`wake.state.${key}`) ?? memState.get(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function saveState(key, value) {
  const raw = JSON.stringify(value);
  memState.set(key, raw);
  try {
    globalThis.localStorage?.setItem(`wake.state.${key}`, raw);
  } catch {
    // keep the in-memory copy
  }
}

/** Import: replaces all settings (already validated by the backup module). */
export function replaceSettings(obj) {
  writeRaw(JSON.stringify({ ...DEFAULT_SETTINGS, ...obj }));
  return getSettings();
}

export function setSetting(key, value) {
  if (!(key in DEFAULT_SETTINGS)) throw new Error(`Unknown setting: ${key}`);
  const next = { ...getSettings(), [key]: value };
  writeRaw(JSON.stringify(next));
  return next;
}
