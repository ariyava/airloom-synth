import { frequency } from './music';
import { createOutputStage } from './audio-output';
import type { Instrument } from './performance';
import type { Hand, Preset, Settings, Trigger } from './types';
interface Sound {
  waves: OscillatorType[];
  detune: number;
  gain: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  cutoff: number;
  fm?: number;
}
export const SOUNDS: Record<Preset, Sound> = {
  analog: {
    waves: ['sawtooth', 'triangle'],
    detune: 7,
    gain: 0.065,
    attack: 1,
    decay: 1,
    sustain: 1,
    release: 1,
    cutoff: 0.65,
  },
  pad: {
    waves: ['sine', 'sawtooth'],
    detune: 12,
    gain: 0.055,
    attack: 12,
    decay: 2,
    sustain: 1.25,
    release: 2,
    cutoff: 0.32,
  },
  piano: {
    waves: ['sine', 'sine'],
    detune: 0,
    gain: 0.085,
    attack: 0.25,
    decay: 1.8,
    sustain: 0.2,
    release: 0.65,
    cutoff: 1,
    fm: 2.8,
  },
  pluck: {
    waves: ['triangle', 'square'],
    detune: 3,
    gain: 0.06,
    attack: 0.2,
    decay: 0.6,
    sustain: 0.12,
    release: 0.3,
    cutoff: 0.8,
  },
  dream: {
    waves: ['triangle', 'sine'],
    detune: 18,
    gain: 0.065,
    attack: 6,
    decay: 2,
    sustain: 1,
    release: 2.5,
    cutoff: 0.5,
    fm: 0.6,
  },
  bass: {
    waves: ['sawtooth', 'sine'],
    detune: 0,
    gain: 0.075,
    attack: 0.6,
    decay: 0.8,
    sustain: 0.9,
    release: 0.5,
    cutoff: 0.18,
  },
};
interface Voice {
  hand: Hand;
  oscillators: OscillatorNode[];
  pitched: { node: OscillatorNode; offset: number }[];
  gain: GainNode;
  filter: BiquadFilterNode;
  fmGains: GainNode[];
  release: number;
  released: boolean;
}
export class SynthEngine implements Instrument {
  context: AudioContext | null = null;
  private input!: GainNode;
  private output!: GainNode;
  private reverb!: GainNode;
  private delayWet!: GainNode;
  private chorusWet!: GainNode;
  private analyser: AnalyserNode | null = null;
  private nodes: AudioNode[] = [];
  private lfo: OscillatorNode | null = null;
  private voices = new Map<Trigger, Voice>();
  private all = new Set<Voice>();
  private bends: Record<Hand, number> = { left: 0, right: 0 };
  private settings: Settings;
  constructor(
    settings: Settings,
    private onState: (running: boolean) => void,
  ) {
    this.settings = settings;
  }
  async enable() {
    if (!this.context) {
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      this.context = ctx;
      this.input = ctx.createGain();
      const outputStage = createOutputStage(ctx, this.settings.volume);
      this.output = outputStage.master;
      const mix = ctx.createGain(),
        dry = ctx.createGain();
      dry.gain.value = 0.8;
      this.input.connect(dry).connect(mix);
      const convolver = ctx.createConvolver();
      // A deterministic synthesized impulse; no samples or third-party audio assets.
      const impulse = ctx.createBuffer(2, Math.floor(ctx.sampleRate * 2.2), ctx.sampleRate);
      let seed = 123456;
      for (let ch = 0; ch < 2; ch++) {
        const data = impulse.getChannelData(ch);
        for (let i = 0; i < data.length; i++) {
          seed = (seed * 1664525 + 1013904223) >>> 0;
          data[i] = ((seed / 4294967296) * 2 - 1) * Math.pow(1 - i / data.length, 3);
        }
      }
      convolver.buffer = impulse;
      this.reverb = ctx.createGain();
      this.input.connect(convolver).connect(this.reverb).connect(mix);
      const delay = ctx.createDelay(1),
        feedback = ctx.createGain();
      delay.delayTime.value = 0.32;
      feedback.gain.value = 0.28;
      this.delayWet = ctx.createGain();
      this.input.connect(delay).connect(feedback).connect(delay);
      delay.connect(this.delayWet).connect(mix);
      const chorus = ctx.createDelay(0.1),
        depth = ctx.createGain();
      chorus.delayTime.value = 0.018;
      depth.gain.value = 0.003;
      this.lfo = ctx.createOscillator();
      this.lfo.frequency.value = 0.7;
      this.lfo.connect(depth).connect(chorus.delayTime);
      this.lfo.start();
      this.chorusWet = ctx.createGain();
      this.input.connect(chorus).connect(this.chorusWet).connect(mix);
      this.analyser = outputStage.analyser;
      mix.connect(outputStage.input);
      this.analyser.connect(ctx.destination);
      this.nodes = [
        this.input,
        mix,
        dry,
        convolver,
        this.reverb,
        delay,
        feedback,
        this.delayWet,
        chorus,
        depth,
        this.chorusWet,
        ...outputStage.nodes,
      ];
      ctx.onstatechange = () => {
        if (ctx.state !== 'running') this.panic();
        this.onState(ctx.state === 'running');
      };
      this.apply(this.settings);
    }
    await this.context.resume();
    this.onState(this.context.state === 'running');
  }
  apply(settings: Settings) {
    this.settings = settings;
    const ctx = this.context;
    if (!ctx) return;
    this.output.gain.setTargetAtTime(settings.volume, ctx.currentTime, 0.025);
    this.reverb.gain.setTargetAtTime(settings.reverb * 0.65, ctx.currentTime, 0.04);
    this.delayWet.gain.setTargetAtTime(settings.delay * 0.5, ctx.currentTime, 0.04);
    this.chorusWet.gain.setTargetAtTime(settings.chorus * 0.35, ctx.currentTime, 0.04);
    for (const v of this.voices.values())
      v.filter.frequency.setTargetAtTime(
        Math.max(100, settings.cutoff * SOUNDS[settings.preset].cutoff),
        ctx.currentTime,
        0.04,
      );
  }
  noteOn(id: Trigger, notes: number[], hand: Hand) {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running' || this.voices.has(id)) return;
    const s = this.settings,
      p = SOUNDS[s.preset],
      t = ctx.currentTime;
    const gain = ctx.createGain(),
      filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = Math.max(100, s.cutoff * p.cutoff);
    filter.Q.value = 0.65;
    gain.connect(filter).connect(this.input);
    const peak = p.gain / Math.sqrt(Math.max(1, notes.length));
    const attack = Math.max(0.003, s.attack * p.attack),
      decay = Math.max(0.02, s.decay * p.decay);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, peak * Math.min(1, s.sustain * p.sustain)),
      t + attack + decay,
    );
    const voice: Voice = {
      hand,
      oscillators: [],
      pitched: [],
      gain,
      filter,
      fmGains: [],
      release: s.release * p.release,
      released: false,
    };
    for (const note of notes) {
      const midi = note + (s.preset === 'bass' ? -12 : 0);
      p.waves.forEach((wave, i) => {
        const osc = ctx.createOscillator();
        osc.type = wave;
        osc.frequency.value = frequency(midi) * (i === 1 && s.preset === 'piano' ? 2 : 1);
        osc.detune.value = this.bends[hand] * 100 + (i === 0 ? -p.detune : p.detune);
        osc.connect(gain);
        osc.start(t);
        voice.oscillators.push(osc);
        voice.pitched.push({ node: osc, offset: i === 0 ? -p.detune : p.detune });
        if (i === 0 && p.fm) {
          const mod = ctx.createOscillator(),
            fm = ctx.createGain();
          mod.frequency.value = frequency(midi) * 2;
          mod.detune.value = this.bends[hand] * 100;
          fm.gain.setValueAtTime(frequency(midi) * p.fm, t);
          fm.gain.exponentialRampToValueAtTime(0.5, t + Math.max(0.1, s.decay * 3));
          mod.connect(fm).connect(osc.frequency);
          mod.start(t);
          voice.oscillators.push(mod);
          voice.pitched.push({ node: mod, offset: 0 });
          voice.fmGains.push(fm);
        }
      });
    }
    this.voices.set(id, voice);
    this.all.add(voice);
  }
  noteOff(id: Trigger) {
    const voice = this.voices.get(id);
    if (!voice) return;
    this.voices.delete(id);
    this.releaseVoice(voice, voice.release);
  }
  private releaseVoice(v: Voice, seconds: number) {
    const ctx = this.context;
    if (!ctx || v.released) return;
    v.released = true;
    const t = ctx.currentTime;
    v.gain.gain.cancelAndHoldAtTime(t);
    v.gain.gain.linearRampToValueAtTime(0, t + seconds);
    v.oscillators.forEach((o) => o.stop(t + seconds + 0.02));
    v.oscillators[0].onended = () => {
      v.oscillators.forEach((o) => o.disconnect());
      v.fmGains.forEach((g) => g.disconnect());
      v.gain.disconnect();
      v.filter.disconnect();
      this.all.delete(v);
    };
  }
  bend(hand: Hand, semitones: number) {
    this.bends[hand] = semitones;
    const ctx = this.context;
    if (!ctx) return;
    for (const v of this.all)
      if (v.hand === hand)
        v.pitched.forEach(({ node, offset }) =>
          node.detune.setTargetAtTime(semitones * 100 + offset, ctx.currentTime, 0.012),
        );
  }
  panic() {
    const ctx = this.context;
    if (!ctx) return;
    // Stop even release tails immediately on loss of permission, page focus or audio state.
    for (const v of this.all) {
      v.gain.gain.cancelAndHoldAtTime(ctx.currentTime);
      v.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.015);
      for (const o of v.oscillators) {
        try {
          o.stop(ctx.currentTime + 0.02);
        } catch {
          /* already stopped */
        }
      }
      v.released = true;
    }
    this.voices.clear();
  }
  waveform(data: Uint8Array<ArrayBuffer>) {
    this.analyser?.getByteTimeDomainData(data);
  }
  async dispose() {
    this.panic();
    this.lfo?.stop();
    this.nodes.forEach((n) => n.disconnect());
    if (this.context) {
      this.context.onstatechange = null;
      await this.context.close();
    }
    this.context = null;
  }
}
