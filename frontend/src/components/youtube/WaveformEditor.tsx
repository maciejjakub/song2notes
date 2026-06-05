import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import type { Region } from 'wavesurfer.js/dist/plugins/regions.esm.js';

type Props = {
  audioUrl: string;
  onConfirm: (startSec: number, endSec: number) => void;
  disabled?: boolean;
};

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Waveform with a single draggable/resizable region for picking the slice to
 * keep. The actual trim happens server-side; we only hand back start/end seconds.
 */
export function WaveformEditor({ audioUrl, onConfirm, disabled }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const regionRef = useRef<Region | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [sel, setSel] = useState({ start: 0, end: 0 });

  useEffect(() => {
    if (!containerRef.current) return;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      url: audioUrl,
      height: 96,
      waveColor: '#8a90b8',
      progressColor: '#5b62ff',
      cursorColor: '#c8ccff',
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
    });
    const regions = ws.registerPlugin(RegionsPlugin.create());
    wsRef.current = ws;

    ws.on('decode', (duration) => {
      // Default to the middle 60% — a reasonable starting slice the user adjusts.
      const start = duration * 0.2;
      const end = duration * 0.8;
      const region = regions.addRegion({
        start,
        end,
        color: 'rgba(91, 98, 255, 0.18)',
        drag: true,
        resize: true,
      });
      regionRef.current = region;
      setSel({ start, end });
      setReady(true);
    });

    regions.on('region-updated', (region) => {
      regionRef.current = region;
      setSel({ start: region.start, end: region.end });
    });

    // Stop at the end of the selected region so "play selection" loops the slice.
    ws.on('timeupdate', (time) => {
      const region = regionRef.current;
      if (region && ws.isPlaying() && time >= region.end) {
        ws.pause();
      }
    });

    ws.on('play', () => setIsPlaying(true));
    ws.on('pause', () => setIsPlaying(false));

    return () => {
      ws.destroy();
      wsRef.current = null;
      regionRef.current = null;
    };
  }, [audioUrl]);

  const togglePlay = () => {
    const ws = wsRef.current;
    const region = regionRef.current;
    if (!ws || !region) return;
    if (ws.isPlaying()) {
      ws.pause();
      return;
    }
    // Start from the region's beginning (or wherever the cursor is, if inside it).
    const t = ws.getCurrentTime();
    if (t < region.start || t >= region.end) ws.setTime(region.start);
    ws.play();
  };

  return (
    <div className="waveform-editor">
      <div ref={containerRef} className="waveform-canvas" />
      <div className="waveform-controls">
        <button
          type="button"
          className="btn-secondary"
          onClick={togglePlay}
          disabled={!ready || disabled}
        >
          {isPlaying ? 'Pause' : 'Play selection'}
        </button>
        <span className="waveform-range">
          {fmt(sel.start)} → {fmt(sel.end)}{' '}
          <span className="waveform-range-len">({fmt(sel.end - sel.start)})</span>
        </span>
        <button
          type="button"
          className="btn-primary"
          onClick={() => onConfirm(sel.start, sel.end)}
          disabled={!ready || disabled || sel.end - sel.start < 0.5}
        >
          Analyze this slice
        </button>
      </div>
    </div>
  );
}
