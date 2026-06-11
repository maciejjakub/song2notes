export type SeparatorModel = {
  key: string;
  label: string;
};

export type AppConfig = {
  allowed_extensions: string[];
  max_file_size_mb: number;
  separator_models: SeparatorModel[];
  default_separator: string;
};

export type Note = {
  start_time_sec: number;
  end_time_sec: number;
  pitch_midi: number;
  pitch_name: string;
  velocity: number;
};

export type YouTubeSource = {
  source_id: string;
  title: string;
  duration_sec: number;
  audio_url: string;
};

export type AnalyzeResponse = {
  job_id: string;
  status: string;
  note_count: number;
  notes: Note[];
  note_name: string[];
  tuning_offset_semitones: number | null;
  // null on jobs that predate model selection (old demucs/htdemucs runs)
  separator_model: string | null;
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
  separator_model: string | null;
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
  separator_model: string | null;
  midi_download_url: string;
};
