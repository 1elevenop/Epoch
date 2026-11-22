// Theme registry (BLUEPRINT §6.8, §10 + Phase 5a futuristic themes). Tokens are applied as CSS
// variables on <html>; decorative backgrounds live in styles/themes.css keyed by data-theme.

import '@fontsource/orbitron/latin-500.css';
import '@fontsource/share-tech-mono/latin-400.css';
import '@fontsource/rajdhani/latin-500.css';

const ORBITRON = "'Orbitron', system-ui, sans-serif";
const MONO = "'Share Tech Mono', ui-monospace, monospace";
const RAJ = "'Rajdhani', system-ui, sans-serif";
const SYS = 'inherit';
/** Digit cell width per font (Orbitron is wide, Rajdhani narrow). */
const SLOT_W = { [ORBITRON]: '0.9em', [MONO]: '0.62em', [RAJ]: '0.56em', [SYS]: '0.64em' };

/** text2 is secondary text; glow is the digit glow colour (transparent = none). */
export const THEMES = [
  { id: 'oled', name: 'OLED Black', font: SYS, t: { bg: '#000000', surface: '#111214', raised: '#1a1c20', border: '#2a2d33', text: '#f2f3f5', text2: '#9aa0a6', accent: '#ff8a3d', glow: 'transparent' } },
  { id: 'dark', name: 'Dark', font: SYS, t: { bg: '#15171b', surface: '#1f2228', raised: '#2a2e36', border: '#3a3f49', text: '#f2f3f5', text2: '#a9aeb6', accent: '#ff8a3d', glow: 'transparent' } },
  { id: 'light', name: 'Light', font: SYS, t: { bg: '#f4f5f7', surface: '#ffffff', raised: '#e9ebef', border: '#d3d7de', text: '#15171b', text2: '#4d535c', accent: '#c2410c', glow: 'transparent' } },
  { id: 'neon', name: 'Neon Cyber', font: ORBITRON, t: { bg: '#05030a', surface: '#0d0b17', raised: '#161229', border: '#2b2350', text: '#e8fbff', text2: '#8fd8e6', accent: '#00f0ff', glow: '#00f0ff', glow2: '#ff2bd6' } },
  { id: 'synthwave', name: 'Synthwave', font: ORBITRON, t: { bg: '#1a0b2e', surface: '#241040', raised: '#311755', border: '#4b2475', text: '#fff0fb', text2: '#f0a8e0', accent: '#ff3ea5', glow: '#ff3ea5', glow2: '#ffb347' } },
  { id: 'matrix', name: 'Matrix Terminal', font: MONO, t: { bg: '#000800', surface: '#031203', raised: '#062006', border: '#0f3a0f', text: '#b8ffb8', text2: '#5fd35f', accent: '#39ff14', glow: '#39ff14' } },
  { id: 'holo', name: 'Holo Glass', font: RAJ, t: { bg: '#0a1020', surface: 'rgba(255,255,255,0.07)', raised: 'rgba(255,255,255,0.12)', border: 'rgba(255,255,255,0.18)', text: '#f4f8ff', text2: '#aebbd6', accent: '#7cc4ff', glow: '#7cc4ff', solidSurface: '#1a2133' } },
  { id: 'nixie', name: 'Nixie Lab', font: MONO, t: { bg: '#140d08', surface: '#21160e', raised: '#2e2014', border: '#5a4326', text: '#ffe2bd', text2: '#d2a36b', accent: '#ff9d2e', glow: '#ff7a1a' } },
  { id: 'aurora', name: 'Aurora', font: RAJ, t: { bg: '#050b16', surface: '#0c1626', raised: '#132036', border: '#22385a', text: '#eafff6', text2: '#9fd9c4', accent: '#5dffb0', glow: '#5dffb0', glow2: '#b388ff' } },
  { id: 'mars', name: 'Mars HUD', font: RAJ, t: { bg: '#170804', surface: '#250f08', raised: '#34160c', border: '#6b2c14', text: '#ffe6d6', text2: '#f0a27c', accent: '#ff6a2b', glow: '#ff6a2b' } },
  { id: 'blueprint', name: 'Blueprint', font: MONO, t: { bg: '#0b2a5b', surface: '#0f3470', raised: '#143d80', border: '#5c86c7', text: '#ffffff', text2: '#c9dcff', accent: '#ffffff', glow: 'transparent', onAccent: '#0b2a5b' } },
  { id: 'deepsea', name: 'Deep Sea', font: ORBITRON, t: { bg: '#020a14', surface: '#06142a', raised: '#0a1d3a', border: '#123060', text: '#e0fffb', text2: '#7fd6cc', accent: '#2ef2d9', glow: '#2ef2d9' } },
];

export const ACCENTS = ['#ff8a3d', '#00f0ff', '#ff3ea5', '#39ff14', '#ffd23f', '#7cc4ff', '#b388ff', '#ff5a5f'];

export const themeById = (id) => THEMES.find((t) => t.id === id) ?? THEMES[0];

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
    '--accent': acc,
    '--on-accent': onAccent(theme, acc),
    '--glow': theme.t.glow,
    '--glow-2': theme.t.glow2 ?? theme.t.glow,
    '--digit-font': theme.font,
    '--slot-w': SLOT_W[theme.font] ?? '0.66em',
  };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.dataset.theme = theme.id;
  root.style.colorScheme = theme.id === 'light' ? 'light' : 'dark';
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', theme.t.bg);
  return theme;
}
