// Register the QR code for the qr challenge: create a new printable code, or scan any code you own.

import qrcode from 'qrcode-generator';
import { scanOnce } from '../challenges/qr.js';
import { esc } from '../../core/dom.js';

export function newPayload() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `EPOCH-${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export function qrSvg(payload) {
  const qr = qrcode(0, 'M');
  qr.addData(payload);
  qr.make();
  return qr.createSvgTag({ cellSize: 8, margin: 4, scalable: true });
}

/** Opens a sheet; resolves with the registered payload, or null if cancelled. */
export function openQrSetup(current) {
  return new Promise((resolve) => {
    const sheet = document.createElement('div');
    sheet.className = 'sheet qr-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', 'QR code for the alarm');
    let payload = current || null;

    function draw() {
      sheet.innerHTML = `
        <div class="sheet-head">
          <button class="btn btn-ghost" data-act="cancel" aria-label="Cancel">Cancel</button>
          <h2 class="sheet-title">Wake-up QR code</h2>
          <button class="btn" data-act="done" aria-label="Use this code" ${payload ? '' : 'disabled'}>Use</button>
        </div>
        <p class="muted">Stick the code somewhere you must walk to (bathroom, kitchen). The alarm stops only when you scan it.</p>
        <div class="qr-box">${payload ? qrSvg(payload) : '<p class="sub">No code yet.</p>'}</div>
        ${payload ? `<p class="muted center">Code: ${esc(payload)}<br>Take a screenshot and print it, or show it on another screen.</p>` : ''}
        <button class="btn btn-secondary" data-act="new" aria-label="Create a new code">Create new code</button>
        <button class="btn btn-secondary" data-act="scan" aria-label="Use an existing barcode or QR code">Use an existing code (scan it)</button>
        <button class="btn btn-ghost" data-act="test" aria-label="Test scan" ${payload ? '' : 'disabled'}>Test: scan it now</button>
        <p class="form-error" role="alert"></p>`;
    }

    const close = (value) => {
      sheet.remove();
      resolve(value);
    };
    sheet.addEventListener('click', async (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      const errEl = sheet.querySelector('.form-error');
      try {
        if (act === 'cancel') close(null);
        if (act === 'done') close(payload);
        if (act === 'new') {
          payload = newPayload();
          draw();
        }
        if (act === 'scan') {
          const v = await scanOnce();
          if (v) {
            payload = v;
            draw();
          }
        }
        if (act === 'test') {
          const v = await scanOnce();
          errEl.textContent = v == null ? 'Cancelled' : v === payload ? 'That code works' : 'Different code — that one would be rejected';
        }
      } catch (err) {
        errEl.textContent = err.message;
      }
    });
    draw();
    document.body.append(sheet);
  });
}
