// Landscape "big display": full-screen digits with the chosen transition (Phase 5a).
// Screens register a source; rotating to landscape (or tapping ⤢) opens it. Time is always computed
// from timestamps by the source (D7); the ticker only decides when to redraw.

import { subscribe } from '../../core/ticker.js';
import { keepAwake } from '../../core/screen.js';
import { getSettings } from '../../core/store.js';
import { AlarmPlugin } from '../../core/bridge.js';
import { esc } from '../../core/dom.js';
import { createDigits } from './digits.js';
import { ic } from '../../core/icons.js';

let source = null; // { kind, read(now) → { text, label, progress, over, fastFrom } }
let open = null;
const landscape = globalThis.matchMedia?.('(orientation: landscape)');

/** Called by Timer / Stopwatch / Focus screens; null when they unmount. */
export function setBigSource(src) {
  source = src;
  if (!src) close();
  else if (landscape?.matches && !open) openBig('rotate');
}

export const bigButton = (label = 'Big display') =>
  `<button class="icon-btn bd-open-btn" data-big aria-label="${esc(label)}" title="${esc(label)}">⤢</button>`;

export function openBig(reason = 'button') {
  if (!source || open) return;
  const kind = source.kind;
  const transition = getSettings().bigTransition?.[kind] ?? 'flip';
  const el = document.createElement('div');
  el.className = 'bd-overlay';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Big display');
  el.innerHTML = `
    <p class="bd-label"></p>
    <div class="bd-digits-host" role="timer" aria-live="off"></div>
    <div class="bd-progress"><div class="bd-progress-fill"></div></div>
    <button class="icon-btn bd-close" aria-label="Close big display">${ic('close')}</button>`;
  document.body.append(el);
  document.body.classList.add('bd-open');
  const digits = createDigits(el.querySelector('.bd-digits-host'), transition);
  const label = el.querySelector('.bd-label');
  const fill = el.querySelector('.bd-progress-fill');
  const bar = el.querySelector('.bd-progress');
  const release = keepAwake('bigdisplay');
  AlarmPlugin.setImmersive?.(true).catch(() => {});

  const host = el.querySelector('.bd-digits-host');
  let lastLen = -1;
  // Shrink the digits when the text is wider than the screen (e.g. 8-char stopwatch in a wide font).
  const fit = () => {
    host.style.fontSize = '';
    const max = el.clientWidth * 0.94;
    if (host.scrollWidth > max) host.style.fontSize = `${(parseFloat(getComputedStyle(host).fontSize) * max) / host.scrollWidth}px`;
  };
  const onResize = () => fit();
  window.addEventListener('resize', onResize);

  const draw = (now) => {
    if (!source) return close();
    const v = source.read(now);
    digits.update(v.text, { fastFrom: v.fastFrom ?? Infinity });
    if (v.text.length !== lastLen) {
      lastLen = v.text.length;
      fit();
    }
    label.textContent = v.label ?? '';
    el.classList.toggle('over', !!v.over);
    bar.hidden = v.progress == null;
    if (v.progress != null) fill.style.transform = `scaleX(${Math.min(1, Math.max(0, v.progress))})`;
  };
  const unsub = subscribe(draw, { fps: kind === 'stopwatch' ? 30 : 8 });
  el.querySelector('.bd-close').addEventListener('click', () => close());
  open = { el, reason, unsub, release, digits, onResize };
}

export function close() {
  if (!open) return;
  const o = open;
  open = null;
  o.unsub();
  o.release();
  window.removeEventListener('resize', o.onResize);
  o.digits.destroy();
  o.el.remove();
  document.body.classList.remove('bd-open');
  AlarmPlugin.setImmersive?.(false).catch(() => {});
}

export const isBigOpen = () => !!open;

export function installBigDisplay() {
  landscape?.addEventListener('change', (e) => {
    if (e.matches) openBig('rotate');
    else if (open?.reason === 'rotate') close();
  });
  // (screens call setBigSource(null) when they unmount, which closes the display)
  // ⤢ buttons anywhere in the app
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-big]')) openBig('button');
  });
}
