import { useState } from 'react';
import { Dropzone } from './components/Dropzone';
import { Results } from './components/Results';
import { analyzeAudio } from './api';
import type { AnalyzeResponse } from './types';
import './App.css';

type Status = 'idle' | 'processing' | 'done' | 'error';

function App() {
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setStatus('processing');
    setError(null);
    setResult(null);
    try {
      const res = await analyzeAudio(file);
      setResult(res);
      setStatus('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setStatus('error');
    }
  };

  const reset = () => {
    setStatus('idle');
    setResult(null);
    setError(null);
    setFileName('');
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
          </div>
          <div>
            <div className="brand-name">song2notes</div>
            <div className="brand-tag">Turn vocals into MIDI</div>
          </div>
        </div>
      </header>

      <main className="app-main">
        {status === 'idle' && (
          <section className="hero">
            <h1>Transcribe a song's vocals to notes</h1>
            <p className="hero-sub">
              Upload an audio file. We'll isolate the vocals, detect each note,
              and hand you back a MIDI file you can open in any DAW.
            </p>
            <Dropzone onFile={handleFile} />
          </section>
        )}

        {status === 'processing' && (
          <section className="processing">
            <div className="spinner" aria-hidden="true" />
            <h2>Analyzing {fileName}</h2>
            <p className="processing-sub">
              Separating vocals and detecting pitch. This usually takes 30–90s.
            </p>
            <ul className="processing-steps">
              <li>Isolating the vocal track</li>
              <li>Running pitch detection</li>
              <li>Segmenting into notes</li>
              <li>Writing MIDI</li>
            </ul>
          </section>
        )}

        {status === 'error' && (
          <section className="error-state">
            <div className="error-icon" aria-hidden="true">!</div>
            <h2>Analysis failed</h2>
            <p className="error-detail">{error}</p>
            <button className="btn-primary" onClick={reset}>
              Try again
            </button>
          </section>
        )}

        {status === 'done' && result && (
          <Results result={result} fileName={fileName} onReset={reset} />
        )}
      </main>
    </div>
  );
}

export default App;
