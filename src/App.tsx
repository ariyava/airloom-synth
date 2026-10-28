import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  AudioLines,
  Camera,
  Check,
  ChevronDown,
  CircleHelp,
  Expand,
  Hand as HandIcon,
  Headphones,
  LoaderCircle,
  Maximize2,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Volume2,
  VolumeX,
  Waves,
  X,
} from 'lucide-react';
import { SynthEngine } from './audio';
import { CameraTracker, type CameraState } from './camera';
import { Overlay } from './overlay';
import { PerformanceController } from './performance';
import { assignmentLabel, CHORDS, PRESETS, ROOTS } from './music';
import { DEFAULTS, loadSettings, saveSettings } from './settings';
import {
  EMPTY_SNAPSHOT,
  FINGERS,
  HANDS,
  type Assignment,
  type Chord,
  type DetectedHand,
  type Hand,
  type Preset,
  type Settings,
  type Snapshot,
} from './types';

function Slider({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  format,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: string;
}) {
  return (
    <label className="slider">
      <span>
        {label}
        <b>{format ?? `${Math.round(value * 100)}%`}</b>
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ '--fill': `${((value - min) / (max - min)) * 100}%` } as React.CSSProperties}
      />
    </label>
  );
}
function Switch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="switch-label">
      <span>{label}</span>
      <button
        type="button"
        className={`switch ${checked ? 'checked' : ''}`}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={onChange}
      >
        <span />
      </button>
    </label>
  );
}
function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    const previous = document.activeElement;
    return () => {
      dialog.close();
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog"
      onCancel={close}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <header>
        <div>
          <span className="eyebrow">YOUR INSTRUMENT</span>
          <h2>{title}</h2>
        </div>
        <button className="icon-button" aria-label="Close dialog" onClick={close}>
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export default function App() {
  const [settings, setSettings] = useState(loadSettings),
    [snapshot, setSnapshot] = useState<Snapshot>(EMPTY_SNAPSHOT);
  const [camera, setCamera] = useState<CameraState>('off'),
    [cameraMessage, setCameraMessage] = useState('Camera is off');
  const [audio, setAudio] = useState(false),
    [audioError, setAudioError] = useState(''),
    [audioBusy, setAudioBusy] = useState(false);
  const [armed, setArmed] = useState(true),
    [modal, setModal] = useState<'settings' | 'mapping' | 'help' | null>(null),
    [storageOk, setStorageOk] = useState(true),
    [notice, setNotice] = useState('');
  const video = useRef<HTMLVideoElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    waveCanvas = useRef<HTMLCanvasElement>(null),
    stage = useRef<HTMLDivElement>(null);
  const tracker = useRef<CameraTracker | null>(null),
    engine = useRef<SynthEngine | null>(null),
    controller = useRef<PerformanceController | null>(null);
  const current = useRef(settings),
    armedRef = useRef(armed);
  current.current = settings;
  armedRef.current = armed;
  const [fullscreen, setFullscreen] = useState(false);
  const change = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }));
  const panic = () => {
    armedRef.current = false;
    setArmed(false);
    controller.current?.reset();
    setSnapshot(EMPTY_SNAPSHOT);
  };
  useEffect(() => {
    const synth = new SynthEngine(current.current, (running) => {
      setAudio(running);
      if (!running) controller.current?.reset();
    });
    engine.current = synth;
    const control = new PerformanceController(synth);
    controller.current = control;
    const overlay = new Overlay();
    let hands: DetectedHand[] = [],
      lastFrame = 0,
      lastUi = 0,
      frames = 0,
      fps = 0,
      fpsAt = performance.now(),
      animation = 0;
    const cam = new CameraTracker(
      video.current!,
      (h, time) => {
        hands = h;
        lastFrame = time;
        frames++;
        if (armedRef.current) control.update(h, time, current.current);
      },
      (state, message) => {
        setCamera(state);
        setCameraMessage(message);
      },
      () => {
        control.reset();
        hands = [];
      },
    );
    tracker.current = cam;
    const waveform = new Uint8Array(128);
    const render = (now: number) => {
      control.expire(now);
      if (now - fpsAt > 1000) {
        fps = Math.round((frames * 1000) / (now - fpsAt));
        frames = 0;
        fpsAt = now;
      }
      const snap = control.snapshot(now);
      snap.fps = fps;
      if (canvas.current)
        overlay.draw(
          canvas.current,
          now - lastFrame < 160 ? hands : [],
          snap,
          current.current,
          now,
          video.current?.videoWidth ? video.current.videoWidth / video.current.videoHeight : 4 / 3,
        );
      if (now - lastUi > 80) {
        setSnapshot(snap);
        lastUi = now;
      }
      const wc = waveCanvas.current,
        ctx = wc?.getContext('2d');
      if (wc && ctx) {
        ctx.clearRect(0, 0, wc.width, wc.height);
        synth.waveform(waveform);
        ctx.strokeStyle = '#c8f58b';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        for (let i = 0; i < waveform.length; i++) {
          const y = synth.context?.state === 'running' ? ((waveform[i] - 128) / 128) * 24 : 0;
          const x = (i / (waveform.length - 1)) * wc.width;
          i === 0 ? ctx.moveTo(x, wc.height / 2 + y) : ctx.lineTo(x, wc.height / 2 + y);
        }
        ctx.stroke();
      }
      animation = requestAnimationFrame(render);
    };
    animation = requestAnimationFrame(render);
    const visibility = () => {
      if (document.hidden) cam.stop();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        armedRef.current = false;
        setArmed(false);
        control.reset();
      }
    };
    const full = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('visibilitychange', visibility);
    document.addEventListener('keydown', key);
    document.addEventListener('fullscreenchange', full);
    return () => {
      cancelAnimationFrame(animation);
      cam.stop();
      void synth.dispose();
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('keydown', key);
      document.removeEventListener('fullscreenchange', full);
    };
  }, []);
  const previousSound = useRef('');
  useEffect(() => {
    const identity = JSON.stringify([
      settings.mappings,
      settings.preset,
      settings.mode,
      settings.key,
    ]);
    if (previousSound.current && previousSound.current !== identity) controller.current?.reset();
    previousSound.current = identity;
    engine.current?.apply(settings);
    setStorageOk(saveSettings(settings));
  }, [settings]);
  const enableAudio = async () => {
    setAudioBusy(true);
    setAudioError('');
    controller.current?.reset();
    try {
      await engine.current?.enable();
    } catch (e) {
      setAudioError(`Audio could not start: ${(e as Error).message}`);
    } finally {
      setAudioBusy(false);
    }
  };
  const updateMapping = (
    hand: Hand,
    finger: (typeof FINGERS)[number],
    patch: Partial<Assignment>,
  ) =>
    setSettings((s) => ({
      ...s,
      mappings: {
        ...s.mappings,
        [hand]: { ...s.mappings[hand], [finger]: { ...s.mappings[hand][finger], ...patch } },
      },
    }));
  const calibrate = () => {
    const palms = controller.current?.palms ?? {};
    if (palms.left === undefined && palms.right === undefined) {
      setNotice('Show at least one hand to calibrate.');
      return;
    }
    setSettings((s) => ({
      ...s,
      reference: 'calibrated',
      neutral: { left: palms.left ?? s.neutral.left, right: palms.right ?? s.neutral.right },
    }));
    setNotice('Visible hands calibrated. Their current palm positions are neutral.');
  };
  const activeLabels = snapshot.active.map((id) => {
    const [h, f] = id.split(':') as [Hand, (typeof FINGERS)[number]];
    return { id, label: assignmentLabel(settings.mappings[h][f], settings.mode, settings.key) };
  });
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stage.current?.requestFullscreen();
    } catch {
      setNotice('Fullscreen is unavailable in this browser.');
    }
  };
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Airloom home">
          <span className="brand-icon">
            <AudioLines size={23} />
          </span>
          airloom<span className="version">SYNTH / 01</span>
        </a>
        <nav>
          <span className="local-badge">
            <span />
            ON-DEVICE INSTRUMENT
          </span>
          <button className="text-button" onClick={() => setModal('help')}>
            <CircleHelp size={16} />
            How to play
          </button>
          <button
            className="icon-button"
            aria-label="Open settings"
            onClick={() => setModal('settings')}
          >
            <Settings2 size={19} />
          </button>
        </nav>
      </header>
      <main>
        <section className="intro">
          <div>
            <span className="eyebrow">
              <span className="tiny-line" />
              THE SPACE BETWEEN MOTION & MUSIC
            </span>
            <h1>
              Shape sound <span>in the air.</span>
            </h1>
            <p>Ten fingers. Infinite expression. Your hands are the instrument.</p>
          </div>
          <div className="intro-mark">
            <Waves size={34} />
            <span>
              NO KEYS.
              <br />
              JUST YOU.
            </span>
          </div>
        </section>
        <div className="workspace">
          <section className="performance-area">
            <div className="section-bar">
              <div className="section-title">
                <span className="status-dot" data-on={camera === 'on'} />
                LIVE PERFORMANCE <span className="small-tag">WEBCAM</span>
              </div>
              <div className="tracking-meta">
                {camera === 'on' ? (
                  <>
                    <span>21 points / hand</span>
                    {settings.showFps && <span>{snapshot.fps} FPS</span>}
                  </>
                ) : (
                  <span>Ready when you are</span>
                )}
              </div>
            </div>
            <div ref={stage} className={`camera-stage ${camera === 'on' ? 'live' : ''}`}>
              <video
                ref={video}
                autoPlay
                muted
                playsInline
                aria-label="Mirrored live webcam preview"
              />
              <canvas
                ref={canvas}
                className="tracking-canvas"
                aria-label="Hand skeleton and finger assignment overlay"
              />
              <div className="stage-top">
                <span className="stage-label">
                  <span className="status-dot" data-on={camera === 'on'} />
                  {camera === 'on' ? 'LIVE INPUT' : 'CAMERA STANDBY'}
                </span>
                <button
                  className="stage-icon"
                  aria-label={fullscreen ? 'Exit fullscreen' : 'Expand webcam'}
                  onClick={() => void toggleFullscreen()}
                >
                  <Maximize2 size={15} />
                </button>
              </div>
              {camera !== 'on' && (
                <div className="camera-empty">
                  <div className="hand-orbit">
                    <div className="orbit o1" />
                    <div className="orbit o2" />
                    <div className="orbit o3" />
                    <HandIcon size={48} strokeWidth={1} />
                    <span className="orbit-dot" />
                  </div>
                  <span className="eyebrow">A LITTLE MOVEMENT. A NEW KIND OF MUSIC.</span>
                  <h2>
                    {camera === 'loading' ? 'Finding your rhythm…' : 'Your next instrument is you.'}
                  </h2>
                  <p>
                    {camera === 'loading'
                      ? 'Preparing the camera and real hand tracking.'
                      : 'Enable your camera. Raise your hands. Make something only you can.'}
                  </p>
                  <button
                    className="primary"
                    disabled={camera === 'loading'}
                    onClick={() => void tracker.current?.start()}
                  >
                    {camera === 'loading' ? (
                      <LoaderCircle className="spin" size={17} />
                    ) : (
                      <Camera size={17} />
                    )}{' '}
                    {camera === 'loading' ? 'Preparing camera…' : 'Start camera'}
                    <span>↗</span>
                  </button>
                  <small>
                    <ShieldCheck size={12} /> Camera frames stay on your device
                  </small>
                </div>
              )}
              <div className="stage-bottom">
                <div className="hand-status">
                  <span className={snapshot.seen.left ? 'detected left' : ''}>
                    <HandIcon size={14} /> LEFT <i />
                  </span>
                  <span className={snapshot.seen.right ? 'detected right' : ''}>
                    <HandIcon size={14} /> RIGHT <i />
                  </span>
                </div>
                <span className="stage-hint">
                  {!armed
                    ? 'PAUSED · RESUME BELOW'
                    : camera === 'on'
                      ? 'EXTEND TO PLAY · MOVE TO BEND'
                      : 'YOUR CAMERA IS YOUR CONTROLLER'}
                </span>
                <span className="stage-corners">⌜ ⌝</span>
              </div>
            </div>
            <div className="live-readout">
              <div className="notes-readout">
                <span className="eyebrow">
                  ACTIVE {settings.mode === 'chords' ? 'CHORDS' : 'NOTES'}
                </span>
                <div aria-live="off">
                  {activeLabels.length ? (
                    activeLabels.map((n) => (
                      <span
                        className={`note-chip ${n.id.startsWith('left') ? 'purple' : ''}`}
                        key={n.id}
                      >
                        {n.label}
                      </span>
                    ))
                  ) : (
                    <span className="empty-note">A little silence before the sound.</span>
                  )}
                </div>
              </div>
              <div className="pitch-readout">
                <span className="eyebrow">PITCH BEND</span>
                <div>
                  <span className="left-text">
                    L{' '}
                    <b>
                      {snapshot.pitch.left >= 0 ? '+' : ''}
                      {snapshot.pitch.left.toFixed(1)}
                    </b>
                  </span>
                  <span className="right-text">
                    R{' '}
                    <b>
                      {snapshot.pitch.right >= 0 ? '+' : ''}
                      {snapshot.pitch.right.toFixed(1)}
                    </b>
                  </span>
                  <small>st</small>
                </div>
              </div>
              <canvas
                ref={waveCanvas}
                width={130}
                height={45}
                className="waveform"
                aria-label="Live audio waveform"
              />
            </div>
          </section>
          <aside className="mapping-panel">
            <div className="section-bar">
              <span className="section-title">
                <SlidersHorizontal size={14} /> FINGER MAPPING
              </span>
              <button className="mini-button" onClick={() => setModal('mapping')}>
                Customize ↗
              </button>
            </div>
            <div className="mode-tabs" aria-label="Playing mode">
              <button
                className={settings.mode === 'chords' ? 'selected' : ''}
                onClick={() => change('mode', 'chords')}
              >
                Chords
              </button>
              <button
                className={settings.mode === 'notes' ? 'selected' : ''}
                onClick={() => change('mode', 'notes')}
              >
                Single notes
              </button>
            </div>
            {[...HANDS].reverse().map((hand) => (
              <div className={`hand-mappings ${hand}`} key={hand}>
                <div className="mapping-heading">
                  <span>
                    <HandIcon size={13} />
                    {hand.toUpperCase()} HAND
                  </span>
                  <span className="hand-color-dot" />
                </div>
                {FINGERS.map((finger, i) => {
                  const active = snapshot.active.includes(`${hand}:${finger}`);
                  return (
                    <button
                      className={`mapping-row ${active ? 'active' : ''}`}
                      key={finger}
                      onClick={() => setModal('mapping')}
                      aria-label={`Edit ${hand} ${finger} mapping`}
                    >
                      <span className="finger-number">0{i + 1}</span>
                      <span className="finger-name">{finger}</span>
                      <span className="assigned">
                        {assignmentLabel(
                          settings.mappings[hand][finger],
                          settings.mode,
                          settings.key,
                        )}
                      </span>
                      <span className="mapping-led" />
                    </button>
                  );
                })}
              </div>
            ))}
            <div className="mapping-foot">
              <Check size={13} />
              <span>Fixed to your fingers. Free to move.</span>
            </div>
          </aside>
        </div>
        <section className="instrument-controls" aria-label="Instrument controls">
          <div className="transport">
            <div className="eyebrow">LET’S MAKE SOME SOUND</div>
            <div className="transport-buttons">
              <button
                className={audio ? 'audio-enabled' : 'primary'}
                onClick={() => void enableAudio()}
                disabled={audioBusy}
              >
                {audioBusy ? (
                  <LoaderCircle size={16} className="spin" />
                ) : audio ? (
                  <Volume2 size={16} />
                ) : (
                  <Headphones size={16} />
                )}{' '}
                {audio ? 'Audio enabled' : 'Enable audio'}
              </button>
              <button
                className="icon-button outlined"
                disabled={camera === 'off'}
                aria-label="Stop camera"
                onClick={() => tracker.current?.stop()}
              >
                <Camera size={17} />
              </button>
              <button
                className={`icon-button outlined ${!armed ? 'pause-on' : ''}`}
                aria-label={armed ? 'Pause performance' : 'Resume performance'}
                onClick={() => {
                  if (armed) panic();
                  else {
                    controller.current?.reset();
                    armedRef.current = true;
                    setArmed(true);
                  }
                }}
              >
                {armed ? <Pause size={17} /> : <Play size={17} />}
              </button>
            </div>
          </div>
          <div className="preset-control">
            <label className="eyebrow" htmlFor="preset">
              SOUND PRESET
            </label>
            <div className="select-wrap">
              <Sparkles size={16} />
              <select
                id="preset"
                value={settings.preset}
                onChange={(e) => change('preset', e.target.value as Preset)}
              >
                {Object.entries(PRESETS).map(([id, name]) => (
                  <option value={id} key={id}>
                    {name}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} />
            </div>
            <span className="control-caption">
              {settings.preset === 'analog'
                ? 'Rich, detuned & a little nostalgic.'
                : settings.preset === 'piano'
                  ? 'Bell-like FM with a gentle decay.'
                  : 'A different texture for your next idea.'}
            </span>
          </div>
          <div className="main-sliders">
            <Slider
              label="Master volume"
              value={settings.volume}
              onChange={(v) => change('volume', v)}
            />
            <Slider
              label="Pitch range"
              value={settings.range}
              min={1}
              max={24}
              step={1}
              format={`±${settings.range} st`}
              onChange={(v) => change('range', v)}
            />
            <Slider label="Reverb" value={settings.reverb} onChange={(v) => change('reverb', v)} />
            <Slider
              label="Release"
              value={settings.release}
              min={0.03}
              max={3}
              format={`${settings.release.toFixed(2)} s`}
              onChange={(v) => change('release', v)}
            />
          </div>
          <button
            className="more-controls"
            onClick={() => setModal('settings')}
            aria-label="More sound and tracking controls"
          >
            <SlidersHorizontal size={18} />
            <span>Fine-tune</span>
          </button>
        </section>
        <div className="under-controls">
          <div>
            <span className={`status-dot ${audio ? 'sound-on' : ''}`} data-on={audio} />
            <span>{audio ? 'Audio engine running' : 'Audio waiting for your permission'}</span>
            <span className="dot-separator">·</span>
            <span>{cameraMessage}</span>
          </div>
          <button className="text-button" onClick={panic}>
            <VolumeX size={13} /> Panic <kbd>esc</kbd>
          </button>
        </div>
        {(camera === 'error' || audioError || !storageOk || notice) && (
          <div
            className={`notice ${camera === 'error' || audioError ? 'error' : ''}`}
            role="status"
          >
            {camera === 'error'
              ? cameraMessage
              : audioError ||
                (!storageOk
                  ? 'Storage is unavailable. Settings will last only for this session.'
                  : notice)}
            <button
              className="icon-button"
              aria-label="Dismiss notice"
              onClick={() => {
                setNotice('');
                setAudioError('');
                if (camera === 'error') {
                  setCamera('off');
                  setCameraMessage('Camera is off');
                }
              }}
            >
              <X size={15} />
            </button>
          </div>
        )}
        <section className="quick-guide">
          <div>
            <span className="guide-num">01</span>
            <div>
              <h3>Extend to play.</h3>
              <p>Open a finger to bring its sound to life.</p>
            </div>
          </div>
          <div>
            <span className="guide-num">02</span>
            <div>
              <h3>Move to explore.</h3>
              <p>Raise or lower your palm to bend the pitch.</p>
            </div>
          </div>
          <div>
            <span className="guide-num">03</span>
            <div>
              <h3>Make it yours.</h3>
              <p>Layer fingers, blend hands, find your sound.</p>
            </div>
          </div>
          <button
            className="guide-arrow"
            aria-label="Read playing guide"
            onClick={() => setModal('help')}
          >
            <Expand size={18} />
          </button>
        </section>
      </main>
      <footer>
        <span>
          <AudioLines size={13} /> AIRLOOM <span> / </span> AN INSTRUMENT WITHOUT EDGES
        </span>
        <span>
          Built for curiosity. Played by you. <span className="footer-dot" />
        </span>
      </footer>
      {modal === 'mapping' && (
        <Modal title="Every finger, your sound." close={() => setModal(null)}>
          <p className="dialog-description">
            Assignments stay attached to anatomical fingers, wherever your hands move. Changes
            release current voices, then apply to your next gesture.
          </p>
          <label className="key-select">
            Musical key / transpose{' '}
            <select
              aria-label="Musical key"
              value={settings.key}
              onChange={(e) => change('key', +e.target.value)}
            >
              {ROOTS.map((r, i) => (
                <option key={r} value={i}>
                  {r} (+{i} st)
                </option>
              ))}
            </select>
          </label>
          <div className="mapping-edit-grid">
            {[...HANDS].reverse().map((hand) => (
              <section key={hand}>
                <h3 className={hand === 'left' ? 'left-text' : 'right-text'}>{hand} hand</h3>
                <div className="edit-head">
                  <span>Finger</span>
                  <span>Root</span>
                  <span>Voicing</span>
                  <span>Octave</span>
                </div>
                {FINGERS.map((f) => (
                  <div className="edit-row" key={f}>
                    <span>{f}</span>
                    <select
                      aria-label={`${hand} ${f} root`}
                      value={settings.mappings[hand][f].root}
                      onChange={(e) => updateMapping(hand, f, { root: +e.target.value })}
                    >
                      {ROOTS.map((r, i) => (
                        <option value={i} key={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={`${hand} ${f} chord`}
                      value={settings.mappings[hand][f].chord}
                      onChange={(e) => updateMapping(hand, f, { chord: e.target.value as Chord })}
                    >
                      {Object.entries(CHORDS).map(([c, v]) => (
                        <option key={c} value={c}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={`${hand} ${f} octave`}
                      value={settings.mappings[hand][f].octave}
                      onChange={(e) => updateMapping(hand, f, { octave: +e.target.value })}
                    >
                      {[1, 2, 3, 4, 5, 6].map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </section>
            ))}
          </div>
          <div className="dialog-actions">
            <span>
              <ShieldCheck size={14} /> Saved on this device
            </span>
            <button
              className="secondary"
              onClick={() => {
                change('mappings', structuredClone(DEFAULTS.mappings));
                change('key', 0);
              }}
            >
              Reset mappings
            </button>
            <button className="primary" onClick={() => setModal(null)}>
              Done <Check size={15} />
            </button>
          </div>
        </Modal>
      )}
      {modal === 'settings' && (
        <Modal title="Find your sweet spot." close={() => setModal(null)}>
          <div className="settings-grid">
            <section>
              <h3>
                <AudioLines size={17} /> Sound & envelope
              </h3>
              <Slider
                label="Attack"
                value={settings.attack}
                min={0.005}
                max={2}
                format={`${settings.attack.toFixed(3)} s`}
                onChange={(v) => change('attack', v)}
              />
              <Slider
                label="Decay"
                value={settings.decay}
                min={0.02}
                max={2}
                format={`${settings.decay.toFixed(2)} s`}
                onChange={(v) => change('decay', v)}
              />
              <Slider
                label="Sustain"
                value={settings.sustain}
                min={0.05}
                onChange={(v) => change('sustain', v)}
              />
              <Slider
                label="Delay"
                value={settings.delay}
                max={0.7}
                onChange={(v) => change('delay', v)}
              />
              <Slider
                label="Chorus"
                value={settings.chorus}
                onChange={(v) => change('chorus', v)}
              />
              <Slider
                label="Filter cutoff"
                value={settings.cutoff}
                min={100}
                max={18000}
                step={100}
                format={`${Math.round(settings.cutoff)} Hz`}
                onChange={(v) => change('cutoff', v)}
              />
              <p className="setting-note">
                Each preset shapes the envelope and filter differently. ADSR changes affect new
                voices.
              </p>
            </section>
            <section>
              <h3>
                <Activity size={17} /> Tracking & expression
              </h3>
              <Slider
                label="Pitch sensitivity"
                value={settings.sensitivity}
                min={0.25}
                max={2}
                format={`${settings.sensitivity.toFixed(2)}×`}
                onChange={(v) => change('sensitivity', v)}
              />
              <Slider
                label="Neutral dead zone"
                value={settings.deadZone}
                max={0.15}
                format={`${Math.round(settings.deadZone * 100)}% frame`}
                onChange={(v) => change('deadZone', v)}
              />
              <Slider
                label="Pitch smoothing"
                value={settings.smoothing}
                max={250}
                step={1}
                format={`${settings.smoothing} ms`}
                onChange={(v) => change('smoothing', v)}
              />
              <Slider
                label="Extension threshold"
                value={settings.activation}
                min={0.65}
                max={0.95}
                onChange={(v) => change('activation', v)}
              />
              <Slider
                label="Fold threshold"
                value={settings.releaseThreshold}
                min={0.2}
                max={0.6}
                onChange={(v) => change('releaseThreshold', v)}
              />
              <Slider
                label="Activation hold"
                value={settings.activationMs}
                max={150}
                step={1}
                format={`${settings.activationMs} ms`}
                onChange={(v) => change('activationMs', v)}
              />
              <Slider
                label="Release hold"
                value={settings.releaseMs}
                max={200}
                step={1}
                format={`${settings.releaseMs} ms`}
                onChange={(v) => change('releaseMs', v)}
              />
            </section>
            <section>
              <h3>
                <HandIcon size={17} /> Pitch reference
              </h3>
              <div className="reference-options">
                <button
                  className={settings.reference === 'center' ? 'selected' : ''}
                  onClick={() => change('reference', 'center')}
                >
                  Screen center
                </button>
                <button
                  className={settings.reference === 'calibrated' ? 'selected' : ''}
                  onClick={() => change('reference', 'calibrated')}
                >
                  Calibrated
                </button>
              </div>
              <p className="setting-note">
                Hold your palms at a comfortable height, then capture. Each visible hand gets its
                own neutral position.
              </p>
              <div className="calibration-buttons">
                <button className="secondary" onClick={calibrate}>
                  Capture neutral
                </button>
                <button
                  className="icon-button outlined"
                  aria-label="Reset calibration"
                  onClick={() => {
                    change('neutral', { left: 0.5, right: 0.5 });
                    change('reference', 'center');
                    setNotice('Pitch reference reset to screen center.');
                  }}
                >
                  <RotateCcw size={15} />
                </button>
              </div>
              <p className="setting-note">
                {notice ||
                  `Left ${Math.round(settings.neutral.left * 100)}% / Right ${Math.round(settings.neutral.right * 100)}%`}
              </p>
            </section>
            <section>
              <h3>
                <Settings2 size={17} /> Performance view
              </h3>
              <Switch
                label="Hand skeleton"
                checked={settings.skeleton}
                onChange={() => change('skeleton', !settings.skeleton)}
              />
              <Switch
                label="Fingertip labels"
                checked={settings.labels}
                onChange={() => change('labels', !settings.labels)}
              />
              <Switch
                label="FPS indicator"
                checked={settings.showFps}
                onChange={() => change('showFps', !settings.showFps)}
              />
              <Switch
                label="Debug baseline"
                checked={settings.debug}
                onChange={() => change('debug', !settings.debug)}
              />
              <p className="setting-note">
                The pitch baseline is invisible during normal performance.
              </p>
            </section>
          </div>
          <div className="dialog-actions">
            <span>
              <Check size={14} /> Changes save automatically
            </span>
            <button className="primary" onClick={() => setModal(null)}>
              Back to playing <Play size={14} />
            </button>
          </div>
        </Modal>
      )}
      {modal === 'help' && (
        <Modal title="A new way to play." close={() => setModal(null)}>
          <div className="help-content">
            <p>
              Start your camera and enable audio. Use a well-lit space and keep both palms facing
              the webcam, with your hands fully in frame.
            </p>
            <div className="help-step">
              <HandIcon />
              <div>
                <h3>One finger. One voice.</h3>
                <p>
                  Make a loose fist, then extend your right index finger: C major. Fold it to
                  release. Extend more fingers to layer their assigned chords.
                </p>
              </div>
            </div>
            <div className="help-step">
              <ArrowUp />
              <div>
                <h3>Take your sound higher.</h3>
                <p>
                  Keep a finger extended and raise your palm. Its chord bends smoothly upward
                  without restarting. Every interval stays together.
                </p>
              </div>
            </div>
            <div className="help-step">
              <ArrowDown />
              <div>
                <h3>Find the center.</h3>
                <p>
                  Lower your palm to bend down. The exact vertical center is neutral, with a small
                  dead zone. Both hands control their own pitch.
                </p>
              </div>
            </div>
            <p>
              Customize all ten mappings, notes, voicings and octaves. Choose a preset and fine-tune
              the sound. Use calibration for a more comfortable neutral position.
            </p>
            <p className="setting-note">
              Escape pauses the instrument. Resume with the play button. Hiding the page stops the
              camera. If fingers overlap, turn your palms back toward the camera and separate them.
            </p>
          </div>
          <div className="dialog-actions">
            <span>
              <ShieldCheck size={14} /> No account. No camera upload.
            </span>
            <button className="primary" onClick={() => setModal(null)}>
              Let’s play <Play size={14} />
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
