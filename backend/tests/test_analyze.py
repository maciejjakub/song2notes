import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings
import os
from pathlib import Path
from unittest.mock import patch

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_dirs():
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    os.makedirs(settings.OUTPUT_DIR, exist_ok=True)
    yield

def test_analyze_success():
    # Ensure test file exists
    test_file_path = Path("..") / "samples" / "test.mp3"
    assert test_file_path.exists()
    
    # We must patch the pipeline to avoid running actual ML models during unit tests
    with patch("app.main.separate_vocals") as mock_separate:
        with patch("app.main.extract_notes") as mock_extract:
            # Mock successful pipeline
            mock_separate.return_value = Path(settings.OUTPUT_DIR) / "mock" / "vocals.wav"
            mock_extract.return_value = {
                "midi_path": str(Path(settings.OUTPUT_DIR) / "mock" / "output.mid"),
                "notes": [{"start_time_sec": 0.0, "end_time_sec": 1.0, "pitch_midi": 60, "pitch_name": "C4", "velocity": 100}],
                "note_count": 1,
                "note_name": ["C4"],
            }
            
            with open(test_file_path, "rb") as f:
                response = client.post("/analyze", files={"audio": ("test.mp3", f, "audio/mpeg")})

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "complete"
    assert data["note_count"] == 1
    assert "midi_download_url" in data
    # No model in the request → the configured default is used and recorded.
    assert data["separator_model"] == settings.DEFAULT_SEPARATOR
    assert mock_separate.call_args.args[1] == settings.DEFAULT_SEPARATOR

def test_analyze_explicit_model():
    test_file_path = Path("..") / "samples" / "test.mp3"

    with patch("app.main.separate_vocals") as mock_separate:
        with patch("app.main.extract_notes") as mock_extract:
            mock_separate.return_value = Path(settings.OUTPUT_DIR) / "mock" / "vocals.wav"
            mock_extract.return_value = {
                "midi_path": str(Path(settings.OUTPUT_DIR) / "mock" / "output.mid"),
                "notes": [],
                "note_count": 0,
                "note_name": [],
            }

            with open(test_file_path, "rb") as f:
                response = client.post(
                    "/analyze",
                    files={"audio": ("test.mp3", f, "audio/mpeg")},
                    data={"model": "roformer"},
                )

    assert response.status_code == 200
    assert response.json()["separator_model"] == "roformer"
    assert mock_separate.call_args.args[1] == "roformer"

def test_analyze_unknown_model_rejected():
    test_file_path = Path("..") / "samples" / "test.mp3"

    with open(test_file_path, "rb") as f:
        response = client.post(
            "/analyze",
            files={"audio": ("test.mp3", f, "audio/mpeg")},
            data={"model": "no-such-model"},
        )

    assert response.status_code == 400
    assert "Unknown model" in response.json()["detail"]

def test_config_lists_separator_models():
    response = client.get("/config")
    assert response.status_code == 200
    data = response.json()
    keys = {m["key"] for m in data["separator_models"]}
    assert keys == set(settings.SEPARATOR_MODELS)
    assert all(m["label"] for m in data["separator_models"])
    assert data["default_separator"] in keys

def test_analyze_failure_pipeline():
    test_file_path = Path("..") / "samples" / "test.mp3"

    # Mock failure in pipeline
    with patch("app.main.separate_vocals", side_effect=RuntimeError("Separation failed")):
        with open(test_file_path, "rb") as f:
            response = client.post("/analyze", files={"audio": ("test.mp3", f, "audio/mpeg")})

    assert response.status_code == 500
    assert "Separation failed" in response.json()["detail"]
