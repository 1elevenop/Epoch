// First-run onboarding (BLUEPRINT §6.9). Done only after the test alarm rang on the lock screen.

import { AlarmPlugin } from '../../core/bridge.js';
import { esc } from '../../core/dom.js';
import { getSettings, setSetting } from '../../core/store.js';
import { toast } from '../../core/toast.js';
import { statusList, oemSteps, ITEMS } from './reliability.js';
import { openEditor } from '../alarm/editor.js';
import { startTestAlarm } from '../alarm/alarm.js';

const STEPS = ['Welcome', 'Permissions', 'Battery', 'Test'];

export function onboardingScreen(el) {
  let step = 0;
  let testStartedAt = null;
  document.body.classList.add('no-tabbar');
  setSetting('onboardingSeen', true);

  el.innerHTML = `<section class="screen onboarding" aria-labelledby="screen-title">
      <ol class="dots" aria-label="Setup progress">${STEPS.map((s) => `<li>${s}</li>`).join('')}</ol>
      <div id="ob-body"></div>
      <div class="ob-nav">
        <button class="btn btn-ghost" data-act="skip" aria-label="Skip setup for now">Skip for now</button>
        <button class="btn" data-act="next" aria-label="Next step">Next</button>
      </div>
    </section>`;
  const body = el.querySelector('#ob-body');
  const nextBtn = el.querySelector('[data-act=next]');

  async function render() {
    el.querySelectorAll('.dots li').forEach((li, i) => li.classList.toggle('on', i <= step));
    nextBtn.hidden = step === 3;
    if (step === 0) {
      body.innerHTML = `<h1 id="screen-title">WAKE11</h1>
        <p class="lead">An alarm clock that actually gets you up, plus timers, a stopwatch and focus sessions.</p>
        <ul class="ticks"><li>Alarms ring even when the phone is locked, silent or rebooted.</li>
        <li>Snoozing gets harder each time (coming next).</li>
        <li>Everything stays on this phone. No account.</li></ul>
        <p class="muted">Setup takes about 2 minutes and ends with a real 10-second test alarm.</p>`;
    }
    if (step === 1 || step === 2) {
      body.innerHTML = `<h1 id="screen-title">${step === 1 ? 'Permissions' : 'Battery'}</h1><ul class="rel-list"><li class="empty">Checking…</li></ul><div id="oem"></div>`;
      try {
        const s = await AlarmPlugin.getReliabilityStatus();
        const items = step === 1 ? ITEMS.slice(0, 3) : ITEMS.slice(3);
        body.querySelector('.rel-list').innerHTML = statusList(s, items);
        if (step === 2) {
          const oem = oemSteps(s.manufacturer);
          body.querySelector('#oem').innerHTML = `<div class="card"><h2>${esc(oem.name)}: also do this</h2>
            <ol class="steps">${oem.steps.map((t) => `<li>${esc(t)}</li>`).join('')}</ol></div>`;
        }
      } catch (err) {
        body.querySelector('.rel-list').innerHTML = `<li class="empty">${esc(err.message)}</li>`;
      }
    }
    if (step === 3) {
      body.innerHTML = `<h1 id="screen-title">Test it</h1>
        <p class="lead">1. Create your first alarm.</p>
        <button class="btn btn-ghost" data-act="first" aria-label="Create first alarm">Create first alarm</button>
        <p class="lead">2. Start the test, then lock the phone. It rings in 10 seconds over the lock screen. Solve the sum to stop it.</p>
        <button class="btn" data-act="test" aria-label="Start 10 second test alarm">Start test alarm</button>
        <div id="confirm"></div>`;
      checkTest();
    }
  }

  async function checkTest() {
    if (!testStartedAt) return;
    const logs = await AlarmPlugin.getLogs().catch(() => []);
    const rang = logs.some((l) => l.label === 'Test alarm' && l.firstRangAt >= testStartedAt);
    const box = body.querySelector('#confirm');
    if (!box || !rang) return;
    box.innerHTML = `<div class="card"><h2>Did it ring on the lock screen?</h2>
      <div class="row"><button class="btn" data-act="yes" aria-label="Yes, it rang on the lock screen">Yes</button>
      <button class="btn btn-ghost" data-act="no" aria-label="No, it did not">No</button></div></div>`;
  }

  el.querySelector('.screen').addEventListener('click', async (e) => {
    const setting = e.target.closest('[data-setting]')?.dataset.setting;
    if (setting === 'notifications') {
      const r = await AlarmPlugin.requestNotifications().catch(() => ({ granted: false }));
      if (!r.granted) await AlarmPlugin.openSetting('notifications');
      render();
      return;
    }
    if (setting) return AlarmPlugin.openSetting(setting).catch((err) => toast(err.message));
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'next') {
      step = Math.min(3, step + 1);
      render();
    }
    if (act === 'skip') location.hash = '#/alarm';
    if (act === 'first') openEditor(null);
    if (act === 'test' && (await startTestAlarm())) testStartedAt = Date.now() - 1000;
    if (act === 'yes') {
      setSetting('onboarded', true);
      toast('Setup done. Keep your old alarm as a backup for the first 2 weeks.', { ms: 6000 });
      location.hash = '#/alarm';
    }
    if (act === 'no') location.hash = '#/reliability';
  });

  let listener = null;
  let alive = true;
  AlarmPlugin.addListener('ringStopped', () => setTimeout(checkTest, 300)).then((l) => (alive ? (listener = l) : l.remove()));
  const onVisible = () => {
    if (document.hidden) return;
    if (step === 3) checkTest();
    else render();
  };
  document.addEventListener('visibilitychange', onVisible);
  render();

  return () => {
    alive = false;
    listener?.remove();
    document.removeEventListener('visibilitychange', onVisible);
    document.body.classList.remove('no-tabbar');
  };
}

export const needsOnboarding = () => !getSettings().onboarded;
