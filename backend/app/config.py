from pathlib import Path
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    UPLOAD_DIR: str = "../samples/uploads"
    OUTPUT_DIR: str = "../samples/outputs"
    DB_PATH: str = "song2notes.db"
    MAX_FILE_SIZE_MB: int = 50
    ALLOWED_EXTENSIONS: set[str] = {".mp3", ".wav", ".flac", ".ogg", ".m4a"}
    # Reject YouTube videos longer than this to avoid huge downloads/processing.
    MAX_YOUTUBE_DURATION_SEC: int = 900

    # ── Vocal separation (python-audio-separator) ───────────────────────────
    # User-selectable per job. The registry key is also the on-disk subdir under
    # OUTPUT_DIR for the separated stems and is stored on each Job row; "file" is
    # the audio-separator model filename. The "htdemucs" key matches the layout
    # the old demucs-based pipeline wrote, so legacy jobs (NULL separator_model)
    # resolve to the same directories. Model weights are cached outside the repo.
    SEPARATOR_MODELS: dict[str, dict[str, str]] = {
        "htdemucs": {"file": "htdemucs.yaml", "label": "Demucs v4 (htdemucs)"},
        "mdx_voc_ft": {"file": "UVR-MDX-NET-Voc_FT.onnx", "label": "MDX-Net Voc FT"},
        "roformer": {"file": "vocals_mel_band_roformer.ckpt", "label": "Mel-Band Roformer"},
    }
    DEFAULT_SEPARATOR: str = "mdx_voc_ft"
    SEPARATOR_MODEL_DIR: str = str(Path.home() / ".cache" / "audio-separator-models")

    class Config:
        env_file = ".env"

settings = Settings()
