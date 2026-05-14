import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings
import os
import shutil

@pytest.fixture(autouse=True)
def setup_upload_dir():
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    yield
    # Cleanup (Optional: remove files)

client = TestClient(app)

def test_upload_success():
    # Ensure test file exists
    test_file_path = os.path.join(os.getcwd(), "samples", "test.mp3")
    assert os.path.exists(test_file_path)
    
    with open(test_file_path, "rb") as f:
        response = client.post("/upload", files={"audio": ("test.mp3", f, "audio/mpeg")})
    
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "uploaded"
    assert "job_id" in data
    
    # Clean up uploaded file
    uploaded_file = os.path.join(settings.UPLOAD_DIR, f"{data['job_id']}.mp3")
    assert os.path.exists(uploaded_file)
    os.remove(uploaded_file)

def test_upload_invalid_type():
    with open(__file__, "rb") as f: # Use this file as a dummy non-audio file
        response = client.post("/upload", files={"audio": ("test.py", f, "text/x-python")})
    
    assert response.status_code == 400

def test_upload_too_large():
    # Create a temporary file larger than 50MB
    large_file_path = "large.mp3"
    with open(large_file_path, "wb") as f:
        f.seek(51 * 1024 * 1024)
        f.write(b"0")
    
    with open(large_file_path, "rb") as f:
        response = client.post("/upload", files={"audio": ("large.mp3", f, "audio/mpeg")})
    
    assert response.status_code == 413
    
    # Cleanup
    os.remove(large_file_path)
