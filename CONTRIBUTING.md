# Contributing

Thanks for helping. Epoch is a small project, so keep changes focused.

## Before you open a pull request

- `npm test` and `cd android && ./gradlew testDebugUnitTest` pass.
- Test on a real Android phone. There is no browser version; `src/core/bridge.js` only works on the device.
- Keep files under about 300 lines and split by feature.
- Time comes from timestamps (`Date.now()`, `System.currentTimeMillis()`), never from counting ticks.
- Native code owns alarms. The web layer never schedules an alarm on its own.
- Every value read from a backup file is validated.
- New dependency? Add a one-line reason to `CHANGELOG.md`.
- Buttons have labels, touch targets are at least 48 px, text contrast is at least 4.5:1.

The full design and its rules are in `docs/BLUEPRINT.md`.

## Reporting bugs

Use the bug report template. Alarm problems are often caused by the phone maker's battery settings, so include your phone model, Android version and what More → Reliability shows.

Security problems: see `SECURITY.md`, not a public issue.
