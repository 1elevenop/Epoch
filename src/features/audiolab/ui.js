// Small shared pieces for Audio Lab screens.

import { esc } from '../../core/dom.js';
import { DEFAULT_VOLUME } from './dsp.js';

export const header = (title, sub = '') => `
  <a class="back-link" href="#/audio" aria-label="Back to Audio Lab">‹ Audio Lab</a>
  <h1 id="screen-title">${esc(title)}</h1>${sub ? `<p class="muted">${sub}</p>` : ''}`;

export const volumeField = (id = 'vol', value = DEFAULT_VOLUME, label = 'Volume') => `
  <label class="field">${esc(label)} <output id="${id}-out">${Math.round(value * 100)} %</output>
    <input type="range" id="${id}" min="0" max="1" step="0.01" value="${value}" aria-label="${esc(label)}" /></label>`;

/** Segmented control. options: [[value, label]]. */
export const seg = (name, options, current, label) => `
  <div class="seg" role="tablist" aria-label="${esc(label)}" data-seg="${name}">
    ${options.map(([v, l]) => `<button type="button" class="seg-btn" role="tab" data-v="${esc(v)}" aria-selected="${String(v) === String(current)}">${esc(l)}</button>`).join('')}
  </div>`;

/** Wires a segmented control; calls onPick(value) and updates the selection. */
export function bindSeg(root, name, onPick) {
  const box = root.querySelector(`[data-seg="${name}"]`);
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    for (const x of box.querySelectorAll('[data-v]')) x.setAttribute('aria-selected', String(x === b));
    onPick(b.dataset.v);
  });
}

/** Wires a volume slider; returns a getter. */
export function bindVolume(root, id, onChange) {
  const input = root.querySelector(`#${id}`);
  const out = root.querySelector(`#${id}-out`);
  input.addEventListener('input', () => {
    out.textContent = `${Math.round(input.value * 100)} %`;
    onChange(Number(input.value));
  });
  return () => Number(input.value);
}
