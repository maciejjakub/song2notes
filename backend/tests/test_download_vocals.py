import uuid
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session
from pathlib import Path
from app.main import app
from app.config import settings
from app.db import engine
from app.db_models import Job

client = TestClient(app)


def _insert_job(job_id: str, separator_model: str | None) -> None:
    job = Job(
        id=job_id,
        original_filename="song.mp3",
        note_count=0,
        duration_sec=0.0,
        midi_path="",
        notes_json="[]",
        separator_model=separator_model,
    )
    with Session(engine) as session:
        session.add(job)
        session.commit()


def _delete_job(job_id: str) -> None:
    with Session(engine) as session:
        job = session.get(Job, job_id)
        if job:
            session.delete(job)
            session.commit()


@pytest.fixture
def vocals_job():
    """Job row + stem file mimicking the layout the separator produces during /analyze."""

    def _make(separator_model: str | None, stem_dir: str):
        job_id = str(uuid.uuid4())
        _insert_job(job_id, separator_model)
        vocals_path = Path(settings.OUTPUT_DIR) / stem_dir / job_id / "vocals.wav"
        vocals_path.parent.mkdir(parents=True, exist_ok=True)
        vocals_path.write_bytes(b"RIFF....WAVE fake pcm")
        created.append((job_id, vocals_path))
        return job_id

    created: list[tuple[str, Path]] = []
    yield _make
    for job_id, vocals_path in created:
        vocals_path.unlink(missing_ok=True)
        _delete_job(job_id)


def test_download_vocals_success(vocals_job):
    job_id = vocals_job("roformer", "roformer")
    response = client.get(f"/download/{job_id}/vocals")
    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/wav"
    assert response.content == b"RIFF....WAVE fake pcm"


def test_download_vocals_legacy_job_falls_back_to_htdemucs(vocals_job):
    # Rows from before model selection have NULL separator_model; their stems
    # were written by the old demucs pipeline under htdemucs/.
    job_id = vocals_job(None, "htdemucs")
    response = client.get(f"/download/{job_id}/vocals")
    assert response.status_code == 200
    assert response.content == b"RIFF....WAVE fake pcm"


def test_download_vocals_not_found():
    response = client.get("/download/non-existent-job/vocals")
    assert response.status_code == 404
