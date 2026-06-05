import type { AnalyzeResponse, AppConfig, JobDetail, JobSummary } from './types';

export const API_BASE = 'http://127.0.0.1:8000';

/**
 * Debug-only: when enabled (build-time env var VITE_DEBUG_VOCALS=true), the
 * Results view exposes a player for the demucs-separated vocal stem, so we can
 * hear whether separation went wrong on a given sample. Not surfaced to end users.
 */
export const DEBUG_VOCALS = import.meta.env.VITE_DEBUG_VOCALS === 'true';

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

export async function analyzeAudio(file: File): Promise<AnalyzeResponse> {
  const form = new FormData();
  form.append('audio', file);
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
