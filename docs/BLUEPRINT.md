# Epoch (formerly WAKE11) — Alarm, Focus & Audio App · Build Blueprint

> Owner: 1elevenop · Target: personal Android phone · Version 1.0 (2026-11-22)
> Purpose of this file: the single source of truth for Claude Code. Put it in the project root. Build phase by phase. Do not start a phase before the previous phase passes its acceptance tests.

---

## 0. How to use this file in Claude Code

1. Create an empty folder, e.g. `wake-app/`. Put this file in it as `BLUEPRINT.md`.
2. Start Claude Code in that folder. First prompt:

```
Read BLUEPRINT.md fully. Then create CLAUDE.md that summarises the rules in
section 2 and section 13. Then do Phase 0 only. Stop after Phase 0 and show me
how to run the app on my phone.
```

3. For every next phase:

```
Do Phase N from BLUEPRINT.md. Write the tests listed for this phase.
Stop when the acceptance checklist passes. Tell me what to test by hand on my phone.
```

4. Keep a `CHANGELOG.md`. When a decision changes, update this file, not only the code.

---

## 1. Goal and definition of success

| Goal | Measurable test |
|---|---|
| Alarm never fails to ring | 30 nights, 0 missed alarms. Includes reboot, Doze, battery saver, phone on silent |
| Anti-snooze gets me up | Average snoozes per morning ≤ 1 after 2 weeks (app logs this) |
| Focus mode is used daily | ≥ 5 logged focus sessions per week |
| App replaces the stock clock for timer/stopwatch | Stock Clock app not opened for 2 weeks |

Non-goals for v1: iOS, Play Store release, cloud sync, accounts, widgets, Wear OS.

---

## 2. Key decisions (and why)

| # | Decision | Reason |
|---|---|---|
| D1 | **Hybrid app: Capacitor + web UI (HTML/CSS/JS) + small native Kotlin layer** | You want HTML/CSS. But a web page cannot schedule a real alarm, cannot wake a locked phone, and is killed in the background. The native layer does only those jobs |
| D2 | **Native side owns all alarm data and alarm timing** | At boot, or when the alarm fires, the WebView may not be running. Native code must know the alarms without asking JS |
| D3 | **Sound first, UI second** | When an alarm fires, native code starts the sound immediately. The web UI loads after. If the web UI fails, the alarm still rings, and a native fallback screen can dismiss it |
| D4 | **Use `AlarmManager.setAlarmClock()`** for alarms and timers | It is the strongest exact-alarm API. It works in Doze and shows the alarm icon in the status bar |
| D5 | **Declare `USE_EXACT_ALARM`** | Alarm-clock apps may declare it; it is granted at install. `SCHEDULE_EXACT_ALARM` is denied by default for new installs on Android 14+ |
| D6 | **Vanilla JS + Vite, no framework** | Small app, you wanted HTML/CSS, fewer moving parts. ES modules give enough structure |
| D7 | **Time is always computed, never counted** | `remaining = endAt - Date.now()`. Ticks only redraw the screen. No drift, survives sleep |
| D8 | **Offline only, local storage only** | No server, no account. Export/import JSON for backup |
| D9 | **Android only, sideloaded (debug/release APK)** | Personal use. No Play Store policy work needed now |

---

## 3. Platform constraints (researched, Nov 2026)

| Topic | Rule | Our handling |
|---|---|---|
| Exact alarms | Android 14+: `SCHEDULE_EXACT_ALARM` not pre-granted to new installs targeting API 33+. Alarm-clock apps should declare `USE_EXACT_ALARM` (granted at install) | Declare `USE_EXACT_ALARM`. Also declare `SCHEDULE_EXACT_ALARM` with `android:maxSdkVersion="32"`. Always check `canScheduleExactAlarms()` before scheduling |
| Full-screen alarm over lock screen | Android 14+: `USE_FULL_SCREEN_INTENT` limited to calling/alarm apps. Check `NotificationManager.canUseFullScreenIntent()`; if false, send user to `ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT` | Check at startup and in the Reliability screen |
| Foreground service types | Android 14+: every foreground service must declare a type + matching permission | Ringing service: type `mediaPlayback`, permission `FOREGROUND_SERVICE_MEDIA_PLAYBACK` |
| Starting FGS from background | Restricted since Android 12. An exact-alarm broadcast is an allowed trigger (verify on device) | Start the ringing service only from the alarm `BroadcastReceiver` |
| Boot | Alarms are erased on reboot. Android 15 blocks some FGS types (incl. mediaPlayback) from starting in `BOOT_COMPLETED` | Boot receiver only **re-schedules**. To resume a missed ringing alarm, schedule a new exact alarm 5 s later; let the alarm receiver ring |
| Notifications | Android 13+: runtime permission `POST_NOTIFICATIONS` | Ask in onboarding |
| OEM battery killers (Xiaomi, Vivo, Oppo, Realme, Samsung) | Can kill apps despite Android rules | Reliability screen with phone-specific steps: autostart ON, battery "No restrictions", lock app in recents. Link to dontkillmyapp.com |
| Silent mode / DND | Alarm stream normally plays in silent mode | Play with `AudioAttributes.USAGE_ALARM` |

**Verify items on the real phone** (Phase 3 tests): FGS start from alarm receiver, full-screen intent permission state, behaviour after force-stop (force-stop cancels alarms — that is Android design and cannot be fixed; the app warns about it).

---

## 4. Architecture

```
┌─────────────────────────── ANDROID PHONE ────────────────────────────┐
│                                                                      │
│  WEB LAYER (WebView, Capacitor)        NATIVE LAYER (Kotlin)         │
│  ─────────────────────────────         ──────────────────────        │
│  UI: Clock, Alarm list, Timer,         AlarmPlugin  (bridge API)     │
│  Stopwatch, Focus, Audio Lab,   ◄────► AlarmStore   (SharedPrefs JSON)│
│  Challenges, Stats, Settings           AlarmScheduler (AlarmManager) │
│                                        AlarmReceiver (fires)         │
│  Stores: IndexedDB (tasks,             RingService  (FGS: sound,     │
│  sessions, logs), localStorage         vibration, volume ramp)       │
│  (UI prefs)                            RingActivity (lock-screen host│
│                                          → loads web /ring route;    │
│  Web Audio: metronome, tones,            native fallback dismiss)    │
│  noise, beeps                          BootReceiver (re-schedule)    │
│                                        TimeChangeReceiver            │
│                                        WakeCheckReceiver             │
└──────────────────────────────────────────────────────────────────────┘
```

### Responsibility split

| Job | Native | Web |
|---|---|---|
| Store alarms | ✅ source of truth | mirror (reads via plugin) |
| Compute next trigger time | ✅ | display only |
| Ring sound, vibration, volume ramp | ✅ | — |
| Show on lock screen, turn screen on | ✅ | — |
| Challenges (math, typing, memory, shake) | fallback math only | ✅ main UI |
| QR scan, step count | ✅ (plugins) | UI |
| Timers when app is closed | ✅ (alarm at `endAt`) | UI + in-app beep |
| Stopwatch | — | ✅ (timestamps only) |
| Focus mode, tasks, stats | keep-screen-on, immersive | ✅ |
| Audio lab | — | ✅ Web Audio |

### Bridge API (`AlarmPlugin`, TypeScript-style signature)

```ts
listAlarms(): Promise<Alarm[]>
upsertAlarm(a: Alarm): Promise<Alarm>          // returns with nextTriggerAt
deleteAlarm(id: string): Promise<void>
setEnabled(id: string, on: boolean): Promise<Alarm>
getRingState(): Promise<RingState | null>      // what is ringing now
snooze(id: string): Promise<SnoozeResult>      // {allowed, nextRingAt, snoozesLeft}
dismiss(id: string, proof: DismissProof): Promise<void>
confirmAwake(id: string): Promise<void>        // wake-check answered
scheduleTimer(t: {id, endAt, label}): Promise<void>
cancelTimer(id: string): Promise<void>
getReliabilityStatus(): Promise<{exactAlarm, fullScreenIntent,
   notifications, batteryUnrestricted, manufacturer}>
openSetting(which: 'exactAlarm'|'fullScreen'|'battery'|'notifications'|'appDetails')
previewSound(soundId: string, volume: number): Promise<void>
stopPreview(): Promise<void>
// events
addListener('ringStarted' | 'ringStopped' | 'alarmsChanged', cb)
```

---

## 5. Alarm engine (the core)

### 5.1 State machine (per alarm instance)

```
           schedule()
IDLE ───────────────► SCHEDULED ──(time reached)──► RINGING
 ▲                        ▲                         │   │
 │                        │ snooze allowed          │   │ dismiss + proof OK
 │                        └──── SNOOZED ◄───────────┘   ▼
 │                                                 DISMISSED
 │                                                      │ wakeCheck on?
 │                                         no ◄─────────┤
 │                                                      ▼ yes
 │                                            WAKE_CHECK_PENDING
 │                                                      │ (delay, e.g. 4 min)
 │                                                      ▼
 │                                            WAKE_CHECK_PROMPT (60 s window)
 │                                               │              │
 │                                    tapped ✓   │              │ no tap
 │                                               ▼              ▼
 └──── (repeat → next SCHEDULED) ◄─────────── DONE          RINGING (escalated)
```

Rules:
- Every state change is written to `AlarmStore` **before** the side effect. A crash or reboot resumes from the stored state.
- Only one alarm rings at a time. A second alarm that fires during ringing is queued and rings 1 min after dismiss.
- Repeat alarms compute the next trigger from the **rule**, not "+24 h" (handles DST/timezone change).

### 5.2 Anti-snooze escalation

| Snooze # | Snooze length | Next challenge | Volume |
|---|---|---|---|
| 0 (first ring) | — | base difficulty | ramp 30 s to target |
| 1 | settings value (default 5 min) | +1 level | ramp 10 s |
| 2 | 60 % of default (3 min) | +2 levels | starts at target |
| 3+ | **snooze locked** | must dismiss | max |

Extra rules:
- **Snooze budget (optional):** N snoozes per week. Shown on the ring screen: "1 snooze left this week".
- **Volume lock:** while ringing, the service resets `STREAM_ALARM` to the target level every 2 s.
- **Swipe-away / force close:** the foreground service keeps ringing after swipe-away. Force-stop from settings cancels everything — app cannot prevent it; the log records "ended without dismiss".
- **Power off cheat:** on boot, if stored state is `RINGING` or `SNOOZED` and the alarm time was < 60 min ago → schedule ring in 5 s (see section 3, Boot).
- **Auto-silence:** after 15 min of ringing with no input, stop and log "missed". Safety against draining battery / disturbing others.

### 5.3 Dismiss challenges

| ID | Challenge | Difficulty levels | Notes |
|---|---|---|---|
| `math` | Solve K problems | L1: 1-digit + 1-digit · L2: 2-digit + 1-digit · L3: 2-digit + 2-digit · L4: 3 times-table problems | Wrong answer adds one problem (max 2 extra). Numeric keypad only |
| `type` | Type a random phrase exactly | 4 / 6 / 9 / 12 words | Paste blocked, autocorrect off |
| `memory` | Repeat a tile pattern on a 3×3 / 4×4 grid | length 4 → 8 | |
| `shake` | Shake N times | 20 / 40 / 60 / 90 | Accelerometer magnitude threshold, debounce 250 ms |
| `qr` | Scan the registered code | — | User registers a code in setup (print it, stick it in bathroom). Only that exact payload passes |
| `steps` | Walk N steps | 20 / 40 / 80 | Needs `ACTIVITY_RECOGNITION`. Use step detector sensor |

Combine: an alarm may require a **chain**, e.g. `qr → math`.

**Escape hatch (mandatory):** if `qr` or `steps` fails (camera broken, code lost, sensor missing) → after 3 failed attempts or 5 min, switch to `math L4 + type 12 words`. An alarm that cannot be dismissed is a bug, not a feature.

**Native fallback:** `RingActivity` has a built-in Kotlin math screen (L3). It is used when the WebView fails to load within 4 s.

### 5.4 Wake-up check
- Default: on, delay 4 min, window 60 s.
- Shown as a full-screen notification "Are you up? Tap ✓". Tap = `confirmAwake`.
- No tap → ring again with snooze locked.

### 5.5 Sunrise pre-alarm (Phase 5)
- N minutes before the alarm (default 15), RingActivity shows a dark-red → orange → white gradient at rising brightness. No sound. Works only if the phone faces you.

---

## 6. Feature specifications

### 6.1 Clock tab
- Large digital time (tabular numerals), seconds toggle, date, next alarm ("Alarm in 7 h 20 m").
- Analog face option (SVG, hand angles from time; smooth seconds via `requestAnimationFrame`).
- World clocks: add city (bundled list of ~400 cities with IANA zone), shows offset "+4:30", day/night dot. Use `Intl.DateTimeFormat` with `timeZone`.
- Night mode: tap to enter. Black screen, dim red digits, moves the digits a few pixels every minute (burn-in protection), keep screen on.

### 6.2 Alarm tab
- List: time, label, days, challenge icons, toggle. Swipe to delete with undo (5 s).
- Editor fields: time, repeat days (Mon–Sun chips), label, sound (bundled 6 sounds + gentle/hard categories), vibrate, target volume, ramp seconds, snooze length, max snoozes, challenge chain + difficulty, wake-check on/off, one-time (delete after use), sunrise pre-alarm.
- Quick add: "+10 min", "+30 min", "+1 h" nap alarms.
- "Skip next occurrence" for repeat alarms.
- Test button: rings in 10 s with the real path (native schedule → receiver → service → activity).

### 6.3 Timer tab
- Multiple timers run at once. Each: label, duration, `endAt`, state (`running|paused|done`).
- Presets chips (1, 3, 5, 10, 25 min) + custom wheel input.
- Buttons: start, pause, reset, +1 min.
- On finish: if app open → in-app sound + full-screen "Done" with overtime counter (−00:42). If app closed → native alarm at `endAt` rings with `USAGE_ALARM`, simple dismiss (no challenge).
- Ongoing notification with live countdown (native `Chronometer` count-down) while a timer runs.

### 6.4 Stopwatch tab
- Model: `{startedAt|null, accumulatedMs, laps: [{totalMs, splitMs}]}`. No background work needed.
- Lap list: lap #, split, total. Fastest lap green, slowest red.
- Copy laps as text. Display updates at 30 fps for hundredths.

### 6.5 Focus mode (study sessions)
**Setup screen**
- Session goal (one line, required).
- Plan: focus minutes, break minutes, cycles, long break after N cycles (defaults 25 / 5 / 4 / 15).
- Task picker: choose existing tasks or create new. Each task has subtasks.

**Running screen (fullscreen, immersive, screen kept on)**
```
┌───────────────────────────────┐
│  Goal: Finish chapter 4 notes │
│                               │
│            18:42              │  ← big ring progress
│        Focus · 2 of 4         │
│                               │
│ ▸ Task: Chapter 4 notes  3/5  │
│   ☑ Read 4.1                  │
│   ☑ Read 4.2                  │
│   ☑ Summarise 4.1             │
│   ☐ Summarise 4.2   ← current │
│   ☐ Flashcards                │
│                               │
│ [Parking lot ✎]  [Pause] [⋯]  │
└───────────────────────────────┘
```
- Tick a subtask → progress updates, small haptic. All subtasks ticked → task auto-completes (can be undone).
- **Parking lot:** quick text box for stray thoughts. Saved with the session.
- **Leave detection:** Capacitor `App` `appStateChange` / `pause` events count how often and how long you left the app. Shown in review.
- **Exit friction:** ending early requires a long-press (2 s) and a reason chip ("done early", "interrupted", "gave up").
- Optional ambient noise from Audio Lab (brown/pink noise) during focus; off during breaks.
- Optional DND during session (needs Notification Policy access; Phase 5).
- Break screen: different colour, suggested action (stand, water, breathing timer), "Skip break" needs a second tap.

**Review screen**
- Planned vs actual minutes, cycles done, subtasks done, leaves count, parking-lot items (convert to tasks with one tap), one-line note, rating 1–5.

**Tasks screen (outside sessions)**
- Task list with subtasks, drag to reorder, archive completed.

**Stats**
- Today / week focus minutes, 12-week heatmap calendar, streak (days with ≥ 1 completed focus block), tasks completed per week, average leaves per session.

### 6.6 Audio Lab (Web Audio API, foreground only in v1)
| Tool | Spec |
|---|---|
| Metronome | 20–300 BPM, tap tempo (average of last 4 taps), time signatures 2/4, 3/4, 4/4, 5/4, 6/8, 7/8, accent beat 1, subdivisions (none, 8ths, triplets, 16ths), visual pulse. **Scheduler:** look-ahead pattern — a 25 ms JS loop schedules oscillator clicks 100 ms ahead using `audioCtx.currentTime`. Never trigger sounds directly from `setInterval` |
| Tone generator | sine / square / sawtooth / triangle, 20 Hz–20 kHz (log slider + numeric input), fine ±1 Hz, note picker (A4 = 440, adjustable), sweep mode (start, end, duration, linear/log), volume with a hard safety limiter, fade in/out 20 ms to avoid clicks |
| Noise | white, pink, brown (generated buffers, looped), mix volume, sleep fade-out timer |
| Tuner | mic input → autocorrelation pitch detection → note + cents meter. Needs `RECORD_AUDIO` |
| Binaural beats | left/right frequency difference. Label in UI: "experimental — evidence for effects is weak". Headphones required notice |

Hearing safety: high-frequency and high-volume combos show a warning; default volume 30 %.

### 6.7 Extra tools (Phase 5)
| Tool | Spec |
|---|---|
| Interval / HIIT timer | work, rest, rounds, sets, rest between sets; Tabata preset (20/10 × 8); voice/beep countdown 3-2-1; big colour states (green work, red rest); saved presets |
| Breathing timer | box 4-4-4-4, 4-7-8, custom; animated circle; cycles count |
| Event countdowns | title + date; "47 days" cards on Clock tab |
| Chess / game clock | two sides, base + increment, tap to switch |
| Speech timer | green → yellow → red at set times |

### 6.8 Settings
Theme (Black default, Light), accent colour, 12/24 h, week start, default snooze length, default challenge, timer sound, haptics on/off, export/import JSON, Reliability screen, about/version.

**Added in Phase 5a (owner request, 2026-11-22):**
- ~~9 extra futuristic themes~~ (removed in Epoch 2.0, §11 phase 7; old ids load as Black). Were: Neon Cyber, Synthwave, Matrix Terminal, Holo Glass, Nixie Lab, Aurora, Mars HUD, Blueprint, Deep Sea (12 total). Every theme keeps text contrast ≥ 4.5:1; animated backgrounds stop under reduced motion and never run on the ring screen. Fonts bundled offline (Orbitron, Share Tech Mono, Rajdhani).
- **Backgrounds (2.0)**: app and big display separately: theme, plain colour, or image (JPEG/PNG/WebP/GIF/AVIF/BMP ≤ 100 MB, decoded before saving) with dim 0–80 %. Images in IndexedDB `media`, not in backups; settings `bgApp` / `bgBig` validated on import.
- **Big display**: turning the phone to landscape on Timer, Stopwatch or Focus (or tapping the expand button) shows full-screen digits; rotating back closes it. Screen kept on, immersive.
- 9 digit transitions with live previews, chosen per screen: Flip clock, Glitch, Odometer roll, Matrix scramble, Nixie tube, Hologram scan, Particle burst, Liquid morph, 7-segment LED. Only changed digits animate; stopwatch hundredths use a light swap; reduced motion → plain swap.

### 6.10 Home-screen widgets (Phase 6, owner request 2026-11-23)
Plain `RemoteViews` (no Glance / Compose, rule 7). Clocks use `TextClock` / `AnalogClock` and timers `Chronometer`, so they tick without waking the app; the rest redraws on alarm/timer/snooze changes, at midnight and every 30 min.

| Widget | Default size | Shows | Tap |
|---|---|---|---|
| Clock | 4×2 | time, date, next alarm / "Snoozed until …" | Clock tab |
| Analog clock | 2×2 | analog face | Clock tab |
| World clocks | 4×2 | up to 3 cities from Clock → world clocks | Clock tab |
| Alarm | 4×2 | next alarm + +10 / +30 / +1 h nap buttons (alarm created natively, same as the Alarm tab's nap chips) | Alarm tab |
| Timer | 2×1 | soonest running timer counting down | Timer tab |
| Countdown | 2×1 | nearest upcoming event countdown | Event countdowns |

World clocks and countdowns are owned by the web settings and mirrored to native (`AlarmPlugin.setWidgetData`, validated: real time-zone ids, valid dates). **Wear OS: not planned** (owner decision 2026-11-23).

### 6.9 Onboarding (first run, 4 screens)
1. What the app does. 2. Permissions: notifications, exact alarm check, full-screen intent check. 3. Battery: phone-maker-specific steps + "Open settings" buttons. 4. Create first alarm + run the 10-second test alarm. Onboarding is done only when the test alarm rang on the lock screen.

---

## 7. Data model

```ts
type Alarm = {
  id: string;              // uuid
  hour: number; minute: number;
  days: number[];          // 0=Sun..6=Sat; [] = one-time
  label: string;
  enabled: boolean;
  soundId: string; vibrate: boolean;
  volume: number;          // 0..1 of STREAM_ALARM max
  rampSec: number;
  snooze: { lengthMin: number; max: number; shrink: boolean; weeklyBudget: number|null };
  challenge: { chain: ('math'|'type'|'memory'|'shake'|'qr'|'steps')[]; level: 1|2|3|4; qrPayload?: string };
  wakeCheck: { enabled: boolean; delayMin: number; windowSec: number };
  sunriseMin: number;      // 0 = off
  deleteAfterUse: boolean;
  skipNext: boolean;
  oneShotAt: number|null;       // fixed one-shot time (nap alarms, 10 s test alarm); overrides hour/minute
  nextTriggerAt: number|null;   // computed by native
  createdAt: number; updatedAt: number;
};

type RingState = {
  alarmId: string; instanceId: string;
  phase: 'RINGING'|'SNOOZED'|'WAKE_CHECK_PENDING'|'WAKE_CHECK_PROMPT';
  firstRangAt: number; snoozeCount: number; nextRingAt: number|null;
  challengeLevel: number;
};

type AlarmLog = {            // one per alarm instance
  instanceId: string; alarmId: string; scheduledFor: number;
  firstRangAt: number; dismissedAt: number|null; snoozes: number;
  challengeFails: number; wakeCheck: 'passed'|'failed'|'off';
  outcome: 'dismissed'|'missed'|'auto_silenced'|'killed';
};

type Timer = { id: string; label: string; durationMs: number;
  endAt: number|null; remainingMs: number; state: 'idle'|'running'|'paused'|'done' };

type Task = { id: string; title: string; done: boolean; order: number;
  subtasks: { id: string; title: string; done: boolean }[];
  createdAt: number; completedAt: number|null; archived: boolean };

type FocusSession = {
  id: string; goal: string;
  plan: { focusMin: number; breakMin: number; cycles: number; longBreakMin: number; longEvery: number };
  taskIds: string[];
  segments: { kind: 'focus'|'break'|'long_break'; start: number; end: number|null; completed: boolean }[];
  leaves: { at: number; durationMs: number }[];
  parkingLot: { at: number; text: string }[];
  endReason: 'completed'|'done_early'|'interrupted'|'gave_up';
  review: { note: string; rating: 1|2|3|4|5 } | null;
  startedAt: number; endedAt: number|null;
};
```

Storage:
- Native `SharedPreferences` (JSON): `alarms`, `ringState`, `alarmLogs` (last 200), `timers` (only running ones).
- Web IndexedDB (via a ~60-line wrapper, no library needed): `tasks`, `sessions`, `stats cache`.
- Web `localStorage`: UI settings only.
- Export file: `{version, exportedAt, alarms, alarmLogs, tasks, sessions, settings}`. Import validates `version` and every field before writing.

---

## 8. Project structure

```
wake-app/
├─ CLAUDE.md  CHANGELOG.md  README.md  docs/ (BLUEPRINT.md RELEASE_PLAN.md)
├─ package.json  vite.config.js  capacitor.config.json
├─ src/
│  ├─ index.html
│  ├─ main.js                 # boot, router, tab bar
│  ├─ core/
│  │  ├─ time.js              # now(), format, nextTrigger mirror (for display)
│  │  ├─ ticker.js            # one rAF loop, subscribers, throttled
│  │  ├─ store.js             # IndexedDB wrapper + localStorage settings
│  │  ├─ bridge.js            # AlarmPlugin wrapper (native only)
│  │  ├─ audio.js             # shared AudioContext, beeps, unlock
│  │  └─ haptics.js
│  ├─ features/
│  │  ├─ clock/  alarm/  timer/  stopwatch/
│  │  ├─ focus/  (setup.js run.js review.js tasks.js stats.js)
│  │  ├─ challenges/ (math.js type.js memory.js shake.js qr.js steps.js runner.js)
│  │  ├─ audiolab/ (lab metronome tone noise mixer tuner binaural dsp output ui)
│  │  ├─ tools/ (hub interval breathing countdowns chess speech models)
│  │  └─ settings/ (settings.js reliability.js onboarding.js)
│  ├─ ring/ring.js            # /ring route shown inside RingActivity
│  └─ styles/ (tokens.css base.css components.css)
├─ android/app/src/main/java/.../wake/
│  ├─ AlarmPlugin.kt  AlarmStore.kt  AlarmScheduler.kt  NextTrigger.kt
│  ├─ Receivers.kt (AlarmReceiver, BootReceiver, TimeChangeReceiver)  WakeCheckReceiver.kt (Phase 3)
│  ├─ RingController.kt (ring state machine)  Alarm.kt (model + validation)
│  ├─ Escalation.kt (anti-snooze rules)  WakeCheck.kt (wake-check + WakeCheckReceiver)
│  ├─ RingService.kt  RingActivity.kt  FallbackMathView.kt  Sunrise.kt  SunriseActivity.kt  FocusDnd.kt
│  └─ res/raw/ (alarm sounds .wav, generated by scripts/gen-sounds.mjs)
└─ tests/  (vitest unit tests; tests/support/fake-alarm-plugin.js = test double)  android/app/src/test (JUnit)
```

**No browser build (decision 2026-11-22).** Epoch is developed and tested on the Android phone only. `bridge.js` talks to the native plugins; off-device every call rejects with `NOT_ANDROID`. A setTimeout-based fake of the native plugin lives in `tests/support/` for unit tests only and is never shipped.

---

## 9. Android manifest essentials

```xml
<uses-permission android:name="android.permission.USE_EXACT_ALARM"/>
<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" android:maxSdkVersion="32"/>
<uses-permission android:name="android.permission.USE_FULL_SCREEN_INTENT"/>
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK"/>
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED"/>
<uses-permission android:name="android.permission.WAKE_LOCK"/>
<uses-permission android:name="android.permission.VIBRATE"/>
<uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS"/>
<uses-permission android:name="android.permission.CAMERA"/>               <!-- QR -->
<uses-permission android:name="android.permission.ACTIVITY_RECOGNITION"/> <!-- steps -->
<uses-permission android:name="android.permission.RECORD_AUDIO"/>         <!-- tuner -->

<service android:name=".RingService" android:exported="false"
         android:foregroundServiceType="mediaPlayback"/>
<activity android:name=".RingActivity" android:exported="false"
          android:showWhenLocked="true" android:turnScreenOn="true"
          android:launchMode="singleInstance" android:excludeFromRecents="true"/>
<receiver android:name=".AlarmReceiver" android:exported="false"/>
<receiver android:name=".WakeCheckReceiver" android:exported="false"/>
<receiver android:name=".BootReceiver" android:exported="true">
  <intent-filter>
    <action android:name="android.intent.action.BOOT_COMPLETED"/>
    <action android:name="android.intent.action.MY_PACKAGE_REPLACED"/>
  </intent-filter>
</receiver>
<receiver android:name=".TimeChangeReceiver" android:exported="true">
  <intent-filter>
    <action android:name="android.intent.action.TIME_SET"/>
    <action android:name="android.intent.action.TIMEZONE_CHANGED"/>
  </intent-filter>
</receiver>
```

Ring path in detail:
1. `AlarmReceiver.onReceive` → acquire partial wake lock (10 s) → update `ringState` → `startForegroundService(RingService)`.
2. `RingService.onCreate` → `startForeground` with a high-priority notification on an alarm channel (`IMPORTANCE_HIGH`, sound null — the service plays sound) + `setFullScreenIntent(RingActivity)`.
3. Service starts `MediaPlayer` (looping, `USAGE_ALARM`) + vibration pattern + volume ramp + volume lock loop.
4. `RingActivity` shows over lock screen, loads the web app at `/#/ring?instance=…`. If the bridge reports ready within 4 s → web challenge UI. Else → `FallbackMathView`.
5. Dismiss/snooze calls go to the plugin → service stops → state saved → next instance scheduled.

Library choices (use latest stable at build time; check the docs):
- `@capacitor/core`, `@capacitor/android`, `@capacitor/app`, `@capacitor/haptics`, `@capacitor/status-bar`, `@capacitor/motion` (shake).
- QR: `@capacitor-mlkit/barcode-scanning`.
- Keep screen on: `@capacitor-community/keep-awake`.
- Steps and immersive mode: small methods added to the custom plugin (step detector sensor, `WindowInsetsController`).
- minSdk 26, targetSdk = current latest.

---

## 10. UI design system

| Token | Value |
|---|---|
Epoch 2.0 (unslop method: audit → direction → nine passes). Tokens live in `src/styles/tokens.css`; theme colours in `src/core/theme.js`.

**Direction.** Product: an offline Android alarm, timer and focus app that wakes you reliably and keeps exact time. Character: exact, quiet, unhurried. World: an archive drawer at night: black, creme paper, one scarlet mark (index cards with numbered file tabs). Moments: the live numerals; the ringing-alarm screen. Signature: the numbered file tab on Tools and Audio Lab cards; a 1-px scarlet hairline marks the active tab.

| Token | Value |
|---|---|
| Themes | **Black**: page `#000000`, surface `#0F0F0E`, raised `#1B1B19`, creme hairline 14 %. **Light**: creme page `#E2DFD6`, surface `#EBE8E1`, raised `#D5D1C5`, ink hairline 12 % |
| Text | Black `#E8E5DA` / `#A8A597` / `#8A877B`; Light `#111110` / `#45433D` / `#57554E` (all ≥ 4.5:1) |
| Accent | scarlet `#F5332C` (Black) / `#B01C16` (Light); 8 user swatches. Used for the primary action, live progress and the signature hairline only |
| States | toned per theme: success, danger, focus blue, break green |
| Type | Geist (words) + Geist Mono (every time and number, tabular). Sizes 12/14/16/20/28 px + display digits. Weights 400/500 |
| Spacing | 4 px grid: 4, 8, 12, 16, 20, 24, 32, 40, 48 |
| Radius | controls 8, cards 12, sheets 16 |
| Icons | one set, 24 grid, 1.5 stroke, round caps, text colour (tab icons and mark drawn in Affinity) |
| Motion | one curve `cubic-bezier(0.22,1,0.36,1)`; presses 150 ms (scale 0.97); screen entrance 200 ms opacity only; no loops; respect `prefers-reduced-motion` |

Palette (2.0, owner references): scarlet `#F5332C`, black `#000000`, creme `#CCC8B9` family. Tools and Audio Lab are index-card drawers (numbered file tab per card, tool opens inside the card). Backgrounds: app and big display each theme / colour / image (§6.8).

Layout: bottom tab bar — Alarm · Timer · Stopwatch · Focus · Tools · Audio Lab. Settings (with Reliability, Alarm log, Setup guide) opens from the gear at the top right. Clock (world clocks, night clock) is Tools → Clock. One-hand use: primary buttons in bottom third.

---

## 11. Build phases and acceptance tests

| Phase | Scope | Acceptance checklist |
|---|---|---|
| **0. Skeleton** | Vite + Capacitor + Android project, tab bar, router, design tokens, `ticker.js`, `store.js`, `bridge.js`, app runs on phone via USB | `npx cap run android` installs on phone; tabs switch; no console errors |
| **1. Clock, Stopwatch, Timer (in-app)** | Clock tab, world clocks, night mode, stopwatch with laps, multiple timers (foreground only) | Stopwatch drift < 50 ms over 10 min vs reference; 3 timers run together; screen lock and unlock → times still correct |
| **2. Native alarm core** | `AlarmStore`, `NextTrigger`, scheduler, receiver, `RingService`, `RingActivity` with **fallback math only**, boot + time-change receivers, alarm list/editor UI, test-alarm button, Reliability screen, onboarding | See section 12 tests T1–T8 all pass |
| **3. Anti-snooze** | Web ring screen, challenge runner, math/type/memory/shake/qr/steps, escalation table, snooze budget, volume lock, wake-check, escape hatch, alarm logs | T9–T14 pass; 7 real mornings logged |
| **4. Focus mode** | Tasks, setup, running screen, Pomodoro engine, parking lot, leave detection, exit friction, review, stats, native timers when app closed | 5 real sessions logged; app closed during focus → phase-end alert still rings |
| **6. Home-screen widgets** (owner request) | 6 widgets (§6.10) | All widgets draw on the phone; nap button sets an alarm; taps open the right screen |
| **5. Audio Lab + Tools + polish** | metronome, tone, noise, tuner, binaural; interval, breathing, countdowns, chess, speech timer; sunrise pre-alarm; DND in focus; export/import; themes | Metronome jitter < 2 ms (measure with audio recording); export → wipe → import restores everything |
| **7. Epoch 2.0** (owner request 2026-11-25) | Rename to Epoch / `app.epoch`; Black + Light only; tabs Alarm, Timer, Stopwatch, Focus, Tools, Audio Lab + settings gear; Clock → Tools; Geist / Geist Mono; unslop design passes (§10); Affinity icons + mark | Every tab and Settings checked in Black and Light on the phone; Stopwatch buttons never start mid-screen; alarm and timer ring under `app.epoch`; Epoch backup imports into Epoch |

---

## 12. Test plan

Unit tests (run every phase):
- `NextTrigger` (Kotlin + JS mirror): repeat days across week boundary, one-time alarm in past → tomorrow, timezone change, skipNext, DST zone (e.g. `Europe/London`) though India has no DST.
- Anti-snooze state machine: every transition, snooze lock at 3, budget exhaustion, escape-hatch trigger.
- Pomodoro engine: segment sequence, pause/resume keeps total correct, long-break placement.
- Challenge generators: answers correct, difficulty ranges, seeded randomness for tests.

Device tests (by hand, record results in `CHANGELOG.md`):

| ID | Test | Expected |
|---|---|---|
| T1 | Alarm in 2 min, screen off, phone locked | Rings on lock screen with sound |
| T2 | Phone on silent + DND on | Rings (alarm stream) |
| T3 | `adb shell dumpsys deviceidle force-idle`, alarm in 3 min | Rings on time (±5 s) |
| T4 | Swipe app away from recents, alarm in 2 min | Rings |
| T5 | Reboot phone, alarm in 5 min after boot | Rings |
| T6 | Change system time / timezone | Next trigger recalculated correctly |
| T7 | Battery saver on | Rings |
| T8 | Overnight real alarm × 3 nights | Rings every time |
| T9 | Snooze 3 times | 3rd snooze button locked; lengths 5/3 min; harder challenge each time |
| T10 | Power off while ringing, power on | Rings again within ~10 s of boot complete |
| T11 | QR challenge with wrong code | Rejected; after 3 fails → escape hatch |
| T12 | Wake-check not answered | Re-rings with snooze locked |
| T13 | Kill WebView (e.g. break the /ring route on purpose) | Native fallback math appears within 4 s |
| T14 | Ring 15 min untouched | Auto-silence, logged as missed |

---

## 13. Rules for Claude Code

1. Follow the phases. No feature from a later phase early.
2. Time is computed from timestamps (`Date.now()` / `System.currentTimeMillis()`); never from tick counts.
3. Native code owns alarms. Web code never schedules an alarm by itself.
4. Write state before side effects (store → then schedule/ring).
5. Every native public method checks permissions and returns a clear error code, not a crash.
6. Every input from import files is validated.
7. No new dependency without a one-line reason in `CHANGELOG.md`.
8. Keep files under ~300 lines; split by feature.
9. Accessibility: labels on all buttons, 48 px targets, contrast ≥ 4.5:1.
10. After each phase: list what to test by hand on the phone.

---

## 14. Risks (inversion: what would make this fail?)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| OEM battery killer stops alarms | High on Xiaomi/Vivo/Oppo/Realme | Critical | Reliability screen, T1–T8 on your exact phone, keep stock Clock as backup alarm for the first 2 weeks |
| Scope creep — 30 features, nothing finished | High | High | Phases with acceptance gates. Phase 2 + 3 before anything fancy |
| Anti-snooze too harsh → you disable it | Medium | High | Escape hatch, adjustable levels, review logs after week 1 and tune |
| Anti-snooze too soft → autopilot dismissal | Medium | Medium | Use QR (requires walking) + wake-check; watch the snooze metric |
| WebView slow to start on lock screen | Medium | Medium | Sound starts natively first; native fallback screen |
| Android API changes | Low–medium | Medium | Re-check exact-alarm, FSI, FGS rules when updating targetSdk |
| You need Kotlin knowledge to debug | Medium | Medium | Keep native layer small (≈8 files); ask Claude Code to explain each file once |

---

## 15. Requirements on your side

- Windows PC with Android Studio (bundles the Android SDK and JDK), Node.js LTS, Git.
- Phone: Developer options on, USB debugging on, USB cable.
- Tell Claude Code your **phone model and Android version** at Phase 2 start; it decides which OEM battery steps to show.
- A printed QR code (generated in-app in Phase 3) stuck somewhere you must walk to.

---

## 16. Open decisions (answer before the phase that needs them)

| Question | Needed by | Default if not answered |
|---|---|---|
| App name | Phase 0 | "WAKE" → WAKE11 → **renamed Epoch (2.0, package `app.epoch`)** |
| Bundled alarm sounds — which style? | Phase 2 | 6 royalty-free tones generated or CC0 → **decided: 6 generated tones (3 gentle, 3 hard)** |
| Default challenge chain | Phase 3 | `qr → math L2` → **decided: `math L2` for new alarms; QR added in the editor once a code is registered** |
| Weekly snooze budget on/off | Phase 3 | off (per-alarm setting in the editor) |
| Pomodoro defaults | Phase 4 | 25 / 5 / 4 / 15 → **decided: 25 / 5 / 4 / 15, last plan remembered** |

---

## 17. Build status (updated 2026-11-22)

✅ = done and verified · ❌ = not done yet / not verified yet. Details and dates are in `CHANGELOG.md`.
Test phone: Samsung Galaxy S25 Ultra (SM-S938B), Android 17.

### 17.1 Phases
| Phase | Status | Notes |
|---|---|---|
| 0. Skeleton | ✅ | Runs on the phone (browser build dropped 2026-11-22) |
| 1. Clock, Stopwatch, Timer | ✅ | Built; one hand check still open (17.2) |
| 2. Native alarm core | ✅ | Built; T3 and T8 still open (17.3) |
| 3. Anti-snooze | ✅ | Built; T10, T11, T14 and 7 real mornings still open |
| 4. Focus mode + native timers | ✅ | Built; 5 real sessions still open |
| 5a. Themes, landscape big display, 9 transitions, Settings | ✅ | Added on owner request (§6.8) |
| 5b. Export / import | ✅ | Wipe-and-restore passed on the phone |
| 5c. Audio Lab (metronome, tone, noise, tuner, binaural; ambient noise in focus) | ✅ | Built; jitter recording + tuner with an instrument still open |
| 5d. Tools (interval/HIIT, breathing, countdowns, chess clock, speech timer) | ✅ | Built and checked on the phone; beeps/voice by ear still open |
| 5e. Sunrise pre-alarm + DND during focus | ✅ | Built and checked on the phone; real-morning sunrise still open |
| 6. Home-screen widgets | ✅ | 6 widgets; checked on the home screen (analog not placed yet) |
| 7. Epoch 2.0 rebrand + redesign | 🔄 | Name/package, Black + Light, six tabs + gear, Geist, unslop passes, Affinity icons. Checked on the phone: tabs, Stopwatch bar fix, Light bars. Open: alarm/timer ring under the new package, Epoch → Epoch backup import, widgets, screenshots/banners |

### 17.2 Acceptance checklists (§11)
| Phase | Check | Status |
|---|---|---|
| 0 | App installs on the phone | ✅ |
| 0 | Tabs switch, no console errors | ✅ |
| 1 | Stopwatch drift < 50 ms over 10 min | ✅ unit test |
| 1 | 3 timers run together | ✅ unit test |
| 1 | Screen lock and unlock → times still correct (by hand) | ❌ |
| 2 | T1–T8 all pass | ❌ T3, T8 open (17.3) |
| 3 | T9–T14 pass | ❌ T9 partly, T10, T11, T14 open |
| 3 | 7 real mornings logged | ❌ |
| 4 | 5 real focus sessions logged | ❌ |
| 4 | App closed during focus → phase-end alert still rings | ✅ phone |
| 5 | Metronome jitter < 2 ms (audio recording) | ❌ unit test < 2 µs on the audio clock; recording on a second device still open |
| 5 | Export → wipe → import restores everything | ✅ phone |

### 17.3 Device tests (§12)
| ID | Test | Status |
|---|---|---|
| T1 | Alarm on locked phone, screen off | ✅ owner |
| T2 | Silent + DND | ✅ owner |
| T3 | Deep Doze, rings on time | ❌ inconclusive: Samsung refuses deep Doze when an alarm is < 1 h away; a forced 70-min run was woken by a notification tap. Repeat overnight, phone untouched |
| T4 | Swiped from recents | ✅ owner |
| T5 | Reboot | ✅ owner |
| T6 | Time / timezone change | ✅ owner |
| T7 | Battery saver | ✅ owner |
| T8 | 3 real nights | ❌ |
| T9 | Snooze 3× → 3rd locked, 5/3 min, harder each time | ❌ partly: escalation + "1 left" seen on the phone; full sequence only in unit tests |
| T10 | Power off while ringing → rings after boot | ❌ |
| T11 | Wrong QR 3× → escape hatch | ❌ (unit-tested only) |
| T12 | Wake-check unanswered → re-rings, snooze locked | ✅ phone |
| T13 | Broken web ring screen → native fallback within 4 s | ✅ phone |
| T14 | 15 min untouched → auto-silenced, logged | ❌ |

### 17.4 Features vs §6
| Area | Done ✅ | Not yet ❌ |
|---|---|---|
| Clock (§6.1) | Digital/analog, seconds toggle, date, next alarm, world clocks (441 cities), night mode, event countdown cards | — |
| Alarm (§6.2) | List, editor, swipe-delete + undo, nap +10/+30/+1 h, skip next, 10-s test, 6 sounds, sunrise pre-alarm + preview | — |
| Anti-snooze (§5) | Escalation, weekly budget, volume ramp + lock, 6 challenges + chains, escape hatch, wake-check, native fallback, auto-silence, logs | — |
| Timer (§6.3) | Multiple timers, presets, wheel input, +1 min, Done screen with overtime, native ring when closed, count-down notification, timer sound choice | — |
| Stopwatch (§6.4) | Laps, fastest/slowest, copy, 30 fps | — |
| Focus (§6.5) | Tasks + subtasks, setup, running screen, parking lot, leave detection, exit friction, break screen, review, stats + heatmap, ambient noise, DND | — |
| Audio Lab (§6.6) | Metronome, tone generator + sweep, noise + sleep fade, tuner, binaural, limiter + safety warnings | — |
| Tools (§6.7) | Interval/HIIT + Tabata + presets, breathing, event countdowns, chess clock, speech timer | — |
| Settings (§6.8) | 12 themes, accent, big-display transitions, 24 h, haptics, week start, export/import, Reliability link, version, default snooze length, default challenge, timer sound | — |
| Onboarding (§6.9) | 4 screens, ends with lock-screen test alarm | — |
| Big display (5a) | Rotate or ⤢ on Timer / Stopwatch / Focus, 9 transitions with previews, auto-fit | — |

### 17.5 Owner to-do
- ❌ Allow notifications again (reset by the wipe test) — Alarm tab banner.
- ❌ T3 overnight, T8 (3 nights), T10, T11, T14.
- ❌ 7 real mornings (goal: ≤ 1 snooze per alarm on average, More → Alarm log).
- ❌ 5 real focus sessions.
- ❌ Keep the stock Clock alarm as a backup for the first 2 weeks (§14).

