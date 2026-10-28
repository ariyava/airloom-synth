import { FINGERS, type Finger, type Point, type Settings } from './types';
export const TIP: Record<Finger, number> = { thumb: 4, index: 8, middle: 12, ring: 16, pinky: 20 };
export const CONNECTIONS = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
];
export const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export function angle(a: Point, b: Point, c: Point): number {
  const u = [a.x - b.x, a.y - b.y, a.z - b.z],
    v = [c.x - b.x, c.y - b.y, c.z - b.z];
  const denominator = Math.hypot(...u) * Math.hypot(...v);
  return denominator < 1e-9
    ? 0
    : (Math.acos(clamp(u.reduce((n, x, i) => n + x * v[i], 0) / denominator, -1, 1)) * 180) /
        Math.PI;
}
export function palmCenter(points: Point[]): Point {
  const ids = [0, 5, 9, 13, 17];
  return ids.reduce(
    (p, i) => ({ x: p.x + points[i].x / 5, y: p.y + points[i].y / 5, z: p.z + points[i].z / 5 }),
    { x: 0, y: 0, z: 0 },
  );
}
/** Rotation invariant joint angles; use world-space points for geometry. */
export function extensionScore(p: Point[], finger: Finger): number {
  if (p.length !== 21 || p.some((v) => !Number.isFinite(v.x + v.y + v.z))) return 0;
  if (finger === 'thumb') {
    const straight = clamp((angle(p[2], p[3], p[4]) - 110) / 60);
    const spread = clamp(
      (distance(p[4], p[5]) / Math.max(distance(p[5], p[17]), 1e-5) - 0.35) / 0.85,
    );
    const mcp = clamp((angle(p[1], p[2], p[3]) - 95) / 65);
    return clamp(straight * 0.4 + spread * 0.45 + mcp * 0.15);
  }
  const tip = TIP[finger],
    mcp = tip - 3,
    pip = tip - 2,
    dip = tip - 1;
  const pipScore = clamp((angle(p[mcp], p[pip], p[dip]) - 85) / 85);
  const dipScore = clamp((angle(p[pip], p[dip], p[tip]) - 95) / 75);
  const reach = clamp(
    (distance(p[tip], p[0]) - distance(p[mcp], p[0])) /
      Math.max(
        distance(p[mcp], p[pip]) + distance(p[pip], p[dip]) + distance(p[dip], p[tip]),
        1e-5,
      ),
  );
  return clamp(pipScore * 0.6 + dipScore * 0.25 + reach * 0.15);
}
export function allScores(points: Point[]): Record<Finger, number> {
  return Object.fromEntries(FINGERS.map((f) => [f, extensionScore(points, f)])) as Record<
    Finger,
    number
  >;
}
export function pitchOffset(
  y: number,
  neutral: number,
  range: number,
  deadZone: number,
  sensitivity = 1,
): number {
  const delta = neutral - y;
  if (Math.abs(delta) <= deadZone) return 0;
  const span = delta > 0 ? neutral : 1 - neutral;
  return (
    clamp(((Math.abs(delta) - deadZone) / Math.max(span - deadZone, 0.01)) * sensitivity, 0, 1) *
    range *
    Math.sign(delta)
  );
}
export class FingerGate {
  active = false;
  private candidate: boolean | null = null;
  private since = 0;
  private score: number | null = null;
  update(raw: number, now: number, dt: number, s: Settings): 'on' | 'off' | null {
    // Fast one-pole filtering followed by Schmitt trigger and time-based debounce.
    this.score =
      this.score === null ? raw : this.score + (raw - this.score) * (1 - Math.exp(-dt / 18));
    const desired = this.active ? this.score > s.releaseThreshold : this.score >= s.activation;
    if (desired === this.active) {
      this.candidate = null;
      return null;
    }
    if (desired !== this.candidate) {
      this.candidate = desired;
      this.since = now;
    }
    if (now - this.since < (desired ? s.activationMs : s.releaseMs)) return null;
    this.active = desired;
    this.candidate = null;
    return desired ? 'on' : 'off';
  }
  reset() {
    this.active = false;
    this.score = null;
    this.candidate = null;
  }
}
