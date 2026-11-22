// Renders a time string into one slot per character and animates only the characters that change.
// Non-digits (":", ".", "−") never animate. Fast slots (stopwatch hundredths) use a light swap.

import { TRANSITIONS, transitionById } from './transitions/index.js';

export const isDigit = (c) => c >= '0' && c <= '9';

/** Positions whose character changed; `rebuild` when the length (layout) changed. Pure — unit tested. */
export function diff(prev, next) {
  if (prev == null || prev.length !== next.length) return { rebuild: true, changed: [] };
  const changed = [];
  for (let i = 0; i < next.length; i++) if (prev[i] !== next[i]) changed.push({ i, from: prev[i], to: next[i] });
  return { rebuild: false, changed };
}

const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/**
 * createDigits(host, transitionId) → { update(text, { fastFrom }), setTransition(id), destroy() }
 * fastFrom: index of the first "fast" character (e.g. hundredths), or Infinity.
 */
export function createDigits(host, transitionId) {
  let tr = transitionById(transitionId);
  let text = null;
  let slots = [];
  host.classList.add('bd-digits', 'digits');

  function build(next) {
    host.innerHTML = '';
    host.dataset.transition = tr.id;
    slots = [...next].map((ch) => {
      const slot = document.createElement('span');
      slot.className = isDigit(ch) ? 'bd-slot' : 'bd-sep';
      host.append(slot);
      if (isDigit(ch)) tr.set(slot, ch);
      else slot.textContent = ch;
      return slot;
    });
  }

  return {
    update(next, { fastFrom = Infinity } = {}) {
      const d = diff(text, next);
      if (d.rebuild) build(next);
      for (const { i, from, to } of d.changed) {
        const slot = slots[i];
        if (!isDigit(to) || !isDigit(from)) {
          build(next);
          break;
        }
        if (reducedMotion() || i >= fastFrom) tr.set(slot, to, { fast: true });
        else tr.change(slot, from, to);
      }
      text = next;
    },
    setTransition(id) {
      tr = transitionById(id);
      const t = text;
      text = null;
      if (t != null) this.update(t);
    },
    destroy() {
      host.innerHTML = '';
      slots = [];
    },
  };
}

export { TRANSITIONS };
