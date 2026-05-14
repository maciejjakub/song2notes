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
