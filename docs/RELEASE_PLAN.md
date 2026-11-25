# WAKE11 — GitHub release plan (released as v1.0.0)

Status: **released as v1.0.0 on 2026-11-23, repository public.** §1 security fixes done 2026-11-23 (see CHANGELOG); everything else still to do. Tick items as they land; log decisions in `CHANGELOG.md`.
Findings below come from checks run on 2026-11-23 (git history scan, `npm audit`, `npm outdated`, manifest, repo files).

---

## 0. Decisions (answered by the owner 2026-11-23)

| # | Answer |
|---|---|
| D-R1 | **Public** repository |
| D-R2 | **MIT** licence |
| D-R3 | Commits rewritten to the GitHub **noreply** address — done; pushed to private `1elevenop/WAKE11` 2026-11-23 (public on release day) |
| D-R4 | Package id changed to **`app.wake11`** — done 2026-11-23; name removed from the whole git history |
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
| 18 | Git leaked secrets | ✅ checked | History scan clean (again 2026-11-23: manual pattern scan of tree + all commits + image metadata, see CHANGELOG). **Task:** run `gitleaks` (or GitHub secret scanning after push) once more before making the repo public. Author email: see D-R3. |
| 19 | Full security audit | 🔜 | Run `/security-review` (or a manual pass) on the native plugins (`AlarmPlugin`, `BackupPlugin`, `DevicePlugin`, widgets receiver) before release. |
| 20 | Make no mistakes | — | Covered by the checklist + "Release day" gate in §6. |

Extra Android items:
- [x] `INTERNET` and `ACCESS_NETWORK_STATE` removed (`tools:node="remove"`, also stops ML Kit usage logging). Phone: all screens work, QR scanner (Google Play services) still opens.
- [x] Explain every sensitive permission: table in `PRIVACY.md`, linked from README (2026-11-23).
- [x] Privacy statement: `PRIVACY.md` + README section (2026-11-23).

---

## 2. Brand: new logo & icon

- [x] Logo concept: **D2** chosen from drafts A–D and D1–D6 (`media/logo/drafts/`).
- [x] Master files in `media/logo/`: `wake11-icon.svg` + 512/1024 PNG, `wake11-mark.svg` (+ white/black one-colour) + PNGs. All generated by `scripts/gen-icons.py`; PNGs exported from Affinity.
- [x] Android launcher icon (vector, no PNGs): adaptive background + foreground + **monochrome** layer ("11" only). Old Capacitor PNGs removed.
- [x] Splash: Android 12+ system splash (black + mark) and `splash.xml` for older; Capacitor images removed.
- [x] Notification icon `ic_stat_wake11` (white "11") in all 5 notification builders.
- [x] Launcher icon checked on the phone (One UI app drawer, 2026-11-23): tile, grid, "11" and bar render inside the mask, no clipping. Notification icon seen in the status bar while ringing.
- [x] Widgets use the new look (2026-11-23): analog clock has its own dial and hands; all widgets checked on the phone.

## 3. Media package (`media/`)

- [x] **Screenshots** — 2026-11-23: `media/screenshots/dark/` (11) and `light/` (8), demo data from `scripts/demo-backup.mjs`, status bar cropped off. Retaken after the unslop pass, ring screen without One UI's pop-up; added Focus running (dark + light), big display landscape (Nixie, focus) and widgets (dark). All demo data, status bar / dock cropped.
  Plan: (from the phone via `adb exec-out screencap`, light + dark themes): Clock, Alarm list, Alarm editor, Ring screen + challenge, Focus running, Focus stats, Audio Lab, Tools (interval green screen), Big display (landscape), Widgets on home screen. Use demo data, not personal data.
- [x] **Short demo** (GIF/MP4, < 30 s): set alarm → ring → challenge → wake-check. Use `adb shell screenrecord`. Done 2026-11-23: `media/demo/wake11-demo.gif` (11.8 s, built from screenshots: test alarm → ring → math → dismissed; no wake-check in the clip).
- [x] **Social preview** image for GitHub (1280×640): logo + tagline + 2 phone screenshots. Done: `media/banner/wake11-social.png` (`scripts/gen-banners.py`). Upload it in GitHub → Settings → Social preview (no API for it).
- [x] **README banner** (logo + tagline). Done: `media/banner/wake11-banner.png`.
- [ ] Optional: feature graphic 1024×500 (if F-Droid / Play later).
- [x] Remove personal data from all images: demo data only, status bar cropped (2026-11-23). Re-check any new captures.

## 4. Repository docs

- [x] `README.md` (2026-11-23; banner still to make, the icon heads it for now): banner · one-line pitch · screenshots · features (Clock, Alarm + anti-snooze, Timer, Stopwatch, Focus, Audio Lab, Tools, Widgets) · **install from APK** (download, allow unknown sources, verify SHA-256) · first-run setup (permissions, Samsung battery steps) · privacy · build from source (Node, Android Studio JDK, `npm ci`, `npm test`, `npx cap sync`, Gradle) · project structure · licence · credits.
- [x] `LICENSE` (D-R2): MIT, © 2026 1elevenop.
- [x] `THIRD_PARTY_NOTICES.md`: Capacitor (MIT), Vite/Vitest (MIT), qrcode-generator (MIT), keep-awake (MIT), ML Kit barcode plugin (Apache-2.0) + Google ML Kit terms, fonts Orbitron / Rajdhani / Share Tech Mono (SIL OFL 1.1 — licence text must ship).
- [x] `PRIVACY.md` (short: offline, no tracking, what permissions do).
- [x] `CONTRIBUTING.md` (optional: tests must pass, file size rule, phase rules) and issue templates (bug report asks phone model + Android version + Reliability screen).
- [x] `SECURITY.md`: how to report a problem privately.
- [x] Tidy `CHANGELOG.md` into release notes format (keep history, add a "0.6.0" summary at the top).
- [x] `BLUEPRINT.md` and `RELEASE_PLAN.md` moved to `docs/`, `CLAUDE.md` stays at the root (D-R5, 2026-11-23).

## 5. Build & release artefacts

- [x] Version bump check (`versionName 0.6.0`, `versionCode 6`, Settings shows 0.6.0). ✅ APK reports app.wake11 0.6.0 (6).
- [ ] APK size is 27 MB (ML Kit barcode model is large): consider per-ABI split APKs (arm64-v8a only for modern phones) in addition to the universal APK.
- [x] Build signed release, record SHA-256 of each APK, publish checksums in the release notes. ✅ `WAKE11-0.6.0.apk` SHA-256 `9062a37aa4662b71f1c950fe886875fa8d0e5b43ce25fda0fa0f70288378dfc7`, v2 signature verified.
- [x] Publish signing-certificate fingerprint in README so users can verify updates. ✅ `9E:B4:…:CB:3D`, cert DN `CN=WAKE11`.
- [ ] Optional CI (GitHub Actions): `npm ci && npm test` on every push (no signing secrets in CI; releases stay signed locally).
- [x] Tag `v1.0.0` and GitHub Release with notes, APK and checksums (2026-11-23). The owner chose 1.0.0 for the first public release (versionName 1.0.0, versionCode 7); the v0.6.0 draft and tag were removed unpublished. `WAKE11-1.0.0.apk` SHA-256 `06e7b25594f6550999514c423f00ba7136e98a78eb58b06cb9cf6d00e1969c73`, same signing certificate.
- [x] Tag `v1.0.1` and GitHub Release (2026-11-25): ghost-ring fix (alarms silently queued after deleting an alarm during its wake-up check). versionName 1.0.1, versionCode 8. `WAKE11-1.0.1.apk` SHA-256 `4ebc321038853895ac9e98c9107e5f6391c4882d5ae37fb31a544e732ad8c3d6`, same signing certificate. Verified on the S25 Ultra: planted ghost state was cleared and the next alarm rang.

## 6. Release day gate (must all be ✅)

- [x] Rewrite commit author email (D-R3) **before** the first push (done 2026-11-23).
- [x] `gitleaks` 8.30.1 clean ✅ (9 commits, no leaks, 2026-11-23); `npm audit` clean ✅ (0 vulnerabilities); `npm test` 100 % pass; Kotlin unit tests pass.
- [x] Fresh install of the release APK on the phone (2026-11-23, after exporting a backup): setup guide → notifications allowed, exact alarms and full-screen already OK, battery exemption granted → 10 s test alarm woke the locked, dozing phone and rang over the lock screen (T1) ✅ → backup import restored 4 alarms, 15 log entries, 3 tasks, 8 sessions ✅. Widgets were removed by the uninstall and not re-added.
- [ ] Device tests still open (T3, T8, T9, T10, T11, T14) listed as **known limitations** in the release notes if not done.
- [ ] README renders correctly on GitHub; all images load; no personal data in screenshots.
- [ ] Keystore + password backed up privately (never in the repo).

---

### Suggested order
1. Decisions D-R1…D-R6 → 2. security fixes (§1 tasks: CSP, allowBackup, INTERNET test, XSS audit, template cleanup) → 3. logo + icons → 4. screenshots & media → 5. README, LICENSE, notices → 6. build, checksums, tag, GitHub Release.

---

## 7. Epoch 2.0.0 release plan (rebrand + redesign)

**Why this release is different:** the package id changed (`app.wake11` → `app.epoch`), so Epoch installs **beside** WAKE11 instead of over it. Every user must move data with Export (WAKE11) → Import (Epoch). The release notes lead with that.

Signing stays the same key (fingerprint `9E:B4:…:CB:3D`), so future Epoch updates install over Epoch.

### 7.1 Decisions (owner)
- [ ] **Repo name:** rename `1elevenop/WAKE11` → `1elevenop/Epoch` before the release (GitHub redirects old URLs, clones and release links), or keep the name. Recommended: rename, then `git remote set-url origin` locally.
- [ ] **Release type:** full release `v2.0.0` (recommended) or a pre-release `v2.0.0-beta.1` for a few days first.

### 7.2 Finish on the phone (debug build, then release build)
- [ ] Grant Epoch's permissions through the setup guide (notifications, alarms & reminders, full-screen, battery unrestricted, Samsung never-sleeping list).
- [ ] Alarm 2 min out, screen locked: sound first, ring screen, challenge, dismiss, wake-up check. Snooze once.
- [ ] Timer in the background rings; focus session phase-end rings with the app closed.
- [ ] Notification icon (new mark) shows; launcher icon and splash show the new mark.
- [ ] Widgets: add all six again (new app), clock widgets open Tools → Clock, nap button sets an alarm.
- [ ] Backup move: Export in WAKE11 1.0.1 → Import in Epoch. Alarms, logs, tasks, sessions, countdowns, world clocks arrive; an old theme loads as Black.
- [ ] Backgrounds: pick a real photo through Android's file picker for the app and for the big display; a file over 50 MB is refused with a message.
- [ ] Tools / Audio Lab cards: open and close each; sound stops when a card closes or the tab changes.
- [ ] Only after the import is confirmed, and with the owner's OK: uninstall WAKE11 on the test phone.

### 7.3 Repo content
- [ ] New screenshots in `media/screenshots/` (Black and Light; no personal data): Alarm, Timer, Stopwatch, Focus, Tools with an open card, Audio Lab, Settings → Background, big display landscape, ring screen, widgets.
- [ ] Update `scripts/gen-banners.py` to the new name, palette and mark → `media/banner/epoch-banner.png`, `epoch-social.png`; delete `wake11-*` banners; record a new demo GIF (`media/demo/epoch-demo.gif`).
- [ ] README: image links, "What's new in 2.0", and a **Moving from WAKE11** section (Export → install Epoch → Import → uninstall WAKE11). Fix the line "Updates install over the old version" to say it applies from Epoch 2.0 on.
- [ ] GitHub social preview image (repo Settings → Social preview) → `epoch-social.png`.
- [ ] CHANGELOG `2.0.0 — Epoch` gets the date; BLUEPRINT §17 phase 7 → ✅ with what is still open.

### 7.4 Merge and gate
- [ ] Open a PR `claude/epoch-rebrand-redesign-92271a` → `main`; review the diff; merge (squash not needed, history is clean).
- [ ] `npm ci && npm test` (all pass), `npm audit` (0), Kotlin unit tests (`gradlew testDebugUnitTest`), `gitleaks detect` on the whole history (no keystore, no passwords).
- [ ] `npm run build && npx cap sync android && cd android && gradlew assembleRelease` with versionName 2.0.0 / versionCode 9.
- [ ] `apksigner verify --print-certs` shows `9E:B4:…:CB:3D`; rename to `Epoch-2.0.0.apk`; write `SHA256SUMS.txt`.
- [ ] Install the release APK on the phone (`adb install -r`) and repeat one alarm and one import check.

### 7.5 Publish
- [ ] Tag `v2.0.0` on `main`; push the tag.
- [ ] `gh release create v2.0.0 Epoch-2.0.0.apk SHA256SUMS.txt --title "Epoch 2.0.0" --notes-file release-notes.md` (notes below).
- [ ] Mark WAKE11 1.0.1's release notes with one line: "WAKE11 is now Epoch — see 2.0.0" (edit, don't delete).
- [ ] Check the release page as a logged-out visitor: APK downloads, checksum matches, README images load.

### 7.6 Release notes outline
1. **WAKE11 is now Epoch.** New name, new look. It installs as a new app: export a backup in WAKE11 first (Settings → Backup), install Epoch, import it, then uninstall WAKE11.
2. What's new: six tabs (Clock moved to Tools); settings gear; Tools and Audio Lab as cards that open in place; scarlet / black / creme palette with Black and Light themes; Geist type; backgrounds for the app and the big display (colour or image up to 50 MB); new icons.
3. Fixed: Stopwatch (and other tools) buttons no longer jump from the middle to the bottom.
4. Removed: the ten decorative themes (a WAKE11 backup that used one loads as Black).
5. Install / verify: SHA-256, signing fingerprint, Android 8+ (minSdk as before), permissions to grant again.
6. Known limitations: open device tests (T3, T8, T9–T14), images are not in backups, widgets must be added again.

### 7.7 After release
- [ ] Watch issues for a week (import problems, Samsung battery killing the new package).
- [ ] Keep WAKE11 1.0.1 on the releases page for people who need to export from it.
