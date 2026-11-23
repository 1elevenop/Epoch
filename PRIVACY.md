# Privacy

WAKE11 works entirely offline. No data leaves your phone.

- **No internet.** The app does not have the Android `INTERNET` permission, so it cannot send or receive anything over the network.
- **No account, no analytics, no ads, no tracking.**
- **Your data stays on the phone.** Alarms, the alarm log, tasks, focus sessions and settings are stored in the app's private storage. They are excluded from Google cloud backup and device-to-device transfer.
- **Backups are yours.** Settings → Backup → Export writes one JSON file to a place you choose. Import reads it back and checks every field before it changes anything.
- **Uninstalling deletes everything.** Export a backup first if you want to keep your alarms.

## Permissions and why WAKE11 asks for them

| Permission | What it is for |
| --- | --- |
| Alarms & reminders (`USE_EXACT_ALARM`, `SCHEDULE_EXACT_ALARM` on Android 12L and older) | Ring alarms and timers at the exact minute |
| Full-screen notifications (`USE_FULL_SCREEN_INTENT`) | Show the alarm screen over the lock screen |
| Notifications (`POST_NOTIFICATIONS`) | Ringing alarms, running timers and the "Are you up?" check |
| Foreground service (`FOREGROUND_SERVICE`, `…_MEDIA_PLAYBACK`) | Keep the alarm sound playing until you dismiss it |
| Start at boot (`RECEIVE_BOOT_COMPLETED`) | Re-schedule alarms after the phone restarts |
| Wake lock, vibrate (`WAKE_LOCK`, `VIBRATE`) | Wake the phone and vibrate when an alarm rings |
| Ignore battery optimisation (`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`) | Ask Android not to delay or stop alarms; you confirm in a system dialog |
| Alarm volume (`MODIFY_AUDIO_SETTINGS`) | Raise the alarm volume gradually and restore it afterwards |
| Camera (`CAMERA`), only if you use the QR challenge | Scan your QR code to dismiss an alarm. Scanning runs on the phone in Google Play services; no image is saved |
| Physical activity (`ACTIVITY_RECOGNITION`), only for the Walk challenge | Count steps to dismiss an alarm |
| Microphone (`RECORD_AUDIO`), only in Audio Lab → Tuner | Detect the note you play. Sound is analysed live and never recorded or stored |
| Do Not Disturb access (`ACCESS_NOTIFICATION_POLICY`), optional | Turn on Do Not Disturb during a focus session and turn it off afterwards |

Optional permissions are only requested when you use the feature that needs them, and WAKE11 keeps working without them.

## Questions

Open an issue on GitHub. For anything sensitive, see `SECURITY.md`.
