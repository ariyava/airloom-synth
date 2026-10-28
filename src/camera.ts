import { HandIdentity } from './identity';
import type { DetectedHand } from './types';
export type CameraState = 'off' | 'loading' | 'on' | 'error';
export class CameraTracker {
  private stream: MediaStream | null = null;
  private worker: Worker | null = null;
  private raf = 0;
  private generation = 0;
  private busy = false;
  private frameTime = -1;
  private sentAt = 0;
  private identity = new HandIdentity();
  private startReject: ((e: Error) => void) | null = null;
  constructor(
    private video: HTMLVideoElement,
    private onHands: (h: DetectedHand[], time: number) => void,
    private onState: (s: CameraState, message: string) => void,
    private onStop: () => void,
  ) {}
  async start() {
    this.stop();
    const token = ++this.generation;
    this.onState('loading', 'Loading hand tracker…');
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error('Camera requires localhost or HTTPS and a supported browser.');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          width: { ideal: 960 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
          facingMode: 'user',
        },
      });
      if (token !== this.generation) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      this.video.srcObject = stream;
      stream.getVideoTracks().forEach((t) => {
        t.onended = () => this.fail('Camera disconnected. Start the camera to reconnect.');
        t.onmute = () => this.onStop();
      });
      await this.video.play();
      if (token !== this.generation) return;
      this.worker = new Worker(new URL('/vision-worker.js', location.href));
      const delegate = await new Promise<string>((resolve, reject) => {
        const timer = window.setTimeout(
          () => reject(new Error('Tracker loading timed out. Check model files, then try again.')),
          45000,
        );
        this.startReject = (e) => {
          clearTimeout(timer);
          reject(e);
        };
        this.worker!.onmessage = (e) => {
          if (e.data.type === 'ready') {
            clearTimeout(timer);
            this.startReject = null;
            resolve(e.data.delegate);
          }
          if (e.data.type === 'error') {
            clearTimeout(timer);
            reject(new Error(e.data.message));
            this.fail(e.data.message);
          }
          if (e.data.type === 'result') {
            this.busy = false;
            this.onHands(this.identity.resolve(e.data.hands, performance.now()), performance.now());
          }
        };
        this.worker!.onerror = (e) => {
          clearTimeout(timer);
          reject(new Error(e.message));
          this.fail('Hand tracker could not run. Try an up-to-date Chrome or Edge browser.');
        };
        this.worker!.postMessage({
          type: 'init',
          wasm: new URL('/vision', location.href).href,
          model: new URL('/models/hand_landmarker.task', location.href).href,
        });
      });
      if (token !== this.generation) return;
      this.onState('on', `${delegate} tracking · on device`);
      this.loop(token);
    } catch (e) {
      if (token !== this.generation) return;
      const err = e as Error;
      this.fail(
        err.name === 'NotAllowedError'
          ? 'Camera permission denied. Allow camera access in browser settings and try again.'
          : err.name === 'NotFoundError'
            ? 'No camera found. Connect a webcam and try again.'
            : err.name === 'NotReadableError'
              ? 'Camera is busy. Close other camera apps and try again.'
              : err.message,
      );
    }
  }
  private loop(token: number) {
    if (token !== this.generation) return;
    if (this.busy && performance.now() - this.sentAt > 3500) {
      this.fail('Tracking interrupted. Restart the camera.');
      return;
    }
    if (!this.busy && this.video.readyState >= 2 && this.video.currentTime !== this.frameTime) {
      this.frameTime = this.video.currentTime;
      this.busy = true;
      this.sentAt = performance.now();
      createImageBitmap(this.video, {
        resizeWidth: 640,
        resizeHeight: Math.round((640 * this.video.videoHeight) / this.video.videoWidth),
      })
        .then((bitmap) => {
          if (token !== this.generation || !this.worker) {
            bitmap.close();
            return;
          }
          this.worker.postMessage({ type: 'frame', bitmap, time: performance.now() }, [bitmap]);
        })
        .catch(() => this.fail('Could not read webcam frames. Restart the camera.'));
    }
    this.raf = requestAnimationFrame(() => this.loop(token));
  }
  private fail(message: string) {
    this.stop();
    this.onState('error', message);
  }
  stop() {
    this.generation++;
    cancelAnimationFrame(this.raf);
    this.startReject?.(new Error('Camera stopped.'));
    this.startReject = null;
    this.worker?.terminate();
    this.worker = null;
    this.stream?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    this.stream = null;
    this.video.pause();
    this.video.srcObject = null;
    this.busy = false;
    this.frameTime = -1;
    this.identity.reset();
    this.onStop();
    this.onState('off', 'Camera is off');
  }
}
