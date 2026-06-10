/**
 * MidiPlayer — the framework-free engine.
 *
 * Owns: the canvas (injected, not created), the Tone.js synth, the transport
 * scheduling, and the requestAnimationFrame draw loop.
 * Knows nothing about React. Communicates outward only via `on()` callbacks.
 *
 * Lifecycle: new MidiPlayer(canvas, opts) -> load(source) -> play()/pause() ...
 * -> dispose(). Always call dispose() to tear down audio + the rAF loop.
 */
import * as Tone from "tone";
import { parseMidi } from "./parseMidi";
import type {
  MidiSource,
  ParsedSong,
  PlayerEventMap,
  PlayerOptions,
} from "./types";

type Listener<E extends keyof PlayerEventMap> = (payload: PlayerEventMap[E]) => void;

const BLACK_KEY_SEMITONES = new Set([1, 3, 6, 8, 10]);
const isBlack = (midi: number) => BLACK_KEY_SEMITONES.has(((midi % 12) + 12) % 12);

interface KeyGeom {
  x: number;
  w: number;
  black: boolean;
}

export class MidiPlayer {
  // --- injected / config ---
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly pxPerSec: number;
  private readonly keyboardHeight: number;
  private readonly rangePadding: number;
  private readonly volumeDb: number;

  // --- internal mutable state (never exposed) ---
  private song: ParsedSong | null = null;
  private sampler: Tone.Sampler | null = null;
  private rafId = 0;
  private speed = 1;
  private scheduled = false;
  private playing = false;
  private speedRescheduleTimer: ReturnType<typeof setTimeout> | null = null;

  // keyboard layout derived from the song's pitch range
  private lo = 60;
  private hi = 72;
  private whites: number[] = [];

  // canvas sizing
  private dpr = 1;
  private width = 0;
  private height = 0;
  private whiteW = 0;
  private resizeObserver: ResizeObserver | null = null;

  private readonly listeners: { [E in keyof PlayerEventMap]: Set<Listener<E>> } = {
    time: new Set(),
    play: new Set(),
    pause: new Set(),
    end: new Set(),
  };

  constructor(canvas: HTMLCanvasElement, options: PlayerOptions = {}) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("MidiPlayer: could not get 2D canvas context");
    this.ctx = ctx;

    this.pxPerSec = options.pixelsPerSecond ?? 170;
    this.keyboardHeight = options.keyboardHeight ?? 84;
    this.rangePadding = options.rangePadding ?? 2;
    this.volumeDb = options.volumeDb ?? -8;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }

  // ---------------------------------------------------------------- events
  on<E extends keyof PlayerEventMap>(event: E, cb: Listener<E>): () => void {
    this.listeners[event].add(cb);
    return () => this.listeners[event].delete(cb);
  }

  private emit<E extends keyof PlayerEventMap>(event: E, payload: PlayerEventMap[E]): void {
    this.listeners[event].forEach((cb) => cb(payload));
  }

  // ---------------------------------------------------------------- loading
  /** Load + parse a MIDI source. Resolves once notes are ready and a first frame is drawn. */
  async load(source: MidiSource): Promise<ParsedSong> {
    const song = await parseMidi(source);
    this.song = song;

    const pitches = song.notes.map((n) => n.midi);
    this.lo = (pitches.length ? Math.min(...pitches) : 60) - this.rangePadding;
    this.hi = (pitches.length ? Math.max(...pitches) : 72) + this.rangePadding;
    this.whites = [];
    for (let m = this.lo; m <= this.hi; m++) if (!isBlack(m)) this.whites.push(m);

    this.scheduled = false;
    this.resize();
    this.draw(0);

    // Start downloading the piano samples now, in the background, so they're
    // likely ready by the time the user hits play. Never blocks loading/playback.
    if (!this.sampler) this.buildInstrument();
    return song;
  }

  // ---------------------------------------------------------------- transport
  async play(): Promise<void> {
    if (!this.song) throw new Error("MidiPlayer: call load() before play()");
    await Tone.start(); // must be inside a user gesture
    if (!this.sampler) this.buildInstrument();
    // NOTE: we deliberately do NOT await sample loading here. Blocking playback
    // on a network fetch would freeze the button + animation if the samples are
    // slow/unreachable. Instead the transport + visuals start immediately and
    // notes simply stay silent until the buffers finish loading (guarded in
    // schedule()). Samples are prefetched in load(), so this gap is usually nil.
    if (!this.scheduled) this.schedule();

    Tone.Transport.start();
    this.playing = true;
    this.emit("play", undefined);
    this.loop();
  }

  pause(): void {
    Tone.Transport.pause();
    this.playing = false;
    cancelAnimationFrame(this.rafId);
    this.emit("pause", undefined);
  }

  restart(): void {
    Tone.Transport.stop();
    Tone.Transport.seconds = 0;
    this.draw(0);
    this.emit("time", { currentTime: 0, duration: this.song?.duration ?? 0 });
    if (this.playing) Tone.Transport.start();
  }

  /** Jump to an absolute position in song-time (seconds), clamped to [0, duration].
   *  Works whether playing or paused; the visualizer updates immediately. */
  seek(seconds: number): void {
    if (!this.song) return;
    const target = Math.max(0, Math.min(seconds, this.song.duration));
    // Release anything currently sounding so notes held across the jump don't hang.
    this.sampler?.releaseAll();
    // Transport runs in sped-up time; convert song-time -> transport-time.
    Tone.Transport.seconds = target / this.speed;
    this.draw(target);
    this.emit("time", { currentTime: target, duration: this.song.duration });
  }

  /** 0.3–1.5 typical. Reschedules at the new rate, preserving position.
   *  The visual fall-speed updates immediately; the (expensive) transport
   *  rebuild is debounced so dragging the slider doesn't rebuild every tick. */
  setSpeed(multiplier: number): void {
    const songNow = Tone.Transport.seconds * this.speed;
    this.speed = multiplier;
    // Keep audio position coherent with the new rate right away...
    Tone.Transport.seconds = songNow / this.speed;
    // ...but only rebuild the scheduled events once the slider settles.
    if (!this.scheduled) return;
    if (this.speedRescheduleTimer) clearTimeout(this.speedRescheduleTimer);
    this.speedRescheduleTimer = setTimeout(() => {
      const pos = Tone.Transport.seconds * this.speed;
      this.schedule();
      Tone.Transport.seconds = pos / this.speed;
      this.speedRescheduleTimer = null;
    }, 120);
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  // ---------------------------------------------------------------- audio
  private buildInstrument(): void {
    // Salamander grand piano — Tone's canonical sampled piano. The Sampler holds
    // a sparse set of recorded pitches and pitch-shifts to fill in the rest, so
    // we only download ~30 notes. Files are cached by the browser after first load.
    this.sampler = new Tone.Sampler({
      urls: {
        A0: "A0.mp3", C1: "C1.mp3", "D#1": "Ds1.mp3", "F#1": "Fs1.mp3",
        A1: "A1.mp3", C2: "C2.mp3", "D#2": "Ds2.mp3", "F#2": "Fs2.mp3",
        A2: "A2.mp3", C3: "C3.mp3", "D#3": "Ds3.mp3", "F#3": "Fs3.mp3",
        A3: "A3.mp3", C4: "C4.mp3", "D#4": "Ds4.mp3", "F#4": "Fs4.mp3",
        A4: "A4.mp3", C5: "C5.mp3", "D#5": "Ds5.mp3", "F#5": "Fs5.mp3",
        A5: "A5.mp3", C6: "C6.mp3", "D#6": "Ds6.mp3", "F#6": "Fs6.mp3",
        A6: "A6.mp3", C7: "C7.mp3", "D#7": "Ds7.mp3", "F#7": "Fs7.mp3",
        A7: "A7.mp3", C8: "C8.mp3",
      },
      baseUrl: "/piano/salamander/", // self-hosted Salamander grand piano samples (public/)
      release: 1.1,
      onerror: (err) => console.error("MidiPlayer: piano samples failed to load", err),
    }).toDestination();
    this.sampler.volume.value = this.volumeDb;
  }

  private schedule(): void {
    if (!this.song) return;
    Tone.Transport.cancel(0);
    for (const n of this.song.notes) {
      Tone.Transport.schedule((t) => {
        // Skip until the samples are decoded — triggering an empty Sampler throws.
        if (!this.sampler?.loaded) return;
        this.sampler.triggerAttackRelease(
          Tone.Frequency(n.midi, "midi").toFrequency(),
          Math.max(n.duration / this.speed, 0.05),
          t,
          0.4 + n.velocity * 0.6,
        );
      }, n.time / this.speed);
    }
    this.scheduled = true;
  }

  // ---------------------------------------------------------------- loop
  private loop = (): void => {
    if (!this.song) return;
    const now = Tone.Transport.seconds * this.speed; // back to song time
    this.draw(now);
    this.emit("time", {
      currentTime: Math.min(now, this.song.duration),
      duration: this.song.duration,
    });
    if (now >= this.song.duration + 0.4) {
      this.pause();
      Tone.Transport.stop();
      Tone.Transport.seconds = 0;
      this.draw(0);
      this.emit("end", undefined);
      return;
    }
    this.rafId = requestAnimationFrame(this.loop);
  };

  // ---------------------------------------------------------------- sizing
  private resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = this.canvas.clientWidth || 640;
    this.height = Math.max(360, Math.min(Math.round(this.width * 0.62), 560));
    this.canvas.style.height = `${this.height}px`;
    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.whiteW = this.whites.length ? this.width / this.whites.length : this.width;
    if (this.song) {
      this.draw(Tone.Transport.seconds * this.speed);
    }
  }

  // ---------------------------------------------------------------- geometry
  private keyGeom(midi: number): KeyGeom {
    if (!isBlack(midi)) {
      const i = this.whites.indexOf(midi);
      return { x: i * this.whiteW, w: this.whiteW, black: false };
    }
    const below = midi - 1;
    const i = this.whites.indexOf(below);
    const bw = this.whiteW * 0.62;
    return { x: (i + 1) * this.whiteW - bw / 2, w: bw, black: true };
  }

  private hue(midi: number): number {
    return 210 + (midi - this.lo) * 5;
  }

  // ---------------------------------------------------------------- drawing
  private draw(now: number): void {
    if (!this.song) return;
    const { ctx } = this;
    const W = this.width;
    const H = this.height;
    const lineY = H - this.keyboardHeight;

    ctx.clearRect(0, 0, W, H);

    // beat grid
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 1;
    for (let s = Math.ceil(now); (s - now) * this.pxPerSec < lineY; s++) {
      const y = lineY - (s - now) * this.pxPerSec;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // falling notes
    for (const n of this.song.notes) {
      const bottom = lineY - (n.time - now) * this.pxPerSec;
      const top = bottom - n.duration * this.pxPerSec;
      if (bottom < -40) continue; // entirely above the canvas — not visible yet
      if (top > lineY) continue; // already past the hit line (below it) — skip, but
      // don't break: later notes are sorted *higher* up and are still falling.
      const g = this.keyGeom(n.midi);
      const active = now >= n.time && now <= n.time + n.duration;
      const x = g.x + 2;
      const w = Math.max(g.w - 4, 3);
      const t = Math.max(top, -40);
      const b = Math.min(bottom, lineY);
      const radius = Math.max(0, Math.min(6, (b - t) / 2, w / 2));
      const L = active ? 68 : 58;
      const A = 0.35 + n.velocity * 0.55;
      const grad = ctx.createLinearGradient(0, t, 0, b);
      grad.addColorStop(0, `hsla(${this.hue(n.midi)},85%,${L + 8}%,${A})`);
      grad.addColorStop(1, `hsla(${this.hue(n.midi)},80%,${L - 6}%,${A})`);
      ctx.fillStyle = grad;
      this.roundRect(x, t, w, b - t, radius);
      ctx.fill();
      if (active) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        this.roundRect(x, t, w, b - t, radius);
        ctx.stroke();
      }
    }

    // hit line
    const grd = ctx.createLinearGradient(0, lineY - 6, 0, lineY);
    grd.addColorStop(0, "rgba(255,255,255,0)");
    grd.addColorStop(1, "rgba(255,255,255,0.18)");
    ctx.fillStyle = grd;
    ctx.fillRect(0, lineY - 6, W, 6);
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, lineY);
    ctx.lineTo(W, lineY);
    ctx.stroke();

    this.drawKeyboard(now, lineY);
  }

  private drawKeyboard(now: number, lineY: number): void {
    const { ctx } = this;
    const active = new Set(
      this.song!.notes.filter((n) => now >= n.time && now <= n.time + n.duration).map(
        (n) => n.midi,
      ),
    );
    // white keys
    for (const m of this.whites) {
      const g = this.keyGeom(m);
      const on = active.has(m);
      ctx.fillStyle = on ? `hsl(${this.hue(m)},85%,66%)` : "#eef0fa";
      ctx.fillRect(g.x, lineY, g.w - 1, this.keyboardHeight);
    }
    // black keys on top
    for (let m = this.lo; m <= this.hi; m++) {
      if (!isBlack(m)) continue;
      const g = this.keyGeom(m);
      const on = active.has(m);
      ctx.fillStyle = on ? `hsl(${this.hue(m)},85%,58%)` : "#0e1019";
      ctx.fillRect(g.x, lineY, g.w, this.keyboardHeight * 0.62);
    }
    // ledge shadow
    const sg = ctx.createLinearGradient(0, lineY, 0, lineY + 8);
    sg.addColorStop(0, "rgba(0,0,0,0.35)");
    sg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = sg;
    ctx.fillRect(0, lineY, this.width, 8);
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---------------------------------------------------------------- teardown
  /** Tear down audio nodes, the rAF loop, and the resize observer. */
  dispose(): void {
    cancelAnimationFrame(this.rafId);
    if (this.speedRescheduleTimer) clearTimeout(this.speedRescheduleTimer);
    this.speedRescheduleTimer = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    Tone.Transport.stop();
    Tone.Transport.cancel(0);
    this.sampler?.dispose();
    this.sampler = null;
    (Object.keys(this.listeners) as (keyof PlayerEventMap)[]).forEach((k) =>
      this.listeners[k].clear(),
    );
    this.playing = false;
  }
}
