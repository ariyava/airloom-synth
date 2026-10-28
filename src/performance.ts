import { allScores, FingerGate, palmCenter, pitchOffset } from './gesture';
import {
  FINGERS,
  HANDS,
  type DetectedHand,
  type Hand,
  type Settings,
  type Snapshot,
  type Trigger,
} from './types';
export interface Instrument {
  noteOn(id: Trigger, notes: number[], hand: Hand): void;
  noteOff(id: Trigger): void;
  bend(hand: Hand, semitones: number): void;
  panic(): void;
}
import { notesFor } from './music';
export const TRACKING_GRACE_MS = 160;
export class PerformanceController {
  private gates = new Map<Trigger, FingerGate>();
  private lastSeen: Record<Hand, number> = { left: -Infinity, right: -Infinity };
  private lastTime = 0;
  private pitch: Record<Hand, number> = { left: 0, right: 0 };
  palms: Partial<Record<Hand, number>> = {};
  constructor(private instrument: Instrument) {
    for (const h of HANDS) for (const f of FINGERS) this.gates.set(`${h}:${f}`, new FingerGate());
  }
  update(hands: DetectedHand[], now: number, s: Settings): Snapshot {
    const dt = this.lastTime ? Math.max(1, Math.min(100, now - this.lastTime)) : 33;
    this.lastTime = now;
    for (const h of hands) {
      const first = now - this.lastSeen[h.hand] > TRACKING_GRACE_MS;
      this.lastSeen[h.hand] = now;
      const y = palmCenter(h.points).y;
      this.palms[h.hand] = y;
      const neutral = s.reference === 'calibrated' ? s.neutral[h.hand] : 0.5;
      const target = pitchOffset(y, neutral, s.range, s.deadZone, s.sensitivity);
      this.pitch[h.hand] = first
        ? target
        : this.pitch[h.hand] +
          (target - this.pitch[h.hand]) * (s.smoothing === 0 ? 1 : 1 - Math.exp(-dt / s.smoothing));
      this.instrument.bend(h.hand, this.pitch[h.hand]);
      const scores = allScores(h.world.length === 21 ? h.world : h.points);
      for (const f of FINGERS) {
        const id: Trigger = `${h.hand}:${f}`,
          gate = this.gates.get(id)!;
        const event = gate.update(scores[f], now, dt, s);
        if (event === 'on')
          this.instrument.noteOn(id, notesFor(s.mappings[h.hand][f], s.mode, s.key), h.hand);
        if (event === 'off') this.instrument.noteOff(id);
      }
    }
    this.expire(now);
    return this.snapshot(now);
  }
  expire(now: number) {
    for (const h of HANDS)
      if (now - this.lastSeen[h] > TRACKING_GRACE_MS) {
        for (const f of FINGERS) {
          const id: Trigger = `${h}:${f}`,
            g = this.gates.get(id)!;
          if (g.active) this.instrument.noteOff(id);
          g.reset();
        }
        delete this.palms[h];
        this.pitch[h] = 0;
      }
  }
  snapshot(now: number): Snapshot {
    return {
      active: [...this.gates].filter(([, g]) => g.active).map(([id]) => id),
      pitch: { ...this.pitch },
      seen: {
        left: now - this.lastSeen.left <= TRACKING_GRACE_MS,
        right: now - this.lastSeen.right <= TRACKING_GRACE_MS,
      },
      fps: 0,
    };
  }
  reset() {
    this.instrument.panic();
    for (const g of this.gates.values()) g.reset();
    this.lastSeen = { left: -Infinity, right: -Infinity };
    this.pitch = { left: 0, right: 0 };
    this.palms = {};
    this.lastTime = 0;
  }
}
