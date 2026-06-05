/**
 * MidiPlayerView — a thin presentational component.
 *
 * All it does: render a <canvas> for the engine to draw into, plus controls
 * wired to the hook. No audio/canvas logic lives here — that's the whole point
 * of the engine/adapter split. Style it however your app likes; the engine
 * doesn't care.
 */
import { useState } from "react";
import { useMidiPlayer } from "./useMidiPlayer";
import type { MidiSource, PlayerOptions } from "./types";

export interface MidiPlayerViewProps {
  /** URL string, ArrayBuffer, or Uint8Array. */
  source: MidiSource | null;
  options?: PlayerOptions;
  className?: string;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function MidiPlayerView({ source, options, className }: MidiPlayerViewProps) {
  const {
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
  } = useMidiPlayer(source, options);

  const [speedPct, setSpeedPct] = useState(100);

  // While dragging the timeline we show a local value so the playhead's own
  // updates don't yank the thumb back. `null` means "not scrubbing — follow
  // playback". We seek live on each move for an immediate scrub preview.
  const [scrub, setScrub] = useState<number | null>(null);
  const displayTime = scrub ?? currentTime;
  const seekable = !loading && !error && !!song && duration > 0;

  return (
    <div className={className} style={styles.wrap}>
      <div style={styles.stage}>
        <canvas ref={canvasRef} style={styles.canvas} />
        {loading && <div style={styles.overlay}>Loading MIDI…</div>}
        {error && <div style={styles.overlay}>⚠ {error.message}</div>}
      </div>

      <div style={styles.timeline}>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.01}
          value={Math.min(displayTime, duration || 0)}
          disabled={!seekable}
          aria-label="Seek"
          style={styles.scrubber}
          onPointerDown={() => seekable && setScrub(displayTime)}
          onChange={(e) => {
            if (!seekable) return;
            const t = Number(e.target.value);
            setScrub(t);
            seek(t); // live preview as you drag
          }}
          onPointerUp={() => setScrub(null)}
          onBlur={() => setScrub(null)}
        />
      </div>

      <div style={styles.controls}>
        <button onClick={toggle} disabled={loading || !!error || !song} style={styles.primary}>
          {isPlaying ? "⏸ Pause" : "▶ Play"}
        </button>
        <button onClick={restart} disabled={loading || !!error || !song} style={styles.btn}>
          ↺ Restart
        </button>

        <span style={styles.time}>
          {formatTime(displayTime)} / {formatTime(duration)}
        </span>

        <label style={styles.speed}>
          speed
          <input
            type="range"
            min={30}
            max={150}
            value={speedPct}
            onChange={(e) => {
              const pct = Number(e.target.value);
              setSpeedPct(pct);
              setSpeed(pct / 100);
            }}
          />
          <span style={{ minWidth: 36, textAlign: "right" }}>{speedPct}%</span>
        </label>
      </div>

      {song && (
        <div style={styles.meta}>
          {song.notes.length} notes · {formatTime(song.duration)} · {song.bpm} bpm ·{" "}
          {song.trackCount} track{song.trackCount === 1 ? "" : "s"}
        </div>
      )}
    </div>
  );
}

// Inline styles keep this file drop-in with zero CSS setup.
// Replace with your own classes / Tailwind / CSS modules as you like.
const styles: Record<string, React.CSSProperties> = {
  wrap: { display: "flex", flexDirection: "column", gap: 12, width: "100%", color: "#e8eaf2" },
  stage: {
    position: "relative",
    background: "linear-gradient(180deg,#0c0e18,#0a0c14)",
    border: "1px solid #1d2030",
    borderRadius: 16,
    overflow: "hidden",
  },
  canvas: { display: "block", width: "100%" },
  timeline: { display: "flex", alignItems: "center", padding: "0 4px" },
  scrubber: { width: "100%", cursor: "pointer", accentColor: "#6b97ff" },
  overlay: {
    position: "absolute",
    inset: 0,
    display: "grid",
    placeItems: "center",
    font: "13px ui-monospace, monospace",
    color: "#9aa0c0",
    background: "rgba(10,12,20,0.6)",
  },
  controls: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    flexWrap: "wrap",
    background: "#11131f",
    border: "1px solid #1d2030",
    borderRadius: 14,
    padding: "12px 16px",
    font: "13px ui-monospace, monospace",
  },
  primary: {
    font: "inherit",
    color: "#fff",
    background: "linear-gradient(180deg,#6b97ff,#4f7af0)",
    border: "none",
    padding: "9px 16px",
    borderRadius: 10,
    cursor: "pointer",
  },
  btn: {
    font: "inherit",
    color: "#e8eaf2",
    background: "#191c2c",
    border: "1px solid #1d2030",
    padding: "9px 16px",
    borderRadius: 10,
    cursor: "pointer",
  },
  time: { color: "#6b7090", fontVariantNumeric: "tabular-nums", minWidth: 84 },
  speed: { display: "flex", alignItems: "center", gap: 8, marginLeft: "auto", color: "#6b7090" },
  meta: { color: "#6b7090", font: "11.5px ui-monospace, monospace", letterSpacing: "0.04em" },
};
