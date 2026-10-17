# Extracts a few notes per instrument from the FluidR3 General MIDI soundfont (MIT licence, via
# github.com/gleitz/midi-js-soundfonts) into small mp3 files under assets/music/<instrument>/<note>.mp3.
# The game pitch-shifts between these notes. Run:  python tools/make_samples.py
import base64, json, os, re, urllib.request

BASE = "https://cdn.jsdelivr.net/gh/gleitz/midi-js-soundfonts@gh-pages/FluidR3_GM/{}-mp3.js"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "music")
# notes every minor third (C, Eb, Gb, A) over the useful range of each instrument
def notes(lo, hi):
    names = ["C", "Eb", "Gb", "A"]
    return [f"{n}{o}" for o in range(lo, hi + 1) for n in names]
INSTR = {
    "acoustic_grand_piano": notes(2, 6), "ocarina": notes(4, 6), "flute": notes(4, 6), "orchestral_harp": notes(3, 6),
    "marimba": notes(3, 6), "acoustic_guitar_nylon": notes(2, 5), "string_ensemble_1": notes(3, 5), "acoustic_bass": notes(1, 3),
    "music_box": notes(4, 7), "pizzicato_strings": notes(3, 5), "seashore": ["C4"], "bird_tweet": ["C5", "A5"],
}
for inst, want in INSTR.items():
    txt = urllib.request.urlopen(BASE.format(inst)).read().decode("utf-8")
    body = txt[txt.index("{", txt.index("MIDI.Soundfont.")):txt.rindex("}") + 1]
    body = re.sub(r",\s*}", "}", body)
    data = json.loads(body)
    d = os.path.join(OUT, inst); os.makedirs(d, exist_ok=True); total = 0
    for n in want:
        if n not in data: continue
        raw = base64.b64decode(data[n].split(",", 1)[1])
        with open(os.path.join(d, n + ".mp3"), "wb") as f: f.write(raw)
        total += len(raw)
    print(inst, len(want), "notes", total//1024, "KB")
