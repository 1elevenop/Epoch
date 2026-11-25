<p align="center"><img src="media/banner/epoch-banner.png" alt="Epoch — the alarm clock that makes sure you actually get up"></p>

<p align="center">An alarm clock for Android that makes sure you actually get up, with timers, a stopwatch, focus sessions and small audio tools. Offline, no account, no ads.</p>

<p align="center">
  <img src="media/screenshots/black/09-ring-challenge.png" width="200" alt="Ringing alarm with a math challenge">
  <img src="media/screenshots/black/01-alarms.png" width="200" alt="Alarm list">
  <img src="media/screenshots/black/04-focus.png" width="200" alt="Focus with recent sessions">
  <img src="media/screenshots/black/06-tools-clock.png" width="200" alt="Tools, clock card with world clocks">
</p>

<p align="center"><img src="media/demo/epoch-demo.gif" width="240" alt="Alarm list, ringing alarm with a challenge, focus, stats, tools and Audio Lab"></p>

## What's new in 2.0

WAKE11 is now **Epoch**: a new name, a new look and a mascot.

- Six tabs: Alarm, Timer, Stopwatch, Focus, Tools, Audio Lab. Clock moved into Tools; Settings opens from the gear.
- Tools and Audio Lab are index cards that open in place.
- Scarlet, black and creme, with Black and Light themes and Geist type.
- Backgrounds for the app and the big display: a colour or your own image.
- The Epoch mascot on the app icon, empty lists, Settings and the ring screen.

## Moving from WAKE11

Epoch has a new package id, so it installs **next to** WAKE11 instead of replacing it. Move your data once:

1. In WAKE11: Settings → Backup → **Export**.
2. Install Epoch (see [Install](#install)).
3. In Epoch: Settings → Backup → **Import** the file. Alarms, the alarm log, tasks, focus sessions, countdowns and world clocks come across; a WAKE11 theme that no longer exists loads as Black.
4. Run Epoch's setup guide to grant its permissions, add your widgets again, then uninstall WAKE11.

## Features

**Alarm that gets you up**
- Rings on time with the phone locked, silent, on battery saver or after a restart (native Android alarms, not a web timer)
- Dismiss challenges: math, typing a phrase, memory, shaking, walking a number of steps or scanning a QR code you placed in another room. Chain up to four
- Snoozing gets harder: shorter snoozes, a harder challenge each time, a weekly snooze budget
- Wake-up check: a few minutes after you dismiss, Epoch asks "Are you up?". Miss it and the alarm rings again
- Gentle sunrise pre-alarm, volume ramp, nap and test alarms, an alarm log with your snoozes

**Timers and focus**
- Several timers at once and a stopwatch with laps. Turn the phone sideways for a big display with nine digit styles (flip clock, Nixie tubes, 7-segment and more)
- Focus sessions: Pomodoro-style blocks, a task list with subtasks, a parking lot for stray thoughts, optional Do Not Disturb and background noise, stats with streaks and a 12-week chart

**Audio Lab and tools**
- Metronome, tone generator, white/pink/brown noise, tuner, binaural beats
- Tools: clock with world clocks, night mode and an analog face; interval (HIIT/Tabata) timer, breathing guide, event countdowns, chess clock, speech timer
- Home-screen widgets: clock, analog clock, next alarm with nap buttons, timer, world clocks, countdown
- Black and Light themes with eight accent colours; Geist and Geist Mono type

<p align="center">
  <img src="media/screenshots/black/10-big-display-landscape.png" width="520" alt="Big display, stopwatch, landscape">
</p>

<p align="center">
  <img src="media/screenshots/black/03-stopwatch.png" width="160" alt="Stopwatch with laps">
  <img src="media/screenshots/black/05-focus-stats.png" width="160" alt="Focus stats">
  <img src="media/screenshots/black/07-audio-lab.png" width="160" alt="Audio Lab cards">
  <img src="media/screenshots/light/01-alarms.png" width="160" alt="Alarm list, Light theme">
  <img src="media/screenshots/light/08-settings-background.png" width="160" alt="Settings, accent colours and backgrounds, Light theme">
</p>

## Install

Epoch is not on the Play Store. Install the APK from GitHub:

1. Open the latest release on the [Releases page](../../releases) and download `Epoch-<version>.apk`.
2. Optional but recommended: check the file. The release notes list its SHA-256 checksum.
   - Windows: `certutil -hashfile Epoch-<version>.apk SHA256`
   - macOS / Linux: `shasum -a 256 Epoch-<version>.apk`
3. Open the APK on your phone. Android asks to allow installs from your browser or file manager once; allow it, install, then you can turn that permission off again.

From Epoch 2.0 on, updates install over the old version and keep your data, because every release is signed with the same key (WAKE11 used the same key, but a different package id). Signing certificate SHA-256 fingerprint:

```
9E:B4:F1:85:CC:72:35:3E:2A:E5:A6:6E:7F:52:1C:AB:BC:2A:27:B9:F1:6E:80:42:09:6B:32:03:89:AC:CB:3D
```

To check it: `apksigner verify --print-certs Epoch-<version>.apk` (Android SDK build-tools).

Requires Android 8.0 or newer. Tested on a Samsung Galaxy S25 Ultra with Android 17.

## First run

The setup guide takes about two minutes and ends with a real 10-second test alarm. It asks for notifications, alarms & reminders, full-screen alerts and an exemption from battery optimisation. You can run it again from Settings (the gear) → Setup guide, and Settings → Reliability shows what is still missing with a Fix button for each.

Some phone makers stop background apps more aggressively than Android itself. On Samsung, also do this once:

- Settings → Battery → Background usage limits → Never sleeping apps → add Epoch
- Settings → Apps → Epoch → Battery → Unrestricted

Reliability shows similar steps for other phone makers.

## Privacy

No internet permission, no analytics, no account. Everything stays on the phone and is excluded from cloud backup; Settings → Backup exports a JSON file you control. Every permission and why it is needed: [PRIVACY.md](PRIVACY.md).

## Known limitations

These device tests have not passed yet on a real phone:

- Deep Doze overnight with the phone untouched (Samsung would not enter deep Doze during the test)
- Three real nights in a row
- The full snooze sequence (3 snoozes, shorter each time); covered by unit tests, partly seen on the phone
- Power off while ringing, then ringing again after boot
- Wrong QR code three times, then the escape hatch; covered by unit tests
- Left ringing for 15 minutes, then auto-silenced and logged

## Build from source

You need Node.js (current LTS) and Android Studio (for the Android SDK and its bundled JDK).

```sh
npm ci
npm test                # unit tests (Vitest)
npm run build           # web UI → dist/
npx cap sync android    # copy it into the Android project
cd android
./gradlew installDebug  # Windows: gradlew.bat installDebug, with JAVA_HOME = Android Studio's jbr
./gradlew testDebugUnitTest
```

Release builds are signed with a key that is not in this repository. To build your own, copy `android/keystore.properties.example` to `android/keystore.properties`, point it at your keystore and run `./gradlew assembleRelease`. An APK signed with a different key cannot update the official one.

There is no browser version: the app needs the native alarm plugin and is developed and tested on a phone.

## How it is built

- Web UI: vanilla HTML, CSS and JavaScript (ES modules), bundled with Vite. No UI framework.
- Native: a small Kotlin layer under [Capacitor](https://capacitorjs.com). It owns the alarms (`AlarmManager.setAlarmClock`), wakes the phone, plays the sound and shows a native fallback screen if the web view fails.
- Time is always computed from timestamps, never counted, so timers stay right after the phone sleeps.

```
src/          web UI: core/ (bridge, store, time, icons), features/<tab>/, ring/, styles/
android/      Capacitor project; Kotlin in app/src/main/java/app/epoch/
tests/        Vitest unit tests (with a fake native plugin)
scripts/      icon and launcher generation, banners, demo backup for screenshots
docs/         BLUEPRINT.md (design and decisions), RELEASE_PLAN.md
media/        logo, banners, demo GIF and screenshots
```

## Licence and credits

Epoch is released under the [MIT licence](LICENSE). It includes Capacitor, Google ML Kit, qrcode-generator and the Geist and Geist Mono fonts under their own licences; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Changes are listed in [CHANGELOG.md](CHANGELOG.md). Security problems: [SECURITY.md](SECURITY.md).
