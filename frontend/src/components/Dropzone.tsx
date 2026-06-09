import { useCallback, useRef, useState } from 'react';

// Fallbacks used until the backend's /config arrives (or if it's unreachable).
const DEFAULT_ALLOWED_EXTS = ['.mp3', '.wav', '.flac', '.ogg', '.m4a'];
const DEFAULT_MAX_SIZE_MB = 50;

type Props = {
  onFile: (file: File) => void;
  disabled?: boolean;
  allowedExts?: string[];
  maxSizeMb?: number;
};

export function Dropzone({ onFile, disabled, allowedExts, maxSizeMb }: Props) {
  const exts = allowedExts ?? DEFAULT_ALLOWED_EXTS;
  const maxSize = maxSizeMb ?? DEFAULT_MAX_SIZE_MB;
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validate = (file: File): string | null => {
    const lower = file.name.toLowerCase();
    if (!exts.some((ext) => lower.endsWith(ext))) {
      return `Unsupported file type. Allowed: ${exts.join(', ')}`;
    }
    if (file.size > maxSize * 1024 * 1024) {
      return `File too large. Max ${maxSize} MB.`;
    }
    return null;
  };

  const handleFile = (file: File) => {
    const err = validate(file);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    onFile(file);
  };

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      if (disabled) return;
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [disabled],
  );

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // reset so the same file can be selected again
    e.target.value = '';
  };

  return (
    // This should be a button instead of a div
    <div className="dropzone-wrap">
      <div
        className={`dropzone${isDragging ? ' dragging' : ''}${disabled ? ' disabled' : ''}`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => !disabled && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
            inputRef.current?.click();
          }
        }}
      >
        {/* this should have label */}
        <input
          ref={inputRef}
          type="file"
          accept={exts.join(',')}
          onChange={onChange}
          hidden
          disabled={disabled}
        />
        <div className="dropzone-icon" aria-hidden="true">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
        </div>
        <div className="dropzone-title">
          {isDragging ? 'Drop the file here' : 'Drag a song here'}
        </div>
        <div className="dropzone-sub">
          or <span className="dropzone-link">click to browse</span>
        </div>
        <div className="dropzone-meta">
          {exts.join(' · ')} — up to {maxSize} MB
        </div>
      </div>
      {error && <div className="error-banner">{error}</div>}
    </div>
  );
}
