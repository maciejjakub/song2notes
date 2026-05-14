import type { AnalyzeResponse } from './types';

export const API_BASE = 'http://127.0.0.1:8000';

export async function analyzeAudio(file: File): Promise<AnalyzeResponse> {
  const form = new FormData();
  form.append('audio', file);

  const res = await fetch(`${API_BASE}/analyze`, {
    method: 'POST',
    body: form,
  });

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

export function midiDownloadUrl(path: string): string {
  return `${API_BASE}${path}`;
}
