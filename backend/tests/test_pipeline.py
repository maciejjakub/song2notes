import pytest
from unittest.mock import patch, MagicMock
from pathlib import Path
from app.pipeline import separate_vocals
from app.config import settings

def test_separate_vocals_success(tmp_path):
    # Setup mock
    job_id = "test-job"
    input_path = tmp_path / f"{job_id}.wav"
    input_path.touch()
    
    # Mock demucs main
    with patch("app.pipeline.main") as mock_main:
        # Mock the creation of the output file that demucs would produce
        expected_output_dir = Path(settings.OUTPUT_DIR) / "htdemucs" / job_id
        expected_output_dir.mkdir(parents=True, exist_ok=True)
        vocals_path = expected_output_dir / "vocals.wav"
        vocals_path.touch()
        
        result = separate_vocals(input_path)
        
        assert result == vocals_path
        mock_main.assert_called_once()

def test_separate_vocals_failure_demucs_exception():
    input_path = Path("fake.wav")
    
    with patch("app.pipeline.main", side_effect=Exception("Demucs crashed")):
        with pytest.raises(RuntimeError, match="Demucs separation failed"):
            separate_vocals(input_path)

def test_separate_vocals_failure_no_output_file():
    input_path = Path("fake.wav")
    
    with patch("app.pipeline.main"):
        with pytest.raises(RuntimeError, match="Separation failed. Vocals not found"):
            separate_vocals(input_path)
