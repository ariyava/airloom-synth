import { SynthEngine } from '../src/audio';
import { DEFAULTS } from '../src/settings';
import { CameraTracker } from '../src/camera';
const button = document.querySelector<HTMLButtonElement>('#run')!,
  output = document.querySelector<HTMLPreElement>('#results')!;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
button.onclick = async () => {
  button.disabled = true;
  output.textContent = '';
  const log = (s: string) => {
    output.textContent += s + '\n';
  };
  let worker: Worker | null = null,
    synth: SynthEngine | null = null;
  try {
    worker = new Worker(new URL('/vision-worker.js', location.href));
    const ready = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Model initialization timeout')), 45000);
      worker!.onerror = (e) => {
        clearTimeout(timer);
        reject(new Error(e.message));
      };
      worker!.onmessage = (e) => {
        if (e.data.type === 'ready') {
          clearTimeout(timer);
          resolve(e.data.delegate);
        }
        if (e.data.type === 'error') {
          clearTimeout(timer);
          reject(new Error(e.data.message));
        }
      };
    });
    worker.postMessage({
      type: 'init',
      delegate: new URLSearchParams(location.search).get('delegate') === 'CPU' ? 'CPU' : 'GPU',
      wasm: new URL('/vision', location.href).href,
      model: new URL('/models/hand_landmarker.task', location.href).href,
    });
    const delegate = await ready;
    log(`PASS: real Hand Landmarker initialized (${delegate}).`);
    const blank = new OffscreenCanvas(640, 480),
      ctx = blank.getContext('2d')!;
    ctx.fillStyle = '#303030';
    ctx.fillRect(0, 0, 640, 480);
    const bitmap = blank.transferToImageBitmap();
    const result = new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Inference timeout')), 15000);
      worker!.onmessage = (e) => {
        if (e.data.type === 'result') {
          clearTimeout(timer);
          resolve(e.data.hands.length);
        }
        if (e.data.type === 'error') {
          clearTimeout(timer);
          reject(new Error(e.data.message));
        }
      };
    });
    worker.postMessage({ type: 'frame', bitmap, time: performance.now() }, [bitmap]);
    const count = await result;
    if (count !== 0) throw new Error('Blank frame incorrectly detected hands.');
    log('PASS: real model processes a transferred blank frame and returns zero hands.');
    const settings = {
      ...structuredClone(DEFAULTS),
      volume: 0.06,
      reverb: 0,
      delay: 0,
      chorus: 0,
      release: 0.05,
    };
    synth = new SynthEngine(settings, () => {});
    await synth.enable();
    if (synth.context?.state !== 'running') throw new Error('Audio context did not run.');
    const context = synth.context,
      oscillators: OscillatorNode[] = [],
      original = context.createOscillator.bind(context);
    context.createOscillator = () => {
      const osc = original();
      oscillators.push(osc);
      return osc;
    };
    synth.noteOn('right:index', [48, 52, 55], 'right');
    await sleep(220);
    const waveform = new Uint8Array(128);
    synth.waveform(waveform);
    if (!waveform.some((x) => Math.abs(x - 128) > 0))
      throw new Error('Playing chord produced no waveform.');
    log('PASS: real Web Audio chord produces a nonzero output waveform.');
    const before = oscillators.length;
    synth.bend('right', 7.25);
    await sleep(80);
    if (oscillators.length !== before || before !== 6)
      throw new Error('Pitch bending recreated oscillators.');
    if (Math.abs(oscillators[0].detune.value - (725 - 7)) > 2)
      throw new Error('Continuous detune was not applied.');
    const ratio = oscillators[2].frequency.value / oscillators[0].frequency.value;
    if (Math.abs(ratio - 2 ** (4 / 12)) > 0.001) throw new Error('Chord interval changed.');
    log(
      'PASS: fractional pitch bend changes detune with no oscillator restart, preserving intervals.',
    );
    synth.noteOn('left:index', [47, 50, 53], 'left');
    synth.bend('left', -3);
    await sleep(80);
    if (
      Math.abs(oscillators[6].detune.value - (-300 - 7)) > 2 ||
      Math.abs(oscillators[0].detune.value - (725 - 7)) > 2
    )
      throw new Error('Hand bends were not independent.');
    log('PASS: simultaneous chords retain independent left/right detune.');
    synth.panic();
    await sleep(150);
    synth.waveform(waveform);
    if (waveform.some((x) => Math.abs(x - 128) > 1))
      throw new Error('Panic did not silence the graph.');
    log('PASS: Panic silences actual audio output.');
    for (const preset of ['pad', 'piano', 'pluck', 'dream', 'bass'] as const) {
      synth.apply({ ...settings, preset });
      synth.noteOn('right:index', [48], 'right');
      await sleep(80);
      synth.noteOff('right:index');
      await sleep(180);
    }
    log('PASS: all six presets create and release real audio voices without runtime errors.');
    // Exercise the full main-thread camera lifecycle with a clearly synthetic blank stream.
    // This tests real worker inference and cleanup without requesting a person's webcam.
    const originalGetUserMedia = navigator.mediaDevices.getUserMedia;
    const source = document.createElement('canvas');
    source.width = 640;
    source.height = 480;
    const paint = source.getContext('2d')!;
    paint.fillStyle = '#303030';
    paint.fillRect(0, 0, 640, 480);
    const stream = source.captureStream(15),
      video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    document.body.append(video);
    video.style.width = '1px';
    const repaint = setInterval(() => paint.fillRect(0, 0, 640, 480), 70);
    let camera: CameraTracker | null = null;
    try {
      navigator.mediaDevices.getUserMedia = async () => stream;
      const firstFrame = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Camera pipeline timeout')), 30000);
        camera = new CameraTracker(
          video,
          () => {
            clearTimeout(timer);
            resolve();
          },
          (state, message) => {
            if (state === 'error') {
              clearTimeout(timer);
              reject(new Error(message));
            }
          },
          () => {},
        );
      });
      await camera!.start();
      await firstFrame;
      camera!.stop();
      if (stream.getTracks().some((t) => t.readyState !== 'ended') || video.srcObject !== null)
        throw new Error('Camera stop leaked a stream.');
      log(
        'PASS: full CameraTracker pipeline reads a synthetic stream, runs real inference and stops every track.',
      );
      navigator.mediaDevices.getUserMedia = async () => {
        throw new DOMException('Test denial', 'NotAllowedError');
      };
      let message = '';
      camera = new CameraTracker(
        video,
        () => {},
        (state, text) => {
          if (state === 'error') message = text;
        },
        () => {},
      );
      await camera.start();
      if (!message.includes('permission denied'))
        throw new Error('Permission error was not explained.');
      log('PASS: webcam permission denial produces a clear, recoverable error.');
    } finally {
      clearInterval(repaint);
      camera?.stop();
      stream.getTracks().forEach((t) => t.stop());
      video.remove();
      navigator.mediaDevices.getUserMedia = originalGetUserMedia;
    }
    log(
      'COMPLETE: browser integration checks passed. Physical hand accuracy, actual speaker output quality and end-to-end gesture latency still require human testing.',
    );
  } catch (e) {
    log(`FAIL: ${(e as Error).message}`);
  } finally {
    worker?.terminate();
    await synth?.dispose();
    button.disabled = false;
  }
};
