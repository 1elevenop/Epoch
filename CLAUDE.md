# WAKE11 — project rules for Claude Code

Source of truth: `docs/BLUEPRINT.md`. If a decision changes, update it and log it in `CHANGELOG.md`. Release work: `docs/RELEASE_PLAN.md`.

## Key decisions (BLUEPRINT §2)
- **D1 Hybrid:** Capacitor + vanilla HTML/CSS/JS web UI + a small native Kotlin layer. Native does only what the web cannot: schedule real alarms, wake a locked phone, keep ringing in the background.
- **D2 Native owns alarms:** alarm data and timing live in native (`SharedPreferences` JSON). The web layer only mirrors them via `AlarmPlugin`.
- **D3 Sound first, UI second:** when an alarm fires, native starts sound immediately; web UI loads after. If the WebView fails, a native fallback screen can dismiss.
- **D4** Alarms and timers use `AlarmManager.setAlarmClock()`.
- **D5** Declare `USE_EXACT_ALARM` (plus `SCHEDULE_EXACT_ALARM` with `maxSdkVersion="32"`).
- **D6** Vanilla JS + Vite, ES modules, no UI framework.
- **D7 Time is computed, never counted:** `remaining = endAt - Date.now()`. Ticks only redraw.
- **D8** Offline only, local storage only. Export/import JSON for backup.
- **D9** Android only, sideloaded APK.

## Rules (BLUEPRINT §13)
1. Follow the phases (§11). No feature from a later phase early. Stop at the end of each phase.
2. Time from timestamps (`Date.now()` / `System.currentTimeMillis()`), never tick counts.
3. Native code owns alarms. Web code never schedules an alarm by itself.
4. Write state before side effects (store → then schedule/ring).
5. Every native public method checks permissions and returns a clear error code, not a crash.
6. Every input from import files is validated.
7. No new dependency without a one-line reason in `CHANGELOG.md`.
8. Keep files under ~300 lines; split by feature.
9. Accessibility: labels on all buttons, 48 px touch targets, contrast ≥ 4.5:1.
10. After each phase: list what to test by hand on the phone.

## Project facts
- App name: WAKE11 · appId `app.wake11` · web root `src/`, build output `dist/`.
- **No browser app.** Develop and test on the phone only (wireless adb); never use a browser preview or a dev server. `src/core/bridge.js` is native-only; the fake plugin in `tests/support/` is for unit tests only.
- Commands: `npm test` (vitest), `npm run build`, `npx cap sync android`, then `cd android && gradlew installDebug` (JAVA_HOME = Android Studio `jbr`). Release: `gradlew assembleRelease` → `android/app/build/outputs/apk/release/app-release.apk`.
- **Signing:** `android/keystore.properties` (git-ignored) → owner's keystore outside the repo. Debug and release both use that key, so they install over each other without data loss. Never commit keystores or passwords; never uninstall the app on the phone without a backup and the owner's OK.
- On-phone checks over adb/WebView debugging need the **debug** build (release is not debuggable); install release afterwards with `adb install -r`.
- Git: `main` tracks `origin` = private GitHub repo `1elevenop/WAKE11` (public on release day). Commits use the GitHub noreply address (local git config). For on-phone checks, drive the WebView over adb (`adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>`).
- Windows dev box: Android SDK at `%LOCALAPPDATA%\Android\Sdk`, JDK = Android Studio's `jbr`.
