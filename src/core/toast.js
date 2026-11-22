// Small bottom toast with an optional action button (e.g. "Undo").

let current = null;

export function toast(message, { action = null, onAction = null, ms = 4000 } = {}) {
  current?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  const text = document.createElement('span');
  text.textContent = message;
  el.append(text);
  if (action) {
    const btn = document.createElement('button');
    btn.className = 'toast-action';
    btn.textContent = action;
    btn.addEventListener('click', () => {
      onAction?.();
      el.remove();
    });
    el.append(btn);
  }
  document.body.append(el);
  current = el;
  setTimeout(() => el.remove(), ms);
  return () => el.remove();
}
