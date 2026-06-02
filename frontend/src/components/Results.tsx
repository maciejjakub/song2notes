import { useEffect, useRef } from 'react';
import type { AnalyzeResponse } from '../types';
import { midiDownloadUrl } from '../api';

type Props = {
  result: AnalyzeResponse;
  fileName: string;
  onReset: () => void;
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

function formatDuration(start: number, end: number): string {
  const d = end - start;
  return `${d.toFixed(2)}s`;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

// The waterfall keyboard renders only bare key rects (each carrying its MIDI
// pitch in data-pitch), so we draw note-name labels onto the white keys
// ourselves. White keys are naturals; we append the octave on C to anchor the
// register without cluttering every key.
function labelWaterfallKeys(visualizer: HTMLElement) {
  const piano = visualizer.querySelector('svg.waterfall-piano');
  if (!piano) return;
  const whiteKeys = piano.querySelectorAll<SVGRectElement>('rect.white');
  if (whiteKeys.length === 0 || piano.querySelector('.key-label')) return;

  whiteKeys.forEach((key) => {
    const pitch = Number(key.dataset.pitch);
    const x = parseFloat(key.getAttribute('x') || '0');
    const w = parseFloat(key.getAttribute('width') || '0');
    const y = parseFloat(key.getAttribute('y') || '0');
    const h = parseFloat(key.getAttribute('height') || '0');

    const name = NOTE_NAMES[pitch % 12];
    const label = name === 'C' ? `${name}${Math.floor(pitch / 12) - 1}` : name;

    const text = document.createElementNS(SVG_NS, 'text');
    text.classList.add('key-label');
    text.setAttribute('x', String(x + w / 2));
    text.setAttribute('y', String(y + h - 6));
    text.setAttribute('text-anchor', 'middle');
    text.textContent = label;
    piano.appendChild(text);
  });
}

export function Results({ result, fileName, onReset }: Props) {
  const downloadHref = midiDownloadUrl(result.midi_download_url);
  const playerRef = useRef<HTMLElement>(null);
  const waterfallRef = useRef<HTMLElement>(null);

  // Draw note-name labels on the waterfall keyboard. The visualizer renders
  // asynchronously (it fetches the MIDI first) and rebuilds the keyboard on
  // reload, so watch for the keys to (re)appear and (re)label them.
  useEffect(() => {
    const el = waterfallRef.current;
    if (!el) return;
    labelWaterfallKeys(el);
    const observer = new MutationObserver(() => labelWaterfallKeys(el));
    observer.observe(el, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [downloadHref]);

  // Link the player to its visualizers after they are committed to the DOM, so
  // the player's internal `querySelectorAll` actually finds them. The selector
  // is a class, so the single player drives all three visualizers at once.
  // Setting this in JSX fails on remounts because React assigns attributes
  // while the subtree is still detached from the document.
  useEffect(() => {
    playerRef.current?.setAttribute('visualizer', '.midi-visualizer');
  }, [downloadHref]);
  const tuningCents =
    result.tuning_offset_semitones != null
      ? Math.round(result.tuning_offset_semitones * 100)
      : null;

  return (
    <div className="results">
      <div className="results-header">
        <div>
          <div className="results-title">Transcription complete</div>
          <div className="results-file">{fileName}</div>
        </div>
        <button className="btn-secondary" onClick={onReset}>
          Analyze another
        </button>
      </div>

      <div className="stats-grid">
        <div className="stat">
          <div className="stat-value">{result.note_count}</div>
          <div className="stat-label">notes detected</div>
        </div>
        <div className="stat">
          <div className="stat-value">
            {result.notes.length > 0
              ? formatTime(result.notes[result.notes.length - 1].end_time_sec)
              : '—'}
          </div>
          <div className="stat-label">duration</div>
        </div>
        <div className="stat">
          <div className="stat-value">
            {tuningCents != null ? `${tuningCents > 0 ? '+' : ''}${tuningCents}¢` : '—'}
          </div>
          <div className="stat-label">tuning offset</div>
        </div>
      </div>

      <div className="midi-player-section">
        <div className="visualizer-stack">
          <figure className="visualizer-figure">
            <figcaption className="visualizer-label">Piano roll</figcaption>
            <div className="midi-visualizer-wrap">
              <midi-visualizer
                type="piano-roll"
                src={downloadHref}
                className="midi-visualizer"
              />
            </div>
          </figure>

          <figure className="visualizer-figure">
            <figcaption className="visualizer-label">Waterfall</figcaption>
            <div className="midi-visualizer-wrap">
              <midi-visualizer
                ref={waterfallRef}
                type="waterfall"
                src={downloadHref}
                className="midi-visualizer"
              />
            </div>
          </figure>

          <figure className="visualizer-figure">
            <figcaption className="visualizer-label">Staff</figcaption>
            <div className="midi-visualizer-wrap">
              <midi-visualizer
                type="staff"
                src={downloadHref}
                className="midi-visualizer"
              />
            </div>
          </figure>
        </div>
        <midi-player
          ref={playerRef}
          src={downloadHref}
          sound-font="https://storage.googleapis.com/magentadata/js/soundfonts/sgm_plus"
          className="midi-player"
        />
      </div>

      <a className="download-card" href={downloadHref} download={`${result.job_id}.mid`}>
        <div className="download-icon" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </div>
        <div className="download-text">
          <div className="download-title">Download MIDI</div>
          <div className="download-sub">{result.job_id}.mid</div>
        </div>
      </a>

      <div className="notes-section">
        <div className="notes-section-title">Notes</div>
        {result.notes.length === 0 ? (
          <div className="empty">No vocal notes detected.</div>
        ) : (
          <div className="notes-list">
            {result.notes.map((note, idx) => (
              <div className="note-row" key={idx}>
                <div className="note-index">{idx + 1}</div>
                <div className="note-pitch">{note.pitch_name}</div>
                <div className="note-time">
                  <span>{formatTime(note.start_time_sec)}</span>
                  <span className="note-arrow">→</span>
                  <span>{formatTime(note.end_time_sec)}</span>
                </div>
                <div className="note-duration">
                  {formatDuration(note.start_time_sec, note.end_time_sec)}
                </div>
                <div className="note-velocity">
                  <div
                    className="velocity-bar"
                    style={{ width: `${Math.min(100, note.velocity * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
