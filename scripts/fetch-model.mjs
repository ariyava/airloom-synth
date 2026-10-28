import { mkdir, writeFile, readFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const path = 'public/models/hand_landmarker.task';
const url =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const expected = 'fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1';
const hash = (data) => createHash('sha256').update(data).digest('hex');
try {
  if (hash(await readFile(path)) === expected) {
    console.log('Verified hand model already available.');
    process.exit(0);
  }
} catch {}
console.log('Downloading the version 1 MediaPipe Hand Landmarker model…');
const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
if (!response.ok)
  throw new Error(`Model download failed (${response.status}). Run npm run setup:model to retry.`);
const data = new Uint8Array(await response.arrayBuffer());
if (hash(data) !== expected)
  throw new Error('Model checksum mismatch. The download was not installed.');
await mkdir('public/models', { recursive: true });
await writeFile(path + '.download', data);
await rename(path + '.download', path);
console.log(`Saved ${data.length} bytes to ${path}.`);
