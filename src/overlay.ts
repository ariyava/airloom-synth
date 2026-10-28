import { CONNECTIONS, TIP } from './gesture';
import { assignmentLabel } from './music';
import { FINGERS, type DetectedHand, type Point, type Settings, type Snapshot } from './types';
export function fitFrame(width: number, height: number, ratio: number) {
  const w = Math.min(width, height * ratio),
    h = w / ratio;
  return { width: w, height: h, x: (width - w) / 2, y: (height - h) / 2 };
}
export class Overlay {
  private smooth = new Map<string, Point>();
  draw(
    canvas: HTMLCanvasElement,
    hands: DetectedHand[],
    state: Snapshot,
    s: Settings,
    now: number,
    ratio = 4 / 3,
  ) {
    const rect = canvas.getBoundingClientRect(),
      dpr = Math.min(devicePixelRatio, 2);
    if (
      canvas.width !== Math.round(rect.width * dpr) ||
      canvas.height !== Math.round(rect.height * dpr)
    ) {
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
    }
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    const frame = fitFrame(rect.width, rect.height, ratio);
    ctx.translate(frame.x, frame.y);
    const w = frame.width,
      h = frame.height,
      keep = new Set<string>();
    if (s.debug)
      for (const hand of ['left', 'right'] as const) {
        const y = (s.reference === 'calibrated' ? s.neutral[hand] : 0.5) * h;
        ctx.strokeStyle = hand === 'left' ? '#ad9fff88' : '#c9f48988';
        ctx.setLineDash([5, 8]);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    for (const hand of hands) {
      const color = hand.hand === 'right' ? '#c8f58b' : '#b3a1ff';
      const points = hand.points.map((p, i) => {
        const key = `${hand.hand}:${i}`;
        keep.add(key);
        const prev = this.smooth.get(key);
        const next = prev
          ? { x: prev.x + (p.x - prev.x) * 0.6, y: prev.y + (p.y - prev.y) * 0.6, z: p.z }
          : p;
        this.smooth.set(key, next);
        return next;
      });
      if (s.skeleton) {
        ctx.strokeStyle = color + '55';
        ctx.lineWidth = 1.3;
        for (const [a, b] of CONNECTIONS) {
          ctx.beginPath();
          ctx.moveTo(points[a].x * w, points[a].y * h);
          ctx.lineTo(points[b].x * w, points[b].y * h);
          ctx.stroke();
        }
      }
      for (const f of FINGERS) {
        const p = points[TIP[f]],
          active = state.active.includes(`${hand.hand}:${f}`),
          x = p.x * w,
          y = p.y * h;
        ctx.save();
        ctx.fillStyle = color;
        ctx.globalAlpha = active ? 1 : 0.4;
        ctx.shadowColor = color;
        ctx.shadowBlur = active ? 18 : 3;
        ctx.beginPath();
        ctx.arc(x, y, active ? 5 : 3, 0, Math.PI * 2);
        ctx.fill();
        if (active) {
          ctx.globalAlpha = 0.3;
          ctx.lineWidth = 1;
          ctx.strokeStyle = color;
          ctx.beginPath();
          ctx.arc(x, y, 10 + Math.sin(now / 180) * 2, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
        if (s.labels) {
          const label = assignmentLabel(s.mappings[hand.hand][f], s.mode, s.key);
          ctx.font = '500 11px ui-monospace, monospace';
          const width = ctx.measureText(label).width + 16;
          const lx = Math.max(4, Math.min(w - width - 4, x - width / 2)),
            ly = Math.max(4, y - 32);
          ctx.fillStyle = active ? '#c8f58b' : '#151b1de6';
          if (hand.hand === 'left' && active) ctx.fillStyle = '#b3a1ff';
          ctx.beginPath();
          ctx.roundRect(lx, ly, width, 22, 5);
          ctx.fill();
          ctx.fillStyle = active ? '#101510' : '#d0d8d5';
          ctx.fillText(label, lx + 8, ly + 15);
        }
      }
    }
    for (const key of this.smooth.keys()) if (!keep.has(key)) this.smooth.delete(key);
  }
}
