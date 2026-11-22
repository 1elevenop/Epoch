// Noise mixer: white / pink / brown loops, each with its own level, through one master gain.
// Used by the Noise screen and by focus sessions (ambient noise, BLUEPRINT §6.5).

import { NOISE_KINDS, volumeToGain } from './dsp.js';
import { output, fadeGain, setVolume, fadeOut, playNoise } from './output.js';

export function createMixer(volume) {
  const o = output();
  if (!o) return null;
  const { ctx } = o;
  const master = fadeGain(ctx, volume);
  master.connect(o.out);
  const ch = new Map(); // kind → { src, gain }

  return {
    ctx,
    /** level 0..1 (0 stops that channel). */
    setLevel(kind, level) {
      if (!NOISE_KINDS.includes(kind)) return;
      let c = ch.get(kind);
      if (level <= 0) {
        if (c) {
          ch.delete(kind);
          fadeOut(ctx, c.gain, () => c.src.stop());
        }
        return;
      }
      if (!c) {
        const gain = ctx.createGain();
        gain.gain.value = 0;
        gain.connect(master);
        c = { gain, src: playNoise(ctx, kind, gain) };
        ch.set(kind, c);
      }
      // channel levels are linear mix weights; loudness is set by the master volume
      c.gain.gain.setTargetAtTime(Math.min(1, level) * 1.6, ctx.currentTime, 0.02);
    },
    setVolume: (v) => setVolume(ctx, master, v),
    /** Fade the master to silence over `fadeSecs`, ending `inSecs` from now (sleep timer). */
    scheduleFadeOut(inSecs, fadeSecs, volume) {
      const t = ctx.currentTime;
      const end = t + Math.max(0.05, inSecs);
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(volumeToGain(volume), t);
      master.gain.setValueAtTime(volumeToGain(volume), Math.max(t, end - fadeSecs));
      master.gain.linearRampToValueAtTime(0, end);
    },
    cancelFadeOut(volume) {
      master.gain.cancelScheduledValues(ctx.currentTime);
      setVolume(ctx, master, volume);
    },
    stop() {
      fadeOut(ctx, master, () => {
        for (const c of ch.values()) c.src.stop();
        ch.clear();
        master.disconnect();
      });
    },
  };
}

// ---------- focus ambient: one shared mixer that follows the session state ----------
let ambient = null; // { mixer, key }

/** kind 'off' | 'white' | 'pink' | 'brown'. Call on every focus redraw; it only acts on changes. */
export function syncAmbient(play, kind, volume) {
  const key = play && kind !== 'off' ? `${kind}:${volume}` : '';
  if ((ambient?.key ?? '') === key) return;
  if (ambient && (!key || !key.startsWith(`${ambient.kind}:`))) {
    ambient.mixer.stop();
    ambient = null;
  }
  if (!key) return;
  if (!ambient) {
    const mixer = createMixer(volume);
    if (!mixer) return;
    mixer.setLevel(kind, 1);
    ambient = { mixer, kind, key };
  } else {
    ambient.mixer.setVolume(volume);
    ambient.key = key;
  }
}
