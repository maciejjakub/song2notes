# Frontend session summary

## What changed
- **Backend relocated** from `app/`, `tests/`, `requirements.txt` at the project root into `backend/`.
- **CORS** added to `backend/app/main.py` allowing `http://localhost:5173` so the React app can call the API.
- **New `frontend/`** — Vite + React + TypeScript app (scaffolded with `create-vite@5` because Node 21 isn't compatible with the latest `create-vite`).
- **README** updated with the new `backend/` and `frontend/` run instructions.

## Frontend structure
- `src/App.tsx` — state machine: `idle` → `processing` → `done` / `error`.
- `src/components/Dropzone.tsx` — drag-and-drop + click-to-browse, validates extension (`.mp3/.wav/.flac/.ogg`) and 50 MB size cap.
- `src/components/Results.tsx` — stats (note count, duration, tuning offset in cents), gradient MIDI download card, scrollable note list with index · pitch · time range · duration · velocity bar.
- `src/api.ts` — `POST /analyze` and MIDI URL resolution against `http://127.0.0.1:8000`.
- `src/types.ts` — shared types for the `/analyze` response shape.
- `src/index.css` + `src/App.css` — dark theme, radial gradients, glassmorphism panels, animated processing steps.

## Integration verified
End-to-end against `samples/sample-hey-jude.mp3`:
- `POST /analyze` → 200, 38 notes detected, tuning offset -0.08 semitones, ~82s processing.
- `GET /download/{job_id}/midi` → 200, valid MIDI bytes.
- CORS preflight + actual responses return correct `Access-Control-Allow-Origin`.
- TypeScript `tsc -b` passes with no errors.
- Vite serves all modules at http://localhost:5173.

## How to run
```bash
# backend (from project root)
cd backend && uvicorn app.main:app --reload   # http://127.0.0.1:8000

# frontend (separate terminal)
cd frontend && npm run dev                    # http://localhost:5173
```
