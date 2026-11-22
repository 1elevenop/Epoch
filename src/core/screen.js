// Keep the screen on (night mode now, focus mode later).
// Native: @capacitor-community/keep-awake. Browser: Screen Wake Lock API when available.

import { Capacitor } from '@capacitor/core';
import { KeepAwake } from '@capacitor-community/keep-awake';

const holders = new Set();
let webLock = null;

async function apply(on) {
  try {
    if (Capacitor.isNativePlatform()) {
      await (on ? KeepAwake.keepAwake() : KeepAwake.allowSleep());
    } else if (on && navigator.wakeLock && !webLock) {
      webLock = await navigator.wakeLock.request('screen');
      webLock.addEventListener('release', () => (webLock = null));
    } else if (!on && webLock) {
      await webLock.release();
      webLock = null;
    }
  } catch (err) {
    console.warn('[screen] keep-awake unavailable', err);
  }
}

/** keepAwake(owner) → release(). Several screens can hold it; the screen sleeps when all release. */
export function keepAwake(owner) {
  holders.add(owner);
  if (holders.size === 1) apply(true);
  return () => {
    if (!holders.delete(owner)) return;
    if (holders.size === 0) apply(false);
  };
}

// A web wake lock is dropped when the page is hidden; take it again on return.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && holders.size && !Capacitor.isNativePlatform()) apply(true);
  });
}
