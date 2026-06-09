"""Grid-search the segmentation constants against the Hooktheory ground truth.

crepe + separation are the slow, parameter-independent stages, so we run crepe
once per cached vocal stem (3 models x 3 samples = 9), cache it, then re-run only
_smooth_freqs/_segment_notes/_merge_notes per parameter combo by monkeypatching
the module globals. Scoring reuses the fitting-alignment metrics from _eval.

Untracked; run from backend/:  python _tune.py
"""
import json
import itertools
from pathlib import Path

import numpy as np
import librosa
import crepe

import app.pipeline as P

SAMPLES = ["sample-hey-jude", "sample-heal-the-world", "sample-sign-of-the-times"]
MODELS = {
    "htdemucs": "../samples/outputs/htdemucs/{s}/vocals.wav",
    "mdx_voc_ft": "../samples/outputs_mdx/mdx_voc_ft/{s}/vocals.wav",
    "roformer": "../samples/outputs_roformer/roformer/{s}/vocals.wav",
}
MAJ = {1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11}
TONIC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11,
         "C#": 1, "D#": 3, "F#": 6, "G#": 8, "A#": 10}

DEFAULTS = {"CONFIDENCE_THRESHOLD": 0.65, "PITCH_TOLERANCE": 0.6, "HOLD_FRAMES": 6,
            "MIN_NOTE_DURATION": 0.12, "MERGE_GAP": 0.10, "PITCH_SMOOTH_FRAMES": 21}

GRID = {
    "MIN_NOTE_DURATION": [0.10, 0.14, 0.18, 0.22],
    "HOLD_FRAMES": [6, 8, 10, 12],
    "MERGE_GAP": [0.10, 0.16, 0.22],
    "CONFIDENCE_THRESHOLD": [0.55, 0.65, 0.75],
    "PITCH_SMOOTH_FRAMES": [15, 21, 27],
}


def load_ref(stem):
    d = json.load(open(f"../samples/hooktheory-{stem.replace('sample-', '')}.txt"))
    tpc = TONIC[d["keys"][0]["tonic"]]
    return [((tpc + MAJ[int(n["sd"])]) % 12, float(n["duration"]))
            for n in d["notes"] if not n["isRest"]]


def fitting_match(ref, pred):
    n, m = len(ref), len(pred)
    dp = [[0] * (m + 1) for _ in range(n + 1)]
    bt = [[None] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        dp[i][0] = i; bt[i][0] = "del"
    for j in range(1, m + 1):
        bt[0][j] = "ins"
    for i in range(1, n + 1):
        ri = ref[i - 1]
        for j in range(1, m + 1):
            sub = dp[i - 1][j - 1] + (ri != pred[j - 1])
            dele = dp[i - 1][j] + 1
            ins = dp[i][j - 1] + 1
            dp[i][j] = min(sub, dele, ins)
            bt[i][j] = "sub" if dp[i][j] == sub else "del" if dp[i][j] == dele else "ins"
    jend = min(range(m + 1), key=lambda j: dp[n][j])
    matched, i, j = set(), n, jend
    while i > 0:
        mv = bt[i][j]
        if mv == "sub":
            if ref[i - 1] == pred[j - 1]:
                matched.add(i - 1)
            i, j = i - 1, j - 1
        elif mv == "del":
            i -= 1
        else:
            j -= 1
    return matched


def score(ref, pred):
    ref_pc = [p for p, _ in ref]
    best = max((fitting_match(ref_pc, [(p + s) % 12 for p in pred]) for s in range(12)),
              key=len)
    m = len(best)
    note = m / len(ref)                                   # recall
    dur = sum(d for k, (_, d) in enumerate(ref) if k in best) / sum(d for _, d in ref)
    f1 = 2 * m / (len(ref) + len(pred)) if pred else 0.0  # balanced: penalises extras
    return note, dur, f1


# ── cache crepe per stem ────────────────────────────────────────────────────
CACHE = Path("/tmp/crepe_cache.npz")
cache = {k: v for k, v in np.load(CACHE, allow_pickle=True).items()} if CACHE.exists() else {}
data, refs = {}, {s: load_ref(s) for s in SAMPLES}
for model, tmpl in MODELS.items():
    for s in SAMPLES:
        key = f"{model}|{s}"
        if f"{key}|f" not in cache:
            print(f"crepe: {key}")
            audio, sr = librosa.load(tmpl.format(s=s), sr=None, mono=True)
            t, f, c, _ = crepe.predict(audio, sr, model_capacity="full",
                                       viterbi=True, step_size=10, verbose=0)
            cache[f"{key}|t"], cache[f"{key}|f"], cache[f"{key}|c"] = t, f, c
        data[key] = (cache[f"{key}|t"], cache[f"{key}|f"], cache[f"{key}|c"])
np.savez(CACHE, **cache)


def evaluate(params):
    for k, v in {**DEFAULTS, **params}.items():
        setattr(P, k, v)
    per, f1s, notes = {}, [], []
    for model in MODELS:
        for s in SAMPLES:
            t, f, c = data[f"{model}|{s}"]
            tuning = P._estimate_tuning(f, c)
            seg = P._merge_notes(P._segment_notes(t, P._smooth_freqs(f, c), c, tuning))
            pred = [n["pitch_midi"] % 12 for n in seg]
            na, da, f1 = score(refs[s], pred)
            per[(model, s)] = (na, da, f1, len(pred))
            f1s.append(f1); notes.append(na)
    return float(np.mean(f1s)), float(np.mean(notes)), per


base_f1, base_note, base_per = evaluate({})
print(f"\nBASELINE  F1={base_f1*100:.1f}%  (recall note={base_note*100:.1f}%)")

keys = list(GRID)
results = []
for combo in itertools.product(*GRID.values()):
    params = dict(zip(keys, combo))
    f1, note, per = evaluate(params)
    results.append((f1, note, params, per))
results.sort(key=lambda r: r[0], reverse=True)

print(f"searched {len(results)} combos\n--- top 5 (by F1) ---")
for f1, note, p, _ in results[:5]:
    print(f"F1={f1*100:.1f}% note={note*100:.1f}%  {p}")

best_f1, best_note, best_p, best_per = results[0]
ref_n = {s: len(refs[s]) for s in SAMPLES}
print(f"\nBEST PARAMS: {best_p}")
print(f"\n{'cell (ref_n)':<32}{'F1 base→tuned':<20}{'pred_n base→tuned'}")
for model in MODELS:
    for s in SAMPLES:
        _, _, bf, bp = base_per[(model, s)]
        _, _, tf, tp = best_per[(model, s)]
        cell = f"{model}/{s.replace('sample-','')} ({ref_n[s]})"
        print(f"{cell:<32}{bf*100:>5.1f} → {tf*100:<5.1f}      {bp:>3} → {tp}")
print(f"\n{'AVERAGE F1':<32}{base_f1*100:>5.1f} → {best_f1*100:<5.1f}")
