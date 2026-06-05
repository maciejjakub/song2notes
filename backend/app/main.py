import json
import os
import re
import uuid
import shutil
from pathlib import Path
from contextlib import asynccontextmanager
import librosa
import soundfile as sf
from pytubefix import YouTube
from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlmodel import Session, select
from .config import settings
from .models import YouTubeDownloadRequest, YouTubeAnalyzeRequest
from .pipeline import separate_vocals, extract_notes
from .db import init_db, get_session
from .db_models import Job, JobSummary

@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    os.makedirs(settings.OUTPUT_DIR, exist_ok=True)
    init_db()
    yield

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    return {"status": "ok"}

@app.get("/config")
async def get_config():
    """Upload constraints, so the frontend doesn't hardcode its own copy."""
    return {
        "allowed_extensions": sorted(settings.ALLOWED_EXTENSIONS),
        "max_file_size_mb": settings.MAX_FILE_SIZE_MB,
    }

@app.get("/live")
async def liveness():
    return {"status": "alive"}

@app.get("/ready")
async def readiness():
    return {"status": "ready"}

def _run_pipeline(input_path: Path, original_filename: str, session: Session) -> dict:
    """Separate vocals, extract notes, persist the job. Shared by every entry
    point that ends up with an audio file on disk (direct upload, YouTube slice).

    `input_path.stem` is used as the job id because separate_vocals/extract_notes
    derive their output directories from it — callers must name the file accordingly.
    """
    job_id = input_path.stem
    try:
        vocals_path = separate_vocals(input_path)
        analysis_result = extract_notes(vocals_path, job_id)

        notes = analysis_result["notes"]
        duration_sec = float(notes[-1]["end_time_sec"]) if notes else 0.0
        midi_path = str(Path(settings.OUTPUT_DIR) / job_id / "output.mid")

        job = Job(
            id=job_id,
            original_filename=original_filename,
            note_count=analysis_result["note_count"],
            tuning_offset_semitones=analysis_result.get("tuning_offset_semitones"),
            duration_sec=duration_sec,
            midi_path=midi_path,
            notes_json=json.dumps(notes),
        )
        session.add(job)
        session.commit()

        return {
            "job_id": job_id,
            "status": "complete",
            "note_count": analysis_result["note_count"],
            "notes": notes,
            "note_name": analysis_result["note_name"],
            "tuning_offset_semitones": analysis_result.get("tuning_offset_semitones"),
            "midi_download_url": f"/download/{job_id}/midi"
        }
    except Exception as e:
        # Cleanup on failure
        shutil.rmtree(Path(settings.OUTPUT_DIR) / job_id, ignore_errors=True)
        shutil.rmtree(Path(settings.OUTPUT_DIR) / "htdemucs" / job_id, ignore_errors=True)
        if input_path.exists():
            os.remove(input_path)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/analyze", response_model=dict)
async def analyze_audio(
    audio: UploadFile = File(...),
    session: Session = Depends(get_session),
):
    ext = Path(audio.filename).suffix.lower()
    if ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Invalid file type")

    audio.file.seek(0, os.SEEK_END)
    file_size = audio.file.tell()
    audio.file.seek(0)
    if file_size > settings.MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large")

    original_filename = audio.filename or f"upload{ext}"
    job_id = str(uuid.uuid4())
    upload_path = Path(settings.UPLOAD_DIR) / f"{job_id}{ext}"
    with open(upload_path, "wb") as buffer:
        shutil.copyfileobj(audio.file, buffer)

    return _run_pipeline(upload_path, original_filename, session)

@app.get("/download/{job_id}/midi")
async def download_midi(job_id: str):
    midi_path = Path(settings.OUTPUT_DIR) / job_id / "output.mid"
    if not midi_path.exists():
        raise HTTPException(status_code=404, detail="MIDI file not found")
    return FileResponse(midi_path, media_type="audio/midi", filename=f"{job_id}.mid")

@app.get("/download/{job_id}/vocals")
async def download_vocals(job_id: str):
    """Serve the demucs-separated vocal stem produced during /analyze.

    Debug aid: lets the frontend (in debug mode) play back the isolated vocals
    so we can hear whether separation, not pitch detection, is the culprit when
    a transcription looks wrong. The file persists on disk after analysis.
    """
    vocals_path = Path(settings.OUTPUT_DIR) / "htdemucs" / job_id / "vocals.wav"
    if not vocals_path.exists():
        raise HTTPException(status_code=404, detail="Vocals not found")
    return FileResponse(vocals_path, media_type="audio/wav", filename=f"{job_id}-vocals.wav")

# ── YouTube import (feature-flagged on the frontend) ─────────────────────────
# Pull audio out of a YouTube video, let the user slice it client-side, then
# feed the chosen segment through the standard analysis pipeline.

_YOUTUBE_URL_RE = re.compile(
    r"^(https?://)?(www\.|m\.)?(youtube\.com/watch\?v=[\w-]{11}|youtu\.be/[\w-]{11})"
)


def _youtube_source_path(source_id: str) -> Path:
    return Path(settings.UPLOAD_DIR) / f"{source_id}.m4a"


@app.post("/youtube/download")
async def youtube_download(payload: YouTubeDownloadRequest):
    url = payload.url.strip()
    if not _YOUTUBE_URL_RE.match(url):
        raise HTTPException(status_code=400, detail="Not a valid YouTube video URL")

    try:
        yt = YouTube(url)
        duration = yt.length or 0
        if duration > settings.MAX_YOUTUBE_DURATION_SEC:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Video is too long ({duration}s). "
                    f"Max {settings.MAX_YOUTUBE_DURATION_SEC}s."
                ),
            )
        stream = yt.streams.get_audio_only()  # highest-bitrate audio (m4a on YouTube)
        if stream is None:
            raise HTTPException(status_code=502, detail="No audio stream available")

        source_id = str(uuid.uuid4())
        stream.download(
            output_path=settings.UPLOAD_DIR,
            filename=f"{source_id}.m4a",
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"YouTube download failed: {e}")

    return {
        "source_id": source_id,
        "title": yt.title,
        "duration_sec": float(duration),
        "audio_url": f"/youtube/audio/{source_id}",
    }


@app.get("/youtube/audio/{source_id}")
async def youtube_audio(source_id: str):
    """Stream the downloaded m4a so the frontend can render its waveform."""
    source_path = _youtube_source_path(source_id)
    if not source_path.exists():
        raise HTTPException(status_code=404, detail="Source audio not found")
    return FileResponse(source_path, media_type="audio/mp4")


@app.post("/youtube/analyze", response_model=dict)
async def youtube_analyze(
    payload: YouTubeAnalyzeRequest,
    session: Session = Depends(get_session),
):
    source_path = _youtube_source_path(payload.source_id)
    if not source_path.exists():
        raise HTTPException(status_code=404, detail="Source audio not found")

    start, end = payload.start_sec, payload.end_sec
    if start < 0 or end <= start:
        raise HTTPException(status_code=400, detail="Invalid slice range")

    # Decode just the chosen segment and write it as a wav the pipeline can consume.
    # The trimmed file is named <job_id>.wav so _run_pipeline derives a matching job id.
    job_id = str(uuid.uuid4())
    trimmed_path = Path(settings.UPLOAD_DIR) / f"{job_id}.wav"
    try:
        audio, sr = librosa.load(
            str(source_path), sr=None, mono=False, offset=start, duration=end - start
        )
        # soundfile expects (frames, channels); librosa gives (channels, frames) when stereo.
        data = audio.T if audio.ndim > 1 else audio
        sf.write(str(trimmed_path), data, sr)
    except Exception as e:
        trimmed_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Failed to trim audio: {e}")

    original_filename = f"{payload.title or 'youtube'}.wav"
    return _run_pipeline(trimmed_path, original_filename, session)


@app.get("/jobs", response_model=list[JobSummary])
async def list_jobs(session: Session = Depends(get_session)):
    jobs = session.exec(select(Job).order_by(Job.created_at.desc())).all()
    return [JobSummary.model_validate(j, from_attributes=True) for j in jobs]

@app.get("/jobs/{job_id}")
async def get_job(job_id: str, session: Session = Depends(get_session)):
    job = session.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {
        "job_id": job.id,
        "original_filename": job.original_filename,
        "created_at": job.created_at.isoformat(),
        "status": job.status,
        "note_count": job.note_count,
        "notes": json.loads(job.notes_json),
        "tuning_offset_semitones": job.tuning_offset_semitones,
        "duration_sec": job.duration_sec,
        "midi_download_url": f"/download/{job.id}/midi",
    }

@app.delete("/jobs/{job_id}")
async def delete_job(job_id: str, session: Session = Depends(get_session)):
    job = session.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Best-effort filesystem cleanup
    shutil.rmtree(Path(settings.OUTPUT_DIR) / job_id, ignore_errors=True)
    # Demucs writes the separated stems under htdemucs/<job_id>/ — clean that too,
    # otherwise vocals.wav is orphaned on disk after the job is deleted.
    shutil.rmtree(Path(settings.OUTPUT_DIR) / "htdemucs" / job_id, ignore_errors=True)
    for ext in settings.ALLOWED_EXTENSIONS:
        upload_file = Path(settings.UPLOAD_DIR) / f"{job_id}{ext}"
        if upload_file.exists():
            upload_file.unlink()

    session.delete(job)
    session.commit()
    return {"job_id": job_id, "status": "deleted"}
