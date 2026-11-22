// Type a random phrase exactly (BLUEPRINT §5.3): 4 / 6 / 9 / 12 words. Paste blocked, autocorrect off.

import { esc } from '../../core/dom.js';

const WORDS = (
  'apple river candle orange window garden yellow pencil rocket silver forest bottle ' +
  'mirror planet coffee jacket sunset bridge castle pillow thunder lemon violet marble ' +
  'anchor basket camera desert engine feather guitar harbor island jungle kettle ladder ' +
  'meadow needle orchard parrot quartz ribbon saddle tunnel umbrella velvet walnut zebra'
).split(' ');

export const wordCount = (level) => [4, 6, 9, 12][Math.min(4, Math.max(1, level)) - 1];

export function phrase(level, r) {
  return Array.from({ length: wordCount(level) }, () => r.pick(WORDS)).join(' ');
}

export function matches(typed, target) {
  return typed.trim().replace(/\s+/g, ' ') === target;
}

export function mount(host, { level, r, onDone, onFail }) {
  const target = phrase(level, r);
  host.innerHTML = `
    <p class="ch-hint">Type exactly:</p>
    <p class="ch-phrase">${esc(target)}</p>
    <textarea class="input ch-type" rows="3" aria-label="Type the phrase"
      autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" inputmode="text"></textarea>
    <p class="ch-status" role="alert"></p>
    <button class="btn" data-act="check" aria-label="Check phrase">Check</button>`;
  const box = host.querySelector('.ch-type');
  const status = host.querySelector('.ch-status');
  const block = (e) => {
    e.preventDefault();
    status.textContent = 'Pasting is blocked — type it.';
  };
  box.addEventListener('paste', block);
  box.addEventListener('drop', block);
  box.addEventListener('beforeinput', (e) => {
    if (e.inputType === 'insertFromPaste' || e.inputType === 'insertFromDrop') block(e);
  });
  host.querySelector('[data-act=check]').addEventListener('click', () => {
    if (matches(box.value, target)) return onDone();
    onFail();
    status.textContent = 'Not exact yet — check each word.';
  });
  box.focus();
  return () => {};
}
