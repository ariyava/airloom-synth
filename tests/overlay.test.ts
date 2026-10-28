import { describe, expect, it } from 'vitest';
import { fitFrame } from '../src/overlay';
describe('overlay registration', () => {
  it('aligns a 4:3 camera with letterboxed desktop video without stretching', () => {
    const fit = fitFrame(1000, 480, 4 / 3);
    expect(fit).toEqual({ width: 640, height: 480, x: 180, y: 0 });
  });
  it('aligns a wide camera in a narrow viewport', () => {
    const fit = fitFrame(320, 340, 16 / 9);
    expect(fit).toEqual({ width: 320, height: 180, x: 0, y: 80 });
  });
  it('keeps the exact center baseline at the visible frame center', () => {
    const fit = fitFrame(390, 340, 4 / 3);
    expect(fit.y + fit.height * 0.5).toBe(170);
  });
});
