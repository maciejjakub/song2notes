import type { JobSummary } from '../types';

type Props = {
  jobs: JobSummary[];
  loading: boolean;
  activeJobId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
};

function formatDate(iso: string): string {
  const d = new Date(iso + (iso.endsWith('Z') ? '' : 'Z'));
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function HistoryPanel({ jobs, loading, activeJobId, onSelect, onDelete }: Props) {
  return (
    <aside className="history-panel">
      <div className="history-header">
        <span className="history-title">History</span>
        {jobs.length > 0 && <span className="history-count">{jobs.length}</span>}
      </div>

      {loading && jobs.length === 0 ? (
        <div className="history-empty">Loading…</div>
      ) : jobs.length === 0 ? (
        <div className="history-empty">No analyses yet. Upload a file to get started.</div>
      ) : (
        <ul className="history-list">
          {jobs.map((job) => (
            <li
              key={job.id}
              className={`history-item ${activeJobId === job.id ? 'active' : ''}`}
            >
              <button className="history-item-main" onClick={() => onSelect(job.id)}>
                <div className="history-item-name" title={job.original_filename}>
                  {job.original_filename}
                </div>
                <div className="history-item-meta">
                  <span>{job.note_count} notes</span>
                  <span className="history-dot">·</span>
                  <span>{formatDate(job.created_at)}</span>
                </div>
              </button>
              <button
                className="history-item-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(job.id);
                }}
                aria-label={`Delete ${job.original_filename}`}
                title="Delete"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
