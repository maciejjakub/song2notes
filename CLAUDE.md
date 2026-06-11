# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

song2notes transcribes a song's vocals into MIDI notes. A FastAPI backend runs an
audio pipeline (vocal separation → pitch detection → note segmentation → MIDI) and
a React/Vite frontend drives it.

> The root `README.md` is stale on the pipeline internals: it describes **Demucs**
> Trust the code and this file over the README.

## Commands

Backend (Python 3.10, run from `backend/`):

```bash
source ../.venv/bin/activate          # venv lives at project root: .venv/
pip install -r requirements.txt       # also needs ffmpeg on the system
uvicorn app.main:app --reload         # serves http://127.0.0.1:8000
pytest                                 # run all tests (must be run from backend/)
pytest tests/test_pipeline.py::<name>  # single test
```

Frontend (run from `frontend/`):

```bash
npm install
npm run dev      # Vite dev server on http://localhost:5173
npm run build    # tsc -b && vite build
npm run lint     # eslint
```

Tests **must** run from `backend/` — they import `app.*` and load `../samples/test.mp3`
by relative path. They mock `separate_vocals` / `extract_notes` so no ML models run.

## Pipeline (the core of the app)

`backend/app/pipeline.py` is where transcription quality is won or lost. Two stages:

1. **`separate_vocals(input_path)`** — `audio-separator` isolates the vocal stem.
   Output lands at `OUTPUT_DIR/<SEPARATOR_NAME>/<job_id>/vocals.wav`.
2. **`extract_notes(vocals_path, job_id)`** — CREPE predicts per-frame pitch, then
   custom DSP turns frames into notes: tuning estimation → median pitch smoothing →
   **deviation-based segmentation with hysteresis** (`_segment_notes`) → same-pitch
   merge (`_merge_notes`) → `pretty_midi` write.

The module-level constants at the top of `pipeline.py` (`HOLD_FRAMES`, `MERGE_GAP`,
`MIN_NOTE_DURATION`, `PITCH_TOLERANCE`, `CONFIDENCE_THRESHOLD`, vocal range bounds)
are the real accuracy knobs. Per `model_evaluation_summary.md`, the **segmentation
stage — not the separation model — is the end-to-end bottleneck**; it over-segments
sustained notes. Tune these constants before reaching for a different model.

### job_id is load-bearing

`_run_pipeline` (in `main.py`) uses `input_path.stem` as the `job_id`, and
`separate_vocals` / `extract_notes` both derive their output directories from it.
**Any new entry point that lands an audio file on disk must name the file
`<job_id>.<ext>`** or the pipeline will write stems and MIDI to mismatched dirs.
See how `/youtube/analyze` names its trimmed wav for the pattern to follow.

## Backend layout

- `app/main.py` — all FastAPI routes. Entry points (`/analyze`, `/youtube/analyze`)
  funnel into `_run_pipeline`, which is the only place that persists a `Job`.
- `app/config.py` — `pydantic-settings`; overridable via env / `.env`. Holds the
  `SEPARATOR_*` model settings and the per-experiment `OUTPUT_DIR` / `DB_PATH`.
- `app/pipeline.py` — separation + transcription (above).
- `app/db.py` / `app/db_models.py` — SQLModel + SQLite. `Job` rows store the full
  notes list as `notes_json`; the DB is the analysis history shown in the UI.
- `app/models.py` — request models for the YouTube endpoints.

## Frontend notes

- React 19 + TypeScript + Vite. `App.tsx` is the single stateful container; everything
  else is presentational components under `src/components/`.
- **Same-origin API**: `API_BASE = ''` in `src/api.ts`, and `vite.config.ts` proxies
  the backend route prefixes to `127.0.0.1:8000`. The dev server binds `0.0.0.0`, so
  the app is reachable from a phone on the same Wi-Fi with no code change. When adding
  a backend route prefix, add it to `API_PREFIXES` in `vite.config.ts`.
- MIDI playback uses `html-midi-player` / `@magenta/music`; the custom interactive
  timeline lives in `src/components/midi-player/`. Waveform slicing (YouTube import)
  uses `wavesurfer.js`.
- Two build-time feature flags (set in `frontend/.env.local`):
  `VITE_ENABLE_YT_IMPORT=true` shows the YouTube-import panel;
  `VITE_DEBUG_VOCALS=true` exposes a player for the separated vocal stem (debugging
  whether separation, not pitch detection, is at fault on a bad transcription).