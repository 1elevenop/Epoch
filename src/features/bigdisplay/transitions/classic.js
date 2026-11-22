// Flip clock, Glitch, Odometer roll, Matrix scramble, Nixie tube.
// Each: set(slot, ch) draws instantly; change(slot, from, to) animates. Styles in styles/transitions.css.

const el = (cls, text = '') => {
  const s = document.createElement('span');
  s.className = cls;
  s.textContent = text;
  return s;
};

/** Removes elements left over from an animation that was interrupted by the next change. */
const reset = (slot) => {
  clearTimeout(slot._t);
  clearInterval(slot._i);
  slot.replaceChildren();
};

export const flip = {
  id: 'flip',
  name: 'Flip clock',
  set(slot, ch) {
    reset(slot);
    slot.dataset.ch = ch;
    slot.append(el('fl-top', ch), el('fl-bot', ch));
  },
  change(slot, from, to) {
    reset(slot);
    slot.dataset.ch = to;
    // static: new top, old bottom; flaps: old top folds down, new bottom unfolds
    slot.append(el('fl-top', to), el('fl-bot', from), el('fl-top fl-flap-top', from), el('fl-bot fl-flap-bot', to));
    slot._t = setTimeout(() => this.set(slot, to), 640);
  },
};

export const glitch = {
  id: 'glitch',
  name: 'Glitch',
  set(slot, ch) {
    reset(slot);
    slot.dataset.ch = ch;
    slot.classList.remove('gl-on');
    slot.append(el('gl-txt', ch));
  },
  change(slot, from, to) {
    this.set(slot, to);
    void slot.offsetWidth; // restart the animation
    slot.classList.add('gl-on');
    slot._t = setTimeout(() => slot.classList.remove('gl-on'), 220);
  },
};

export const odometer = {
  id: 'odometer',
  name: 'Odometer roll',
  set(slot, ch) {
    reset(slot);
    slot.append(el('od-strip', ch));
  },
  change(slot, from, to) {
    reset(slot);
    const strip = el('od-strip od-roll');
    strip.append(el('od-cell', from), el('od-cell', to));
    slot.append(strip);
    slot._t = setTimeout(() => this.set(slot, to), 460);
  },
};

const GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺ0123456789ABCDEF<>#$%';
export const scramble = {
  id: 'scramble',
  name: 'Matrix scramble',
  set(slot, ch) {
    reset(slot);
    slot.classList.remove('sc-on');
    slot.append(el('sc-txt', ch));
  },
  change(slot, from, to) {
    reset(slot);
    const t = el('sc-txt');
    slot.append(t);
    slot.classList.add('sc-on');
    let n = 0;
    slot._i = setInterval(() => {
      n += 1;
      t.textContent = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      if (n >= 8) this.set(slot, to);
    }, 32);
  },
};

export const nixie = {
  id: 'nixie',
  name: 'Nixie tube',
  set(slot, ch) {
    reset(slot);
    slot.append(el('nx-ghost', '8'), el('nx-lit', ch));
  },
  change(slot, from, to) {
    reset(slot);
    slot.append(el('nx-ghost', '8'), el('nx-lit nx-out', from), el('nx-lit nx-in', to));
    slot._t = setTimeout(() => this.set(slot, to), 520);
  },
};
