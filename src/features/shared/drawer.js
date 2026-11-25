// Index-card drawer (Tools, Audio Lab): tapping a card opens its tool inside the card instead of
// a new screen. One card open at a time; closing a card (or leaving the tab) runs the tool's cleanup.

import { esc } from '../../core/dom.js';
import { toolIcon } from '../../core/icons.js';

/** items: [{ id, name, sub, render?(el) → cleanup, href? }]. Returns the screen cleanup. */
export function mountDrawer(el, { title, items, note = '' }) {
  el.innerHTML = `
    <section class="screen" aria-labelledby="screen-title">
      <h1 id="screen-title">${esc(title)}</h1>
      <ol class="drawer">
        ${items.map((t, i) => `
        <li class="file" data-id="${t.id}" style="--tab-x:${8 + (i % 3) * 30}%">
          <span class="file-n digits" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>
          <button class="file-head" type="button" aria-expanded="false" aria-controls="file-${t.id}">
            ${toolIcon(t.id)}<span class="file-name">${esc(t.name)}</span><span class="file-sub">${esc(t.sub)}</span>
          </button>
          <div class="file-body" id="file-${t.id}" hidden></div>
        </li>`).join('')}
      </ol>
      ${note ? `<p class="muted">${esc(note)}</p>` : ''}
    </section>`;

  let open = null; // { li, body, cleanup }
  function close() {
    if (!open) return;
    try { if (typeof open.cleanup === 'function') open.cleanup(); } catch (e) { console.error('[drawer] cleanup failed', e); }
    open.body.replaceChildren();
    open.body.hidden = true;
    open.li.classList.remove('open');
    open.li.querySelector('.file-head').setAttribute('aria-expanded', 'false');
    open = null;
  }

  el.querySelector('.drawer').addEventListener('click', (e) => {
    const head = e.target.closest('.file-head');
    if (!head) return;
    const li = head.closest('.file');
    const item = items.find((t) => t.id === li.dataset.id);
    const wasOpen = open?.li === li;
    close();
    if (wasOpen) return;
    if (item.href) {
      location.hash = item.href; // full-screen tools (chess) keep their own screen
      return;
    }
    const body = li.querySelector('.file-body');
    body.hidden = false;
    li.classList.add('open');
    head.setAttribute('aria-expanded', 'true');
    let cleanup = null;
    try {
      cleanup = item.render(body) ?? null;
    } catch (err) {
      console.error(`[drawer] failed to open ${item.id}`, err);
      body.textContent = 'Something went wrong in this tool.';
    }
    open = { li, body, cleanup };
    li.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });

  return close;
}
