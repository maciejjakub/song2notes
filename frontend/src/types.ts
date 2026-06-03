export type AppConfig = {
  allowed_extensions: string[];
  max_file_size_mb: number;
};

export type Note = {
  start_time_sec: number;
  end_time_sec: number;
  pitch_midi: number;
  pitch_name: string;
  velocity: number;
};

export type AnalyzeResponse = {
  job_id: string;
  status: string;
  note_count: number;
  notes: Note[];
  note_name: string[];
  tuning_offset_semitones: number | null;
  midi_download_url: string;
};

export type JobSummary = {
  id: string;
  original_filename: string;
  created_at: string;
  status: string;
  note_count: number;
  tuning_offset_semitones: number | null;
  duration_sec: number;
};

export type JobDetail = {
  job_id: string;
  original_filename: string;
  created_at: string;
  status: string;
  note_count: number;
  notes: Note[];
  tuning_offset_semitones: number | null;
  duration_sec: number;
  midi_download_url: string;
};
