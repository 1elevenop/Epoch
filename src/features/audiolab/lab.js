// Audio Lab (BLUEPRINT §6.6): an index-card drawer. A tool plays only while its card is open.

import { mountDrawer } from '../shared/drawer.js';
import { metronomeScreen } from './metronome.js';
import { toneScreen } from './tone.js';
import { noiseScreen } from './noise.js';
import { tunerScreen } from './tuner.js';
import { binauralScreen } from './binaural.js';

const TOOLS = [
  { id: 'metronome', name: 'Metronome', sub: '20–300 BPM, tap tempo', render: metronomeScreen },
  { id: 'tone', name: 'Tone', sub: '20 Hz – 20 kHz, sweep', render: toneScreen },
  { id: 'noise', name: 'Noise', sub: 'White, pink, brown', render: noiseScreen },
  { id: 'tuner', name: 'Tuner', sub: 'Note and cents', render: tunerScreen },
  { id: 'binaural', name: 'Binaural beats', sub: 'Headphones', render: binauralScreen },
];

export const labScreen = (el) =>
  mountDrawer(el, { title: 'Audio Lab', items: TOOLS, note: 'Default volume is 30 %. Sound stops when you close a card.' });
