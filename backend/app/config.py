from pathlib import Path
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    UPLOAD_DIR: str = "../samples/uploads"
    # Output + DB are isolated per separation-model experiment branch so runs
    # don't intermingle with main's htdemucs history. See SEPARATOR_* below.
    OUTPUT_DIR: str = "../samples/outputs_mdx"
    DB_PATH: str = "song2notes_mdx.db"
    MAX_FILE_SIZE_MB: int = 50
    ALLOWED_EXTENSIONS: set[str] = {".mp3", ".wav", ".flac", ".ogg", ".m4a"}
    # Reject YouTube videos longer than this to avoid huge downloads/processing.
    MAX_YOUTUBE_DURATION_SEC: int = 900

    # ── Vocal separation (python-audio-separator) ───────────────────────────
    # One model per branch. SEPARATOR_NAME is the on-disk subdir under
    # OUTPUT_DIR (replaces the old hardcoded "htdemucs"); SEPARATOR_MODEL is the
    # audio-separator model filename. Model weights are cached outside the repo
    # and shared across branches so they download only once.
    SEPARATOR_NAME: str = "mdx_voc_ft"
    SEPARATOR_MODEL: str = "UVR-MDX-NET-Voc_FT.onnx"
    SEPARATOR_MODEL_DIR: str = str(Path.home() / ".cache" / "audio-separator-models")

    class Config:
        env_file = ".env"

settings = Settings()
