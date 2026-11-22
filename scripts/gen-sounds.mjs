// Generates the 6 bundled alarm sounds (BLUEPRINT §16 default: generated tones) as 16-bit mono WAV
// into android/app/src/main/res/raw. Run: node scripts/gen-sounds.mjs
import { writeFileSync, mkdirSync } from 'node:fs';

const RATE = 22050;
const OUT = 'android/app/src/main/res/raw';

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(Math.max(-1, Math.min(1, s)) * 32767, i * 2));
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

/** Render a loop of `seconds` from a list of notes {t, f, d, type, amp}. */
function render(seconds, notes) {
  const out = new Float32Array(Math.round(seconds * RATE));
  for (const { t, f, d, type = 'sine', amp = 0.5, decay = 4 } of notes) {
    const s0 = Math.round(t * RATE);
    const n = Math.round(d * RATE);
    for (let i = 0; i < n && s0 + i < out.length; i++) {
      const x = i / RATE;
      const ph = 2 * Math.PI * (typeof f === 'function' ? f(x) : f * x);
      let v = Math.sin(ph);
      if (type === 'square') v = Math.sign(v) * 0.6;
      if (type === 'bell') v = Math.sin(ph) + 0.5 * Math.sin(2.76 * ph) + 0.25 * Math.sin(5.4 * ph);
      const attack = Math.min(1, x / 0.01);
      const release = Math.min(1, (d - x) / 0.02);
      out[s0 + i] += v * amp * attack * release * Math.exp(-decay * x);
    }
  }
  return out;
}

const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5, A4 = 440;
const sounds = {
  gentle_bells: render(3, [
    { t: 0, f: C5, d: 1.5, type: 'bell', amp: 0.3, decay: 2 },
    { t: 0.5, f: E5, d: 1.5, type: 'bell', amp: 0.3, decay: 2 },
    { t: 1, f: G5, d: 1.8, type: 'bell', amp: 0.3, decay: 2 },
  ]),
  gentle_rise: render(3, [{ t: 0, f: (x) => 300 * x + 150 * x * x, d: 2.4, amp: 0.5, decay: 0 }]),
  gentle_marimba: render(2, [C5, G5, E5, C6].map((f, i) => ({ t: i * 0.25, f, d: 0.5, amp: 0.55, decay: 9 }))),
  hard_classic: render(1, [0, 0.15, 0.3].map((t) => ({ t, f: 1000, d: 0.1, type: 'square', amp: 0.7, decay: 0 }))),
  hard_siren: render(2, [{ t: 0, f: (x) => 600 * x + (x < 1 ? 200 * x * x : 400 * x - 200 * x * x), d: 2, amp: 0.6, decay: 0 }]),
  hard_buzzer: render(1, [{ t: 0, f: A4 / 2, d: 0.6, type: 'square', amp: 0.7, decay: 0 }]),
};

mkdirSync(OUT, { recursive: true });
for (const [name, samples] of Object.entries(sounds)) writeFileSync(`${OUT}/${name}.wav`, wav(samples));
console.log(`wrote ${Object.keys(sounds).length} sounds to ${OUT}`);
