import { cp, mkdir } from 'node:fs/promises';
await mkdir('public/vision', { recursive: true });
await cp('node_modules/@mediapipe/tasks-vision/wasm', 'public/vision', { recursive: true });
console.log('MediaPipe WASM copied to public/vision.');
