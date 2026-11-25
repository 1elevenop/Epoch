// Settings → Background: separate choices for the app (portrait) and the big display (landscape).

import { setSetting } from '../../core/store.js';
import { getBg, bgKey, saveBgImage, bgImageName, applyAppBg, bgCss, BG_TYPES } from '../../core/background.js';

const SLOTS = [
  ['app', 'App', 'Behind every screen when you hold the phone upright'],
  ['big', 'Big display', 'Behind the digits after you turn the phone sideways'],
];
const MODES = [['theme', 'Theme'], ['color', 'Colour'], ['image', 'Image']];

const block = ([slot, title, hint]) => {
  const bg = getBg(slot);
  return `
  <div class="bg-block" data-bg="${slot}" data-mode="${bg.mode}">
    <div class="bg-top"><div><p class="bg-title">${title}</p><p class="muted">${hint}</p></div><span class="bg-preview" aria-hidden="true"></span></div>
    <div class="seg" role="radiogroup" aria-label="${title} background">
      ${MODES.map(([m, l]) => `<button class="seg-btn" role="radio" data-bg-mode="${m}" aria-checked="${bg.mode === m}">${l}</button>`).join('')}
    </div>
    <label class="field bg-when-color">Colour<input class="input bg-color" type="color" value="${bg.color}" aria-label="${title} background colour" /></label>
    <div class="row bg-when-image">
      <button class="btn btn-ghost bg-pick" type="button">Choose image</button>
      <span class="muted bg-name"></span>
      <input class="bg-file" type="file" accept="${BG_TYPES.join(',')}" hidden />
    </div>
    <label class="field bg-when-color bg-when-image">Dim <output class="bg-dim-out">${Math.round(bg.dim * 100)} %</output>
      <input class="bg-dim" type="range" min="0" max="0.8" step="0.05" value="${bg.dim}" aria-label="${title} background dim" /></label>
    <p class="form-error bg-error" role="alert"></p>
  </div>`;
};

export const backgroundHtml = () => `
  <h2 class="section-title">Background</h2>
  ${SLOTS.map(block).join('')}
  <p class="muted">Images stay on this phone and are not part of backups.</p>`;

export function bindBackground(root) {
  for (const box of root.querySelectorAll('.bg-block')) {
    const slot = box.dataset.bg;
    const $ = (s) => box.querySelector(s);
    const save = (patch) => setSetting(bgKey(slot), { ...getBg(slot), ...patch });
    const refresh = async () => {
      box.dataset.mode = getBg(slot).mode;
      for (const b of box.querySelectorAll('[data-bg-mode]')) b.setAttribute('aria-checked', String(b.dataset.bgMode === getBg(slot).mode));
      $('.bg-preview').style.background = (await bgCss(slot)) ?? 'var(--bg)';
      $('.bg-name').textContent = (await bgImageName(slot)) ?? 'No image yet';
      if (slot === 'app') await applyAppBg();
    };
    const pick = () => $('.bg-file').click();

    box.addEventListener('click', async (e) => {
      const m = e.target.closest('[data-bg-mode]');
      if (m) {
        $('.bg-error').textContent = '';
        if (m.dataset.bgMode === 'image' && !(await bgImageName(slot))) return pick(); // mode set once a file is saved
        save({ mode: m.dataset.bgMode });
        await refresh();
      }
      if (e.target.closest('.bg-pick')) pick();
    });
    $('.bg-file').addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      try {
        await saveBgImage(slot, file);
        save({ mode: 'image' });
        $('.bg-error').textContent = '';
      } catch (err) {
        $('.bg-error').textContent = err.message;
      }
      await refresh();
    });
    $('.bg-color').addEventListener('input', (e) => { save({ color: e.target.value }); refresh(); });
    $('.bg-dim').addEventListener('input', (e) => {
      $('.bg-dim-out').textContent = `${Math.round(e.target.value * 100)} %`;
      save({ dim: Number(e.target.value) });
      refresh();
    });
    refresh();
  }
}
