// Shared Audio Lab output: every tool plays through one hard limiter, so no setting can clip
// or jump in loudness. Also caches the looped noise buffers.

import { getCtx, unlock } from '../../core/audio.js';
import { fillNoise, volumeToGain } from './dsp.js';

let limiter = null;
const noiseBuffers = new Map();

/** Returns { ctx, out } where `out` is the limiter input, or null when Web Audio is missing. */
export function output() {
  const ctx = getCtx();
  if (!ctx) return null;
  unlock();
  if (!limiter) {
    limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.1;
    limiter.connect(ctx.destination);
  }
  return { ctx, out: limiter };
}

/** Gain node that fades to `volume` over 20 ms (no clicks). */
export function fadeGain(ctx, volume, at = ctx.currentTime) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(volumeToGain(volume), at + 0.02);
  return g;
}

export function setVolume(ctx, gainNode, volume) {
  gainNode.gain.setTargetAtTime(volumeToGain(volume), ctx.currentTime, 0.015);
}

/** Fade out over 20 ms, then call done (e.g. to stop oscillators). */
export function fadeOut(ctx, gainNode, done) {
  const t = ctx.currentTime;
  gainNode.gain.cancelScheduledValues(t);
  gainNode.gain.setValueAtTime(gainNode.gain.value, t);
  gainNode.gain.linearRampToValueAtTime(0, t + 0.02);
  setTimeout(done, 40);
}

/** 8 s stereo loop (different seed per channel so it sounds wide, not centred). */
export function noiseBuffer(ctx, kind) {
  if (!noiseBuffers.has(kind)) {
    const len = ctx.sampleRate * 8;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    fillNoise(buf.getChannelData(0), kind, 11);
    fillNoise(buf.getChannelData(1), kind, 29);
    noiseBuffers.set(kind, buf);
  }
  return noiseBuffers.get(kind);
}

/** Starts a looped noise source into `dest`; returns the source. */
export function playNoise(ctx, kind, dest) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, kind);
  src.loop = true;
  src.connect(dest);
  src.start();
  return src;
}
