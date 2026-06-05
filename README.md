# song2notes

song2notes is a FastAPI-based service designed to transcribe audio files into MIDI notes by isolating vocals using Demucs and transcribing them with Basic Pitch.

## Architecture

The application follows a simple, synchronous pipeline:

1.  **Upload:** Audio files are uploaded via the `/analyze` endpoint (or pre-uploaded via `/upload`).
2.  **Vocal Separation:** The service uses [Demucs](https://github.com/adefossez/demucs) to isolate vocals (`vocals.wav`) from the mixed audio.
3.  **Note Transcription:** The isolated vocals are transcribed to MIDI using [Basic Pitch](https://github.com/spotify/basic-pitch).
4.  **Data Persistence:** Temporary uploaded audio files and extracted MIDI/vocal files are stored on the local disk (configurable via environment variables or `app/config.py`).

## Getting Started

### Prerequisites

- Python 3.10
- [FFmpeg](https://ffmpeg.org/) installed on the system (required by Demucs/Basic Pitch).

### Installation

1. Clone the repository and create a virtual environment:

   ```bash
   python3.10 -m venv .venv
   source .venv/bin/activate
   ```

2. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

### Running the API

The backend lives in `backend/`. Start the server using Uvicorn with auto-reload enabled:

```bash
cd backend
uvicorn app.main:app --reload
```

The API will be available at `http://127.0.0.1:8000`.

### Running the frontend

The React app lives in `frontend/`. From the project root:

```bash
cd frontend
npm install
npm run dev
```

The UI will be available at `http://localhost:5173` and expects the backend to be running on `http://127.0.0.1:8000`.

## Usage

### Analyze Audio (Full Pipeline)

Send an audio file to the `/analyze` endpoint to run the entire pipeline:

```bash
curl -X POST "http://127.0.0.1:8000/analyze" \
     -H "Content-Type: multipart/form-data" \
     -F "audio=@../samples/test.mp3"
```

The response contains the `job_id`, `note_count`, a list of `notes`, a `note_name` array of pitch name strings, and a `midi_download_url`.

### Download MIDI

Use the `midi_download_url` from the analyze response, or construct it from the `job_id`:

```bash
curl "http://127.0.0.1:8000/download/<job_id>/midi" --output output.mid
```

### Check Job Status

```bash
curl "http://127.0.0.1:8000/jobs/<job_id>"
```

### Import audio from YouTube (feature flag)

A feature-flagged panel under the dropzone lets you paste a YouTube URL, fetch
its audio (via the `pytubefix` library), slice it on a waveform, and send the
chosen segment through the standard analysis pipeline.

```bash
echo "VITE_ENABLE_YT_IMPORT=true" >> frontend/.env.local
```

Backend endpoints: `POST /youtube/download`, `GET /youtube/audio/{source_id}`,
`POST /youtube/analyze`. Videos longer than `MAX_YOUTUBE_DURATION_SEC` (default
900s) are rejected.

### Debug mode

Debug mode exposes separated vocals as conditionally rendered div exposing backend endpoint
```bash
echo "VITE_DEBUG_VOCALS=true" > frontend/.env.local
```