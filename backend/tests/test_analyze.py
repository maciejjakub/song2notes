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
    test_file_path = Path("samples") / "test.mp3"
    assert test_file_path.exists()
    
    # We must patch the pipeline to avoid running actual ML models during unit tests
    with patch("app.main.separate_vocals") as mock_separate:
        with patch("app.main.extract_notes") as mock_extract:
            # Mock successful pipeline
            mock_separate.return_value = Path(settings.OUTPUT_DIR) / "mock" / "vocals.wav"
            mock_extract.return_value = {
                "midi_path": str(Path(settings.OUTPUT_DIR) / "mock" / "output.mid"),
                "notes": [{"start_time_sec": 0.0, "end_time_sec": 1.0, "pitch_midi": 60, "pitch_name": "C4", "velocity": 100}],
                "note_count": 1
            }
            
            with open(test_file_path, "rb") as f:
                response = client.post("/analyze", files={"audio": ("test.mp3", f, "audio/mpeg")})
    
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "complete"
    assert data["note_count"] == 1
    assert "midi_download_url" in data

def test_analyze_failure_pipeline():
    test_file_path = Path("samples") / "test.mp3"
    
    # Mock failure in pipeline
    with patch("app.main.separate_vocals", side_effect=RuntimeError("Demucs failed")):
        with open(test_file_path, "rb") as f:
            response = client.post("/analyze", files={"audio": ("test.mp3", f, "audio/mpeg")})
    
    assert response.status_code == 500
    assert "Demucs failed" in response.json()["detail"]
