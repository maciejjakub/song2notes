from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field


class Job(SQLModel, table=True):
    id: str = Field(primary_key=True)
    original_filename: str
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    status: str = Field(default="complete")
    note_count: int
    tuning_offset_semitones: Optional[float] = None
    duration_sec: float
    midi_path: str
    notes_json: str
    # Registry key from settings.SEPARATOR_MODELS. NULL on rows that predate
    # model selection — those were produced by the original demucs htdemucs path.
    separator_model: Optional[str] = None


class JobSummary(SQLModel):
    id: str
    original_filename: str
    created_at: datetime
    status: str
    note_count: int
    tuning_offset_semitones: Optional[float] = None
    duration_sec: float
    separator_model: Optional[str] = None
