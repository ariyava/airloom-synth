import type { Assignment, Chord, Settings } from './types';
export const ROOTS = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const CHORDS: Record<Chord, { label: string; suffix: string; intervals: number[] }> = {
  note: { label: 'Single note', suffix: '', intervals: [0] },
  major: { label: 'Major', suffix: ' maj', intervals: [0, 4, 7] },
  minor: { label: 'Minor', suffix: ' min', intervals: [0, 3, 7] },
  dim: { label: 'Diminished', suffix: ' dim', intervals: [0, 3, 6] },
  '7': { label: 'Dominant 7', suffix: '7', intervals: [0, 4, 7, 10] },
  maj7: { label: 'Major 7', suffix: ' maj7', intervals: [0, 4, 7, 11] },
  min7: { label: 'Minor 7', suffix: ' min7', intervals: [0, 3, 7, 10] },
  sus2: { label: 'Suspended 2', suffix: ' sus2', intervals: [0, 2, 7] },
  sus4: { label: 'Suspended 4', suffix: ' sus4', intervals: [0, 5, 7] },
  aug: { label: 'Augmented', suffix: ' aug', intervals: [0, 4, 8] },
};
export const PRESETS = {
  analog: 'Classic Analog',
  pad: 'Warm Ambient Pad',
  piano: 'Electric Piano',
  pluck: 'Pluck Synth',
  dream: 'Dreamy Atmosphere',
  bass: 'Deep Bass',
} as const;
export function notesFor(a: Assignment, mode: Settings['mode'] = 'chords', key = 0): number[] {
  const root = (a.octave + 1) * 12 + a.root + key;
  return (mode === 'notes' ? [0] : CHORDS[a.chord].intervals).map((i) => root + i);
}
export const frequency = (midi: number, bend = 0) => 440 * 2 ** ((midi + bend - 69) / 12);
export function assignmentLabel(a: Assignment, mode: Settings['mode'] = 'chords', key = 0) {
  return ROOTS[(a.root + key) % 12] + (mode === 'notes' ? '' : CHORDS[a.chord].suffix);
}
