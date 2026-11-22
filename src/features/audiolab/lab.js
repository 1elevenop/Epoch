// Audio Lab hub (BLUEPRINT §6.6). Every tool plays only while its screen is open (foreground, v1).

const TOOLS = [
  ['metronome', 'Metronome', '20–300 BPM, tap tempo, accents'],
  ['tone', 'Tone generator', 'Sine to sawtooth, 20 Hz – 20 kHz, sweep'],
  ['noise', 'Noise', 'White, pink, brown, sleep fade-out'],
  ['tuner', 'Tuner', 'Microphone → note and cents'],
  ['binaural', 'Binaural beats', 'Experimental · headphones'],
];

export function labScreen(el) {
  el.innerHTML = `
    <section class="screen" aria-labelledby="screen-title">
      <a class="back-link" href="#/more" aria-label="Back to More">‹ More</a>
      <h1 id="screen-title">Audio Lab</h1>
      <ul class="list">
        ${TOOLS.map(([id, name, sub]) => `<li><a class="list-item link" href="#/audio-${id}"><span>${name}</span><span>${sub} ›</span></a></li>`).join('')}
      </ul>
      <p class="muted">Default volume is 30 %. Sound stops when you leave a tool.</p>
    </section>`;
}
