// Hologram scan, Particle burst, Liquid morph, 7-segment LED.

const el = (cls, text = '') => {
  const s = document.createElement('span');
  s.className = cls;
  s.textContent = text;
  return s;
};
const reset = (slot) => {
  clearTimeout(slot._t);
  cancelAnimationFrame(slot._raf);
  slot.replaceChildren();
};

export const holo = {
  id: 'holo',
  name: 'Hologram scan',
  set(slot, ch) {
    reset(slot);
    slot.append(el('ho-txt', ch));
  },
  change(slot, from, to) {
    reset(slot);
    slot.append(el('ho-txt ho-old', from), el('ho-txt ho-new', to), el('ho-beam'));
    slot._t = setTimeout(() => this.set(slot, to), 560);
  },
};

// ---------- particle burst (canvas) ----------
function sample(ch, w, h, font, step) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff';
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(ch, w / 2, h / 2);
  const data = g.getImageData(0, 0, w, h).data;
  const pts = [];
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) if (data[(y * w + x) * 4 + 3] > 128) pts.push([x, y]);
  return pts;
}

export const particles = {
  id: 'particles',
  name: 'Particle burst',
  set(slot, ch) {
    reset(slot);
    slot.append(el('pa-txt', ch));
  },
  change(slot, from, to) {
    reset(slot);
    const rect = slot.getBoundingClientRect();
    const w = Math.max(20, Math.round(rect.width));
    const h = Math.max(20, Math.round(rect.height));
    const cs = getComputedStyle(slot);
    const font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const step = Math.max(3, Math.round(w / 26));
    const a = sample(from, w, h, font, step);
    const b = sample(to, w, h, font, step);
    const n = Math.min(160, Math.max(a.length, b.length));
    if (!n) return this.set(slot, to);
    const pick = (arr, i) => arr[Math.floor((i / n) * arr.length)] ?? [w / 2, h / 2];
    const ps = Array.from({ length: n }, (_, i) => {
      const s = pick(a, i);
      const e = pick(b, i);
      const ang = Math.random() * Math.PI * 2;
      const r = (0.4 + Math.random() * 0.6) * w;
      return { s, e, m: [w / 2 + Math.cos(ang) * r, h / 2 + Math.sin(ang) * r * 0.6] };
    });
    const canvas = document.createElement('canvas');
    canvas.className = 'pa-canvas';
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    slot.append(canvas);
    const g = canvas.getContext('2d');
    g.scale(dpr, dpr);
    const color = cs.color;
    const start = performance.now();
    const DUR = 620;
    const ease = (t) => 1 - (1 - t) ** 3;
    const frame = (now) => {
      const t = Math.min(1, (now - start) / DUR);
      g.clearRect(0, 0, w, h);
      g.fillStyle = color;
      g.shadowColor = color;
      g.shadowBlur = 6;
      for (const p of ps) {
        // out to a swirl point, then in to the new digit (quadratic curve)
        const u = ease(t);
        const x = (1 - u) ** 2 * p.s[0] + 2 * (1 - u) * u * p.m[0] + u * u * p.e[0];
        const y = (1 - u) ** 2 * p.s[1] + 2 * (1 - u) * u * p.m[1] + u * u * p.e[1];
        g.fillRect(x, y, step * 0.8, step * 0.8);
      }
      if (t < 1 && !document.hidden) slot._raf = requestAnimationFrame(frame);
      else this.set(slot, to);
    };
    slot._raf = requestAnimationFrame(frame);
  },
};

// ---------- liquid morph (SVG gooey filter; blur scales with the digit size) ----------
function gooFor(px) {
  const std = Math.max(2, Math.round(px * 0.06));
  const id = `bd-goo-${std}`;
  if (document.getElementById(id)) return id;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  const filter = document.createElementNS(ns, 'filter');
  filter.id = id;
  const blur = document.createElementNS(ns, 'feGaussianBlur');
  blur.setAttribute('in', 'SourceGraphic');
  blur.setAttribute('stdDeviation', String(std));
  blur.setAttribute('result', 'b');
  const cm = document.createElementNS(ns, 'feColorMatrix');
  cm.setAttribute('in', 'b');
  cm.setAttribute('mode', 'matrix');
  cm.setAttribute('values', '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9');
  filter.append(blur, cm);
  svg.append(filter);
  document.body.append(svg);
  return id;
}

export const liquid = {
  id: 'liquid',
  name: 'Liquid morph',
  set(slot, ch) {
    reset(slot);
    slot.style.filter = '';
    slot.append(el('lq-txt', ch));
  },
  change(slot, from, to) {
    reset(slot);
    slot.style.filter = `url(#${gooFor(parseFloat(getComputedStyle(slot).fontSize) || 40)})`;
    slot.append(el('lq-txt lq-old', from), el('lq-txt lq-new', to));
    slot._t = setTimeout(() => this.set(slot, to), 700);
  },
};

// ---------- 7-segment LED ----------
export const SEGMENTS = {
  0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
};

export const segment = {
  id: 'segment',
  name: '7-segment LED',
  set(slot, ch, { fast = false } = {}) {
    if (!slot.querySelector('.sg-a')) {
      reset(slot);
      const box = el('sg-box');
      for (const s of 'abcdefg') box.append(el(`sg sg-${s}`));
      box.append(el('sg-sr', ''));
      slot.append(box);
    }
    const on = SEGMENTS[ch] ?? '';
    slot.querySelectorAll('.sg').forEach((seg, i) => {
      const name = 'abcdefg'[i];
      seg.style.transitionDelay = fast ? '0ms' : `${i * 30}ms`;
      seg.classList.toggle('on', on.includes(name));
    });
    slot.querySelector('.sg-sr').textContent = ch; // screen readers
  },
  change(slot, from, to) {
    this.set(slot, to);
  },
};
