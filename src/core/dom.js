// Tiny DOM helpers. Any text that is not a constant goes through esc() before innerHTML.

const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => MAP[c]);

export const $ = (root, sel) => root.querySelector(sel);
