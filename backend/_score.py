"""Throwaway accuracy harness: run the pipeline on samples and score predicted
note sequences against the expected pitch-class lists in samples/*.txt.

Untracked on purpose so it survives `git checkout` across the model branches.
Run from backend/:  python _score.py
"""
import json
import re
from pathlib import Path

from app.config import settings
from app.pipeline import separate_vocals, extract_notes

SAMPLES = ["sample-hey-jude", "sample-heal-the-world"]

# Note name (any accidental spelling) -> pitch class 0..11
PC = {
    "C": 0, "B#": 0, "C#": 1, "DB": 1, "D": 2, "D#": 3, "EB": 3,
    "E": 4, "FB": 4, "E#": 5, "F": 5, "F#": 6, "GB": 6, "G": 7,
    "G#": 8, "AB": 8, "A": 9, "A#": 10, "BB": 10, "B": 11, "CB": 11,
}


def to_pc(token: str) -> int:
    t = token.strip().upper()
    m = re.match(r"^([A-G](?:#|B)?)", t)  # strip any trailing octave digit
    return PC[m.group(1)]


def load_expected(name: str) -> list[int]:
    txt = Path(f"../samples/{name.replace('sample-', '')}.txt").read_text()
    toks = [x for x in txt.replace("\n", ",").split(",") if x.strip()]
    return [to_pc(x) for x in toks]


def levenshtein(a: list[int], b: list[int]) -> int:
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


model = getattr(settings, "SEPARATOR_NAME", "htdemucs")
for s in SAMPLES:
    vocals = separate_vocals(Path(f"../samples/{s}.mp3"))
    pred = [to_pc(n) for n in extract_notes(vocals, s)["note_name"]]
    exp = load_expected(s)
    dist = levenshtein(exp, pred)
    acc = max(0.0, 1 - dist / max(len(exp), len(pred)))
    print("RESULT " + json.dumps({
        "model": model, "sample": s,
        "expected_n": len(exp), "pred_n": len(pred),
        "edit_distance": dist, "accuracy_pct": round(acc * 100, 1),
    }))
