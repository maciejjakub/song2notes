import type {
  AnalyzeResponse,
  AppConfig,
  JobDetail,
  JobSummary,
  YouTubeSource,
} from './types';

// Empty = same-origin: API calls become relative paths (e.g. /jobs) that the
// browser resolves against the page's own origin, then Vite's dev proxy (see
// vite.config.ts) forwards them to FastAPI. This keeps everything same-origin
// (no CORS) and host-agnostic, so the app works from localhost or a phone on
// the LAN with no code change. In production, serve behind a reverse proxy that
// forwards the same prefixes to the backend.
export const API_BASE = '';

/**
 * Debug-only: when enabled (build-time env var VITE_DEBUG_VOCALS=true), the
 * Results view exposes a player for the separated vocal stem, so we can hear
 * whether separation went wrong on a given sample. Not surfaced to end users.
 */
export const DEBUG_VOCALS = import.meta.env.VITE_DEBUG_VOCALS === 'true';

/**
 * Feature flag (build-time env var VITE_ENABLE_YT_IMPORT=true): shows the
 * "import from YouTube" panel under the dropzone — fetch a video's audio, slice
 * it, then run the chosen segment through analysis.
 */
export const ENABLE_YT_IMPORT = import.meta.env.VITE_ENABLE_YT_IMPORT === 'true';

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `Request failed with status ${res.status}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }
  return res.json();
}

export async function getConfig(): Promise<AppConfig> {
  const res = await fetch(`${API_BASE}/config`);
  return handle<AppConfig>(res);
}

export async function analyzeAudio(file: File, model: string): Promise<AnalyzeResponse> {
  const form = new FormData();
  form.append('audio', file);
  form.append('model', model);
  const res = await fetch(`${API_BASE}/analyze`, { method: 'POST', body: form });
  return handle<AnalyzeResponse>(res);
}

export async function listJobs(): Promise<JobSummary[]> {
  const res = await fetch(`${API_BASE}/jobs`);
  return handle<JobSummary[]>(res);
}

export async function getJob(jobId: string): Promise<JobDetail> {
  const res = await fetch(`${API_BASE}/jobs/${jobId}`);
  return handle<JobDetail>(res);
}

export async function deleteJob(jobId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/jobs/${jobId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Failed to delete job (${res.status})`);
}

export function midiDownloadUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export function vocalsUrl(jobId: string): string {
  return `${API_BASE}/download/${jobId}/vocals`;
}

export async function youtubeDownload(url: string): Promise<YouTubeSource> {
  const res = await fetch(`${API_BASE}/youtube/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  return handle<YouTubeSource>(res);
}

export function youtubeAudioUrl(audioUrl: string): string {
  return `${API_BASE}${audioUrl}`;
}

export async function youtubeAnalyze(params: {
  source_id: string;
  start_sec: number;
  end_sec: number;
  title?: string;
  model?: string;
}): Promise<AnalyzeResponse> {
  const res = await fetch(`${API_BASE}/youtube/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return handle<AnalyzeResponse>(res);
}
