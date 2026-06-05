from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    UPLOAD_DIR: str = "../samples/uploads"
    OUTPUT_DIR: str = "../samples/outputs"
    DB_PATH: str = "song2notes.db"
    MAX_FILE_SIZE_MB: int = 50
    ALLOWED_EXTENSIONS: set[str] = {".mp3", ".wav", ".flac", ".ogg", ".m4a"}
    # Reject YouTube videos longer than this to avoid huge downloads/processing.
    MAX_YOUTUBE_DURATION_SEC: int = 900

    class Config:
        env_file = ".env"

settings = Settings()
