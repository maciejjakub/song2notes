import pytest
from unittest.mock import patch
from pathlib import Path
from app.pipeline import separate_vocals
from app.config import settings


def test_separate_vocals_success(tmp_path):
    job_id = "test-job"
    input_path = tmp_path / f"{job_id}.wav"
    input_path.touch()

    expected_vocals = Path(settings.OUTPUT_DIR) / "mdx_voc_ft" / job_id / "vocals.wav"

    def fake_separate(_input, custom_output_names=None):
        # Mimic audio-separator writing the stem into its configured output_dir.
        expected_vocals.touch()
        return ["vocals.wav"]

    with patch("app.pipeline.Separator") as mock_separator_cls:
        mock_separator = mock_separator_cls.return_value
        mock_separator.separate.side_effect = fake_separate

        try:
            result = separate_vocals(input_path, "mdx_voc_ft")

            assert result == expected_vocals
            mock_separator.load_model.assert_called_once_with(
                model_filename=settings.SEPARATOR_MODELS["mdx_voc_ft"]["file"]
            )
        finally:
            expected_vocals.unlink(missing_ok=True)


def test_separate_vocals_unknown_model():
    with pytest.raises(ValueError, match="Unknown separation model"):
        separate_vocals(Path("fake.wav"), "no-such-model")


def test_separate_vocals_failure_separator_exception():
    input_path = Path("fake.wav")

    with patch("app.pipeline.Separator") as mock_separator_cls:
        mock_separator_cls.return_value.load_model.side_effect = Exception("model crashed")
        with pytest.raises(RuntimeError, match="Vocal separation failed"):
            separate_vocals(input_path, "mdx_voc_ft")


def test_separate_vocals_failure_no_output_file(tmp_path):
    input_path = tmp_path / "no-output.wav"
    input_path.touch()

    with patch("app.pipeline.Separator") as mock_separator_cls:
        mock_separator_cls.return_value.separate.return_value = ["vocals.wav"]
        with pytest.raises(RuntimeError, match="Vocals not found"):
            separate_vocals(input_path, "mdx_voc_ft")
