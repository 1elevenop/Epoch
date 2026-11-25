// Tools (BLUEPRINT §6.7): an index-card drawer; each tool opens inside its card.

import { mountDrawer } from '../shared/drawer.js';
import { clockScreen } from '../clock/clock.js';
import { intervalScreen } from './interval.js';
import { breathingScreen } from './breathing.js';
import { countdownsScreen } from './countdowns.js';
import { speechScreen } from './speech.js';

const TOOLS = [
  { id: 'clock', name: 'Clock', sub: 'World clocks, night clock', render: clockScreen },
  { id: 'interval', name: 'Interval', sub: 'Work, rest, rounds', render: intervalScreen },
  { id: 'breathing', name: 'Breathing', sub: 'Box, 4-7-8, custom', render: breathingScreen },
  { id: 'countdowns', name: 'Countdowns', sub: 'Days until events', render: countdownsScreen },
  { id: 'chess', name: 'Chess clock', sub: 'Two sides, increment', href: '#/tool-chess' },
  { id: 'speech', name: 'Speech timer', sub: 'Green, yellow, red', render: speechScreen },
];

export const toolsScreen = (el) => mountDrawer(el, { title: 'Tools', items: TOOLS });
