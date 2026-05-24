import json
import os
import uuid
import shutil
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, HTTPException, status, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlmodel import Session, select
from .config import settings
from .models import JobResponse
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

ALLOWED_EXTENSIONS = {'.mp3', '.wav', '.flac', '.ogg'}

@app.get("/health")
async def health_check():
    return {"status": "ok"}

@app.get("/live")
async def liveness():
    return {"status": "alive"}

@app.get("/ready")
async def readiness():
    return {"status": "ready"}

@app.post("/upload", response_model=JobResponse)
async def upload_audio(audio: UploadFile = File(...)):
    # Validate extension
    ext = Path(audio.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail=f"Invalid file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    # Validate size
    audio.file.seek(0, os.SEEK_END)
    file_size = audio.file.tell()
    audio.file.seek(0)
    
    if file_size > settings.MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Max size: {settings.MAX_FILE_SIZE_MB}MB"
        )

    # Save file
    job_id = str(uuid.uuid4())
    file_path = Path(settings.UPLOAD_DIR) / f"{job_id}{ext}"
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(audio.file, buffer)
        
    return JobResponse(
        job_id=job_id,
        status="uploaded"
    )

@app.post("/separate/{job_id}")
async def separate(job_id: str):
    # Find the uploaded file. It might have any of the allowed extensions.
    upload_path = Path(settings.UPLOAD_DIR)
    input_file = None
    for ext in ALLOWED_EXTENSIONS:
        potential_file = upload_path / f"{job_id}{ext}"
        if potential_file.exists():
            input_file = potential_file
            break
            
    if not input_file:
        raise HTTPException(status_code=404, detail="Job not found")
        
    try:
        vocals_path = separate_vocals(input_file)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
        
    return {
        "job_id": job_id,
        "vocals_path": str(vocals_path),
        "status": "separated"
    }

@app.post("/analyze", response_model=dict)
async def analyze_audio(
    audio: UploadFile = File(...),
    session: Session = Depends(get_session),
):
    # 1. Reuse upload logic
    ext = Path(audio.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
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

    try:
        # 2. Separate
        vocals_path = separate_vocals(upload_path)
        # 3. Extract
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
        if upload_path.exists():
            os.remove(upload_path)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/download/{job_id}/midi")
async def download_midi(job_id: str):
    midi_path = Path(settings.OUTPUT_DIR) / job_id / "output.mid"
    if not midi_path.exists():
        raise HTTPException(status_code=404, detail="MIDI file not found")
    return FileResponse(midi_path, media_type="audio/midi", filename=f"{job_id}.mid")

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
    for ext in ALLOWED_EXTENSIONS:
        upload_file = Path(settings.UPLOAD_DIR) / f"{job_id}{ext}"
        if upload_file.exists():
            upload_file.unlink()

    session.delete(job)
    session.commit()
    return {"job_id": job_id, "status": "deleted"}
