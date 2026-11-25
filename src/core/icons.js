// One line-icon set for buttons, status and tabs (24 grid, 1.5 stroke, round caps, currentColor).
// Replaces the emoji and unicode glyphs that were used as icons.

// Tab and settings icons drawn in Affinity (source: epoch-icons.af, kept outside the repo).
export const TAB_PATHS = {
  alarm: '<circle cx="12" cy="13.5" r="7"/><path d="M12 10v3.5l2.5 1.5M4 6.5 6.5 4M20 6.5 17.5 4M7 19l-1.5 1.5M17 19l1.5 1.5"/>',
  timer: '<path d="M6.5 3.5h11M6.5 20.5h11M7.5 3.5c0 5 4.5 6 4.5 8.5s-4.5 3.5-4.5 8.5M16.5 3.5c0 5-4.5 6-4.5 8.5s4.5 3.5 4.5 8.5"/>',
  stopwatch: '<circle cx="12" cy="14" r="7"/><path d="M12 14v-3.5M10 3h4M12 3v4M17.5 8 19 6.5"/>',
  focus: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="0.75"/>',
  tools: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
  audio: '<path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2"/>',
  settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
};

// Tool and Audio Lab icons (Affinity source: epoch-tool-icons.af).
const TOOL_PATHS = {
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.5"/>',
  interval: '<path d="M3 12h4l2-6 4 12 2-6h6"/>',
  breathing: '<path d="M3 9h11c3 0 3-4 .5-4M3 15h15c3 0 3 4 .5 4M3 12h7"/>',
  countdowns: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/>',
  chess: '<rect x="3" y="8" width="18" height="12" rx="2"/><circle cx="8.5" cy="14" r="2.5"/><circle cx="15.5" cy="14" r="2.5"/><path d="M8.5 5v3M15.5 6.5V8"/>',
  speech: '<path d="M5 5h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-8l-4 3.5V16H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/>',
  metronome: '<path d="M7 20 10 4h4l3 16zM12 16l5.5-9"/>',
  tone: '<path d="M3 12c2-7 6-7 9 0s7 7 9 0"/>',
  noise: '<path d="M3 12l2-3 2 6 2-8 2 10 2-7 2 4 2-6 2 5 2-2"/>',
  tuner: '<path d="M9 3v8a3 3 0 0 0 6 0V3M12 14v7"/>',
  binaural: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3.5" y="14" width="4" height="6" rx="1.5"/><rect x="16.5" y="14" width="4" height="6" rx="1.5"/>',
};

/** Line icon for a Tools / Audio Lab card. */
export const toolIcon = (name) => `<svg class="ic file-ic" viewBox="0 0 24 24" aria-hidden="true">${TOOL_PATHS[name] ?? ''}</svg>`;

/** Tab-bar sized icon (styled by .tab svg / .gear svg). */
export const tabIcon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${TAB_PATHS[name]}</svg>`;

const PATHS = {
  play: '<path d="M8 5.5v13l10.5-6.5z"/>',
  pause: '<path d="M9 5.5v13M15 5.5v13"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/>',
  reset: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v3.7h3.7"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  moon: '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.5"/>',
  expand: '<path d="M14 4.5h5.5V10M10 19.5H4.5V14M19.5 4.5l-6 6M4.5 19.5l6-6"/>',
  grip: '<path d="M9 6.5v.01M15 6.5v.01M9 12v.01M15 12v.01M9 17.5v.01M15 17.5v.01"/>',
  back: '<path d="M14.5 5.5L8 12l6.5 6.5"/>',
  backspace: '<path d="M9 5.5h10.5a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5H9L3 12z"/><path d="M12.5 9.5l5 5M17.5 9.5l-5 5"/>',
};

/** Inline SVG string; decorative (the button or text carries the label). */
export const ic = (name) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${PATHS[name]}</svg>`;
