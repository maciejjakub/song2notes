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

export function Results({ result, fileName, onReset }: Props) {
  const downloadHref = midiDownloadUrl(result.midi_download_url);
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
        <div className="midi-visualizer-wrap">
          <midi-visualizer
            type="piano-roll"
            src={downloadHref}
            className="midi-visualizer"
          />
        </div>
        <midi-player
          src={downloadHref}
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
