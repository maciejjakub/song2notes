/**
 * useMidiPlayer — the React adapter over the framework-free MidiPlayer engine.
 *
 * Responsibilities (and ONLY these):
 *  - instantiate the engine once, hand it the canvas (dependency injection)
 *  - load the source, expose loading / error / ready state
 *  - bridge engine events -> React state (throttled so we don't re-render 60fps)
 *  - tear the engine down on unmount (StrictMode double-mount safe)
 *
 * The engine does the work; this hook is a thin, disposable bridge.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { MidiPlayer } from "./MidiPlayer";
import type { MidiSource, PlayerOptions, ParsedSong } from "./types";

export interface UseMidiPlayerResult {
  /** Attach to your <canvas>. */
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  isPlaying: boolean;
  /** Song-time position in seconds (throttled ~10fps for display). */
  currentTime: number;
  duration: number;
  /** Parsed metadata once loaded (notes count, bpm, etc.). */
  song: ParsedSong | null;
  loading: boolean;
  error: Error | null;
  toggle: () => void;
  restart: () => void;
  /** Jump to an absolute song-time position in seconds. */
  seek: (seconds: number) => void;
  setSpeed: (multiplier: number) => void;
}

export function useMidiPlayer(
  source: MidiSource | null,
  options: PlayerOptions = {},
): UseMidiPlayerResult {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<MidiPlayer | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [song, setSong] = useState<ParsedSong | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Keep options stable across renders without forcing the effect to re-run.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Throttle the time -> state bridge so we re-render ~10x/sec, not 60.
  const lastTimePush = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !source) return;

    let disposed = false;
    const engine = new MidiPlayer(canvas, optionsRef.current);
    engineRef.current = engine;

    const offTime = engine.on("time", ({ currentTime, duration }) => {
      const nowMs = performance.now();
      if (nowMs - lastTimePush.current > 100) {
        lastTimePush.current = nowMs;
        setCurrentTime(currentTime);
        setDuration(duration);
      }
    });
    const offPlay = engine.on("play", () => setIsPlaying(true));
    const offPause = engine.on("pause", () => setIsPlaying(false));
    const offEnd = engine.on("end", () => {
      setIsPlaying(false);
      setCurrentTime(0);
    });

    setLoading(true);
    setError(null);
    engine
      .load(source)
      .then((parsed) => {
        if (disposed) return;
        setSong(parsed);
        setDuration(parsed.duration);
      })
      .catch((err: unknown) => {
        if (disposed) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });

    return () => {
      disposed = true;
      offTime();
      offPlay();
      offPause();
      offEnd();
      engine.dispose();
      engineRef.current = null;
    };
  }, [source]);

  const toggle = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.isPlaying) engine.pause();
    else void engine.play();
  }, []);

  const restart = useCallback(() => {
    engineRef.current?.restart();
  }, []);

  const seek = useCallback((seconds: number) => {
    engineRef.current?.seek(seconds);
    // Reflect the jump in display state right away; the throttle would
    // otherwise leave the readout/slider lagging until the next tick.
    setCurrentTime(seconds);
  }, []);

  const setSpeed = useCallback((multiplier: number) => {
    engineRef.current?.setSpeed(multiplier);
  }, []);

  return {
    canvasRef,
    isPlaying,
    currentTime,
    duration,
    song,
    loading,
    error,
    toggle,
    restart,
    seek,
    setSpeed,
  };
}
