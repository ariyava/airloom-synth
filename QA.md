# Verification report

Date: 28 October 2026. Windows / Node 24.18.0 / embedded Chromium browser.

## Automated and build verification

- Dependency installation completed; `package-lock.json` is included.
- 38 Vitest tests cover default mappings, chord construction, single notes, key/octave, fractional frequency ratios, pitch limits, calibration math, dead zones, geometry rotation, thumb folding, debounce/hysteresis, sustained notes, hand ordering and crossing, independent hand pitch, tracking-loss cleanup, persistence validation, Web Audio voice lifecycles, final output limiting and overlay alignment for letterboxed video.
- Strict TypeScript compilation and Vite production build completed successfully.
- Source formatting checked with Prettier.
- The included model's SHA-256 is verified by `npm run setup:model`.

## Real browser integration

The development-only page `/tests/browser.html` runs the real model and Web Audio implementation. A blank synthetic frame and synthetic camera stream are test fixtures only; the instrument itself requires and processes a real webcam stream.

Verified:

- Real MediaPipe initialization and inference on a transferred blank frame, returning no hands, tested with both GPU and explicitly selected CPU delegates.
- Actual Web Audio output contains a nonzero waveform while a chord plays.
- Fractional pitch bends update oscillator detune without creating replacement oscillators.
- Chord frequency intervals remain intact and left/right bends are independent.
- Panic stops real oscillator output; every sound preset creates and releases voices.
- Full CameraTracker start, frame-transfer/inference and stop with a synthetic stream; all media tracks end and the video source clears.
- Permission denial produces a recoverable, readable UI error.
- Browser console had no error or warning entries during these successful checks.

Run the browser check manually with `npm run dev`, visit `/tests/browser.html`, then click **Run integration checks**. It plays a short, quiet test sound but requests no webcam or microphone. Add `?delegate=CPU` to test CPU inference explicitly. This page is not part of the production build.

## Interface verification

- All ten default finger assignments are displayed.
- Right-index customization to D minor 7, octave 4, and the Electric Piano preset survived a page reload. Test settings were restored afterward on a separate localhost origin.
- Enable Audio reports a running engine; Panic latches the Resume control.
- Debug baseline is off by default. Calibrating with no visible hands reports an actionable message.
- Desktop at 1440 px and mobile at 390 px have no horizontal overflow. Camera video uses `object-fit: contain`; canvas transforms preserve overlay registration in the letterboxed frame and fullscreen.

## Increased output level

The output stage now adds 16× input drive and 3× compressor makeup. Master volume is before the final soft-knee sample ceiling of 0.98, so neither makeup nor the fader can amplify an already limited signal. The new-install default volume is 100%; existing saved volume choices are retained.

`/tests/loudness.html` renders identical sustained analog chords through both output stages using Chromium's real OfflineAudioContext. This test plays nothing through the speakers. At the same 55% master setting, single-chord RMS changed from 0.02326 to 0.52649: **+27.10 dB**. At 100%, single-chord RMS was 0.72990. Ten simultaneous chords peaked at 0.98000002 (Float32 rounding), within the ceiling tolerance. Zero volume produced exactly zero RMS and peak. These are digital signal measurements for the test fixture, not acoustic speaker volume or perceived loudness guarantees. Maximum output deliberately uses strong compression and saturation.

## Still requires physical validation

Physical hand recognition, correct anatomical handedness for a real person, partial folding/occlusion, crossing hands, camera unplugging and reconnection, listening quality on the target speakers, and end-to-end latency / sustained 30 FPS were not validated with a person and real webcam. A blank-frame or synthetic-stream pass does not establish these results. Use the manual acceptance checklist in README.md before treating the instrument as performance ready.

Publishing the source repository does not deploy or host the application. Runtime remains local unless hosting is configured separately.
