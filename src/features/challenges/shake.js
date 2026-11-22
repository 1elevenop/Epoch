// Shake N times (BLUEPRINT §5.3): 20 / 40 / 60 / 90. Uses the browser devicemotion event
// (same data @capacitor/motion would give, without a new dependency). Debounce 250 ms.

export const shakeCount = (level) => [20, 40, 60, 90][Math.min(4, Math.max(1, level)) - 1];
export const THRESHOLD = 14; // m/s² of movement beyond gravity
export const DEBOUNCE_MS = 250;

/** Counts one shake when movement passes the threshold, at most once per DEBOUNCE_MS. */
export function createShakeCounter() {
  let last = -Infinity;
  return (magnitude, t) => {
    if (magnitude < THRESHOLD || t - last < DEBOUNCE_MS) return false;
    last = t;
    return true;
  };
}

export function mount(host, { level, onDone, onUnavailable }) {
  const need = shakeCount(level);
  let count = 0;
  let gotEvent = false;
  const counter = createShakeCounter();
  host.innerHTML = `
    <p class="ch-hint">Shake the phone hard</p>
    <p class="ch-big digits" aria-live="polite">0 / ${need}</p>
    <div class="bar"><div class="bar-fill"></div></div>`;
  const big = host.querySelector('.ch-big');
  const fill = host.querySelector('.bar-fill');

  function onMotion(e) {
    gotEvent = true;
    const a = e.acceleration;
    let m;
    if (a && a.x != null) m = Math.hypot(a.x, a.y, a.z);
    else {
      const g = e.accelerationIncludingGravity || {};
      m = Math.abs(Math.hypot(g.x || 0, g.y || 0, g.z || 0) - 9.81);
    }
    if (!counter(m, performance.now())) return;
    count += 1;
    big.textContent = `${count} / ${need}`;
    fill.style.width = `${(100 * count) / need}%`;
    navigator.vibrate?.(15);
    if (count >= need) {
      window.removeEventListener('devicemotion', onMotion);
      onDone();
    }
  }
  window.addEventListener('devicemotion', onMotion);
  const check = setTimeout(() => !gotEvent && onUnavailable('No motion sensor data'), 4000);
  return () => {
    clearTimeout(check);
    window.removeEventListener('devicemotion', onMotion);
  };
}
