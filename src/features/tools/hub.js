// Tools hub (BLUEPRINT §6.7).

const TOOLS = [
  ['interval', 'Interval / HIIT', 'Work, rest, rounds, Tabata'],
  ['breathing', 'Breathing', 'Box, 4-7-8, custom'],
  ['countdowns', 'Event countdowns', '"47 days" cards on Clock'],
  ['chess', 'Chess clock', 'Two sides, increment'],
  ['speech', 'Speech timer', 'Green → yellow → red'],
];

export function toolsScreen(el) {
  el.innerHTML = `
    <section class="screen" aria-labelledby="screen-title">
      <a class="back-link" href="#/more" aria-label="Back to More">‹ More</a>
      <h1 id="screen-title">Tools</h1>
      <ul class="list">
        ${TOOLS.map(([id, name, sub]) => `<li><a class="list-item link" href="#/tool-${id}"><span>${name}</span><span>${sub} ›</span></a></li>`).join('')}
      </ul>
    </section>`;
}
