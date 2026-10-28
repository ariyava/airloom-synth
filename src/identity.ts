import type { DetectedHand, Hand, Point } from './types';
import { palmCenter } from './gesture';
export interface RawHand {
  label: string;
  confidence: number;
  points: Point[];
  world: Point[];
}
/** Inference receives a mirrored image, matching MediaPipe's selfie handedness convention.
 * Preview mirroring never changes this identity. Never assign hands by screen X order. */
export function anatomicalHand(label: string): Hand {
  return label.toLowerCase() === 'left' ? 'left' : 'right';
}
export class HandIdentity {
  private previous = new Map<Hand, { center: Point; time: number }>();
  resolve(raw: RawHand[], now: number): DetectedHand[] {
    const valid = raw.filter((r) => r.confidence >= 0.55 && r.points.length === 21).slice(0, 2);
    const cost = (r: RawHand, h: Hand) => {
      const p = this.previous.get(h),
        c = palmCenter(r.points);
      const motion =
        p && now - p.time < 250
          ? Math.min(1, Math.hypot(c.x - p.center.x, c.y - p.center.y)) * 0.65
          : 0;
      return motion + (anatomicalHand(r.label) === h ? 0 : 0.8 + r.confidence * 0.6);
    };
    let hands: Hand[];
    if (valid.length === 2)
      hands =
        cost(valid[0], 'left') + cost(valid[1], 'right') <=
        cost(valid[0], 'right') + cost(valid[1], 'left')
          ? ['left', 'right']
          : ['right', 'left'];
    else hands = valid.map((r) => (cost(r, 'left') <= cost(r, 'right') ? 'left' : 'right'));
    return valid.map((r, i) => {
      const hand = hands[i];
      this.previous.set(hand, { center: palmCenter(r.points), time: now });
      return { hand, confidence: r.confidence, points: r.points, world: r.world };
    });
  }
  reset() {
    this.previous.clear();
  }
}
