import { describe, it, expect, vi } from 'vitest';
import { assignmentLabel, frequency, notesFor } from '../src/music';
import { DEFAULTS, parseSettings, saveSettings, STORAGE_KEY } from '../src/settings';
import { angle, extensionScore, FingerGate, palmCenter, pitchOffset } from '../src/gesture';
import { anatomicalHand, HandIdentity } from '../src/identity';
import { PerformanceController, TRACKING_GRACE_MS, type Instrument } from '../src/performance';
import { FINGERS, type DetectedHand, type Hand, type Point, type Settings } from '../src/types';

function openHand(): Point[] {
  const p = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  p[0] = { x: 0, y: 0.5, z: 0 };
  for (let f = 0; f < 4; f++)
    for (let j = 0; j < 4; j++) p[5 + f * 4 + j] = { x: (f - 1.5) * 0.12, y: 0.3 - j * 0.16, z: 0 };
  for (let j = 0; j < 4; j++) p[1 + j] = { x: -0.18 - j * 0.15, y: 0.38 - j * 0.07, z: 0 };
  return p;
}
function foldedHand(): Point[] {
  const p = openHand();
  for (let f = 0; f < 4; f++) {
    const m = 5 + f * 4;
    p[m + 1] = { x: p[m].x, y: 0.15, z: 0 };
    p[m + 2] = { x: p[m].x, y: 0.3, z: -0.03 };
    p[m + 3] = { x: p[m].x, y: 0.38, z: -0.02 };
  }
  p[2] = { x: -0.2, y: 0.2, z: 0 };
  p[3] = { x: -0.08, y: 0.25, z: 0 };
  p[4] = { x: -0.04, y: 0.32, z: 0 };
  return p;
}
function detected(hand: Hand, y = 0.5, open = true): DetectedHand {
  const world = open ? openHand() : foldedHand();
  const points = world.map((p) => ({ ...p, y: p.y + y - palmCenter(world).y }));
  return { hand, confidence: 0.99, world, points };
}
function instrument() {
  return { noteOn: vi.fn(), noteOff: vi.fn(), bend: vi.fn(), panic: vi.fn() } satisfies Instrument;
}
const fast = (): Settings => ({ ...structuredClone(DEFAULTS), activationMs: 0, releaseMs: 0 });

describe('permanent musical mappings', () => {
  it('has all ten exact default assignments', () => {
    expect(FINGERS.map((f) => assignmentLabel(DEFAULTS.mappings.right[f]))).toEqual([
      'G maj',
      'C maj',
      'D min',
      'E min',
      'F maj',
    ]);
    expect(FINGERS.map((f) => assignmentLabel(DEFAULTS.mappings.left[f]))).toEqual([
      'A min',
      'B dim',
      'C maj7',
      'D min7',
      'G7',
    ]);
  });
  it('creates C major and all supported chord intervals', () => {
    expect(notesFor(DEFAULTS.mappings.right.index)).toEqual([48, 52, 55]);
    expect(notesFor(DEFAULTS.mappings.left.pinky)).toEqual([43, 47, 50, 53]);
  });
  it('supports single notes, octave and key without mutating assignments', () => {
    const a = DEFAULTS.mappings.right.index;
    expect(notesFor({ ...a, octave: 4 }, 'notes', 2)).toEqual([62]);
    expect(a.root).toBe(0);
  });
  it('preserves every frequency ratio across fractional pitch bends', () => {
    for (const bend of [-12, -3.42, 0, 5.25, 12])
      expect(frequency(52, bend) / frequency(48, bend)).toBeCloseTo(2 ** (4 / 12), 10);
  });
});
describe('pitch control', () => {
  it('is neutral at center and +/- one octave at the bounds', () => {
    expect(pitchOffset(0.5, 0.5, 12, 0.035)).toBe(0);
    expect(pitchOffset(0, 0.5, 12, 0.035)).toBe(12);
    expect(pitchOffset(1, 0.5, 12, 0.035)).toBe(-12);
  });
  it('supports neutral dead zone, calibration, sensitivity and clamping', () => {
    expect(pitchOffset(0.48, 0.5, 12, 0.035)).toBe(0);
    expect(pitchOffset(0.7, 0.7, 24, 0.035)).toBe(0);
    expect(pitchOffset(0, 0.7, 24, 0.035, 2)).toBe(24);
    expect(pitchOffset(1, 0.7, 24, 0.035)).toBe(-24);
  });
  it('is continuous at the edge of the dead zone', () =>
    expect(Math.abs(pitchOffset(0.464999, 0.5, 12, 0.035))).toBeLessThan(0.001));
});
describe('geometry', () => {
  it('uses angles instead of fingertip height and distinguishes folded fingers', () => {
    for (const f of FINGERS) {
      expect(extensionScore(openHand(), f)).toBeGreaterThan(DEFAULTS.activation);
      expect(extensionScore(foldedHand(), f)).toBeLessThan(DEFAULTS.releaseThreshold);
    }
  });
  it('retains finger scores under 3D rotation and translation', () => {
    const p = openHand(),
      rot = p.map((v) => ({ x: v.z + 2, y: v.x - 3, z: v.y + 1 }));
    for (const f of FINGERS) expect(extensionScore(rot, f)).toBeCloseTo(extensionScore(p, f), 8);
  });
  it('handles degenerate geometry without false triggers', () => {
    expect(angle({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })).toBe(0);
    expect(extensionScore([], 'thumb')).toBe(0);
  });
});
describe('finger state machines', () => {
  it('triggers once, sustains without repeats, releases once', () => {
    const g = new FingerGate(),
      s = fast();
    expect(g.update(1, 0, 33, s)).toBe('on');
    for (let t = 33; t < 1000; t += 33) expect(g.update(1, t, 33, s)).toBe(null);
    for (let t = 1000; t < 1200; t += 33) g.update(0, t, 33, s);
    expect(g.active).toBe(false);
    expect(g.update(0, 1300, 33, s)).toBe(null);
  });
  it('rejects a one-frame activation and momentary dropout', () => {
    const g = new FingerGate();
    g.update(0, 0, 33, DEFAULTS);
    g.update(1, 33, 33, DEFAULTS);
    g.update(0, 66, 33, DEFAULTS);
    expect(g.active).toBe(false);
    for (let t = 99; t < 400; t += 33) g.update(1, t, 33, DEFAULTS);
    expect(g.active).toBe(true);
    g.update(0, 400, 33, DEFAULTS);
    g.update(1, 433, 33, DEFAULTS);
    expect(g.active).toBe(true);
  });
  it('holds its state in the hysteresis band', () => {
    const g = new FingerGate(),
      s = fast();
    g.update(1, 0, 33, s);
    for (let t = 33; t < 400; t += 33) g.update(0.65, t, 33, s);
    expect(g.active).toBe(true);
  });
});
describe('anatomical handedness', () => {
  it('resolves mirrored inference labels independently of preview and X position', () => {
    expect(anatomicalHand('Left')).toBe('left');
    expect(anatomicalHand('Right')).toBe('right');
    const identity = new HandIdentity();
    const raw = (hand: Hand, x: number) => ({
      ...detected(hand),
      label: hand === 'left' ? 'Left' : 'Right',
      points: detected(hand).points.map((p) => ({ ...p, x: p.x + x })),
    });
    expect(identity.resolve([raw('right', 0.1), raw('left', 0.8)], 0).map((h) => h.hand)).toEqual([
      'right',
      'left',
    ]);
    expect(identity.resolve([raw('left', 0.1), raw('right', 0.8)], 33).map((h) => h.hand)).toEqual([
      'left',
      'right',
    ]);
  });
  it('never returns duplicate identities for two hands', () => {
    const identity = new HandIdentity();
    const d = detected('left');
    expect(
      new Set(
        identity
          .resolve(
            [
              { ...d, label: 'Left' },
              { ...d, label: 'Left' },
            ],
            0,
          )
          .map((h) => h.hand),
      ).size,
    ).toBe(2);
  });
});
describe('performance lifecycle', () => {
  it('plays the right index C major and bends without retriggering', () => {
    const audio = instrument(),
      c = new PerformanceController(audio),
      s = fast();
    c.update([detected('right')], 100, s);
    expect(audio.noteOn).toHaveBeenCalledWith('right:index', [48, 52, 55], 'right');
    const n = audio.noteOn.mock.calls.length;
    for (let t = 133; t < 500; t += 33) c.update([detected('right', 0.1)], t, s);
    expect(audio.noteOn).toHaveBeenCalledTimes(n);
    expect(audio.bend.mock.calls.some(([hand, v]) => hand === 'right' && v > 5)).toBe(true);
  });
  it('bends both hands independently', () => {
    const audio = instrument(),
      c = new PerformanceController(audio),
      s = fast();
    const snap = c.update([detected('left', 0), detected('right', 1)], 100, s);
    expect(snap.pitch.left).toBe(12);
    expect(snap.pitch.right).toBe(-12);
    expect(snap.active).toHaveLength(10);
  });
  it('releases after tracking grace, tolerates brief loss, and reacquires', () => {
    const audio = instrument(),
      c = new PerformanceController(audio),
      s = fast();
    c.update([detected('right')], 100, s);
    c.update([], 100 + TRACKING_GRACE_MS - 1, s);
    expect(audio.noteOff).not.toHaveBeenCalled();
    c.expire(100 + TRACKING_GRACE_MS + 1);
    expect(audio.noteOff).toHaveBeenCalledTimes(5);
    expect(c.snapshot(300).active).toHaveLength(0);
    c.expire(400);
    expect(audio.noteOff).toHaveBeenCalledTimes(5);
    c.update([detected('right')], 500, s);
    expect(audio.noteOn).toHaveBeenCalledTimes(10);
  });
  it('releases folded fingers and resets every state on stop', () => {
    const audio = instrument(),
      c = new PerformanceController(audio),
      s = fast();
    c.update([detected('right')], 100, s);
    for (let t = 133; t < 450; t += 33) c.update([detected('right', 0.5, false)], t, s);
    expect(c.snapshot(440).active).toHaveLength(0);
    expect(audio.noteOff).toHaveBeenCalledTimes(5);
    c.reset();
    expect(audio.panic).toHaveBeenCalledOnce();
    expect(c.palms).toEqual({});
  });
});
describe('settings persistence', () => {
  it('round trips every mapping and sound setting', () => {
    const s = structuredClone(DEFAULTS);
    s.mappings.right.index = { root: 6, octave: 5, chord: 'sus4' };
    s.volume = 0.23;
    s.preset = 'piano';
    expect(parseSettings(JSON.stringify(s))).toEqual(s);
  });
  it('writes to local storage and reports unavailable storage', () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { setItem });
    expect(saveSettings(DEFAULTS)).toBe(true);
    expect(setItem).toHaveBeenCalledWith(STORAGE_KEY, JSON.stringify(DEFAULTS));
    vi.stubGlobal('localStorage', {
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(saveSettings(DEFAULTS)).toBe(false);
    vi.unstubAllGlobals();
  });
  it('recovers from corrupt, partial, malicious or out-of-range saved data', () => {
    expect(parseSettings('broken')).toEqual(DEFAULTS);
    const s = parseSettings(
      JSON.stringify({
        version: 1,
        volume: 9,
        range: -3,
        mappings: { right: { index: { root: 42, chord: 'major', octave: 3 } } },
        skeleton: false,
        neutral: { left: null },
      }),
    );
    expect(s.volume).toBe(1);
    expect(s.range).toBe(1);
    expect(s.skeleton).toBe(false);
    expect(s.neutral.left).toBe(0.5);
    expect(s.mappings.right.index).toEqual(DEFAULTS.mappings.right.index);
  });
});
