/// <reference lib="webworker" />
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
let detector: HandLandmarker | null = null;
const scope = self as unknown as DedicatedWorkerGlobalScope;
let surface: OffscreenCanvas;
let context: OffscreenCanvasRenderingContext2D;
scope.onmessage = async (event: MessageEvent) => {
  const m = event.data;
  try {
    if (m.type === 'init') {
      const vision = await FilesetResolver.forVisionTasks(m.wasm);
      let delegate: 'GPU' | 'CPU' = m.delegate === 'CPU' ? 'CPU' : 'GPU';
      const options = {
        runningMode: 'VIDEO' as const,
        numHands: 2,
        minHandDetectionConfidence: 0.65,
        minHandPresenceConfidence: 0.65,
        minTrackingConfidence: 0.65,
      };
      try {
        detector = await HandLandmarker.createFromOptions(vision, {
          ...options,
          baseOptions: { modelAssetPath: m.model, delegate },
        });
      } catch {
        delegate = 'CPU';
        detector = await HandLandmarker.createFromOptions(vision, {
          ...options,
          baseOptions: { modelAssetPath: m.model, delegate },
        });
      }
      surface = new OffscreenCanvas(640, 480);
      context = surface.getContext('2d')!;
      scope.postMessage({ type: 'ready', delegate });
    }
    if (m.type === 'frame') {
      const bitmap = m.bitmap as ImageBitmap;
      try {
        if (!detector) throw new Error('Hand tracker is not initialized.');
        if (surface.width !== bitmap.width || surface.height !== bitmap.height) {
          surface.width = bitmap.width;
          surface.height = bitmap.height;
        }
        // Mirror the INFERENCE input, not just the preview. Labels now follow selfie convention.
        context.setTransform(-1, 0, 0, 1, surface.width, 0);
        context.drawImage(bitmap, 0, 0);
        context.resetTransform();
        const result = detector.detectForVideo(surface, m.time);
        scope.postMessage({
          type: 'result',
          time: m.time,
          hands: result.landmarks.map((points, i) => ({
            points,
            world: result.worldLandmarks[i] ?? [],
            label: result.handedness[i][0].categoryName,
            confidence: result.handedness[i][0].score,
          })),
        });
      } finally {
        bitmap.close();
      }
    }
  } catch (e) {
    scope.postMessage({ type: 'error', message: e instanceof Error ? e.message : String(e) });
  }
};
