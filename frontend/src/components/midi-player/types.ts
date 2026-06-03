/**
 * Shared types for the MIDI player engine.
 *
 * The whole module is decoupled around `PlayerNote`: the parser produces it,
 * the engine consumes it. Swapping the parser (custom -> @tonejs/midi -> anything)
 * only has to keep producing this shape.
 */

/** A single note, normalized into seconds. The engine's only input unit. */
export interface PlayerNote {
  /** MIDI note number (0–127). 60 = middle C. */
  midi: number;
  /** Onset, in seconds from the start of the piece. */
  time: number;
  /** Duration, in seconds. */
  duration: number;
  /** Normalized velocity, 0–1. */
  velocity: number;
  /** Track index the note came from — handy for per-hand coloring. */
  track: number;
}

/** A parsed song: the note list plus metadata the UI may want to show. */
export interface ParsedSong {
  notes: PlayerNote[];
  /** Total length in seconds (end of the last note). */
  duration: number;
  /** Initial tempo in BPM, for display. */
  bpm: number;
  /** Number of tracks, for display / coloring decisions. */
  trackCount: number;
}

/** Anything the engine accepts as a MIDI source. */
export type MidiSource = string | ArrayBuffer | Uint8Array;

/** Visual + behavioral knobs. All optional; sensible defaults applied. */
export interface PlayerOptions {
  /** Vertical fall speed, pixels per second. Default 170. */
  pixelsPerSecond?: number;
  /** Keyboard height in CSS px. Default 84. */
  keyboardHeight?: number;
  /** Pitches below/above the song's range to pad the keyboard. Default 2. */
  rangePadding?: number;
  /** Master volume in dB (Tone scale). Default -8. */
  volumeDb?: number;
}

/** Snapshot pushed to `time` listeners each frame (throttle in the UI if needed). */
export interface TimeUpdate {
  /** Current playback position in seconds (song time, not sped-up time). */
  currentTime: number;
  /** Total duration in seconds. */
  duration: number;
}

export type PlayerEvent = "time" | "play" | "pause" | "end";

export interface PlayerEventMap {
  time: TimeUpdate;
  play: void;
  pause: void;
  end: void;
}
