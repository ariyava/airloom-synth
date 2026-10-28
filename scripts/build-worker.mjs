import { build } from 'esbuild';
// MediaPipe's UMD WASM loader needs importScripts and classic script semantics.
// Bundle the typed worker into an IIFE; keep inference off the UI thread in dev AND production.
await build({
  entryPoints: ['src/vision.worker.ts'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  outfile: 'public/vision-worker.js',
  minify: true,
});
console.log('Classic vision worker built.');
