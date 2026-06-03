import { useCallback, useEffect, useState } from 'react';
import { Dropzone } from './components/Dropzone';
import { Results } from './components/Results';
import { HistoryPanel } from './components/HistoryPanel';
import { ThemeToggle } from './components/ThemeToggle';
import { analyzeAudio, deleteJob, getConfig, getJob, listJobs } from './api';
import type { AnalyzeResponse, AppConfig, JobSummary } from './types';
import './App.css';

type Status = 'idle' | 'processing' | 'done' | 'error';

function App() {
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);

  const refreshJobs = useCallback(async () => {
    try {
      const list = await listJobs();
      setJobs(list);
    } catch (err) {
      console.error('Failed to load history', err);
    } finally {
      setJobsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshJobs();
  }, [refreshJobs]);

  useEffect(() => {
    getConfig()
      .then(setConfig)
      .catch((err) => console.error('Failed to load config; using defaults', err));
  }, []);

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setStatus('processing');
    setError(null);
    setResult(null);
    setActiveJobId(null);
    try {
      const res = await analyzeAudio(file);
      setResult(res);
      setActiveJobId(res.job_id);
      setStatus('done');
      refreshJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setStatus('error');
    }
  };

  const handleSelectJob = async (jobId: string) => {
    setActiveJobId(jobId);
    setStatus('processing');
    setError(null);
    try {
      const job = await getJob(jobId);
      setFileName(job.original_filename);
      setResult({
        job_id: job.job_id,
        status: job.status,
        note_count: job.note_count,
        notes: job.notes,
        note_name: job.notes.map((n) => n.pitch_name),
        tuning_offset_semitones: job.tuning_offset_semitones,
        midi_download_url: job.midi_download_url,
      });
      setStatus('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this analysis.');
      setStatus('error');
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    try {
      await deleteJob(jobId);
      if (activeJobId === jobId) reset();
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
    } catch (err) {
      console.error('Failed to delete job', err);
    }
  };

  const reset = () => {
    setStatus('idle');
    setResult(null);
    setError(null);
    setFileName('');
    setActiveJobId(null);
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
        <div className="header-actions">
          {status !== 'idle' && (
            <button className="btn-secondary" onClick={reset}>
              New analysis
            </button>
          )}
          <ThemeToggle />
        </div>
      </header>

      <div className="app-body">
        <HistoryPanel
          jobs={jobs}
          loading={jobsLoading}
          activeJobId={activeJobId}
          onSelect={handleSelectJob}
          onDelete={handleDeleteJob}
        />

        <main className="app-main">
          {status === 'idle' && (
            <section className="hero">
              <h1>Transcribe a song's vocals to notes</h1>
              <p className="hero-sub">
                Upload an audio file. We'll isolate the vocals, detect each note,
                and hand you back a MIDI file you can open in any DAW.
              </p>
              <Dropzone
                onFile={handleFile}
                allowedExts={config?.allowed_extensions}
                maxSizeMb={config?.max_file_size_mb}
              />
            </section>
          )}

          {status === 'processing' && (
            <section className="processing">
              <div className="spinner" aria-hidden="true" />
              <h2>{fileName ? `Analyzing ${fileName}` : 'Loading…'}</h2>
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
    </div>
  );
}

export default App;
