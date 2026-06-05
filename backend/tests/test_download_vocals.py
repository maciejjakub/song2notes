import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings
from pathlib import Path

client = TestClient(app)


@pytest.fixture
def separated_vocals():
    # Mimic the layout demucs produces under OUTPUT_DIR during /analyze.
    job_id = "vocals-test-job"
    vocals_path = Path(settings.OUTPUT_DIR) / "htdemucs" / job_id / "vocals.wav"
    vocals_path.parent.mkdir(parents=True, exist_ok=True)
    vocals_path.write_bytes(b"RIFF....WAVE fake pcm")
    yield job_id, vocals_path
    vocals_path.unlink(missing_ok=True)


def test_download_vocals_success(separated_vocals):
    job_id, _ = separated_vocals
    response = client.get(f"/download/{job_id}/vocals")
    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/wav"
    assert response.content == b"RIFF....WAVE fake pcm"


def test_download_vocals_not_found():
    response = client.get("/download/non-existent-job/vocals")
    assert response.status_code == 404
