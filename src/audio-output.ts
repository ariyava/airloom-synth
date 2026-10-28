/** Loudness gain happens before the final ceiling, including the master fader. */
export const OUTPUT_PROFILE = {
  drive: 16,
  makeup: 3,
  ceiling: 0.98,
  knee: 0.8,
} as const;

export function outputCurve(): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(8193);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    const a = Math.abs(x);
    if (a <= OUTPUT_PROFILE.knee) curve[i] = x;
    else {
      // Cubic soft knee: unity slope at 0.8, zero slope at the 0.98 ceiling.
      const u = (a - OUTPUT_PROFILE.knee) / (1 - OUTPUT_PROFILE.knee);
      curve[i] = Math.sign(x) * (0.8 + 0.2 * u + 0.14 * u * u - 0.16 * u * u * u);
    }
  }
  return curve;
}

export function createOutputStage(ctx: BaseAudioContext, volume: number) {
  const drive = ctx.createGain();
  drive.gain.value = OUTPUT_PROFILE.drive;
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -14;
  compressor.knee.value = 8;
  compressor.ratio.value = 10;
  compressor.attack.value = 0.002;
  compressor.release.value = 0.12;
  const makeup = ctx.createGain();
  makeup.gain.value = OUTPUT_PROFILE.makeup;
  const master = ctx.createGain();
  master.gain.value = Math.max(0, Math.min(1, volume));
  const limiter = ctx.createWaveShaper();
  limiter.curve = outputCurve();
  // The last processing stage bounds samples even during compressor attack.
  // No oversampling filter or amplification follows it that could overshoot.
  limiter.oversample = 'none';
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  drive.connect(compressor).connect(makeup).connect(master).connect(limiter).connect(analyser);
  return {
    input: drive,
    master,
    analyser,
    nodes: [drive, compressor, makeup, master, limiter, analyser],
  };
}
