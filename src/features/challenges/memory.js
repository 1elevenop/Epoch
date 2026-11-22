// Repeat a tile pattern (BLUEPRINT §5.3): 3×3 grid up to length 6, then 4×4; length 4 → 8.

export const patternLength = (level) => [4, 5, 6, 8][Math.min(4, Math.max(1, level)) - 1];
export const gridSize = (len) => (len > 6 ? 4 : 3);

export function pattern(level, r) {
  const len = patternLength(level);
  const cells = gridSize(len) ** 2;
  const out = [];
  while (out.length < len) {
    const c = r.int(0, cells - 1);
    if (c !== out[out.length - 1]) out.push(c); // no immediate repeats (hard to see)
  }
  return out;
}

export function mount(host, { level, r, onDone, onFail }) {
  let seq = [];
  let pos = 0;
  let showing = false;
  let timers = [];
  const size = gridSize(patternLength(level));
  host.innerHTML = `
    <p class="ch-hint" aria-live="polite"></p>
    <div class="mem-grid" style="grid-template-columns:repeat(${size},1fr)" role="group" aria-label="Pattern tiles">
      ${Array.from({ length: size * size }, (_, i) => `<button class="mem-tile" data-i="${i}" aria-label="Tile ${i + 1}"></button>`).join('')}
    </div>
    <button class="btn btn-ghost" data-act="replay" aria-label="Show pattern again">Show again</button>`;
  const hint = host.querySelector('.ch-hint');
  const tiles = [...host.querySelectorAll('.mem-tile')];

  function play(newPattern) {
    timers.forEach(clearTimeout);
    timers = [];
    if (newPattern) seq = pattern(level, r);
    pos = 0;
    showing = true;
    hint.textContent = `Watch ${seq.length} tiles…`;
    seq.forEach((c, i) => {
      timers.push(setTimeout(() => tiles[c].classList.add('lit'), 700 * i + 400));
      timers.push(setTimeout(() => tiles[c].classList.remove('lit'), 700 * i + 900));
    });
    timers.push(
      setTimeout(() => {
        showing = false;
        hint.textContent = 'Now tap the same tiles in order';
      }, 700 * seq.length + 500),
    );
  }

  host.querySelector('.mem-grid').addEventListener('click', (e) => {
    const t = e.target.closest('[data-i]');
    if (!t || showing) return;
    const i = Number(t.dataset.i);
    t.classList.add('tap');
    setTimeout(() => t.classList.remove('tap'), 150);
    if (i === seq[pos]) {
      pos += 1;
      if (pos === seq.length) onDone();
    } else {
      onFail();
      hint.textContent = 'Wrong tile — new pattern';
      setTimeout(() => play(true), 700);
    }
  });
  host.querySelector('[data-act=replay]').addEventListener('click', () => !showing && play(false));
  play(true);
  return () => timers.forEach(clearTimeout);
}
