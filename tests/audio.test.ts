import { afterEach, describe, expect, it, vi } from 'vitest';
import { SynthEngine, SOUNDS } from '../src/audio';
import { DEFAULTS } from '../src/settings';
class Param {
  value = 0;
  setValueAtTime = vi.fn((v: number) => {
    this.value = v;
    return this;
  });
  setTargetAtTime = vi.fn((v: number) => {
    this.value = v;
    return this;
  });
  linearRampToValueAtTime = vi.fn((v: number) => {
    this.value = v;
    return this;
  });
  exponentialRampToValueAtTime = vi.fn((v: number) => {
    this.value = v;
    return this;
  });
  cancelAndHoldAtTime = vi.fn();
}
class Node {
  gain = new Param();
  frequency = new Param();
  detune = new Param();
  delayTime = new Param();
  Q = new Param();
  threshold = new Param();
  knee = new Param();
  ratio = new Param();
  attack = new Param();
  release = new Param();
  type = 'sine';
  curve: Float32Array | null = null;
  oversample = '';
  buffer: unknown;
  fftSize = 0;
  onended: (() => void) | null = null;
  connect = vi.fn((_node?: unknown) => _node as Node);
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
  getByteTimeDomainData = vi.fn();
}
class Context {
  static latest: Context;
  state = 'running';
  currentTime = 1;
  sampleRate = 8000;
  destination = new Node();
  onstatechange: (() => void) | null = null;
  oscillators: Node[] = [];
  gains: Node[] = [];
  compressors: Node[] = [];
  shapers: Node[] = [];
  constructor() {
    Context.latest = this;
  }
  createGain() {
    const n = new Node();
    this.gains.push(n);
    return n;
  }
  createOscillator() {
    const n = new Node();
    this.oscillators.push(n);
    return n;
  }
  createBiquadFilter() {
    return new Node();
  }
  createConvolver() {
    return new Node();
  }
  createDelay() {
    return new Node();
  }
  createDynamicsCompressor() {
    const node = new Node();
    this.compressors.push(node);
    return node;
  }
  createWaveShaper() {
    const node = new Node();
    this.shapers.push(node);
    return node;
  }
  createAnalyser() {
    return new Node();
  }
  createBuffer(channels: number, length: number) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { getChannelData: (ch: number) => data[ch] };
  }
  resume = vi.fn(async () => {
    this.state = 'running';
  });
  close = vi.fn(async () => {
    this.state = 'closed';
  });
}
afterEach(() => vi.unstubAllGlobals());
async function setup() {
  vi.stubGlobal('AudioContext', Context);
  const engine = new SynthEngine(structuredClone(DEFAULTS), vi.fn());
  await engine.enable();
  return { engine, ctx: Context.latest };
}
describe('Web Audio voice lifecycle', () => {
  it('keeps master volume before the final ceiling and supports full mute', async () => {
    const { engine, ctx } = await setup();
    const makeup = ctx.compressors[0].connect.mock.calls[0][0] as Node;
    const master = makeup.connect.mock.calls[0][0] as Node;
    expect(master.connect.mock.calls[0][0]).toBe(ctx.shapers[0]);
    expect(master.gain.value).toBe(1);
    engine.apply({ ...DEFAULTS, volume: 0 });
    expect(master.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 1, 0.025);
  });
  it('only creates audio after user enable and reuses the context', async () => {
    vi.stubGlobal('AudioContext', Context);
    const engine = new SynthEngine(DEFAULTS, vi.fn());
    expect(engine.context).toBeNull();
    await engine.enable();
    const ctx = engine.context;
    await engine.enable();
    expect(engine.context).toBe(ctx);
  });
  it('does not retrigger an active trigger or recreate oscillators during bends', async () => {
    const { engine, ctx } = await setup();
    engine.noteOn('right:index', [48, 52, 55], 'right');
    const count = ctx.oscillators.length;
    engine.noteOn('right:index', [48, 52, 55], 'right');
    engine.bend('right', 3.25);
    expect(ctx.oscillators).toHaveLength(count);
    expect(ctx.oscillators[1].detune.setTargetAtTime).toHaveBeenCalledWith(318, 1, 0.012);
  });
  it('does not bend the other hand and applies its pitch to newly created voices', async () => {
    const { engine, ctx } = await setup();
    engine.bend('left', -4);
    engine.noteOn('left:thumb', [45], 'left');
    engine.noteOn('right:index', [48], 'right');
    engine.bend('right', 5);
    expect(ctx.oscillators[1].detune.value).toBe(-407);
    expect(ctx.oscillators[3].detune.value).toBe(493);
  });
  it('releases the correct voice exactly once with a scheduled envelope', async () => {
    const { engine, ctx } = await setup();
    engine.noteOn('right:index', [48], 'right');
    engine.noteOff('right:index');
    engine.noteOff('right:index');
    expect(ctx.oscillators[1].stop).toHaveBeenCalledOnce();
    expect(ctx.oscillators[1].stop).toHaveBeenCalledWith(1 + DEFAULTS.release + 0.02);
    expect(ctx.gains.at(-1)!.gain.cancelAndHoldAtTime).toHaveBeenCalledWith(1);
  });
  it('panic covers sustained AND already releasing voices', async () => {
    const { engine, ctx } = await setup();
    engine.noteOn('right:index', [48], 'right');
    engine.noteOff('right:index');
    engine.noteOn('left:index', [47], 'left');
    engine.panic();
    expect(ctx.oscillators[1].stop).toHaveBeenLastCalledWith(1.02);
    expect(ctx.oscillators[3].stop).toHaveBeenLastCalledWith(1.02);
  });
  it('ignores note-ons while the browser audio context is suspended', async () => {
    const { engine, ctx } = await setup();
    ctx.state = 'suspended';
    engine.noteOn('right:index', [48], 'right');
    expect(ctx.oscillators).toHaveLength(1);
  });
  it('FM carriers AND modulators follow fractional pitch changes', async () => {
    const { engine, ctx } = await setup();
    engine.apply({ ...DEFAULTS, preset: 'piano' });
    engine.noteOn('right:index', [48], 'right');
    engine.bend('right', 2.5);
    for (const osc of ctx.oscillators.slice(1)) expect(osc.detune.value).toBe(250);
  });
  it('has materially different synthesis definitions for all six presets', () =>
    expect(new Set(Object.values(SOUNDS).map((s) => JSON.stringify(s))).size).toBe(6));
  it('disposes oscillators and closes the context', async () => {
    const { engine, ctx } = await setup();
    engine.noteOn('right:index', [48], 'right');
    await engine.dispose();
    expect(ctx.close).toHaveBeenCalledOnce();
    expect(ctx.oscillators[0].stop).toHaveBeenCalled();
    expect(engine.context).toBeNull();
  });
});
