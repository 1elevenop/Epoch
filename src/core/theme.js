// Themes (BLUEPRINT §10): Black and Light. Tokens are applied as CSS variables on <html>.
// Type is Geist (UI) and Geist Mono (every time and number), bundled offline.

import '@fontsource/geist-sans/latin-400.css';
import '@fontsource/geist-sans/latin-500.css';
import '@fontsource/geist-mono/latin-400.css';
import '@fontsource/geist-mono/latin-500.css';

const DIGIT_FONT = "'Geist Mono', ui-monospace, monospace";

/** text2 = secondary text, text3 = muted text. Borders are hairlines. Palette: scarlet, black, creme. */
export const THEMES = [
  { id: 'black', name: 'Black', t: { bg: '#000000', surface: '#0f0f0e', raised: '#1b1b19', border: 'rgba(204,200,185,0.14)', text: '#e8e5da', text2: '#a8a597', text3: '#8a877b', accent: '#f5332c' } },
  { id: 'light', name: 'Light', t: { bg: '#e2dfd6', surface: '#ebe8e1', raised: '#d5d1c5', border: 'rgba(17,17,16,0.12)', text: '#111110', text2: '#45433d', text3: '#57554e', accent: '#b01c16' } },
];

/** Themes removed in Epoch 2.0, kept so old settings and WAKE11 backups still load. */
const LEGACY = { oled: 'black', dark: 'black', neon: 'black', synthwave: 'black', matrix: 'black', holo: 'black', nixie: 'black', aurora: 'black', mars: 'black', blueprint: 'black', deepsea: 'black' };

/** A current theme id for any current or legacy id, or null if unknown. */
export const normalizeThemeId = (id) => (THEMES.some((t) => t.id === id) ? id : (LEGACY[id] ?? null));

export const ACCENTS = ['#f5332c', '#ff6a1a', '#c9a227', '#7f9468', '#2f55d4', '#8b8fa3', '#ccc8b9', '#111110'];

export const themeById = (id) => THEMES.find((t) => t.id === normalizeThemeId(id)) ?? THEMES[0];

// ---------- contrast (WCAG 2.1) ----------
function rgb(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}
const lum = (hex) => {
  const [r, g, b] = rgb(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export function contrast(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/** Readable text colour on the accent (buttons). */
export const onAccent = (theme, accent) => theme.t.onAccent ?? (contrast('#000000', accent) >= contrast('#ffffff', accent) ? '#000000' : '#ffffff');

export function applyTheme(id, accent = null) {
  const theme = themeById(id);
  const acc = accent || theme.t.accent;
  const root = document.documentElement;
  const vars = {
    '--bg': theme.t.bg,
    '--surface': theme.t.surface,
    '--raised': theme.t.raised,
    '--border': theme.t.border,
    '--text': theme.t.text,
    '--text-2': theme.t.text2,
    '--text-3': theme.t.text3,
    '--accent': acc,
    '--accent-default': theme.t.accent,
    '--on-accent': onAccent(theme, acc),
    '--digit-font': DIGIT_FONT,
    '--slot-w': '0.62em',
  };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.dataset.theme = theme.id;
  root.style.colorScheme = theme.id === 'light' ? 'light' : 'dark';
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', theme.t.bg);
  document.dispatchEvent(new CustomEvent('themechange', { detail: theme.id }));
  return theme;
}
