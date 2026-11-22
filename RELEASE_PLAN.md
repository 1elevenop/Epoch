# WAKE11 — GitHub release plan (v0.6.0)

Status: **§1 security fixes done 2026-11-23** (see CHANGELOG); everything else still to do. Tick items as they land; log decisions in `CHANGELOG.md`.
Findings below come from checks run on 2026-11-23 (git history scan, `npm audit`, `npm outdated`, manifest, repo files).

---

## 0. Decisions (answered by the owner 2026-11-23)

| # | Answer |
|---|---|
| D-R1 | **Public** repository |
| D-R2 | **MIT** licence |
| D-R3 | Rewrite commits to the GitHub **noreply** address before the first push |
| D-R4 | **Change** package id to **`app.wake11`** now (one more backup → uninstall → restore on the phone) |
| D-R5 | Move `BLUEPRINT.md`, `RELEASE_PLAN.md` to **`docs/`**; `CLAUDE.md` stays at the root |
| D-R6 | Logo made in **Affinity**; owner chose **D2** (dark tile, blue italic 11, orange bar) — done 2026-11-23 |

Original questions:


| # | Decision | Options | Why it matters |
|---|---|---|---|
| D-R1 | Repo visibility | public / private | Public = anyone can read code, docs and git history. |
| D-R2 | Licence | MIT · Apache-2.0 · GPL-3.0 · "all rights reserved" | No licence = nobody may legally reuse the code. |
| D-R3 | Commit email | GitHub `noreply` address (recommended) / keep Gmail | **Every commit currently carries your Gmail address**; it becomes public and permanent once pushed. Only a few local commits, so rewriting now is cheap. |
| D-R4 | Package id `app.wake11` | keep / change before first public release | Can never change after people install it (updates would break). It contains your first name. |
| D-R5 | Ship `CLAUDE.md` / `BLUEPRINT.md` / dev notes | keep / move to `docs/` / drop | They contain internal rules and device notes; fine to publish, but decide. |
| D-R6 | Logo direction | see §2 | Blocks icon, README banner and social preview. |

---

## 1. Security & privacy (your 20-item list, mapped to this app)

WAKE11 is an **offline Android app**: no server, no accounts, no network calls, data stays on the phone (D8). Many web-app items therefore do not apply; they are kept here with the reason so nothing is silently skipped.

| # | Item | Applies? | Finding / action |
|---|---|---|---|
| 1 | Hide API keys | ✅ checked | No API keys exist. Git history scanned: no keys/tokens. Signing key + passwords are outside the repo and git-ignored. |
| 2 | Check env variables | ✅ checked | App uses none. `keystore.properties` (secrets) is git-ignored; only `keystore.properties.example` is committed. |
| 3 | Protect admin routes | ➖ n/a | No server, no admin area. |
| 4 | Proper authentication | ➖ n/a | No accounts by design (D8). |
| 5 | Check user access | ✅ done | Only launcher, Boot and TimeChange are exported. Boot already checked its action; **TimeChange now ignores anything but TIME_SET / TIMEZONE_CHANGED**. Widget deep links accept 4 fixed routes only. |
| 6 | Sanitize forms | ✅ done | New `tests/security.test.js`: crafted backups (prototype keys, huge strings, wrong types, garbage JSON). **Found and fixed:** a `null` inside a list crashed the validator; `parseBackup` can no longer throw. |
| 7 | Protect against XSS | ✅ done | Audited every unescaped `innerHTML`: only numbers, constants or allow-listed values. **Fixed:** `in` checks that accepted `__proto__`/`constructor` (backup import, setSetting, metronome, breathing) → `Object.hasOwn`; tool screens tolerate a `null` saved state. CSP added. |
| 8 | Rate limiting | ➖ n/a | No API. (Native already rate-limits snoozes by design.) |
| 9 | Secure API endpoints | ➖ n/a | None. Native plugin methods validate input + return error codes (rule 5). |
| 10 | CORS | ➖ n/a | No network requests. |
| 11 | Security headers | ✅ done | CSP `<meta>`: scripts/fonts/connections from the app only, no objects, no base/form targets; inline styles allowed (3 style attributes). 25 screens on the phone: 0 violations. |
| 12 | Debug mode off | ✅ release | Release APK is not debuggable; WebView debugging off in release. **Task:** strip `console.*` noise? (optional). |
| 13 | Update dependencies | ✅ checked | `npm outdated`: nothing outdated. Re-check right before tagging. Gradle/AGP/Kotlin versions: check too. |
| 14 | Remove unused packages | ✅ checked | All 9 runtime deps are imported. |
| 15 | Exposed files | ✅ done | Capacitor template tests removed; local path removed from CHANGELOG. Your name remains only in the package id + BLUEPRINT owner line (decision D-R4). |
| 16 | Secure the database | ✅ done | `allowBackup="false"`, `fullBackupContent="false"`, `dataExtractionRules` exclude everything from cloud backup and device-to-device copy (follows D8). Export/import JSON is the backup. |
| 17 | Hash passwords | ➖ n/a | No passwords in the app. |
| 18 | Git leaked secrets | ✅ checked | History scan clean. **Task:** run `gitleaks` (or GitHub secret scanning after push) once more before making the repo public. Author email: see D-R3. |
| 19 | Full security audit | 🔜 | Run `/security-review` (or a manual pass) on the native plugins (`AlarmPlugin`, `BackupPlugin`, `DevicePlugin`, widgets receiver) before release. |
| 20 | Make no mistakes | — | Covered by the checklist + "Release day" gate in §6. |

Extra Android items:
- [x] `INTERNET` and `ACCESS_NETWORK_STATE` removed (`tools:node="remove"`, also stops ML Kit usage logging). Phone: all screens work, QR scanner (Google Play services) still opens.
- [ ] Explain every sensitive permission in README (exact alarms, full-screen intent, camera, mic, activity recognition, DND access, battery).
- [ ] Privacy statement: "no data leaves the phone, no analytics, no ads".

---

## 2. Brand: new logo & icon

- [x] Logo concept: **D2** chosen from drafts A–D and D1–D6 (`media/logo/drafts/`).
- [x] Master files in `media/logo/`: `wake11-icon.svg` + 512/1024 PNG, `wake11-mark.svg` (+ white/black one-colour) + PNGs. All generated by `scripts/gen-icons.py`; PNGs exported from Affinity.
- [x] Android launcher icon (vector, no PNGs): adaptive background + foreground + **monochrome** layer ("11" only). Old Capacitor PNGs removed.
- [x] Splash: Android 12+ system splash (black + mark) and `splash.xml` for older; Capacitor images removed.
- [x] Notification icon `ic_stat_wake11` (white "11") in all 5 notification builders.
- [ ] Widget previews use the new look.

## 3. Media package (`media/`)

- [ ] **Screenshots** (from the phone via `adb exec-out screencap`, light + dark themes): Clock, Alarm list, Alarm editor, Ring screen + challenge, Focus running, Focus stats, Audio Lab, Tools (interval green screen), Big display (landscape), Widgets on home screen. Use demo data, not personal data.
- [ ] **Short demo** (GIF/MP4, < 30 s): set alarm → ring → challenge → wake-check. Use `adb shell screenrecord`.
- [ ] **Social preview** image for GitHub (1280×640): logo + tagline + 2 phone screenshots.
- [ ] **README banner** (logo + tagline).
- [ ] Optional: feature graphic 1024×500 (if F-Droid / Play later).
- [ ] Remove personal data from all images (alarm labels, calendar, notifications, status bar).

## 4. Repository docs

- [ ] `README.md`: banner · one-line pitch · screenshots · features (Clock, Alarm + anti-snooze, Timer, Stopwatch, Focus, Audio Lab, Tools, Widgets) · **install from APK** (download, allow unknown sources, verify SHA-256) · first-run setup (permissions, Samsung battery steps) · privacy · build from source (Node, Android Studio JDK, `npm ci`, `npm test`, `npx cap sync`, Gradle) · project structure · licence · credits.
- [ ] `LICENSE` (D-R2).
- [ ] `THIRD_PARTY_NOTICES.md`: Capacitor (MIT), Vite/Vitest (MIT), qrcode-generator (MIT), keep-awake (MIT), ML Kit barcode plugin (Apache-2.0) + Google ML Kit terms, fonts Orbitron / Rajdhani / Share Tech Mono (SIL OFL 1.1 — licence text must ship).
- [ ] `PRIVACY.md` (short: offline, no tracking, what permissions do).
- [ ] `CONTRIBUTING.md` (optional: tests must pass, file size rule, phase rules) and issue templates (bug report asks phone model + Android version + Reliability screen).
- [ ] `SECURITY.md`: how to report a problem privately.
- [ ] Tidy `CHANGELOG.md` into release notes format (keep history, add a "0.6.0" summary at the top).
- [ ] Decide on `CLAUDE.md` / `BLUEPRINT.md` / `RELEASE_PLAN.md` (D-R5).

## 5. Build & release artefacts

- [ ] Version bump check (`versionName 0.6.0`, `versionCode 6`, Settings shows 0.6.0).
- [ ] APK size is 27 MB (ML Kit barcode model is large): consider per-ABI split APKs (arm64-v8a only for modern phones) in addition to the universal APK.
- [ ] Build signed release, record SHA-256 of each APK, publish checksums in the release notes.
- [ ] Publish signing-certificate fingerprint in README so users can verify updates.
- [ ] Optional CI (GitHub Actions): `npm ci && npm test` on every push (no signing secrets in CI; releases stay signed locally).
- [ ] Tag `v0.6.0`, GitHub Release with notes, APK(s), checksums, screenshots.

## 6. Release day gate (must all be ✅)

- [ ] Rewrite commit author email (D-R3) **before** the first push.
- [ ] `gitleaks detect` clean; `npm audit` clean; `npm test` 100 % pass; Kotlin unit tests pass.
- [ ] Fresh install of the release APK on the phone: onboarding → all permissions → alarm rings on locked phone (T1) → widgets → backup export/import.
- [ ] Device tests still open (T3, T8, T9, T10, T11, T14) listed as **known limitations** in the release notes if not done.
- [ ] README renders correctly on GitHub; all images load; no personal data in screenshots.
- [ ] Keystore + password backed up privately (never in the repo).

---

### Suggested order
1. Decisions D-R1…D-R6 → 2. security fixes (§1 tasks: CSP, allowBackup, INTERNET test, XSS audit, template cleanup) → 3. logo + icons → 4. screenshots & media → 5. README, LICENSE, notices → 6. build, checksums, tag, GitHub Release.
