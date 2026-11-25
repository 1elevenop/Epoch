// Chess / game clock (BLUEPRINT §6.7): two sides, base + increment, tap your side to switch.
// The top half is rotated so the player across the table can read it.

import { subscribe } from '../../core/ticker.js';
import { loadState, saveState } from '../../core/store.js';
import { keepAwake } from '../../core/screen.js';
import { getCtx, unlock, beepAt } from '../../core/audio.js';
import * as M from './models.js';
import { ic } from '../../core/icons.js';

const PRESETS = [[1, 0], [3, 2], [5, 0], [10, 0], [15, 10], [30, 0]];

function fmt(ms) {
  const s = Math.ceil(ms / 1000);
  if (ms < 10_000) return `${Math.floor(ms / 1000)}.${Math.floor((ms % 1000) / 100)}`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(s % 60).padStart(2, '0')}`;
}

/** Stored game → usable game, or null (rule 6). */
function sanitize(c) {
  const n = (v) => Number.isFinite(v) && v >= 0;
  if (!c || !n(c.base) || !n(c.inc) || !Array.isArray(c.left) || !c.left.every(n) || !Array.isArray(c.moves) || !c.moves.every(n)) return null;
  if (![null, 0, 1].includes(c.active) || ![null, 0, 1].includes(c.flag)) return null;
  // a clock that was running when the app closed comes back paused at the saved time
  return { ...c, left: c.left.slice(0, 2), moves: c.moves.slice(0, 2), since: null };
}

export function chessScreen(el) {
  const saved = loadState('chess', {}) ?? {};
  let cfg = { base: M.clamp(Number(saved.cfg?.base) || 5, 1, 180), inc: M.clamp(Number(saved.cfg?.inc) || 0, 0, 60) };
  let game = sanitize(saved.game) ?? M.newChess(cfg.base, cfg.inc);
  const save = () => saveState('chess', { cfg, game });
  let release = null;

  el.innerHTML = `
    <section class="chess" aria-label="Chess clock">
      <button class="chess-side top" data-side="1" aria-label="Player 2 clock: tap after your move"><span class="chess-time digits"></span><span class="chess-moves"></span></button>
      <div class="chess-bar">
        <a class="icon-btn" href="#/tools" aria-label="Back to Tools">${ic('back')}</a>
        <select class="input" id="preset" aria-label="Time control">
          ${PRESETS.map(([b, i]) => `<option value="${b}|${i}" ${b === cfg.base && i === cfg.inc ? 'selected' : ''}>${b}+${i}</option>`).join('')}
        </select>
        <button class="icon-btn" id="pause" aria-label="Pause">${ic('pause')}</button>
        <button class="icon-btn" id="reset" aria-label="Reset clocks">${ic('reset')}</button>
      </div>
      <button class="chess-side bottom" data-side="0" aria-label="Player 1 clock: tap after your move"><span class="chess-time digits"></span><span class="chess-moves"></span></button>
    </section>`;
  const $ = (s) => el.querySelector(s);
  const sides = [$('[data-side="0"]'), $('[data-side="1"]')];

  const ensureAwake = () => {
    const live = game.active != null && game.since != null;
    if (live && !release) release = keepAwake('chess');
    if (!live && release) {
      release();
      release = null;
    }
  };
  function set(next) {
    game = next;
    save();
    ensureAwake();
  }

  for (const b of sides) {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      unlock();
      const side = Number(b.dataset.side);
      if (game.active != null && game.since == null && game.flag == null) return set(M.chessResume(game)); // paused: any tap resumes
      const next = M.chessTap(game, side);
      if (next !== game) {
        const ctx = getCtx();
        if (ctx) beepAt(ctx, ctx.currentTime + 0.01, 1200, 0.04, 0.15);
        navigator.vibrate?.(20);
      }
      set(next);
    });
  }
  $('#pause').addEventListener('click', () => set(game.since != null ? M.chessPause(game) : M.chessResume(game)));
  $('#reset').addEventListener('click', () => set(M.newChess(cfg.base, cfg.inc)));
  $('#preset').addEventListener('change', (e) => {
    const [b, i] = e.target.value.split('|').map(Number);
    cfg = { base: b, inc: i };
    set(M.newChess(b, i));
  });

  const unsub = subscribe((now) => {
    const flagged = M.chessFlag(game, now);
    if (flagged) {
      set(flagged);
      const ctx = getCtx();
      if (ctx) for (let k = 0; k < 3; k++) beepAt(ctx, ctx.currentTime + 0.05 + k * 0.25, 660, 0.2, 0.3);
    }
    sides.forEach((b, i) => {
      const left = M.chessLeft(game, i, now);
      b.querySelector('.chess-time').textContent = game.flag === i ? 'Flag' : fmt(left);
      b.querySelector('.chess-moves').textContent = `Moves ${game.moves[i]}`;
      b.dataset.state = game.flag === i ? 'flag' : game.active === i ? (game.since != null ? 'run' : 'paused') : '';
      b.classList.toggle('low', left < 20_000 && game.flag == null);
    });
    $('#pause').innerHTML = ic(game.since != null ? 'pause' : 'play');
    $('#pause').setAttribute('aria-label', game.since != null ? 'Pause' : 'Resume');
    $('#pause').disabled = game.active == null || game.flag != null;
    $('#preset').disabled = game.active != null && game.flag == null;
  }, { fps: 20 });

  ensureAwake();
  return () => {
    if (game.since != null) set(M.chessPause(game)); // leaving the screen pauses the game
    unsub();
    release?.();
  };
}
