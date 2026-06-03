/**
 * Public surface of the midi-player module.
 *
 * Consumers import from here. The engine (MidiPlayer) is framework-free and
 * usable on its own; the hook + view are the optional React adapter.
 */
export { MidiPlayer } from "./MidiPlayer";
export { parseMidi } from "./parseMidi";
export { useMidiPlayer } from "./useMidiPlayer";
export { MidiPlayerView } from "./MidiPlayerView";
export type { UseMidiPlayerResult } from "./useMidiPlayer";
export type { MidiPlayerViewProps } from "./MidiPlayerView";
export type {
  PlayerNote,
  ParsedSong,
  MidiSource,
  PlayerOptions,
  TimeUpdate,
  PlayerEvent,
  PlayerEventMap,
} from "./types";
