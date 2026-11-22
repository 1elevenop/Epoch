// Runs a challenge chain (e.g. qr → math) one after another. If a hardware/QR challenge fails 3 times,
// takes 5 minutes, or is unavailable, the escape hatch swaps the rest for math L4 + type 12 words.
// An alarm that cannot be dismissed is a bug, not a feature (BLUEPRINT §5.3).

import * as math from './math.js';
import * as type from './type.js';
import * as memory from './memory.js';
import * as shake from './shake.js';
import * as qr from './qr.js';
import * as steps from './steps.js';
import { rng, shouldEscape, ESCAPE_CHAIN, CHALLENGE_INFO } from './rules.js';
import { esc } from '../../core/dom.js';

const MODULES = { math, type, memory, shake, qr, steps };

/**
 * runChain(host, { chain, level, qrPayload, seed, onComplete(proof), onProgress? }) → cleanup().
 * proof = { completed: [ids], fails, escaped }
 */
export function runChain(host, { chain, level, qrPayload, seed, onComplete }) {
  const r = rng(seed ?? Date.now());
  let queue = (chain?.length ? chain : ['math']).map((id) => ({ id, level }));
  const completed = [];
  let totalFails = 0;
  let escaped = false;
  let cleanup = () => {};
  let escapeTimer = null;

  host.innerHTML = `<div class="ch-steps" aria-label="Challenges"></div><div class="ch-notice" role="status"></div><div class="ch-body"></div>`;
  const stepsEl = host.querySelector('.ch-steps');
  const notice = host.querySelector('.ch-notice');
  const body = host.querySelector('.ch-body');

  function drawSteps() {
    const all = [...completed.map((id) => ({ id, done: true })), ...queue.map((q, i) => ({ id: q.id, current: i === 0 }))];
    stepsEl.innerHTML = all
      .map((s) => `<span class="ch-step ${s.done ? 'done' : ''} ${s.current ? 'current' : ''}">${CHALLENGE_INFO[s.id].icon} ${esc(CHALLENGE_INFO[s.id].name)}</span>`)
      .join('<span class="ch-arrow" aria-hidden="true">→</span>');
  }

  function escape(reason) {
    if (escaped) return;
    escaped = true;
    cleanup();
    clearTimeout(escapeTimer);
    queue = ESCAPE_CHAIN.map((c) => ({ ...c }));
    notice.textContent = `Escape hatch: ${reason}. Solve these instead.`;
    next();
  }

  function next() {
    cleanup();
    clearTimeout(escapeTimer);
    if (!queue.length) {
      body.innerHTML = '<p class="ch-big">✓</p>';
      onComplete({ completed, fails: totalFails, escaped });
      return;
    }
    drawSteps();
    const { id, level: lvl } = queue[0];
    let fails = 0;
    const startedAt = Date.now();
    const check = (unavailable = false, reason = '') => {
      if (!escaped && shouldEscape({ id, fails, startedAt, now: Date.now(), unavailable })) {
        escape(reason || (unavailable ? `${CHALLENGE_INFO[id].name} unavailable` : fails >= 3 ? '3 failed attempts' : '5 minutes passed'));
        return true;
      }
      return false;
    };
    escapeTimer = setTimeout(() => check(), 5 * 60_000 + 100);
    cleanup = MODULES[id].mount(body, {
      level: lvl,
      r,
      qrPayload,
      onDone: () => {
        completed.push(id);
        queue.shift();
        next();
      },
      onFail: () => {
        fails += 1;
        totalFails += 1;
        check();
      },
      onUnavailable: (why) => check(true, why),
    });
  }

  next();
  return () => {
    cleanup();
    clearTimeout(escapeTimer);
  };
}
