import pytest
from app.pipeline import get_pitch_name

def test_get_pitch_name():
    assert get_pitch_name(60) == "C4"
    assert get_pitch_name(61) == "C#4"
    assert get_pitch_name(62) == "D4"
    assert get_pitch_name(63) == "D#4"
    assert get_pitch_name(64) == "E4"
    assert get_pitch_name(65) == "F4"
    assert get_pitch_name(66) == "F#4"
    assert get_pitch_name(67) == "G4"
    assert get_pitch_name(68) == "G#4"
    assert get_pitch_name(69) == "A4"
    assert get_pitch_name(70) == "A#4"
    assert get_pitch_name(71) == "B4"
    assert get_pitch_name(21) == "A0"
    assert get_pitch_name(108) == "C8"
