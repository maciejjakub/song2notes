from typing import Optional
from pydantic import BaseModel


class YouTubeDownloadRequest(BaseModel):
    url: str


class YouTubeAnalyzeRequest(BaseModel):
    source_id: str
    start_sec: float
    end_sec: float
    # Carried over from the download response so the saved job keeps the video title.
    title: Optional[str] = None
