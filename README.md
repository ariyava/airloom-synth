# Airloom

A real, browser-based hand gesture synthesizer. A webcam tracks two hands; each anatomical finger owns a permanent note or chord. Palm height continuously bends that hand's voices without retriggering them.

[راهنمای فارسی](README.fa.md)

## Run locally

Requires Node.js 20.19+ or 22.12+ and npm. Chrome or Edge desktop is recommended. Use speakers at a comfortable level or wired headphones.

On Windows you can double-click `Start-Airloom.cmd` to install missing dependencies, start the local server and open the browser. Close the server with Ctrl+C in its terminal.

```sh
npm ci
npm run dev
```

Open the printed localhost URL, click **Enable audio**, then **Start camera**, and allow webcam access. No microphone is requested. A real MediaPipe model is included under `public/models`; WASM is copied from the pinned npm package during installation. Runtime inference, webcam frames, audio synthesis and settings stay on your device; the app makes no runtime CDN or backend calls.

If the model file is missing, run `npm run setup:model`. The downloader uses Google's versioned model URL. A model download failure does not silently switch to simulated hands.

```sh
npm test          # Core geometry, state, music, identity, persistence and cleanup tests
npm run typecheck # Strict TypeScript validation
npm run build    # TypeScript + production assets in dist/
npm run preview  # Serve the production build locally
npm run check    # Tests and production build
```

The application needs localhost or HTTPS for camera access. Opening `index.html` directly through `file://` will not work. Deploy `dist/` at the domain root if publishing later. No deployment or GitHub push is performed by these commands.

## Play

1. Use even lighting, show palms toward the camera, and keep your whole hands in frame.
2. Make a loose fist. Extend your **right index** to sustain C major; fold it to release.
3. Extend additional fingers for polyphony. The two hands have ten independent gates.
4. Raise a palm for a positive pitch bend, lower it for a negative bend. The default screen midpoint is neutral; the top/bottom are +12/-12 semitones. Assigned chord names never change with movement.
5. Try six genuinely different synthesis presets. Adjust volume, release, reverb and pitch range below the camera. More controls include ADSR, delay, chorus, filter cutoff, gesture thresholds and pitch smoothing.
6. Use **Customize** for per-finger root, chord and octave. Single-note mode plays each assignment's root. Musical key transposes every base assignment by 0–11 semitones, independently of the palm pitch controller.
7. In settings, choose **Capture neutral** with one or both hands visible for independent calibration. Unseen hands retain their previous calibration. Reset returns to screen center.

**Escape / Panic** releases voices and latches performance paused. Click Resume to play again. Stop Camera, camera disconnection, worker errors, page hiding and audio suspension all release voices. A hidden page stops its webcam and requires Start Camera again. Missing hands get a short 160 ms grace period, then their notes release using the preset envelope. If a worker hangs, the main-thread watchdog still releases voices.

### Default mappings

| Finger | Right hand        | Left hand              |
| ------ | ----------------- | ---------------------- |
| Thumb  | G major, octave 3 | A minor, octave 2      |
| Index  | C major, octave 3 | B diminished, octave 2 |
| Middle | D minor, octave 3 | C major 7, octave 3    |
| Ring   | E minor, octave 3 | D minor 7, octave 3    |
| Pinky  | F major, octave 3 | G dominant 7, octave 2 |

Octave refers to the root's scientific pitch octave (C4 is MIDI 60). Chords: single, major, minor, diminished, dominant seventh, major seventh, minor seventh, sus2, sus4, augmented. The bass preset adds a deliberate fixed -12 semitone register to its oscillator sound; stored assignments are unchanged.

## Configuration

All mappings and exposed sound/tracking settings save to `localStorage` under `airloom.settings.v1`. Data is versioned, validated and clamped on load. Unavailable storage displays a session-only warning. No camera frames are stored.

| Setting                     | Default                    | Behavior                                                             |
| --------------------------- | -------------------------- | -------------------------------------------------------------------- |
| Pitch range                 | ±12 st                     | Adjustable ±1–24 semitones, independently per hand                   |
| Pitch sensitivity           | 1×                         | Scales distance-to-pitch gain; output is clamped to range            |
| Neutral dead zone           | 3.5% frame                 | Half-width around neutral; continuous at both edges                  |
| Pitch smoothing             | 65 ms                      | Time-based low-pass filter; audio detune has another 12 ms smoothing |
| Extension / fold thresholds | 0.79 / 0.53                | Schmitt hysteresis on a normalized geometry score                    |
| Activation / release hold   | 32 / 55 ms                 | Time-based debounce after 18 ms score smoothing                      |
| Missing-hand grace          | 160 ms                     | Internal safety setting in `performance.ts`                          |
| Master volume               | 100%                       | Strong input gain and compressor makeup, final 0.98 sample ceiling   |
| ADSR                        | 25 / 250 ms / 65% / 500 ms | Presets scale these values; envelope edits affect new voices         |
| Reverb / delay / chorus     | 22% / 12% / 0%             | Synthesized impulse, 320 ms feedback echo, modulated short delay     |
| Debug baseline              | Off                        | Only shown when explicitly enabled                                   |

Mappings, musical key, note/chord mode and preset changes release existing voices and reset the gates. Held extensions acquire the new sound once after normal activation debounce. This avoids stuck voices with stale assignments. Output volume, effect levels, filter and pitch controls update live. The preview is mirrored for natural interaction. Inference is also mirrored exactly once, matching the model's selfie handedness convention. Finger assignment never depends on screen position or array order.

## Architecture

The output stage uses stronger input drive and compressor makeup to make single-finger chords audible at a useful level. New installations start at 100% master volume; previously saved levels remain intact. Turn down your speaker/headphone volume before trying the louder output. The master fader is before a final 0.98 sample ceiling. Maximum output uses strong compression and saturation; acoustic loudness still depends on the operating-system mixer and speakers. Run `/tests/loudness.html` during development to measure the output offline without playing sound.

- `src/camera.ts`: webcam lifecycle, frame transfer, worker startup and timeout, disconnection and cancellation handling.
- `src/vision.worker.ts`: MediaPipe Hand Landmarker, up to two 21-point hands, mirrored input, GPU initialization with CPU fallback. One frame in flight at a time; no accumulating inference queue.
- `src/identity.ts`: anatomical identities, confidence filtering and previous-palm association; never sorts by horizontal position.
- `src/gesture.ts`: rotation-invariant PIP/DIP joint angles and reach geometry; separate thumb spread/IP/MCP analysis; filtering, hysteresis and debounce.
- `src/performance.ts`: ten independent finger gates, per-hand palm pitch filters, tracking grace and note cleanup. No React dependency.
- `src/audio.ts`: persistent Web Audio graph, per-trigger oscillators and ADSR, real polyphony, continuous oscillator detune, filter/effects/limiter. No external samples.
- `src/audio-output.ts`: input drive, compression, makeup, master fader and bounded final output stage.
- `src/overlay.ts`: imperative canvas rendering, smoothed fingertip positions and stable finger labels.
- `src/settings.ts`, `src/music.ts`, `src/types.ts`: validation, persistence, chord math and shared types.
- `src/App.tsx`: responsive UI. Camera results and rendering use refs; UI status updates at about 12 Hz instead of re-rendering React on every camera frame.

Worker inference avoids blocking the UI, as recommended in the [official MediaPipe web guide](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js). The tracker may fall back to CPU when GPU initialization is unavailable. Recent browsers with Web Workers, OffscreenCanvas, WebAssembly, ImageBitmap and Web Audio are required. A blocked model/WASM request produces a visible error.

The typed vision worker is compiled to a classic worker by esbuild before `dev` and `build`. This keeps MediaPipe's native `importScripts` WASM loader compatible without modifying vendor code or moving inference onto the UI thread. Restart the dev server after editing `vision.worker.ts`. The preview preserves the video aspect ratio and uses the same letterbox transform for fingertip overlays, including fullscreen.

## Hardware validation and honest limits

Automated geometry fixtures verify logic; they do not prove accuracy on every person's hands or webcam. Full occlusion, crossed/overlapping fingers, back-facing palms, poor lighting, classifier errors and motion blur can defeat monocular tracking. The application suppresses noise and releases lost tracks, but cannot reconstruct invisible fingers reliably. Keep palms facing the camera and separate overlapping hands.

30+ FPS and low latency are targets, not measured guarantees. Tracking frame rate, audio output device latency and physical gesture accuracy must be measured on the target computer. Bluetooth audio can add substantial latency. Preset sound quality requires listening; browser initialization alone does not validate it.

Manual acceptance checklist:

- Right index produces C major; all other assignments stay fixed during translation and rotation.
- Extended index sustains while palm movement bends the same chord smoothly, without restarting.
- Both hands bend in opposite directions independently; multiple chords remain audible at a comfortable level.
- Folding, disappearance, unplugging the camera, hiding the page, Panic and audio suspension release notes.
- Cross hands slowly and confirm anatomical assignments; repeat under target lighting.
- Change assignment and preset while playing; verify old voices release and new voices start once.
- Refresh after customizing and confirm settings persist. Test permission denial and reconnect behavior.

See `QA.md` for results from the implementation environment and the remaining physical checks. Third-party notices are in `THIRD_PARTY.md`.
