// Walk N steps (BLUEPRINT §5.3): 20 / 40 / 80. Native step-detector sensor via AlarmPlugin.

import { AlarmPlugin } from '../../core/bridge.js';

export const stepCount = (level) => [20, 40, 80, 80][Math.min(4, Math.max(1, level)) - 1];

export function mount(host, { level, onDone, onUnavailable }) {
  const need = stepCount(level);
  let count = 0;
  let listener = null;
  let stopped = false;
  host.innerHTML = `
    <p class="ch-hint">Get up and walk</p>
    <p class="ch-big digits" aria-live="polite">0 / ${need}</p>
    <div class="bar"><div class="bar-fill"></div></div>`;
  const big = host.querySelector('.ch-big');
  const fill = host.querySelector('.bar-fill');

  function step() {
    if (stopped) return;
    count += 1;
    big.textContent = `${Math.min(count, need)} / ${need}`;
    fill.style.width = `${(100 * Math.min(count, need)) / need}%`;
    if (count >= need) {
      cleanup();
      onDone();
    }
  }

  function cleanup() {
    stopped = true;
    listener?.remove();
    AlarmPlugin.stopSteps?.().catch(() => {});
  }

  (async () => {
    try {
      listener = await AlarmPlugin.addListener('step', step);
      await AlarmPlugin.startSteps();
    } catch (err) {
      onUnavailable(err.message || 'Step sensor unavailable');
    }
  })();
  return cleanup;
}
