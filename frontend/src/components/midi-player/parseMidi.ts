/**
 * Parser layer. Wraps @tonejs/midi and flattens it into our `PlayerNote` shape.
 *
 * This is the deliberately-thin "commodity" boundary we discussed: the rest of
 * the engine never imports @tonejs/midi directly, so the library could be
 * swapped here without touching the renderer or the React layer.
 */
import { Midi } from "@tonejs/midi";
import type { MidiSource, ParsedSong, PlayerNote } from "./types";

/** Fetch a URL and return its bytes. Throws on non-OK responses. */
async function fetchMidiBytes(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load MIDI (${res.status} ${res.statusText}): ${url}`);
  }
  return res.arrayBuffer();
}

/** Normalize any accepted source into an ArrayBuffer of MIDI bytes. */
async function toArrayBuffer(source: MidiSource): Promise<ArrayBuffer> {
  if (typeof source === "string") return fetchMidiBytes(source);
  if (source instanceof Uint8Array) {
    // Copy into a standalone ArrayBuffer (avoids SharedArrayBuffer / offset issues).
    return source.slice().buffer;
  }
  return source;
}

/**
 * Parse a MIDI source into a `ParsedSong`.
 * @tonejs/midi handles tempo maps, multi-track merging, SMPTE timing, and the
 * malformed-but-legal files a hand-rolled parser would choke on.
 */
export async function parseMidi(source: MidiSource): Promise<ParsedSong> {
  const buffer = await toArrayBuffer(source);
  const midi = new Midi(buffer);

  const notes: PlayerNote[] = midi.tracks.flatMap((track, trackIndex) =>
    track.notes.map((n) => ({
      midi: n.midi,
      time: n.time, // already in seconds, tempo-map aware
      duration: n.duration,
      velocity: n.velocity, // already normalized 0–1
      track: trackIndex,
    })),
  );

  // Sort by onset so the render loop can early-exit / window cleanly.
  notes.sort((a, b) => a.time - b.time);

  const duration = notes.reduce((max, n) => Math.max(max, n.time + n.duration), 0);
  const bpm = Math.round(midi.header.tempos[0]?.bpm ?? 120);

  return { notes, duration, bpm, trackCount: midi.tracks.length };
}
