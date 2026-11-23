import { ic } from '../../core/icons.js';
// Math challenge (BLUEPRINT §5.3). Kept solvable half-asleep:
// L1: 1-digit + 1-digit · L2: 2-digit + 1-digit · L3: 2-digit + 2-digit · L4: times table (3 problems).
// Wrong answer adds one more problem, at most MAX_EXTRA in total. Numeric keypad only.

export const MAX_EXTRA = 2;

export function problem(level, r) {
  if (level <= 1) {
    const a = r.int(2, 9);
    const b = r.int(2, 9);
    return { text: `${a} + ${b}`, answer: a + b };
  }
  if (level === 2) {
    const a = r.int(11, 49);
    const b = r.int(2, 9);
    return { text: `${a} + ${b}`, answer: a + b };
  }
  if (level === 3) {
    const a = r.int(10, 49);
    const b = r.int(10, 49);
    return { text: `${a} + ${b}`, answer: a + b };
  }
  const a = r.int(2, 9);
  const b = r.int(2, 9);
  return { text: `${a} × ${b}`, answer: a * b };
}

/** Compares the typed digits with the answer (pure, unit tested). */
export const check = (typed, answer) => /^\d+$/.test(typed) && Number(typed) === answer;

export const problemCount = (level) => (level >= 4 ? 3 : 2);

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓'];

export function mount(host, { level, r, onDone, onFail }) {
  let remaining = problemCount(level);
  let extra = 0;
  let current = problem(level, r);
  let typed = '';
  host.innerHTML = `
    <p class="ch-progress" aria-live="polite"></p>
    <p class="ch-problem digits"></p>
    <p class="ch-answer digits" aria-live="polite"></p>
    <p class="ch-status" role="alert"></p>
    <div class="keypad" role="group" aria-label="Number keypad">
      ${KEYS.map((k) => `<button class="key ${k === '✓' ? 'ok' : ''}" data-k="${k}" aria-label="${k === '⌫' ? 'Delete' : k === '✓' ? 'Check answer' : k}">${k === '⌫' ? ic('backspace') : k === '✓' ? ic('check') : k}</button>`).join('')}
    </div>`;
  const $ = (s) => host.querySelector(s);

  function draw() {
    $('.ch-progress').textContent = `${remaining} left`;
    $('.ch-problem').textContent = `${current.text} = ?`;
    $('.ch-answer').textContent = typed || '_';
  }

  host.querySelector('.keypad').addEventListener('click', (e) => {
    const k = e.target.closest('[data-k]')?.dataset.k;
    if (!k) return;
    const status = $('.ch-status');
    if (k === '⌫') typed = typed.slice(0, -1);
    else if (k === '✓') {
      if (typed === '') return;
      status.className = 'ch-status';
      const verdict = check(typed, current.answer);
      if (verdict) {
        remaining -= 1;
        if (remaining === 0) return onDone();
        status.classList.add('ok');
        status.textContent = `Correct — ${remaining} more`;
      } else {
        const add = extra < MAX_EXTRA; // wrong answer adds a problem, capped so it never spirals
        if (add) {
          extra += 1;
          remaining += 1;
        }
        onFail();
        status.textContent = `${typed} is wrong (${current.text} = ${current.answer}).${add ? ' One more added.' : ' Try another.'}`;
      }
      current = problem(level, r);
      typed = '';
    } else if (typed.length < 6) typed += k;
    draw();
  });
  draw();
  return () => {};
}
