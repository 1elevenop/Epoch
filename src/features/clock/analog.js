// Analog face (SVG). Hand angles are computed from the timestamp every frame.

function ticks() {
  let out = '';
  for (let i = 0; i < 60; i++) {
    const major = i % 5 === 0;
    out += `<line x1="100" y1="${major ? 12 : 14}" x2="100" y2="${major ? 26 : 20}"
      transform="rotate(${i * 6} 100 100)" class="${major ? 'tick-major' : 'tick'}"/>`;
  }
  return out;
}

export function createAnalog(host) {
  host.innerHTML = `
    <svg class="analog" viewBox="0 0 200 200" role="img" aria-label="Analog clock">
      <circle cx="100" cy="100" r="96" class="face"/>
      ${ticks()}
      <line id="h-hand" x1="100" y1="108" x2="100" y2="56" class="hand-h"/>
      <line id="m-hand" x1="100" y1="112" x2="100" y2="30" class="hand-m"/>
      <line id="s-hand" x1="100" y1="118" x2="100" y2="22" class="hand-s"/>
      <circle cx="100" cy="100" r="4" class="hub"/>
    </svg>`;
  const svg = host.querySelector('svg');
  const hH = svg.querySelector('#h-hand');
  const mH = svg.querySelector('#m-hand');
  const sH = svg.querySelector('#s-hand');
  let lastLabel = -1;

  return function update(t) {
    const d = new Date(t);
    const s = d.getSeconds() + d.getMilliseconds() / 1000;
    const m = d.getMinutes() + s / 60;
    const h = (d.getHours() % 12) + m / 60;
    sH.setAttribute('transform', `rotate(${s * 6} 100 100)`);
    mH.setAttribute('transform', `rotate(${m * 6} 100 100)`);
    hH.setAttribute('transform', `rotate(${h * 30} 100 100)`);
    if (d.getMinutes() !== lastLabel) {
      lastLabel = d.getMinutes();
      svg.setAttribute('aria-label', `Analog clock, ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
    }
  };
}
