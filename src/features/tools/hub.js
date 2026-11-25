// Tools hub (BLUEPRINT §6.7).

const TOOLS = [
  ['clock', 'Clock', 'World clocks, night clock'],
  ['interval', 'Interval / HIIT', 'Work, rest, rounds, Tabata'],
  ['breathing', 'Breathing', 'Box, 4-7-8, custom'],
  ['countdowns', 'Event countdowns', 'Days until events'],
  ['chess', 'Chess clock', 'Two sides, increment'],
  ['speech', 'Speech timer', 'Green → yellow → red'],
];

export function toolsScreen(el) {
  el.innerHTML = `
    <section class="screen" aria-labelledby="screen-title">
      <h1 id="screen-title">Tools</h1>
      <ul class="list">
        ${TOOLS.map(([id, name, sub]) => `<li><a class="list-item link" href="#/tool-${id}"><span>${name}</span><span>${sub} ›</span></a></li>`).join('')}
      </ul>
    </section>`;
}
