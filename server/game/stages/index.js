// Stage registry. Adding a stage = writing a module with the same shape
// (generate/validate/views/actions/hint/fakeFor) and listing it here.
import junction from './junction.js';
import archive from './archive.js';
import pressure from './pressure.js';
import broadcast from './broadcast.js';
import chase from './chase.js';
import core from './core.js';

export const STAGES = [junction, archive, pressure, broadcast, chase, core];
