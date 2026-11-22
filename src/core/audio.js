// One shared AudioContext. Browsers only allow sound after a user gesture, so unlock()
// is called from button taps (e.g. starting a timer) before any sound is needed.

let ctx = null;

export function getCtx() {
  if (!ctx) {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

export function unlock() {
  const c = getCtx();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

export function beepAt(c, at, freq = 880, dur = 0.12, gain = 0.25) {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.01); // short fades avoid clicks
  g.gain.setValueAtTime(gain, at + dur - 0.02);
  g.gain.linearRampToValueAtTime(0, at + dur);
  osc.connect(g).connect(c.destination);
  osc.start(at);
  osc.stop(at + dur + 0.01);
}

/**
 * Repeating "beep-beep-beep" until the returned stop() is called.
 * Uses look-ahead scheduling on the audio clock, not setInterval timing.
 */
export function startAlertLoop() {
  const c = getCtx();
  if (!c) return () => {};
  unlock();
  const PERIOD = 1.2;
  let next = c.currentTime + 0.05;
  const pump = () => {
    while (next < c.currentTime + 0.5) {
      for (let i = 0; i < 3; i++) beepAt(c, next + i * 0.18);
      next += PERIOD;
    }
  };
  pump();
  const id = setInterval(pump, 100);
  return () => clearInterval(id);
}
