// AlarmPlugin bridge (BLUEPRINT §4): talks to the native Kotlin plugins. Epoch is Android-only
// (D9); there is no browser build. Off-device every call rejects with code NOT_ANDROID (rule 5).

import { Capacitor, registerPlugin } from '@capacitor/core';

const PLUGIN = 'AlarmPlugin';

// Capacitor native methods take one options object and resolve objects; this wrapper keeps the
// positional API of BLUEPRINT §4 for the rest of the web code.
function createNativeAlarmPlugin() {
  const p = registerPlugin(PLUGIN);
  const d = registerPlugin('DevicePlugin'); // step sensor, unlock for QR, immersive mode
  const b = registerPlugin('BackupPlugin'); // export / import + system file picker
  return {
    listAlarms: async () => (await p.listAlarms()).alarms,
    upsertAlarm: (alarm) => p.upsertAlarm({ alarm }),
    deleteAlarm: (id) => p.deleteAlarm({ id }),
    setEnabled: (id, on) => p.setEnabled({ id, on }),
    getRingState: async () => (await p.getRingState()).state ?? null,
    getRingContext: async () => (await p.getRingContext()).context ?? null,
    snooze: (id) => p.snooze({ id }),
    dismiss: (id, proof = null) => p.dismiss({ id, proof }),
    confirmAwake: (id) => p.confirmAwake({ id }),
    ringReady: () => p.ringReady(),
    requestUnlock: () => d.requestUnlock(),
    startSteps: () => d.startSteps(),
    stopSteps: () => d.stopSteps(),
    scheduleTimer: (t) => p.scheduleTimer(t),
    cancelTimer: (id) => p.cancelTimer({ id }),
    getTimerState: () => p.getTimerState(),
    stopTimerRing: (id = null) => p.stopTimerRing(id ? { id } : {}),
    setImmersive: (on) => d.setImmersive({ on }),
    getLogs: async () => (await p.getLogs()).logs,
    exportAlarms: () => b.exportAlarms(),
    importAlarms: (alarms, alarmLogs) => b.importAlarms({ alarms, alarmLogs }),
    saveFile: (name, text) => b.saveFile({ name, text }),
    openFile: async () => (await b.openFile()).text ?? null,
    getReliabilityStatus: () => p.getReliabilityStatus(),
    requestNotifications: () => p.requestNotifications(),
    openSetting: (which) => p.openSetting({ which }),
    previewSound: (soundId, volume) => p.previewSound({ soundId, volume }),
    stopPreview: () => p.stopPreview(),
    setWidgetData: (data) => p.setWidgetData(data),
    setTimerSound: (soundId) => p.setTimerSound({ soundId }),
    previewSunrise: (seconds = 30) => p.previewSunrise({ seconds }),
    dndStatus: () => d.dndStatus(),
    openDndAccess: () => d.openDndAccess(),
    setFocusDnd: (on) => d.setFocusDnd({ on }),
    addListener: (event, cb) => (event === 'step' ? d : p).addListener(event, cb),
  };
}

/** Stand-in when the native plugin is missing: every method rejects with a clear error code. */
function unavailablePlugin() {
  const fail = () => Promise.reject(Object.assign(new Error('Epoch runs on Android only'), { code: 'NOT_ANDROID' }));
  return new Proxy({}, { get: (_, key) => (key === 'then' ? undefined : fail) });
}

const useNative = Capacitor.isNativePlatform() && Capacitor.isPluginAvailable(PLUGIN);
if (!useNative) console.error('[bridge] native AlarmPlugin not available — Epoch is Android-only');

export const AlarmPlugin = useNative ? createNativeAlarmPlugin() : unavailablePlugin();
