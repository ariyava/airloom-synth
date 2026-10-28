export const HANDS = ['left', 'right'] as const;
export const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'] as const;
export type Hand = (typeof HANDS)[number];
export type Finger = (typeof FINGERS)[number];
export type Trigger = `${Hand}:${Finger}`;
export type Chord =
  | 'note'
  | 'major'
  | 'minor'
  | 'dim'
  | '7'
  | 'maj7'
  | 'min7'
  | 'sus2'
  | 'sus4'
  | 'aug';
export interface Assignment {
  root: number;
  octave: number;
  chord: Chord;
}
export type Mappings = Record<Hand, Record<Finger, Assignment>>;
export type Preset = 'analog' | 'pad' | 'piano' | 'pluck' | 'dream' | 'bass';
export interface Point {
  x: number;
  y: number;
  z: number;
}
export interface DetectedHand {
  hand: Hand;
  confidence: number;
  points: Point[];
  world: Point[];
}
export interface Settings {
  version: 1;
  mappings: Mappings;
  preset: Preset;
  mode: 'chords' | 'notes';
  key: number;
  volume: number;
  range: number;
  sensitivity: number;
  deadZone: number;
  smoothing: number;
  activation: number;
  releaseThreshold: number;
  activationMs: number;
  releaseMs: number;
  reverb: number;
  delay: number;
  chorus: number;
  cutoff: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  skeleton: boolean;
  labels: boolean;
  debug: boolean;
  showFps: boolean;
  reference: 'center' | 'calibrated';
  neutral: Record<Hand, number>;
}
export interface Snapshot {
  active: Trigger[];
  pitch: Record<Hand, number>;
  seen: Record<Hand, boolean>;
  fps: number;
}
export const EMPTY_SNAPSHOT: Snapshot = {
  active: [],
  pitch: { left: 0, right: 0 },
  seen: { left: false, right: false },
  fps: 0,
};
