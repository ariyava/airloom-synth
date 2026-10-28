import { CHORDS } from './music';
import { FINGERS, HANDS, type Assignment, type Settings } from './types';
const a = (root: number, chord: Assignment['chord'], octave = 3): Assignment => ({
  root,
  chord,
  octave,
});
export const DEFAULTS: Settings = {
  version: 1,
  mappings: {
    right: {
      thumb: a(7, 'major'),
      index: a(0, 'major'),
      middle: a(2, 'minor'),
      ring: a(4, 'minor'),
      pinky: a(5, 'major'),
    },
    left: {
      thumb: a(9, 'minor', 2),
      index: a(11, 'dim', 2),
      middle: a(0, 'maj7'),
      ring: a(2, 'min7'),
      pinky: a(7, '7', 2),
    },
  },
  preset: 'analog',
  mode: 'chords',
  key: 0,
  volume: 1,
  range: 12,
  sensitivity: 1,
  deadZone: 0.035,
  smoothing: 65,
  activation: 0.79,
  releaseThreshold: 0.53,
  activationMs: 32,
  releaseMs: 55,
  reverb: 0.22,
  delay: 0.12,
  chorus: 0,
  cutoff: 6500,
  attack: 0.025,
  decay: 0.25,
  sustain: 0.65,
  release: 0.5,
  skeleton: true,
  labels: true,
  debug: false,
  showFps: true,
  reference: 'center',
  neutral: { left: 0.5, right: 0.5 },
};
export const STORAGE_KEY = 'airloom.settings.v1';
export function parseSettings(raw: string | null): Settings {
  const s = structuredClone(DEFAULTS);
  try {
    const v = JSON.parse(raw ?? '{}');
    if (v.version !== 1) return s;
    const bounds: Partial<Record<keyof Settings, [number, number]>> = {
      key: [0, 11],
      volume: [0, 1],
      range: [1, 24],
      sensitivity: [0.25, 2],
      deadZone: [0, 0.15],
      smoothing: [0, 250],
      activation: [0.65, 0.95],
      releaseThreshold: [0.2, 0.6],
      activationMs: [0, 150],
      releaseMs: [0, 200],
      reverb: [0, 1],
      delay: [0, 0.7],
      chorus: [0, 1],
      cutoff: [100, 18000],
      attack: [0.005, 2],
      decay: [0.02, 2],
      sustain: [0.05, 1],
      release: [0.03, 3],
    };
    for (const [k, [min, max]] of Object.entries(bounds)) {
      const n = v[k];
      if (typeof n === 'number' && Number.isFinite(n))
        Object.assign(s, { [k]: Math.max(min, Math.min(max, n)) });
    }
    for (const k of ['skeleton', 'labels', 'debug', 'showFps'] as const)
      if (typeof v[k] === 'boolean') s[k] = v[k];
    if (['analog', 'pad', 'piano', 'pluck', 'dream', 'bass'].includes(v.preset))
      s.preset = v.preset;
    if (['notes', 'chords'].includes(v.mode)) s.mode = v.mode;
    if (['center', 'calibrated'].includes(v.reference)) s.reference = v.reference;
    for (const h of HANDS) {
      if (typeof v.neutral?.[h] === 'number' && Number.isFinite(v.neutral[h]))
        s.neutral[h] = Math.max(0.15, Math.min(0.85, v.neutral[h]));
      for (const f of FINGERS) {
        const m = v.mappings?.[h]?.[f];
        if (
          m &&
          Number.isInteger(m.root) &&
          m.root >= 0 &&
          m.root < 12 &&
          Number.isInteger(m.octave) &&
          m.octave >= 1 &&
          m.octave <= 6 &&
          Object.hasOwn(CHORDS, m.chord)
        )
          s.mappings[h][f] = { root: m.root, octave: m.octave, chord: m.chord };
      }
    }
  } catch {
    /* Corrupt or unavailable storage uses safe defaults. */
  }
  return s;
}
export function loadSettings(): Settings {
  try {
    return parseSettings(localStorage.getItem(STORAGE_KEY));
  } catch {
    return structuredClone(DEFAULTS);
  }
}
export function saveSettings(s: Settings): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}
