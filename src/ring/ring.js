// #/ring — shown inside the native RingActivity.
// Draws the challenge chain, snooze button with escalation info, and the wake-check prompt.

import { AlarmPlugin } from '../core/bridge.js';
import { subscribe } from '../core/ticker.js';
import { formatClock } from '../core/time.js';
import { getSettings } from '../core/store.js';
import { esc } from '../core/dom.js';
import { runChain } from '../features/challenges/runner.js';

/** Debug switch for device test T13: makes the web screen "fail" so the native fallback appears. */
const BREAK_KEY = 'wake.debug.breakRing';
export const ringBroken = () => {
  try {
    return localStorage.getItem(BREAK_KEY) === '1';
  } catch {
    return false;
  }
};

function snoozeText(c) {
  if (c.snoozeAllowed) {
    const budget = c.budgetLeft != null ? ` · ${c.budgetLeft} left this week` : '';
    return `Snooze ${c.nextSnoozeMin} min (${c.snoozesLeft} left${budget})`;
  }
  return c.snoozeLockReason === 'budget' ? 'No snoozes left this week' : 'Snooze locked — get up';
}

export function ringScreen(el) {
  if (ringBroken()) {
    el.innerHTML = '<p class="sub">Ring screen disabled for test T13 (native fallback should appear).</p>';
    return () => {};
  }
  let stopChain = () => {};
  let unsubClock = () => {};
  let shownKey = null;
  const listeners = [];

  async function render() {
    let c = null;
    try {
      c = await AlarmPlugin.getRingContext();
    } catch (err) {
      console.warn('[ring] context failed', err);
    }
    const phase = c?.state?.phase;
    const key = c ? `${c.state.instanceId}:${phase}:${c.state.snoozeCount}:${c.state.escalated}` : 'none';
    if (key === shownKey) return;
    shownKey = key;
    stopChain();
    unsubClock();

    if (!c || (phase !== 'RINGING' && phase !== 'WAKE_CHECK_PROMPT')) {
      el.innerHTML = `<section class="screen ring-screen"><p class="sub">No alarm is ringing.</p>
        <a class="btn" href="#/alarm" aria-label="Open alarms">Open alarms</a></section>`;
      AlarmPlugin.ringReady?.().catch(() => {});
      return;
    }
    const a = c.alarm;
    if (phase === 'WAKE_CHECK_PROMPT') {
      el.innerHTML = `<section class="screen ring-screen wake-check" aria-labelledby="screen-title">
        <h1 id="screen-title" class="ring-q">Are you up?</h1>
        <p class="sub" id="wc-left"></p>
        <button class="btn btn-huge" data-act="awake" aria-label="Yes, I am up">✓ I'm up</button></section>`;
      el.querySelector('[data-act=awake]').addEventListener('click', () => AlarmPlugin.confirmAwake(a.id).catch(() => {}));
      const left = el.querySelector('#wc-left');
      unsubClock = subscribe((t) => {
        const s = Math.max(0, Math.ceil((c.state.wakeCheckAt - t) / 1000));
        left.textContent = `Tap within ${s} s or the alarm rings again`;
      }, { fps: 2 });
      AlarmPlugin.ringReady?.().catch(() => {});
      return;
    }

    el.innerHTML = `<section class="screen ring-screen ${c.state.escalated ? 'escalated' : ''}" aria-labelledby="screen-title">
      <p class="ring-time digits" id="ring-time"></p>
      <h1 id="screen-title" class="ring-label">${esc(a.label || 'Alarm')}</h1>
      ${c.state.escalated ? '<p class="ring-warn" role="alert">You missed the wake-up check. Snooze is locked.</p>' : ''}
      <p class="ring-level">Level ${c.state.challengeLevel}${c.state.snoozeCount ? ` · snoozed ${c.state.snoozeCount}×` : ''}</p>
      <div id="challenge" class="challenge"></div>
      <button class="btn btn-secondary snooze" data-act="snooze" ${c.snoozeAllowed ? '' : 'disabled'}
        aria-label="${esc(snoozeText(c))}">${esc(snoozeText(c))}</button>
    </section>`;
    const timeEl = el.querySelector('#ring-time');
    unsubClock = subscribe((t) => (timeEl.textContent = formatClock(new Date(t), { hour12: getSettings().hour12 })), { fps: 1 });
    el.querySelector('[data-act=snooze]').addEventListener('click', async (e) => {
      e.target.disabled = true;
      const r = await AlarmPlugin.snooze(a.id).catch(() => ({ allowed: false }));
      if (!r.allowed) render();
    });
    const ch = a.challenge ?? { chain: ['math'], level: 1 };
    stopChain = runChain(el.querySelector('#challenge'), {
      chain: ch.chain,
      level: c.state.challengeLevel,
      qrPayload: ch.qrPayload,
      onComplete: (proof) => AlarmPlugin.dismiss(a.id, proof).catch((err) => console.warn('[ring] dismiss failed', err)),
    });
    AlarmPlugin.ringReady?.().catch(() => {});
  }

  for (const ev of ['ringStarted', 'ringStopped']) {
    AlarmPlugin.addListener(ev, () => render()).then((l) => listeners.push(l));
  }
  render();
  return () => {
    stopChain();
    unsubClock();
    listeners.forEach((l) => l.remove());
  };
}
