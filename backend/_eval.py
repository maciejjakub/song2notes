"""Compare pipeline MIDI output against Hooktheory ground-truth melodies.

Two metrics, both off one tempo-free *fitting* alignment (reference fully
consumed; leading/trailing prediction notes skipped for free) + a 12-way
transposition search:
  - note_acc : fraction of reference notes matched
  - dur_acc  : same, but reference notes weighted by notated duration

Fitting alignment absorbs all three sample caveats automatically:
hey-jude's extra leading pickup and sign-of-the-times' missing second half
become free skips. Untracked; run from backend/:  python _eval.py
"""
import json
from pathlib import Path

import pretty_midi

from app.config import settings
from app.pipeline import separate_vocals, extract_notes

MAJ = {1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11}
TONIC = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5,
         "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}

SAMPLES = ["sample-hey-jude", "sample-heal-the-world", "sample-sign-of-the-times"]


def load_ref(stem: str):
    name = stem.replace("sample-", "")
    d = json.load(open(f"../samples/hooktheory-{name}.txt"))
    tpc = TONIC[d["keys"][0]["tonic"]]
    return [((tpc + MAJ[int(n["sd"])]) % 12, float(n["duration"]))
            for n in d["notes"] if not n["isRest"]]


def pred_pcs(stem: str):
    vocals = separate_vocals(Path(f"../samples/{stem}.m4a"))
    extract_notes(vocals, stem)
    midi = pretty_midi.PrettyMIDI(str(Path(settings.OUTPUT_DIR) / stem / "output.mid"))
    notes = sorted(midi.instruments[0].notes, key=lambda n: n.start)
    return [n.pitch % 12 for n in notes]


def fitting_match(ref, pred):
    """Indices of ref notes matched under fitting alignment (free pred ends)."""
    n, m = len(ref), len(pred)
    dp = [[0] * (m + 1) for _ in range(n + 1)]
    bt = [[None] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        dp[i][0] = i                       # leftover ref notes are deletions
        bt[i][0] = "del"
    for j in range(1, m + 1):
        bt[0][j] = "ins"                   # free leading pred skips (cost 0)
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            sub = dp[i - 1][j - 1] + (ref[i - 1] != pred[j - 1])
            dele = dp[i - 1][j] + 1
            ins = dp[i][j - 1] + 1
            dp[i][j] = min(sub, dele, ins)
            bt[i][j] = ("sub" if dp[i][j] == sub else "del" if dp[i][j] == dele else "ins")
    jend = min(range(m + 1), key=lambda j: dp[n][j])
    matched, i, j = set(), n, jend
    while i > 0:
        move = bt[i][j]
        if move == "sub":
            if ref[i - 1] == pred[j - 1]:
                matched.add(i - 1)
            i, j = i - 1, j - 1
        elif move == "del":
            i -= 1
        else:
            j -= 1
    return matched


def best_over_transpositions(ref_pc, pred):
    best = None
    for shift in range(12):
        tp = [(p + shift) % 12 for p in pred]
        matched = fitting_match(ref_pc, tp)
        if best is None or len(matched) > len(best[1]):
            best = (shift, matched)
    return best


# self-test: hey-jude-style leading pickup must not be penalised
_m = fitting_match([9, 0, 2], [0, 9, 0, 2])
assert _m == {0, 1, 2}, _m
print("self-test OK")

model = getattr(settings, "SEPARATOR_NAME", "htdemucs")
for stem in SAMPLES:
    ref = load_ref(stem)
    ref_pc = [pc for pc, _ in ref]
    pred = pred_pcs(stem)
    shift, matched = best_over_transpositions(ref_pc, pred)
    note_acc = len(matched) / len(ref)
    dur_tot = sum(d for _, d in ref)
    dur_hit = sum(d for k, (_, d) in enumerate(ref) if k in matched)
    print("RESULT " + json.dumps({
        "model": model, "sample": stem.replace("sample-", ""),
        "ref_n": len(ref), "pred_n": len(pred), "transpose": shift,
        "note_acc_pct": round(note_acc * 100, 1),
        "dur_acc_pct": round(dur_hit / dur_tot * 100, 1),
    }))
