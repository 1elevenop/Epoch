import { flip, glitch, odometer, scramble, nixie } from './classic.js';
import { holo, particles, liquid, segment } from './fx.js';

export const TRANSITIONS = [flip, glitch, odometer, scramble, nixie, holo, particles, liquid, segment];

export const transitionById = (id) => TRANSITIONS.find((t) => t.id === id) ?? flip;
