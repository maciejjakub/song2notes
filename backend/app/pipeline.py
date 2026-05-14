from pathlib import Path
import numpy as np
import crepe
import librosa
import pretty_midi
from scipy.ndimage import median_filter
from demucs.separate import main
from .config import settings

CONFIDENCE_THRESHOLD = 0.65   # frames below this are treated as silence
PITCH_TOLERANCE = 0.6         # semitones — frames within ±tol of the current note are absorbed
HOLD_FRAMES = 6               # consecutive deviating frames required before committing a new note (~60 ms)
MIN_NOTE_DURATION = 0.12      # seconds — shorter events are discarded as noise / slide artifacts
VOCAL_MIDI_MIN = 48           # C3 — below this is not a human singing voice
VOCAL_MIDI_MAX = 84           # C6 — above this is not a human singing voice
MERGE_GAP = 0.10              # max silence gap (s) between same-pitch notes to merge
PITCH_SMOOTH_FRAMES = 21      # median window on freqs (~210 ms at 10 ms step) — flattens vibrato


def get_pitch_name(midi_number: int) -> str:
    notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    octave = (midi_number // 12) - 1
    note = notes[midi_number % 12]
    return f"{note}{octave}"


def extract_notes(vocals_path: Path, job_id: str) -> dict:
    audio, sr = librosa.load(str(vocals_path), sr=None, mono=True)

    times, freqs, confidences, _ = crepe.predict(
        audio, sr, model_capacity="full", viterbi=True, step_size=10, verbose=0
    )

    tuning = _estimate_tuning(freqs, confidences)
    smoothed_freqs = _smooth_freqs(freqs, confidences)
    notes = _segment_notes(times, smoothed_freqs, confidences, tuning)
    notes = _merge_notes(notes)

    output_dir = Path(settings.OUTPUT_DIR) / job_id
    output_dir.mkdir(parents=True, exist_ok=True)
    midi_path = output_dir / "output.mid"
    _write_midi(notes, str(midi_path))

    return {
        "midi_path": str(midi_path),
        "notes": notes,
        "note_count": len(notes),
        "note_name": [n["pitch_name"] for n in notes],
        "tuning_offset_semitones": round(tuning, 4),
    }


def _estimate_tuning(freqs: np.ndarray, confidences: np.ndarray) -> float:
    # Use only the most confident frames so vocal noise doesn't bias the estimate.
    mask = (confidences >= 0.85) & (freqs > 0)
    if not mask.any():
        return 0.0
    return float(librosa.pitch_tuning(freqs[mask]))


def _smooth_freqs(freqs: np.ndarray, confidences: np.ndarray) -> np.ndarray:
    smoothed = median_filter(freqs, size=PITCH_SMOOTH_FRAMES)
    smoothed[confidences < CONFIDENCE_THRESHOLD] = 0.0
    return smoothed


def _segment_notes(times: np.ndarray, freqs: np.ndarray, confidences: np.ndarray, tuning: float) -> list:
    """Deviation-based segmentation with hysteresis.

    A frame within ±PITCH_TOLERANCE of current note's semitone is absorbed.
    A deviating frame starts a 'pending' transition; we only commit when HOLD_FRAMES
    consecutive frames stay deviating. Brief slides shorter than HOLD_FRAMES * 10ms
    are absorbed into the active note rather than spawning a phantom note.
    """
    notes = []
    in_note = False
    note_start_t = 0.0
    note_pitches = []
    note_confs = []
    current_semitone = 0

    pending_pitches = []
    pending_confs = []
    pending_start_t = 0.0
    pending_count = 0

    for t, f, c in zip(times, freqs, confidences):
        voiced = c >= CONFIDENCE_THRESHOLD and f > 0
        if not voiced:
            if in_note:
                _append_note(notes, note_start_t, t, note_pitches, note_confs)
            in_note = False
            note_pitches = []
            note_confs = []
            pending_pitches = []
            pending_confs = []
            pending_count = 0
            continue

        midi_f = 69.0 + 12.0 * np.log2(f / 440.0) - tuning

        if not in_note:
            in_note = True
            note_start_t = float(t)
            note_pitches = [midi_f]
            note_confs = [c]
            current_semitone = int(round(midi_f))
            pending_pitches = []
            pending_confs = []
            pending_count = 0
            continue

        if abs(midi_f - current_semitone) <= PITCH_TOLERANCE:
            note_pitches.append(midi_f)
            note_confs.append(c)
            if pending_count > 0:
                # Brief excursion that returned — fold it into the active note.
                note_pitches.extend(pending_pitches)
                note_confs.extend(pending_confs)
                pending_pitches = []
                pending_confs = []
                pending_count = 0
            continue

        # Deviating frame.
        if pending_count == 0:
            pending_start_t = float(t)
        pending_pitches.append(midi_f)
        pending_confs.append(c)
        pending_count += 1

        if pending_count >= HOLD_FRAMES:
            # Commit transition: close the active note up to where the excursion started.
            _append_note(notes, note_start_t, pending_start_t, note_pitches, note_confs)
            note_start_t = pending_start_t
            note_pitches = list(pending_pitches)
            note_confs = list(pending_confs)
            current_semitone = int(round(float(np.median(note_pitches))))
            pending_pitches = []
            pending_confs = []
            pending_count = 0

    if in_note and note_pitches:
        _append_note(notes, note_start_t, float(times[-1]), note_pitches, note_confs)

    return notes


def _append_note(notes, start, end, pitches, confidences):
    if (end - start) < MIN_NOTE_DURATION:
        return
    midi_pitch = int(round(float(np.median(pitches))))
    if not (VOCAL_MIDI_MIN <= midi_pitch <= VOCAL_MIDI_MAX):
        return
    notes.append({
        "start_time_sec": float(start),
        "end_time_sec": float(end),
        "pitch_midi": midi_pitch,
        "pitch_name": get_pitch_name(midi_pitch),
        "velocity": round(float(np.mean(confidences)), 4),
    })


def _merge_notes(notes: list) -> list:
    if not notes:
        return notes
    merged = [notes[0].copy()]
    for note in notes[1:]:
        prev = merged[-1]
        gap = note["start_time_sec"] - prev["end_time_sec"]
        if gap <= MERGE_GAP and note["pitch_midi"] == prev["pitch_midi"]:
            prev["end_time_sec"] = note["end_time_sec"]
            prev["velocity"] = round((prev["velocity"] + note["velocity"]) / 2, 4)
        else:
            merged.append(note.copy())
    return merged


def _write_midi(notes, path):
    pm = pretty_midi.PrettyMIDI()
    instrument = pretty_midi.Instrument(program=0)
    for note in notes:
        velocity = max(1, min(127, int(note["velocity"] * 100)))
        instrument.notes.append(pretty_midi.Note(
            velocity=velocity,
            pitch=note["pitch_midi"],
            start=note["start_time_sec"],
            end=note["end_time_sec"],
        ))
    pm.instruments.append(instrument)
    pm.write(path)


def separate_vocals(input_path: Path) -> Path:
    job_id = input_path.stem
    output_dir = Path(settings.OUTPUT_DIR)

    args = [
        "--out", str(output_dir),
        "--name", "htdemucs",
        "--two-stems", "vocals",
        str(input_path)
    ]

    try:
        main(args)
    except Exception as e:
        raise RuntimeError(f"Demucs separation failed: {str(e)}")

    vocals_path = output_dir / "htdemucs" / job_id / "vocals.wav"

    if not vocals_path.exists():
        raise RuntimeError(f"Separation failed. Vocals not found at {vocals_path}")

    return vocals_path
