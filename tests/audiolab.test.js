import { describe, it, expect } from 'vitest';
import * as D from '../src/features/audiolab/dsp.js';

describe('notes', () => {
  it('maps frequencies to notes and cents', () => {
    expect(D.noteFromFreq(440)).toMatchObject({ name: 'A', octave: 4, cents: 0 });
    expect(D.noteFromFreq(261.63)).toMatchObject({ name: 'C', octave: 4, cents: 0 });
    expect(D.noteFromFreq(445).cents).toBe(20);
    expect(D.noteFromFreq(432, 432)).toMatchObject({ name: 'A', cents: 0 });
    expect(D.noteFromFreq(0)).toBeNull();
    expect(D.freqFromMidi(81)).toBeCloseTo(880, 6);
  });
  it('log slider covers 20 Hz – 20 kHz and round-trips', () => {
    expect(D.posToFreq(0)).toBe(20);
    expect(D.posToFreq(1)).toBeCloseTo(20000, 6);
    expect(D.posToFreq(D.freqToPos(1000))).toBeCloseTo(1000, 6);
  });
  it('sweeps linearly and logarithmically', () => {
    expect(D.sweepFreq(100, 1000, 10, 5, 'lin')).toBe(550);
    expect(D.sweepFreq(100, 10000, 10, 5, 'log')).toBeCloseTo(1000, 6);
  });
});

describe('hearing safety', () => {
  it('warns on high frequency + high volume and caps the gain', () => {
    expect(D.safetyWarning(12000, 0.6)).toMatch(/hearing/);
    expect(D.safetyWarning(1000, 0.3)).toBe('');
    expect(D.safetyWarning(1000, 0.9)).toMatch(/Loud/);
    expect(D.volumeToGain(5)).toBe(0.5);
    expect(D.volumeToGain(D.DEFAULT_VOLUME)).toBeCloseTo(0.045, 6);
  });
});

describe('metronome', () => {
  it('accents beat 1, marks group starts and subdivisions', () => {
    const lv = (sig, sub, n) => Array.from({ length: n }, (_, i) => D.clickLevel(i, sig, sub));
    expect(lv('4/4', 1, 5)).toEqual(['accent', 'beat', 'beat', 'beat', 'accent']);
    expect(lv('6/8', 1, 6)).toEqual(['accent', 'beat', 'beat', 'mid', 'beat', 'beat']);
    expect(lv('3/4', 3, 4)).toEqual(['accent', 'sub', 'sub', 'beat']);
  });

  it('jitter: ticks land exactly on the grid however irregular the scheduling loop is', () => {
    const bpm = 137;
    const clock = D.createClock({ bpm, sig: '4/4', subdiv: 4, startAt: 1 });
    const period = 60 / bpm / 4;
    const ticks = [];
    let now = 0;
    const r = D.rng(3);
    while (now < 600) {
      ticks.push(...clock.pump(now));
      now += 0.005 + r() * 0.08; // 25 ms loop with heavy timer jitter
    }
    ticks.forEach((t, i) => expect(t.n).toBe(i));
    const maxErr = Math.max(...ticks.map((t, i) => Math.abs(t.time - (1 + i * period))));
    expect(maxErr).toBeLessThan(0.000002); // < 2 µs, far below the 2 ms target
    // look-ahead: nothing scheduled in the past
    expect(ticks.length).toBeGreaterThan(5000);
  });

  it('tempo change keeps the next tick in place and restarts the bar on a new signature', () => {
    const c = D.createClock({ bpm: 60, sig: '4/4', subdiv: 1, startAt: 0 });
    expect(c.pump(1.95).map((t) => t.time)).toEqual([0, 1, 2]);
    c.set({ bpm: 120 });
    expect(c.pump(3.95).map((t) => t.time)).toEqual([3, 3.5, 4]);
    c.set({ sig: '3/4' });
    const after = c.pump(5.0);
    expect(after[0]).toMatchObject({ time: 4.5, level: 'accent' });
  });

  it('tap tempo averages the last 4 taps and restarts after a pause', () => {
    expect(D.tapTempo([0])).toBeNull();
    expect(D.tapTempo([0, 500, 1000, 1500])).toBe(120);
    expect(D.tapTempo([0, 100, 200, 300, 800, 1300, 1800])).toBe(120); // only last 4 count
    expect(D.tapTempo([0, 500, 5000, 5600])).toBe(100); // 4.5 s gap → start over
    expect(D.tapTempo([0, 50])).toBe(300); // clamped
  });
});

describe('noise', () => {
  it('generates normalised, loopable buffers with the right spectral tilt', () => {
    const n = 48000;
    const zeroCross = (b) => b.reduce((acc, v, i) => acc + (i && Math.sign(v) !== Math.sign(b[i - 1]) ? 1 : 0), 0);
    const bufs = Object.fromEntries(D.NOISE_KINDS.map((k) => [k, D.fillNoise(new Float32Array(n), k)]));
    for (const b of Object.values(bufs)) expect(Math.max(...b.map(Math.abs))).toBeCloseTo(0.9, 5);
    // brown noise is smooth: the loop seam must be no bigger than an ordinary step
    const steps = bufs.brown.map((v, i) => (i ? Math.abs(v - bufs.brown[i - 1]) : 0));
    expect(Math.abs(bufs.brown[n - 1] - bufs.brown[0])).toBeLessThanOrEqual(Math.max(...steps));
    // more low-frequency energy → fewer zero crossings
    expect(zeroCross(bufs.white)).toBeGreaterThan(zeroCross(bufs.pink));
    expect(zeroCross(bufs.pink)).toBeGreaterThan(zeroCross(bufs.brown));
  });
});

describe('tuner pitch detection', () => {
  const sr = 44100;
  const tone = (f, harmonics = [1]) => {
    const b = new Float32Array(2048);
    for (let i = 0; i < b.length; i++) b[i] = harmonics.reduce((s, a, h) => s + a * Math.sin((2 * Math.PI * f * (h + 1) * i) / sr), 0) * 0.3;
    return b;
  };
  it('finds the fundamental within 3 cents, also with strong harmonics', () => {
    for (const f of [82.41, 110, 196, 440, 659.25, 1046.5]) {
      const got = D.detectPitch(tone(f, [1, 0.8, 0.5, 0.3]), sr);
      expect(Math.abs(1200 * Math.log2(got / f))).toBeLessThan(3);
    }
  });
  it('returns null for silence and noise', () => {
    expect(D.detectPitch(new Float32Array(2048), sr)).toBeNull();
    const noise = D.fillNoise(new Float32Array(2048), 'white');
    expect(D.detectPitch(noise, sr)).toBeNull();
    expect(D.median([3, 1, 2])).toBe(2);
  });
  it('smoothing ignores a lone octave error but follows a real octave change', () => {
    const r = [];
    for (const f of [196, 196.2, 195.8]) D.smoothPitch(r, f);
    expect(D.smoothPitch(r, 98.1)).toBeCloseTo(196, 0); // octave error dropped
    let hz;
    for (let i = 0; i < 8; i++) hz = D.smoothPitch(r, 98);
    expect(hz).toBe(98); // a held lower octave takes over
  });
});
