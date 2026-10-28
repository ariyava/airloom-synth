import { describe, expect, it } from 'vitest';
import { OUTPUT_PROFILE, outputCurve } from '../src/audio-output';

describe('loud output with a bounded final ceiling', () => {
  it('provides strong input and makeup gain before the final limiter', () => {
    expect(OUTPUT_PROFILE.drive * OUTPUT_PROFILE.makeup).toBe(48);
  });
  it('is exactly silent at zero and transparent below the soft knee', () => {
    const curve = outputCurve();
    expect(curve[(curve.length - 1) / 2]).toBe(0);
    expect(curve[6144]).toBe(0.5);
  });
  it('never exceeds the output ceiling or reverses signal polarity', () => {
    const curve = outputCurve();
    expect(curve[0]).toBeCloseTo(-0.98, 6);
    expect(curve.at(-1)).toBeCloseTo(0.98, 6);
    for (let i = 0; i < curve.length; i++) {
      expect(Math.abs(curve[i])).toBeLessThanOrEqual(OUTPUT_PROFILE.ceiling + 1e-7);
      if (i) expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1]);
      expect(curve[i]).toBeCloseTo(-curve[curve.length - 1 - i], 6);
    }
  });
});
