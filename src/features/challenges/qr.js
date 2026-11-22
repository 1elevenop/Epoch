// Scan the registered code (BLUEPRINT §5.3). Only that exact payload passes.
// The scanner screen cannot draw over the lock screen, so we ask to unlock first.

import { Capacitor } from '@capacitor/core';
import { AlarmPlugin } from '../../core/bridge.js';

const native = Capacitor.isNativePlatform();

/** Scans once and returns the raw payload, or null if cancelled. Browser: asks for the text. */
export async function scanOnce() {
  if (!native) return window.prompt('Browser preview: type the QR payload') ?? null;
  const { BarcodeScanner } = await import('@capacitor-mlkit/barcode-scanning');
  const perm = await BarcodeScanner.requestPermissions();
  if (perm.camera !== 'granted' && perm.camera !== 'limited') {
    throw Object.assign(new Error('Camera permission denied'), { code: 'CAMERA_DENIED' });
  }
  const { barcodes } = await BarcodeScanner.scan();
  return barcodes?.[0]?.rawValue ?? null;
}

export function mount(host, { qrPayload, onDone, onFail, onUnavailable }) {
  host.innerHTML = `
    <p class="ch-hint">Walk to your code and scan it.</p>
    <button class="btn btn-round" data-act="scan" aria-label="Open the scanner">Scan code</button>
    <p class="ch-status" role="alert"></p>`;
  const status = host.querySelector('.ch-status');
  if (!qrPayload) {
    setTimeout(() => onUnavailable('No QR code registered'), 0);
    return () => {};
  }
  host.querySelector('[data-act=scan]').addEventListener('click', async () => {
    status.textContent = '';
    try {
      if (native) {
        const { unlocked } = await AlarmPlugin.requestUnlock();
        if (!unlocked) {
          status.textContent = 'Unlock the phone to scan.';
          return;
        }
      }
      const value = await scanOnce();
      if (value == null) {
        status.textContent = 'Scan cancelled.';
        return;
      }
      if (value === qrPayload) return onDone();
      onFail();
      status.textContent = 'Wrong code. Scan the one you registered.';
    } catch (err) {
      onFail();
      status.textContent = err.code === 'CAMERA_DENIED' ? 'Camera permission is needed.' : `Scanner error: ${err.message}`;
      if (err.code === 'CAMERA_DENIED') onUnavailable('Camera permission denied');
    }
  });
  return () => {};
}
