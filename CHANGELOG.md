# Changelog

## Version control + signed release 0.6.0 (2026-11-23)

### Added
- Git repository (`main`): `.gitignore` extended (keystores, `keystore.properties`, local Claude data), `.gitattributes` (LF, CRLF for .bat, binaries marked). Local only, no remote.
- Release signing: `android/app/build.gradle` reads `android/keystore.properties` (git-ignored; template `keystore.properties.example`). Release builds stop with a clear message without it. Debug builds use the same key when present, so debug and release install over each other.
- Version 0.6.0 (versionCode 6), shown in Settings.

### Release
- Owner created the keystore (RSA 4096, PKCS12, alias `wake11`, `CN=WAKE11`) outside the repo with their own password.
- `app-release.apk` 0.6.0: apksigner verifies (v2), signer `CN=WAKE11`, cert SHA-256 `9eb4f185cc72353e2ae5a66e7f521cabbc2a27b9f16e8042096b320389accb3d`, not debuggable.

### Device migration (debug key → own key), 2026-11-23 00:17–00:19
- Full backup first (localStorage, IndexedDB, native alarms + log, raw shared_prefs) to `D:\Aa Dev\WAKE11-backups\` (outside the repo).
- Owner approved the uninstall → old app removed → debug build with the new key installed → backup restored (web storage compared key by key: identical; 1 alarm-log entry; timer sound re-synced) → release APK installed over it with `adb install -r` → opens on the Clock tab with the restored settings. ✅
- Owner to redo: notifications, battery "Unrestricted", Do Not Disturb access, microphone; re-add home-screen widgets.

## Phase 6 — Home-screen widgets (2026-11-23)

### Decisions
- Owner request: home-screen widgets "like Google Clock" plus next alarm, nap buttons, running timer and event countdown. **Wear OS app skipped** (owner decision). Recorded as BLUEPRINT §6.10 and phase 6 in §11/§17.

### Added
- Native `Widgets.kt` (data, drawing, refresh) and `WidgetProviders.kt` (6 providers + `WidgetActionReceiver`): **Clock** (TextClock time + date + next alarm / "Snoozed until …"), **Analog clock**, **World clocks** (3 cities, `TextClock.setTimeZone`), **Alarm** (next alarm + +10 / +30 / +1 h nap), **Timer** (soonest running timer, `Chronometer` count-down, "+N" for more), **Countdown** (nearest upcoming event). Layouts, provider infos (Android 12 target cells, previews, resizable) and labels "WAKE11 …".
- Refresh: from `AlarmStore` writes (alarms, ring state), `TimerAlarms` writes, a midnight inexact alarm and `updatePeriodMillis` 30 min. Clocks and timers tick on their own.
- Nap buttons create the nap alarm natively (same fields as the web `oneShotAlarm`; store then schedule, rule 4); without exact-alarm or notification permission they show what to fix instead (rule 5).
- Widget taps open one screen: `MainActivity` reads an `EXTRA_ROUTE` checked against a fixed list (rule 6) and sets the hash.
- `AlarmPlugin.setWidgetData` + web `core/widgets.js`: world clocks and countdowns mirrored at app start, on every change and after an import; native rejects unknown time zones and bad dates and keeps the last good data.
- `RingService.notificationsAllowed` shared by the plugin and the widgets.

### Dependencies (rule 7)
- None (plain RemoteViews instead of Jetpack Glance).

### Device test results
- 2026-11-23 00:05, phone: Android lists all 6 providers; owner placed Clock, World clocks, Alarm, Timer, Countdown. Empty states correct ("No timer running", "No events / Add one", "No alarm set", "Add cities…"). ✅
- Nap +10 tapped → "Nap" alarm stored and scheduled; Alarm and Clock widgets showed "Today 12:15 am". ✅
- Temporary data: timer "Widget test 24:55" counting down; countdown "46 days"; London 6:36 pm / New York 1:36 pm / Tokyo 3:36 am at 12:06 am IST (correct); a fake zone "Mars/Base" rejected with INVALID and the good data kept. ✅
- Taps: Clock widget → `#/clock`, Timer widget → `#/timer`. ✅
- Test nap alarm, test timer and temporary widget data removed afterwards.
- Open (by hand): Analog clock widget (not placed), midnight redraw of the countdown, widget after a reboot.

## Settings: alarm defaults + timer sound (2026-11-22)

### Added
- Settings → **Alarms & timers** (BLUEPRINT §6.8, `settings/alarm-defaults-ui.js`):
  - **Default snooze length** (3 / 5 / 7 / 10 / 15 min) and **default challenge** (math, type, memory, shake, walk — QR left out because each alarm needs its own code) for new alarms. `defaultAlarm()` reads them and falls back to 5 min / math if a stored value is bad.
  - **Timer sound** (the 6 bundled sounds) with ▶ Play. Native keeps its own copy (`TimerAlarms.sound`, new `AlarmPlugin.setTimerSound`, validated against `Alarm.SOUNDS`), so a timer rings with the chosen sound while the app is closed. Native is written first; if it refuses, the setting is not changed. Re-sent at app start and after an import.
- New settings `defaultSnoozeMin`, `defaultChallenge`, `timerSound`, all checked on import (rule 6). Version shown in Settings: 0.5.6.
- 4 new tests (109 total).

### Dependencies (rule 7)
- None.

### Device test results
- 2026-11-22 23:50, phone: section shows; choosing 10 min / Memory / Siren saves; a new alarm opens with snooze 10 and challenge "Memory"; native prefs hold `hard_siren`; a 3 s native timer opened the "Time's up" screen and played on the alarm stream (`USAGE_ALARM`). Settings put back to 5 min / Math / Classic beep afterwards. ✅
- Open (by hand): hear each timer sound with the app closed.

## Phase 5e — Sunrise pre-alarm + Do Not Disturb during focus (2026-11-22)

### Added
- **Sunrise pre-alarm** (BLUEPRINT §5.5):
  - Native `Sunrise.kt`: a second exact alarm (`setExactAndAllowWhileIdle`, not an alarm-clock entry, so the status bar keeps the real time) at `nextTriggerAt − sunriseMin`. Scheduled/cancelled inside `AlarmScheduler.refresh` / `cancel`, so edit, disable, delete, import, reboot and time change all keep it in step.
  - `SunriseReceiver` shows it only for the trigger it was planned for and never while another alarm rings or snoozes; opens through a silent high-priority full-screen notification (own channel, no sound or vibration).
  - `SunriseActivity`: over the lock screen, immersive, screen kept on; gradient dark red → orange → warm white rising from the bottom; window brightness 1 % → 100 % on a squared curve; progress from timestamps (rule 2). Tap to close; closes itself at alarm time, and `RingController.fire` closes it when the alarm starts.
  - Editor: "Sunrise pre-alarm" Off / 10 / 15 / 20 / 30 min + **Preview** (30 s, new `AlarmPlugin.previewSunrise`). `sunriseMin` validated 0–60 in JS and in `Alarm.kt` (import too, rule 6).
- **Do Not Disturb during focus** (BLUEPRINT §6.5):
  - Native `FocusDnd.kt`: "Priority only" (the owner's DND exceptions and all alarms still come through). Ownership stored before the change (rule 4); turns DND off again only if WAKE11 turned it on and the mode is unchanged; leaves the owner's own DND alone.
  - `DevicePlugin.dndStatus / openDndAccess / setFocusDnd`; `DND_ACCESS_DENIED` when not allowed (rule 5). Manifest: `ACCESS_NOTIFICATION_POLICY`.
  - Focus setup: "Do Not Disturb during the session" switch (setting `focusDnd`, backed up) with an "Allow" hint that opens Android's access list and re-checks on return. On at session start, off at finish; at app start with no session it restores the normal mode (app killed mid-session). A missing permission never blocks a session.
- 5 new tests (105 total): `sunriseMin` validation; DND on/off with the session, owner's DND left alone, owner change not undone, no permission → session still starts. The test fake mirrors `FocusDnd.kt`.

### Dependencies (rule 7)
- None.

### Device test results
- 2026-11-22 23:33, phone: Preview sunrise → full-screen glow over everything; 2 s in ≈ black-red (32,1,0), 22 s in orange with a brighter bottom (250,131,43); closed itself after 30 s. ✅
- 2026-11-22 23:35, phone, no DND access: session starts normally, `setFocusDnd` → `DND_ACCESS_DENIED`, setup shows the Allow hint, "Allow" opens Samsung's "Do not disturb permission" list (WAKE11 is near the bottom — hint text now says so). ✅
- 2026-11-22 23:41, phone, access allowed by owner: session start → `zen_mode` 0 → 1 (Priority only); session end → 0. Session state lost + app reload → restored to 0. Test sessions removed from history afterwards. ✅
- Open (by hand): a real alarm with sunrise on, phone on a stand facing you; DND during a real session (calls/notifications held back, phase-end alarm still rings).

## Browser build dropped (2026-11-22)

### Decision
- Owner decision: **no browser app.** WAKE11 is developed and tested on the Android phone only (fits D9). Recorded in BLUEPRINT §8 and CLAUDE.md.

### Removed
- Web mock from the app: `core/bridge-mock.js` moved to `tests/support/fake-alarm-plugin.js` (unit tests only, never shipped). `bridge.js` is native-only; off-device every call rejects with code `NOT_ANDROID` (rule 5).
- `features/alarm/mockring.js` (browser ring simulation), "Simulate step (browser)" button in the steps challenge, browser-only beep loop on the focus screen, `isMock` checks in the timer bridge.
- `npm run dev` / `npm run preview` scripts and `.claude/launch.json` (browser preview).

### Tests
- 100/100 pass; the timer-service test now runs against the fake plugin via `vi.mock`.

## Phase 5d — Tools (2026-11-22)

### Added
- `features/tools/`: hub (More → Tools) and 5 tools. Pure logic in `models.js` (timestamp runs with pause/resume, rule 2; every stored state validated on load, rule 6).
  - **Interval / HIIT**: work, rest, rounds, sets, rest between sets, get-ready; Tabata preset (10 s + 20/10 × 8) and saved presets (up to 20); full-screen green work / red rest / amber get-ready; 3-2-1 short beeps + long beep at each change, scheduled on the audio clock from the known segment times; optional voice countdown (`speechSynthesis`, if the phone has a voice); screen kept on; survives app restart.
  - **Breathing**: box 4-4-4-4, 4-7-8, custom (in/hold/out/hold); eased circle animation; cycle count with "Well done" at the end.
  - **Event countdowns**: title + date, "47 days" / Tomorrow / Today / "3 days ago"; calendar-day maths (not 24 h blocks); "Clock" toggle shows the card on the Clock tab (redrawn at midnight). Stored in settings `countdowns`, so export/import carries them (validated, rule 6).
  - **Chess clock**: two halves, top rotated for the opponent; presets 1+0, 3+2, 5+0, 10+0, 15+10, 30+0; increment; move counts; tenths under 10 s, red under 20 s; flag with beeps; pause/resume; leaving the screen pauses; game survives restart (comes back paused).
  - **Speech timer**: counts up; green → yellow → red at set minutes (beep at each change), "Start wrapping up" and "Over by …"; survives restart.
- `core/audio.js`: `beepAt` exported for the tools.
- 14 new tests (100 total): run clock, Tabata/sets segment lists, current segment, 3-2-1 cues, breathing steps and circle, countdown days/labels/validation/sorting, chess tap/increment/pause/flag, speech colours, backup validation of `countdowns` / `focusNoise` / `focusNoiseVolume`.

### Dependencies (rule 7)
- None.

### Fixed during the phase
- Interval/speech colour screens: dark band behind the buttons and orange back link on green (contrast, rule 9) — buttons now sit on the colour, link is white.

### Device test results
- 2026-11-22 23:20, phone (driven over adb/WebView debugging): interval 2 s prep + 2 × (3 work / 2 rest) → prep → work R1 → rest → work R2 → "Done", 10 s total, tab bar hidden ✅; breathing circle grows during "Breathe in" ✅; countdown for 2027-01-08 shows "47 days" in the list and on the Clock tab ✅; chess tap starts the other side, increments moves, full-screen layout with rotated top half ✅; speech timer 6 min into a 5/7 setting is yellow "Start wrapping up" after reopening ✅; no JS errors. Test countdown removed afterwards.
- Open (by hand): hearing the 3-2-1 beeps / voice during a real workout; chess with two people; speech beeps at colour changes.

## Phase 5c — Audio Lab + ambient noise in focus (2026-11-22)

### Added
- `features/audiolab/`: hub (More → Audio Lab) and 5 tools; every tool plays only while its screen is open (foreground, v1) and stops on leave.
  - **Metronome**: 20–300 BPM, ±1 / slider, tap tempo (last 4 taps, resets after 2 s), 2/4 3/4 4/4 5/4 6/8 7/8 with accent on 1 and group accents, subdivisions (none/8ths/triplets/16ths), visual pulse. Look-ahead scheduler: 25 ms JS loop, clicks scheduled 100 ms ahead on `ctx.currentTime`; tick times are anchor + k·period (never accumulated).
  - **Tone generator**: sine/square/saw/triangle, 20 Hz–20 kHz log slider + numeric input, ±1 Hz, note picker C1–B8 with adjustable A4 (400–480), sweep (start/end/seconds, log or linear, scheduled on the audio clock, live readout), 20 ms fades.
  - **Noise**: white/pink/brown 8 s stereo loops (seamless cross-faded seam), per-colour mix + master volume, sleep fade-out 15/30/60/90 min (timestamp end, 60 s fade scheduled on the audio clock).
  - **Tuner**: mic → normalised autocorrelation + parabolic interpolation → note, cents meter, Hz; median-of-5 smoothing that drops lone octave errors; A4 adjustable; clear messages for denied / missing / busy mic.
  - **Binaural beats**: carrier 60–1000 Hz, beat 0.5–40 Hz, presets (delta/theta/alpha/beta), "experimental — evidence for effects is weak" label, headphones notice.
  - **Hearing safety**: all tools go through one hard limiter (DynamicsCompressor −6 dB, 20:1); volume → gain is squared and capped at 0.5; default 30 %; warning for ≥ 8 kHz above 50 % volume and for anything above 75 %.
- Focus: "Background noise" (off/brown/pink/white) + volume on the setup screen; plays during focus blocks only, stops in breaks, pauses and when the session ends. New settings `focusNoise`, `focusNoiseVolume`, validated on import.
- Manifest: `RECORD_AUDIO` + `MODIFY_AUDIO_SETTINGS` (tuner; Capacitor's WebView asks on first use).
- 12 new tests (86 total): notes/cents, log slider, sweep, safety, accents, **metronome jitter < 2 µs under a randomly jittered 5–85 ms loop over 10 min**, tempo/signature change, tap tempo, noise spectra + loop seam, pitch detection within 3 cents incl. harmonics, octave-error smoothing.

### Dependencies (rule 7)
- None.

### Device test results
- 2026-11-22 23:05, phone: metronome, tone, noise, binaural all start and stop, no JS errors; Android `dumpsys audio` shows WAKE11 playback `state:started`, not muted. ✅
- 2026-11-22 23:09, phone: tuner → Android "Allow WAKE11 to record audio?" dialog → allowed by owner → live readings. ✅
- 2026-11-22 23:12, phone: speaker → mic loop with reference tones G3, B3, E4, A4, A5: every reading the right note within 1 cent, no octave jumps (after the smoothing fix). ✅ 110 Hz was unreliable through the phone's own speaker (it barely reproduces it); low notes still need a real instrument.
- Open: metronome jitter < 2 ms measured from an audio recording (needs a second device); ambient noise during a real focus session; tuner with an instrument.

## Phase 5b — Export / import (2026-11-22)

### Added
- `BackupPlugin.kt`: export native alarms + alarm log; all-or-nothing import (every alarm re-validated by `Alarm.fromStored`, every log checked, refuses while an alarm rings/snoozes, needs exact alarms + notifications when enabled alarms are imported); old schedules cancelled, new set written, then each alarm scheduled (rule 4). Save / open through Android's system file picker (no storage permission), 5 MB limit.
- `settings/backup.js`: backup format `{version: 1, exportedAt, app, alarms, alarmLogs, tasks, sessions, settings}` and `validateBackup` checking the version and every field of every alarm, log, task, session and setting (unknown keys rejected, theme/transition ids checked) before anything is written (rule 6).
- `backup-io.js` + Settings → Backup: Export (file named `wake11-backup-YYYY-MM-DD-HHMM.json`), Import with a confirm card listing what will be replaced; native alarms first so a refusal leaves everything untouched.
- Browser mock: download / file input instead of the picker.
- 7 new tests (74 total) incl. export → wipe → import round trip and invalid-file cases.

### Device test results
- 2026-11-22 18:12, phone: Export → Android picker → saved 8 KB file in Downloads; file read back over adb has all sections and passes the import validator unchanged; Import → picked the file → confirm card showed 1 alarm, 19 log entries, 1 session → Restored, counts identical afterwards. ✅
- 2026-11-22 18:18, phone, **Phase 5 acceptance "export → wipe → import restores everything": PASS.** Snapshot before (1 alarm, 19 log entries, 0 tasks, 1 focus session, settings) → `pm clear` (app reopened in onboarding, everything empty) → Settings → Import → picked the 18:12 backup → Restored → app force-stopped and reopened → snapshot identical in every field (alarm ids/times/state, first and last log ids, session, settings).
- Note: clearing app data also resets runtime permissions (notifications, camera, physical activity) — allow notifications again afterwards; the Alarm tab banner asks for it. Battery "unrestricted" was kept.

## Phase 5a — Themes, landscape Big Display, Settings (2026-11-22)

### Added
- `core/theme.js`: 12 themes (OLED Black default, Dark, Light + Neon Cyber, Synthwave, Matrix Terminal, Holo Glass, Nixie Lab, Aurora, Mars HUD, Blueprint, Deep Sea) applied as CSS variables; accent override; per-font digit cell width. `styles/themes.css`: decorative backgrounds (grids, sunset horizon, scan-lines, aurora, motes), digit glow.
- Big display (`features/bigdisplay/`): rotate to landscape (or ⤢) on Timer / Stopwatch / Focus → full-screen digits, label, progress bar, overtime in red; auto-fits the width; keeps screen on + immersive; rotating back closes it.
- 9 digit transitions (`transitions/classic.js`, `transitions/fx.js`, `styles/transitions.css`): Flip clock, Glitch, Odometer roll, Matrix scramble, Nixie tube, Hologram scan, Particle burst (canvas), Liquid morph (SVG goo, blur scales with size), 7-segment LED. Only changed digits animate; hundredths use a light swap; reduced motion → plain swap.
- Settings screen (More → Settings): theme gallery with live tiles, accent swatches, transition gallery with looping previews assigned per screen (defaults Timer = Flip, Stopwatch = Odometer, Focus = Nixie), 24-hour clock, haptics, week start, links, version.
- 9 new vitest tests (67 total), incl. WCAG contrast ≥ 4.5 for every theme and the big-display sources.

### Dependencies (rule 7)
- `@fontsource/orbitron`, `@fontsource/share-tech-mono`, `@fontsource/rajdhani` 5.3.0 — offline digit fonts for the new themes (latin subset only).

### Fixed during the browser check
- Theme names in the gallery used the tile's own colours (unreadable "Light") — colours now only on the preview box.
- 7-segment: screen-reader text was drawn over the segments.
- Stopwatch overflowed the width in wide fonts — big display now auto-fits.
- Liquid morph was blobby at small sizes — goo blur now scales with the digit size.
- **Flip clock glitch (user report, 2 rounds):** (1) the bounce easing overshot the brightness filter → bright flash on landing; (2) on the phone (checked by recording the WebView at ~40 fps over adb), the strong 3D perspective (4em) plus the bounce swung the bottom flap toward the viewer so it spilled past the card edges. Now: perspective 14em, no overshoot (ease-out landing), flaps clipped to the card. Re-recorded on the phone: flaps stay inside the card and the card brightness stays steady through the flip.
- **Flip clock halves misaligned (user report with reference image):** on the phone's font, the top and bottom halves were laid out separately and the bottom copy sat a few px lower (visible on 2–9; 1 and 0 hid it). Now every half is the same full-size card clipped to its half (`clip-path`), hinging on the centre line, so alignment is exact on any font. Restyled like a real split-flap: bold digits, hinge gap, side hinge tabs, top-lit card; flap shading via overlay opacity instead of `filter` (unreliable on clipped 3D layers in Android WebView). Verified on the phone at rest for 1–7 and mid-flip.

### Not yet in 5a (later 5b–5e)
- Default snooze length / default challenge / timer sound settings, export/import, Audio Lab, tools, sunrise, DND.

## Phase 4 — Focus mode + native timers (2026-11-22)

### Added (native)
- `TimerAlarms.kt`: timers that ring when the app is closed (setAlarmClock at `endAt`), running list stored in SharedPreferences, ongoing notification with a live Chronometer count-down, boot restore.
- `TimerRingService.kt` + `TimerDoneActivity`: alarm-stream ring with simple Stop (no challenge, §6.3), over the lock screen, notification Stop action, auto-stop after 10 min.
- Plugin: `scheduleTimer`, `cancelTimer`, `getTimerState`, `stopTimerRing`; events `timerDone`, `timerStopped`.
- `DevicePlugin.kt` (split out of AlarmPlugin to keep files < 300 lines): step sensor, unlock for QR scan, `setImmersive`.

### Added (web)
- Timer tab timers are mirrored to native alarms (ring with the app closed); on the phone the sound comes from native, the page shows overtime; timers stopped on the lock screen are reconciled when the app opens.
- Focus mode: Focus home (resume / start, recent sessions), Tasks (subtasks, auto-complete when all ticked, drag handle to reorder, archive completed, delete with undo), Setup (goal required, 25/5/4/15 plan remembered, task picker + quick add), Running screen (progress ring, immersive, screen kept on, subtask ticks with haptic + "task complete" undo, parking lot, pause, break screen in green with a suggestion, "Skip break" needs a second tap, End = hold 2 s + reason chip), Review (planned vs actual, cycles, subtasks, leaves + time away, parking lot → task, note, 1–5 stars), Stats (today / 7-day minutes, streak, sessions per week vs goal ≥ 5, tasks done, avg leaves, 12-week heatmap).
- Pomodoro engine (`focus/engine.js`, pure): sequence with long-break placement, pause-excluded elapsed time, segment log. Leave detection via `@capacitor/app` `appStateChange`.
- A native alarm rings at every focus/break end; reopening the app jumps straight back into the running session.
- 7 new vitest tests (58 total).

### Dependencies (rule 7)
- `@capacitor/app` 8.1.2 — app pause/resume events for leave detection (BLUEPRINT §6.5, §9 choice).

### Not in this phase
- Ambient noise during focus and DND (Audio Lab / Phase 5).

### Device test results (SM-S938B, Android 17)
- 1-min focus session started, app sent Home and its process killed (`am kill`), screen off → at the phase end the native "Time's up — Focus block done — time for a break" screen + sound appeared. ✅ **Phase 4 acceptance: app closed during focus → phase-end alert still rings.**
- Reopening the app went straight to the running session showing "Focus block done ✓ / Start break". ✅ (fixed during the test: it used to open the last tab instead)
- Immersive mode, unlock, step sensor, timer schedule/cancel smoke-tested after the plugin split. ✅
- Test session deleted afterwards so it does not count. **Still needed: 5 real sessions logged.**

## Phase 3 — Anti-snooze (2026-11-22: built, unit-tested, installed; device tests T9 partial, T12, T13 passed)

### Added (native)
- `Escalation.kt` (pure, 8 JUnit tests): snooze 5 → 3 min, 3rd snooze locked (shrink), challenge level +1 per snooze, volume profile (ramp 30 s → 10 s → at target → max), weekly budget.
- Ring screen now hosts the web `#/ring` screen (RingActivity is a Capacitor BridgeActivity); native math fallback if the web screen has not reported ready within 4 s; wake-check fallback button.
- Volume lock: STREAM_ALARM re-applied every 2 s while ringing.
- Wake-check (`WakeCheck.kt`): after dismiss → "Are you up?" full-screen prompt after 4 min, 60 s window, ✓ action in the notification; no tap → rings again escalated (snooze locked, level 4, max volume). Survives reboot. Log entry updated with passed / failed.
- Plugin: `getRingContext`, `ringReady`, `confirmAwake`, `requestUnlock` (QR scanner cannot draw over the lock screen), `startSteps`/`stopSteps` (step detector), challenge `proof.fails` stored in the log. Events reach both WebViews (app + ring screen).
- Alarm fields validated natively: `challenge {chain, level, qrPayload}`, `wakeCheck {enabled, delayMin, windowSec}`, `snooze.shrink`, `snooze.weeklyBudget`.

### Added (web)
- Challenges: math (L1–L4, wrong answer adds a problem), type (4/6/9/12 words, paste blocked), memory (3×3 / 4×4), shake (devicemotion, 250 ms debounce), QR (ML Kit scanner, exact payload), steps (native step sensor). Chains like `qr → math`.
- Escape hatch: qr / steps / shake → after 3 fails, 5 min, or no sensor/camera → math L4 + type 12 words.
- `#/ring` screen: time, label, level, snooze button with "N left · M min" / budget / locked text, challenge runner, wake-check prompt with countdown.
- Editor: challenge chain + difficulty, QR setup (create printable code or register any existing code, test scan), wake-check on/off + delay, shorter-snoozes toggle, weekly budget.
- More → Alarm log: per-ring history + average snoozes per alarm (BLUEPRINT §1 metric, test alarms excluded).
- Browser mock moved to `core/bridge-mock.js`, mirrors escalation + wake-check.
- 16 new vitest tests (49 total).

### Dependencies (rule 7)
- `@capacitor-mlkit/barcode-scanning` 8.2.2 — QR challenge scanner (BLUEPRINT §9 choice).
- `qrcode-generator` 2.0.4 — draws the printable QR code in-app (BLUEPRINT §15), tiny, no dependencies.
- No `@capacitor/motion`: the shake challenge reads the standard `devicemotion` event directly (same data, one less dependency).

### Decisions / deviations
- New alarms default to `math L2` (not `qr → math L2`): QR needs a registered code first; the editor offers it.
- Escape hatch also covers `shake` when the phone gives no motion data.
- Debug switch for T13: `localStorage['wake.debug.breakRing']='1'` disables the web ring screen so the native fallback must appear.

### Device test results
- T3 note: on this Samsung, Doze `min_time_to_alarm` = 1 h — Android will not enter deep Doze while any alarm clock is due within the next hour (even `force-idle` is refused). So a 3-minute alarm can never be "in Doze"; checked instead: alarm 3 min ahead, screen off, locked → rang 124 ms late, ring screen shown. Real deep-Doze run (alarm 70 min ahead): forced deep IDLE at 13:43, but a notification tap at 14:06 woke the phone (`IDLE to ACTIVE, reason=notification interaction`), so at 14:52:59 it was awake; the alarm rang 195 ms late. **T3 not conclusive — repeat overnight / untouched.**
- 2026-11-22 15:00, Phase 3 on SM-S938B (Android 17):
  - Web ring screen shown in RingActivity (no fallback), chain `math → memory`, "Snooze 1 min (2 left)". ✅
  - Snooze → rang again 1 min later as "Level 2 · snoozed 1×", "1 left", harder (×) problem. ✅ (T9 partial: escalation + lock count; full 5/3-min lengths covered by unit tests)
  - Challenges solved → WAKE_CHECK_PENDING → prompt after 1 min with countdown + notification ✓ action. ✅
  - Prompt ignored → rang again escalated: red time, "Snooze is locked", Level 4, 3 problems. Log: `snoozes 1, wakeCheck failed, outcome dismissed`; one-time alarm deleted. ✅ **T12 pass**
  - `wake.debug.breakRing` set → native fallback math appeared within 4 s with "Snooze (2 left)". ✅ **T13 pass** (debug flag removed afterwards)
  - Fixed: prompt notification said "within a minute" for a 30 s window — now uses the real window.
  - **Fixed (user report "math says wrong on right answers"):** (1) the native fallback screen built a *new* problem every time the ring screen resumed (screen on/off, notification), so an answer typed for the old problem counted as wrong — now rebuilt only when the ring itself changes; verified on the phone (same problem + typed digit kept through screen off/on). (2) A correct answer gave no feedback (new problem + "1 left" looked like a rejection) — now "✓ Correct — N more" in green; wrong answers show the right result, e.g. "✗ 105 is wrong (57 + 47 = 104)". 2 new unit tests (51 total).
  - Still to test by hand: T10 (power off while ringing), T11 (QR wrong code → escape hatch), T14 (15 min untouched), shake / steps / type on the phone, 7 real mornings.

## Phase 2 — Native alarm core (2026-11-22)

### Added (native, Kotlin)
- `Alarm.kt` (model + validation, unknown fields kept for later phases), `NextTrigger.kt` (rule-based, DST/timezone-safe, pure), `AlarmStore.kt` (SharedPreferences JSON, `commit()` before side effects), `AlarmScheduler.kt` (`setAlarmClock`, exact-alarm check), `RingController.kt` (RINGING → SNOOZED/DISMISSED, one-at-a-time queue, logs), `RingService.kt` (mediaPlayback FGS, alarm stream, vibration, volume ramp, restores volume, 15-min auto-silence), `RingActivity.kt` + `FallbackMathView.kt` (lock-screen ring screen, (a×b)+c sum, snooze), `Receivers.kt` (alarm, boot/package-replaced with < 60 min ring resume, time/timezone change), `AlarmPlugin.kt` (bridge with error codes INVALID / NOT_FOUND / EXACT_ALARM_DENIED / NOT_IMPLEMENTED).
- 6 generated alarm sounds (3 gentle, 3 hard) — `scripts/gen-sounds.mjs`.
- 10 JUnit tests for NextTrigger (week boundary, past → tomorrow, Sunday = 0, skipNext, timezone change, London DST gap and wall-clock).

### Added (web)
- Alarm tab: list, on/off switch, swipe-to-delete with 5 s undo, editor (time, days, label, sound + preview, volume, ramp, vibrate, snooze length/max, delete-after-use, skip next), nap chips (+10 min / +30 min / +1 h), 10-second test alarm.
- More → Reliability: status + Fix buttons, Samsung battery steps, dontkillmyapp link, force-stop warning.
- Onboarding (4 steps), finished only after confirming the test alarm rang on the lock screen.
- Bridge: native wrapper (positional API → Capacitor option objects); browser mock gains logs and a stand-in ring overlay.
- 10 more vitest tests (33 total).

### Decisions / deviations
- `oneShotAt` field added to Alarm (nap + test alarms ring at an exact moment). BLUEPRINT §7 updated.
- Receivers combined in `Receivers.kt`; ring state machine in its own `RingController.kt`. BLUEPRINT §8 updated.
- Sounds are WAV (not .ogg): generated without an encoder; ~530 KB total.
- Besides the full-screen notification, the ring screen is also opened directly. Reason: found on the phone that with notifications not yet allowed, the alarm rang but no screen appeared.
- Kotlin Gradle plugin 2.4.21 added (blueprint asks for Kotlin); `androidx.core:core-ktx`.
- Permissions for camera / steps / microphone / DND are not declared yet (their phases).

### Device test results (SM-S938B, Android 17)
- 2026-11-22: test alarm fired 7 ms after its scheduled time; ring screen shown; snooze 1 min → rang again with "1 left"; sum solved → dismissed, log `snoozes: 1`, one-shot alarm deleted, service stopped. ✅
- With notification permission not granted and screen locked: sound rang (service in foreground) but no ring screen appeared → fixed above; re-check T1 after granting notifications.
- T1–T8: pending (by hand).

### Fixed after user report (2026-11-22): test alarm rang with no screen, no notification, no way to stop
- Cause: notification permission not granted → Android hid the ring notification and rejected the full-screen screen (appops `USE_FULL_SCREEN_INTENT` reject); the direct ring-screen start is blocked from background; opening the app did not show the ring screen.
- Opening WAKE11 while an alarm rings now always shows the ring screen (`MainActivity.onResume`).
- Native refuses to schedule or switch on an alarm while notifications (or the "Ringing alarms" channel) are off: new error `NOTIFICATIONS_DENIED`. Alarm tab shows a red banner with "Allow notifications"; errors get one-tap Allow / Fix buttons.
- 2026-11-22, user-confirmed after allowing notifications: 10 s test alarm showed the sum screen over the lock screen with sound and could be dismissed. ✅
- Queued alarms (fired while another rang) now stay in the stored queue until they ring, so reboot / app update re-schedules them; a queued alarm that was deleted is dropped from the queue.

## Phase 1 — Clock, Stopwatch, Timer in-app (2026-11-22)

### Added
- Clock tab: digital (seconds toggle) or analog SVG face (smooth seconds), date, "Alarm in …" line (reads the bridge), world clocks with 441 bundled cities (`cities.js`, generated from `Intl` time zones + aliases like Mumbai, Delhi, Bengaluru), relative offset and day/night dot, night mode (dim red digits, moves every minute, screen kept on).
- Stopwatch: timestamp model, laps (split + total), fastest green / slowest red, copy laps, 30 fps, survives app restart.
- Timers: several at once, preset chips (1/3/5/10/25 min), h/m/s scroll wheel + label, start / pause / reset / +1 min / delete, progress ring, full-screen "Time's up" with overtime counter and in-app beeps (Web Audio, look-ahead scheduled). Timer checks run on every tab.
- `core/audio.js`, `core/screen.js` (keep-awake), `core/dom.js` (HTML escaping), `loadState/saveState` in `store.js` for stopwatch/timer timestamps (validated on load, rule 6).
- 12 more unit tests (23 total), including stopwatch drift < 50 ms over 10 min.

### Dependencies (rule 7)
- `@capacitor-community/keep-awake` 8.0.1 — keep the screen on in night mode (BLUEPRINT §9 library choice).

### Fixed during the phase
- Timer service re-entered the ticker (stack overflow) when the first timer started; guarded and covered by a test.

### Notes
- Timers are foreground-only in this phase: if WAKE11 is closed, a finished timer alerts when you reopen it. Native closed-app timers come with the native alarm core.
- No UI yet for 12/24 h (setting exists, Settings screen is Phase 5); default is 24 h.

## Phase 0 — Skeleton (2026-11-22)

### Added
- Vite + Capacitor 8 project, Android platform (`appId app.wake11`, minSdk 26).
- App shell: hash router, bottom tab bar (Clock · Alarm · Timer · Stopwatch · Focus · More), placeholder screens.
- Design tokens from BLUEPRINT §10 (`src/styles/tokens.css`).
- Core modules: `ticker.js` (single rAF loop), `store.js` (IndexedDB wrapper + localStorage settings), `bridge.js` (AlarmPlugin wrapper + web mock), `time.js`.
- Vitest unit tests for ticker, time helpers and the bridge mock.

### Dependencies (rule 7)
- `@capacitor/core`, `@capacitor/cli`, `@capacitor/android` — the native shell (decision D1).
- `vite` — dev server and bundler (decision D6).
- `vitest` — unit tests (BLUEPRINT §12).

### Decisions
- App name: **WAKE11** (user decision, replaces the §16 default "WAKE"). Package id stays `app.wake11`.
- Gradle wrapper raised from 8.14.3 to **9.1.0**: Android Studio's bundled JDK is Java 25, which Gradle 8.x cannot run on. AGP stays at 8.13.0 (Capacitor default).
- minSdk raised from Capacitor's default 24 to **26** (§9). targetSdk/compileSdk 36 (Capacitor 8 default).

### Device test results
- Phone: Samsung Galaxy S25 Ultra (SM-S938B), Android 17 / API 37, wireless debugging.
- 2026-11-22 Phase 0: debug APK installed via `gradlew installDebug`, app launches, clock ticks, tab switch works, safe areas correct, no JS errors in logcat. ✅
- T1–T14: from Phase 2 on.
