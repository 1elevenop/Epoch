// Pure Audio Lab math (no Web Audio here, so it is unit-testable): notes, sliders,
// metronome pattern + clock, tap tempo, noise generators, pitch detection, safety.

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ---------- notes ----------
export const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

/** MIDI note number → frequency. A4 = midi 69. */
export const freqFromMidi = (midi, a4 = 440) => a4 * 2 ** ((midi - 69) / 12);

/** Frequency → nearest note, its name and how many cents off (-50..+50). */
export function noteFromFreq(freq, a4 = 440) {
  if (!(freq > 0)) return null;
  const exact = 69 + 12 * Math.log2(freq / a4);
  const midi = Math.round(exact);
  return {
    midi,
    name: NOTE_NAMES[((midi % 12) + 12) % 12],
    octave: Math.floor(midi / 12) - 1,
    cents: Math.round((exact - midi) * 100),
  };
}

// ---------- log slider (20 Hz – 20 kHz) ----------
export const F_MIN = 20;
export const F_MAX = 20000;
export const posToFreq = (p) => F_MIN * (F_MAX / F_MIN) ** clamp(p, 0, 1);
export const freqToPos = (f) => Math.log(clamp(f, F_MIN, F_MAX) / F_MIN) / Math.log(F_MAX / F_MIN);

/** Sweep frequency at time t (s) of a sweep lasting dur s. */
export function sweepFreq(start, end, dur, t, mode = 'log') {
  const k = clamp(t / dur, 0, 1);
  return mode === 'log' ? start * (end / start) ** k : start + (end - start) * k;
}

// ---------- hearing safety (BLUEPRINT §6.6) ----------
export const DEFAULT_VOLUME = 0.3;
/** Volume 0..1 → gain. Squared for a natural feel, capped well below clipping; a limiter follows. */
export const volumeToGain = (v) => clamp(v, 0, 1) ** 2 * 0.5;
export function safetyWarning(freq, volume) {
  if (volume > 0.5 && freq >= 8000) return 'High frequency at high volume can damage hearing. Turn it down.';
  if (volume > 0.75) return 'Loud. Keep sessions short, especially with headphones.';
  return '';
}

// ---------- metronome ----------
export const SIGNATURES = {
  '2/4': { beats: 2, groups: [0] },
  '3/4': { beats: 3, groups: [0] },
  '4/4': { beats: 4, groups: [0] },
  '5/4': { beats: 5, groups: [0, 3] },
  '6/8': { beats: 6, groups: [0, 3] },
  '7/8': { beats: 7, groups: [0, 2, 4] },
};
export const SUBDIVISIONS = { none: 1, eighths: 2, triplets: 3, sixteenths: 4 };
export const BPM_MIN = 20;
export const BPM_MAX = 300;

/** Click level for tick n: accent (beat 1), mid (group start), beat, or sub (subdivision). */
export function clickLevel(n, sig, subdiv) {
  const { beats, groups } = SIGNATURES[sig];
  const tick = n % (beats * subdiv);
  if (tick % subdiv) return 'sub';
  const beat = tick / subdiv;
  if (beat === 0) return 'accent';
  return groups.includes(beat) ? 'mid' : 'beat';
}

/**
 * Metronome clock on the audio timeline. Tick times are computed from an anchor
 * (time = anchor + k·period), never accumulated, so loop jitter cannot drift them.
 * pump(now) returns every tick that falls before now + lookAhead.
 */
export function createClock({ bpm, sig, subdiv, startAt, lookAhead = 0.1 }) {
  let anchorTime = startAt;
  let anchorTick = 0;
  let next = 0;
  let period = 60 / bpm / subdiv;
  const timeOf = (n) => anchorTime + (n - anchorTick) * period;
  return {
    pump(now) {
      const out = [];
      while (timeOf(next) < now + lookAhead) {
        out.push({ n: next, time: timeOf(next), level: clickLevel(next, sig, subdiv) });
        next++;
      }
      return out;
    },
    /** Tempo/pattern change: keep the next tick where it is, new spacing after it. */
    set(opts) {
      anchorTime = timeOf(next);
      anchorTick = next;
      if (opts.sig || opts.subdiv) {
        // restart the bar so accents stay on beat 1
        anchorTick = next = 0;
      }
      if (opts.sig) sig = opts.sig;
      if (opts.subdiv) subdiv = opts.subdiv;
      if (opts.bpm) bpm = opts.bpm;
      period = 60 / bpm / subdiv;
    },
  };
}

/** Tap tempo: average of the last 4 taps (3 intervals). Taps older than 2 s apart start over. */
export function tapTempo(taps) {
  const recent = [];
  for (let i = taps.length - 1; i >= 0 && recent.length < 4; i--) {
    if (recent.length && recent[0] - taps[i] > 2000) break;
    recent.unshift(taps[i]);
  }
  if (recent.length < 2) return null;
  const avg = (recent[recent.length - 1] - recent[0]) / (recent.length - 1);
  return clamp(Math.round(60000 / avg), BPM_MIN, BPM_MAX);
}

// ---------- noise ----------
/** Deterministic PRNG (mulberry32) so tests and buffers are reproducible. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const NOISE_KINDS = ['white', 'pink', 'brown'];

/**
 * Fills `out` with seamlessly loopable noise of `kind`, peak-normalised to 0.9.
 * `fade` extra samples are generated and cross-faded into the start, so the loop has no click.
 */
export function fillNoise(out, kind, seed = 7, fade = Math.min(2048, out.length >> 2)) {
  const raw = generate(out.length + fade, kind, seed);
  for (let i = 0; i < out.length; i++) out[i] = raw[i];
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    out[i] = raw[out.length + i] * (1 - k) + raw[i] * k;
  }
  let peak = 0;
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) for (let i = 0; i < out.length; i++) out[i] *= 0.9 / peak;
  return out;
}

function generate(len, kind, seed) {
  const out = new Float32Array(len);
  const r = rng(seed);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < out.length; i++) {
    const w = r() * 2 - 1;
    if (kind === 'pink') {
      // Paul Kellet's refined pink filter
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      out[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
    } else if (kind === 'brown') {
      last = (last + 0.02 * w) / 1.02; // leaky integrator
      out[i] = last;
    } else out[i] = w;
  }
  if (kind === 'brown') {
    // remove DC so the integrator's wander stays centred
    let mean = 0;
    for (let i = 0; i < len; i++) mean += out[i];
    mean /= len;
    for (let i = 0; i < len; i++) out[i] -= mean;
  }
  return out;
}

// ---------- pitch detection (autocorrelation) ----------
/**
 * Returns the fundamental in Hz, or null when the signal is too quiet / unclear.
 * Normalised autocorrelation, first strong peak after the first dip, parabolic interpolation.
 */
export function detectPitch(buf, sampleRate, { minHz = 50, maxHz = 2000, rmsGate = 0.01 } = {}) {
  const n = buf.length;
  let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  if (Math.sqrt(rms / n) < rmsGate) return null;
  const minLag = Math.floor(sampleRate / maxHz);
  const maxLag = Math.min(Math.floor(sampleRate / minHz), n - 1);
  const ac = new Float32Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag + 1 && lag < n; lag++) {
    let sum = 0, e1 = 0, e2 = 0;
    for (let i = 0; i < n - lag; i++) {
      sum += buf[i] * buf[i + lag];
      e1 += buf[i] * buf[i];
      e2 += buf[i + lag] * buf[i + lag];
    }
    ac[lag] = e1 && e2 ? sum / Math.sqrt(e1 * e2) : 0;
  }
  let best = -1;
  let bestVal = 0;
  const globalMax = Math.max(...ac.subarray(minLag, maxLag + 1));
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    // first local peak that is close to the global maximum (avoids octave errors)
    if (ac[lag] > ac[lag - 1] && ac[lag] >= ac[lag + 1] && ac[lag] > 0.9 * globalMax && ac[lag] > 0.5) {
      best = lag;
      bestVal = ac[lag];
      break;
    }
  }
  if (best < 0 || !bestVal) return null;
  const a = ac[best - 1], b = ac[best], c = ac[best + 1];
  const shift = (a - c) / (2 * (a - 2 * b + c)) || 0;
  return sampleRate / (best + clamp(shift, -1, 1));
}

/**
 * Tuner smoothing: adds reading f (or null) to the last 5 and returns the median.
 * A lone reading an octave away from the current median is treated as a miss
 * (autocorrelation octave error); a real octave change wins once the old readings age out.
 */
export function smoothPitch(recent, f) {
  const m = median(recent);
  const octaveOff = f && m && [0.5, 2].some((r) => Math.abs(f / m / r - 1) < 0.03);
  if (f && !octaveOff) {
    recent.push(f);
    if (recent.length > 5) recent.shift();
  } else if (recent.length) recent.shift();
  return median(recent);
}

/** Median of the numbers (for smoothing the tuner readout). */
export function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
