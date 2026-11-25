// Backgrounds (BLUEPRINT §6.8): the app (portrait screens) and the big display (landscape) each use
// the theme colour, a plain colour or an image. Images live in IndexedDB ('media'), never in backups.

import { db, getSettings } from './store.js';

export const BG_SLOTS = ['app', 'big'];
export const BG_MODES = ['theme', 'color', 'image'];
export const BG_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/bmp'];
export const BG_MAX_BYTES = 100 * 1024 * 1024;
const KEY = { app: 'bgApp', big: 'bgBig' };

/** A clean background setting from anything (unknown → theme). Pure; unit tested. */
export function sanitizeBg(v) {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  return {
    mode: BG_MODES.includes(o.mode) ? o.mode : 'theme',
    color: typeof o.color === 'string' && /^#[0-9a-f]{6}$/i.test(o.color) ? o.color.toLowerCase() : '#000000',
    dim: typeof o.dim === 'number' && o.dim >= 0 && o.dim <= 0.8 ? o.dim : 0.4,
  };
}

/** true if v is a valid stored background setting (rule 6, import). */
export const isValidBg = (v) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const c = sanitizeBg(v);
  return Object.keys(v).every((k) => ['mode', 'color', 'dim'].includes(k)) && c.mode === v.mode && c.color === String(v.color).toLowerCase() && c.dim === v.dim;
};

/** Checks a picked file before it is stored: type and size. Returns an error message or null. */
export function checkImageFile(file) {
  if (!file) return 'No file chosen';
  if (!BG_TYPES.includes(file.type)) return 'Use a JPEG, PNG, WebP, GIF, AVIF or BMP image';
  if (file.size > BG_MAX_BYTES) return 'Image is larger than 100 MB';
  return null;
}

export const getBg = (slot) => sanitizeBg(getSettings()[KEY[slot]]);
export const bgKey = (slot) => KEY[slot];

const urls = {};
/** Stores an image after checking it decodes. Throws with a readable message. */
export async function saveBgImage(slot, file) {
  const bad = checkImageFile(file);
  if (bad) throw new Error(bad);
  try {
    const bmp = await createImageBitmap(file);
    bmp.close?.();
  } catch {
    throw new Error('This file could not be read as an image');
  }
  await db.put('media', { id: `bg-${slot}`, blob: file, type: file.type, name: String(file.name ?? '').slice(0, 120), at: Date.now() });
  if (urls[slot]) URL.revokeObjectURL(urls[slot]);
  delete urls[slot];
}

/** Object URL of the stored image, or null. */
export async function bgImageUrl(slot) {
  if (urls[slot]) return urls[slot];
  const rec = await db.get('media', `bg-${slot}`).catch(() => null);
  if (!rec?.blob) return null;
  urls[slot] = URL.createObjectURL(rec.blob);
  return urls[slot];
}

export const bgImageName = async (slot) => (await db.get('media', `bg-${slot}`).catch(() => null))?.name ?? null;

/** CSS background shorthand for a slot, or null for the theme background. */
export async function bgCss(slot) {
  const bg = getBg(slot);
  const light = document.documentElement.dataset.theme === 'light';
  const veil = light ? `rgba(226,223,214,${bg.dim})` : `rgba(0,0,0,${bg.dim})`;
  if (bg.mode === 'color') return bg.color;
  if (bg.mode === 'image') {
    const url = await bgImageUrl(slot);
    if (url) return `linear-gradient(${veil}, ${veil}), center / cover no-repeat url("${url}")`;
  }
  return null;
}

/** Applies the app background (portrait screens). */
export async function applyAppBg() {
  const css = await bgCss('app');
  const root = document.documentElement;
  if (css) root.style.setProperty('--app-bg', css);
  else root.style.removeProperty('--app-bg');
  root.toggleAttribute('data-bg', !!css);
}
