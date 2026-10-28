# Third-party assets and software

- MediaPipe Tasks Vision 0.10.32: Google, Apache License 2.0. Installed by npm; its WASM runtime is copied into `public/vision/` and the production build. [Source and license](https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE).
- Hand Landmarker full, float16, version 1: Google's official MediaPipe model bundle, Apache License 2.0, downloaded from https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task . [Model overview](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker) and [model card with license](<https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Hand%20Tracking%20(Lite_Full)%20with%20Fairness%20Oct%202021.pdf>). SHA-256: `fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1`. The license is included at `public/licenses/MediaPipe-Apache-2.0.txt`.
- React / React DOM: Meta and contributors, MIT.
- Lucide icons: Lucide contributors, ISC.
- Vite / Vitest / associated build tools: licenses provided in their npm packages.

All audio is synthesized by the application. The reverb impulse is generated procedurally. No recordings, copyrighted songs, sample packs or remote fonts are bundled.
