import { useState } from 'react';
import { youtubeAudioUrl, youtubeDownload } from '../../api';
import type { YouTubeSource } from '../../types';
import { WaveformEditor } from './WaveformEditor';

// Mirrors the backend check — fail fast before hitting the network.
const YT_URL_RE =
  /^(https?:\/\/)?(www\.|m\.)?(youtube\.com\/watch\?v=[\w-]{11}|youtu\.be\/[\w-]{11})/;

type AnalyzeParams = {
  source_id: string;
  start_sec: number;
  end_sec: number;
  title?: string;
};

type Props = {
  onAnalyze: (params: AnalyzeParams) => void;
  disabled?: boolean;
};

export function YouTubeImport({ onAnalyze, disabled }: Props) {
  const [url, setUrl] = useState('');
  const [source, setSource] = useState<YouTubeSource | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAudio = async () => {
    const trimmed = url.trim();
    if (!YT_URL_RE.test(trimmed)) {
      setError('Enter a valid YouTube video URL.');
      return;
    }
    setError(null);
    setLoading(true);
    setSource(null);
    try {
      setSource(await youtubeDownload(trimmed));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not fetch audio.');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setSource(null);
    setUrl('');
    setError(null);
  };

  return (
    <div className="yt-import">
      <div className="yt-import-header">
        <span className="yt-badge">Beta</span>
        Import audio from YouTube
      </div>

      {!source && (
        <>
          <div className="yt-input-row">
            <input
              type="url"
              className="yt-input"
              placeholder="https://www.youtube.com/watch?v=…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !loading && fetchAudio()}
              disabled={loading || disabled}
            />
            <button
              className="btn-primary"
              onClick={fetchAudio}
              disabled={loading || disabled}
            >
              {loading ? 'Fetching…' : 'Fetch audio'}
            </button>
          </div>
          <div className="yt-hint">
            We'll download the audio so you can trim it before analysis.
          </div>
        </>
      )}

      {source && (
        <div className="yt-editor">
          <div className="yt-source-title" title={source.title}>
            {source.title}
          </div>
          <WaveformEditor
            audioUrl={youtubeAudioUrl(source.audio_url)}
            onConfirm={(start, end) =>
              onAnalyze({
                source_id: source.source_id,
                start_sec: start,
                end_sec: end,
                title: source.title,
              })
            }
            disabled={disabled}
          />
          <button className="btn-secondary yt-reset" onClick={reset} disabled={disabled}>
            Use a different video
          </button>
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}
    </div>
  );
}
