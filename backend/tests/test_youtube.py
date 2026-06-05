import numpy as np
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings
from pathlib import Path
from unittest.mock import MagicMock, patch

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_dirs():
    Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
    Path(settings.OUTPUT_DIR).mkdir(parents=True, exist_ok=True)
    yield


def test_download_rejects_invalid_url():
    response = client.post("/youtube/download", json={"url": "https://example.com/foo"})
    assert response.status_code == 400


def test_download_rejects_too_long_video():
    fake_yt = MagicMock()
    fake_yt.length = settings.MAX_YOUTUBE_DURATION_SEC + 1
    with patch("app.main.YouTube", return_value=fake_yt):
        response = client.post(
            "/youtube/download",
            json={"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"},
        )
    assert response.status_code == 400
    assert "too long" in response.json()["detail"].lower()


def test_download_success(tmp_path):
    fake_stream = MagicMock()
    fake_yt = MagicMock()
    fake_yt.length = 120
    fake_yt.title = "Some Song"
    fake_yt.streams.get_audio_only.return_value = fake_stream

    with patch("app.main.YouTube", return_value=fake_yt):
        response = client.post(
            "/youtube/download",
            json={"url": "https://youtu.be/dQw4w9WgXcQ"},
        )

    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "Some Song"
    assert data["duration_sec"] == 120.0
    assert data["audio_url"] == f"/youtube/audio/{data['source_id']}"
    # The handler asks pytubefix to write <source_id>.m4a into the upload dir.
    fake_stream.download.assert_called_once()
    kwargs = fake_stream.download.call_args.kwargs
    assert kwargs["filename"] == f"{data['source_id']}.m4a"


def test_youtube_audio_not_found():
    response = client.get("/youtube/audio/missing-source")
    assert response.status_code == 404


def test_youtube_analyze_missing_source():
    response = client.post(
        "/youtube/analyze",
        json={"source_id": "nope", "start_sec": 0.0, "end_sec": 5.0},
    )
    assert response.status_code == 404


def test_youtube_analyze_invalid_range():
    source_id = "range-test"
    source_path = Path(settings.UPLOAD_DIR) / f"{source_id}.m4a"
    source_path.touch()
    try:
        response = client.post(
            "/youtube/analyze",
            json={"source_id": source_id, "start_sec": 5.0, "end_sec": 5.0},
        )
        assert response.status_code == 400
    finally:
        source_path.unlink(missing_ok=True)


def test_youtube_analyze_trims_and_runs_pipeline():
    source_id = "trim-test"
    source_path = Path(settings.UPLOAD_DIR) / f"{source_id}.m4a"
    source_path.touch()

    mono = np.zeros(44100, dtype=np.float32)
    try:
        with patch("app.main.librosa.load", return_value=(mono, 44100)) as mock_load, \
             patch("app.main.sf.write") as mock_write, \
             patch("app.main._run_pipeline", return_value={"status": "complete"}) as mock_run:
            response = client.post(
                "/youtube/analyze",
                json={
                    "source_id": source_id,
                    "start_sec": 1.0,
                    "end_sec": 3.0,
                    "title": "Clip",
                },
            )

        assert response.status_code == 200
        # Only the selected window is decoded.
        assert mock_load.call_args.kwargs["offset"] == 1.0
        assert mock_load.call_args.kwargs["duration"] == 2.0
        mock_write.assert_called_once()
        # Pipeline gets a wav named after a fresh job id, with the title as filename.
        input_path = mock_run.call_args.args[0]
        assert input_path.suffix == ".wav"
        assert mock_run.call_args.args[1] == "Clip.wav"
    finally:
        source_path.unlink(missing_ok=True)
