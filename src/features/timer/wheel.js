// Scroll-snap number wheel (e.g. hours 0–99, minutes 0–59). Keyboard: arrow keys change the value.

const ITEM_H = 48;

export function createWheel(host, { max, value = 0, label }) {
  const wrap = document.createElement('div');
  wrap.className = 'wheel';
  wrap.tabIndex = 0;
  wrap.setAttribute('role', 'spinbutton');
  wrap.setAttribute('aria-label', label);
  wrap.setAttribute('aria-valuemin', '0');
  wrap.setAttribute('aria-valuemax', String(max));
  const items = Array.from({ length: max + 1 }, (_, i) => `<div class="wheel-item digits">${String(i).padStart(2, '0')}</div>`);
  wrap.innerHTML = `<div class="wheel-pad"></div>${items.join('')}<div class="wheel-pad"></div>`;
  const caption = document.createElement('span');
  caption.className = 'wheel-caption';
  caption.textContent = label;
  host.append(wrap, caption);

  let current = value;
  const clamp = (v) => Math.min(max, Math.max(0, v));

  function set(v, smooth = false) {
    current = clamp(v);
    wrap.setAttribute('aria-valuenow', String(current));
    wrap.scrollTo({ top: current * ITEM_H, behavior: smooth ? 'smooth' : 'instant' });
  }

  let t = null;
  wrap.addEventListener('scroll', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      current = clamp(Math.round(wrap.scrollTop / ITEM_H));
      wrap.setAttribute('aria-valuenow', String(current));
    }, 80);
  });
  wrap.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') set(current - 1, true);
    else if (e.key === 'ArrowDown') set(current + 1, true);
    else return;
    e.preventDefault();
  });
  wrap.addEventListener('click', (e) => {
    const item = e.target.closest('.wheel-item');
    if (item) set(Number(item.textContent), true);
  });

  requestAnimationFrame(() => set(value));
  return {
    get value() {
      return current;
    },
    set,
  };
}
