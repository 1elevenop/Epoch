// Mascot moods: 3D renders in src/public/mascot/ (decorative, one per screen at most).
// The flat mascot head used for the launcher and notification icon comes from scripts/gen-icons.py.

export const MOODS = ['sleepy', 'bored', 'alarmed', 'happy', 'wave', 'focused', 'snooze', 'confused'];

/** <img> for a mood. Decorative: hidden from screen readers, the text next to it carries the meaning. */
export function mascot(mood, { size = 96, cls = '' } = {}) {
  const m = MOODS.includes(mood) ? mood : 'sleepy';
  return `<img class="mascot ${cls}" src="./mascot/${m}.webp" width="${size}" height="${size}" alt="" aria-hidden="true" decoding="async" draggable="false" />`;
}

/** Empty-list row with a small mascot above the message. `text` must already be escaped. */
export function emptyRow(text, mood) {
  return `<li class="empty empty-mascot">${mascot(mood, { size: 96 })}<span>${text}</span></li>`;
}
