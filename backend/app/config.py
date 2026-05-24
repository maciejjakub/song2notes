from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    UPLOAD_DIR: str = "/tmp/song2notes/uploads"
    OUTPUT_DIR: str = "/tmp/song2notes/outputs"
    DB_PATH: str = "song2notes.db"
    MAX_FILE_SIZE_MB: int = 50

    class Config:
        env_file = ".env"

settings = Settings()
