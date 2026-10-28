import { createOutputStage, OUTPUT_PROFILE } from '../src/audio-output';
import { SOUNDS } from '../src/audio';
import { frequency, notesFor } from '../src/music';
import { DEFAULTS } from '../src/settings';
import { HANDS, FINGERS } from '../src/types';
const button = document.querySelector<HTMLButtonElement>('#run')!,
  results = document.querySelector<HTMLPreElement>('#results')!;
async function render(kind: 'previous' | 'current', volume: number, polyphony = false) {
  const ctx = new OfflineAudioContext(1, 48000, 48000),
    mix = ctx.createGain();
  if (kind === 'current') {
    const stage = createOutputStage(ctx, volume);
    mix.connect(stage.input);
    stage.analyser.connect(ctx.destination);
  } else {
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 12;
    compressor.ratio.value = 8;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.15;
    const limiter = ctx.createWaveShaper(),
      curve = new Float32Array(4096);
    for (let i = 0; i < curve.length; i++)
      curve[i] = 0.85 * Math.tanh(((i / (curve.length - 1)) * 2 - 1) * 1.15);
    limiter.curve = curve;
    limiter.oversample = '2x';
    const master = ctx.createGain();
    master.gain.value = volume * 0.8;
    mix.connect(compressor).connect(limiter).connect(master).connect(ctx.destination);
  }
  const mappings = polyphony
    ? HANDS.flatMap((h) => FINGERS.map((f) => DEFAULTS.mappings[h][f]))
    : [DEFAULTS.mappings.right.index];
  for (const mapping of mappings) {
    const notes = notesFor(mapping),
      gain = ctx.createGain(),
      filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = DEFAULTS.cutoff * SOUNDS.analog.cutoff;
    filter.Q.value = 0.65;
    gain.gain.value = (SOUNDS.analog.gain / Math.sqrt(notes.length)) * DEFAULTS.sustain * 0.8;
    gain.connect(filter).connect(mix);
    for (const note of notes)
      for (let i = 0; i < 2; i++) {
        const osc = ctx.createOscillator();
        osc.type = SOUNDS.analog.waves[i];
        osc.frequency.value = frequency(note);
        osc.detune.value = i === 0 ? -7 : 7;
        osc.connect(gain);
        osc.start(0);
        osc.stop(0.95);
      }
  }
  const rendered = await ctx.startRendering(),
    data = rendered.getChannelData(0);
  let sum = 0,
    peak = 0;
  for (const x of data) {
    if (!Number.isFinite(x)) throw new Error('Non-finite output');
    peak = Math.max(peak, Math.abs(x));
  }
  const start = 24000,
    end = 43200;
  for (let i = start; i < end; i++) sum += data[i] * data[i];
  return { rms: Math.sqrt(sum / (end - start)), peak };
}
button.onclick = async () => {
  button.disabled = true;
  results.textContent = 'Rendering…';
  try {
    const previous = await render('previous', 0.55),
      current = await render('current', 0.55),
      maximum = await render('current', 1),
      layered = await render('current', 1, true),
      muted = await render('current', 0);
    const increase = 20 * Math.log10(current.rms / previous.rms);
    if (increase < 18) throw new Error(`Insufficient loudness increase: ${increase} dB`);
    if (maximum.rms <= current.rms) throw new Error('Master volume does not increase loudness');
    if (Math.max(maximum.peak, layered.peak) > OUTPUT_PROFILE.ceiling + 1e-6)
      throw new Error('Output exceeds the final ceiling');
    if (muted.rms !== 0 || muted.peak !== 0) throw new Error('Zero volume is not silent');
    results.textContent = JSON.stringify(
      {
        status: 'PASS',
        singleChordIncreaseDb: +increase.toFixed(2),
        previousAt55Percent: previous,
        currentAt55Percent: current,
        maximumAt100Percent: maximum,
        tenSimultaneousChords: layered,
        muted,
        ceiling: OUTPUT_PROFILE.ceiling,
      },
      null,
      2,
    );
  } catch (e) {
    results.textContent = `FAIL: ${(e as Error).message}`;
  } finally {
    button.disabled = false;
  }
};
