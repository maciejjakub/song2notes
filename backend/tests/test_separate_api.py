import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings
from pathlib import Path
from unittest.mock import patch

client = TestClient(app)

@pytest.fixture
def uploaded_file(tmp_path):
    # Setup: Create a dummy uploaded file
    job_id = "test-job-id"
    upload_file = Path(settings.UPLOAD_DIR) / f"{job_id}.mp3"
    upload_file.touch()
    yield job_id, upload_file
    # Cleanup
    if upload_file.exists():
        upload_file.unlink()

def test_separate_api_success(uploaded_file):
    job_id, _ = uploaded_file
    
    # Mock the pipeline call
    with patch("app.main.separate_vocals") as mock_separate:
        mock_separate.return_value = Path(settings.OUTPUT_DIR) / "htdemucs" / job_id / "vocals.wav"
        
        response = client.post(f"/separate/{job_id}")
        
    assert response.status_code == 200
    data = response.json()
    assert data["job_id"] == job_id
    assert data["status"] == "separated"
    assert "vocals_path" in data

def test_separate_api_not_found():
    response = client.post("/separate/non-existent-job")
    assert response.status_code == 404

def test_separate_api_pipeline_failure(uploaded_file):
    job_id, _ = uploaded_file
    
    with patch("app.main.separate_vocals", side_effect=RuntimeError("Pipeline error")):
        response = client.post(f"/separate/{job_id}")
        
    assert response.status_code == 500
    assert "detail" in response.json()
