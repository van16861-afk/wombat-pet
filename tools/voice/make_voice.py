# Every line a master says, as audio -> wombat-pet/voice/<id>/<key>.mp3 + index.json
#   python make_voice.py turtle|dolphin [--redo "shown text" ...]
# key = FNV-1a (32-bit, over UTF-16 code units) of the exact text shown on screen, the same hash js/masters.js computes.
# Each take is heard back with Whisper and compared by pinyin (with and without tones); a take that doesn't match is
# redone (up to 8 tries, best kept). Lines already in index.json are skipped unless named with --redo.
#   turtle : the game author's own "old grandpa" recording, cloned (zero-shot)
#   dolphin: CosyVoice's built-in Mandarin female, told to sound like a lively big sister (instruct), a little quick
import sys, os, re, json, random, subprocess, difflib, argparse
sys.stdout.reconfigure(encoding="utf-8"); sys.stderr.reconfigure(encoding="utf-8")
import truststore; truststore.inject_into_ssl()
sys.path[:0] = [r"E:\CosyVoice\repo", r"E:\CosyVoice\repo\third_party\Matcha-TTS"]
import numpy as np, torch, soundfile as sf, whisper
from opencc import OpenCC
from pypinyin import lazy_pinyin, Style
from cosyvoice.cli.cosyvoice import AutoModel

ap = argparse.ArgumentParser(); ap.add_argument("id"); ap.add_argument("--redo", nargs="*", default=[]); ap.add_argument("--list", action="store_true"); ap.add_argument("--seed", type=int, default=0); a = ap.parse_args()
ID = a.id
GAME = r"C:\Users\User\Documents\wombat-pet"; OUT = os.path.join(GAME, "voice", ID); os.makedirs(OUT, exist_ok=True)
TMP = os.path.join(r"E:\CosyVoice\out", ID); os.makedirs(TMP, exist_ok=True)
_t2s = OpenCC("t2s").convert
def t2s(t): return _t2s(t.replace("牠", "它")).replace("姊", "姐")   # (the model reads 姊 as "zi")
def prep(t):   # what the model reads: no stage directions or corner quotes, simplified characters
    t = re.sub(r"（[^）]*）", "", t).replace("……", "，").replace("「", "").replace("」", "").replace("～", "！")
    t = t2s(t).replace("啰", "喽").replace("80", "八十").replace("著", "着")   # (OpenCC leaves 著, which the model reads zhù)
    for a, b in FIX: t = t.replace(a, b)
    return t.strip()
# polyphones the model gets wrong: spell them with a character that only has the right sound
FIX = [("紫竹调", "紫竹吊"), ("曲", "取"), ("颈长", "颈常"), ("耳朵长", "耳朵常"), ("一样长", "一样常"), ("背着房子", "杯着房子"),
       ("曾曾曾孙", "增增增孙"), ("待在", "呆在"), ("种庄稼", "众庄稼"), ("飞来将", "飞来酱"), ("弹给", "谈给"), ("都会跟", "兜会跟"),
       ("转一大圈", "赚一大圈")]
def fnv(s):
    h = 0x811c9dc5; b = s.encode("utf-16-le")
    for i in range(0, len(b), 2): h = ((h ^ (b[i] | b[i+1] << 8)) * 0x01000193) & 0xffffffff
    return format(h, "08x")

# ---- the lines, read out of js/masters.js (and js/tunes.js for the song names) ----
src = open(os.path.join(GAME, "js", "masters.js"), encoding="utf-8").read().replace("export const", "const")
def lit(name, text=src):
    body = re.search(r"const %s = (\{.*?\n\};|\[.*?\n\];)" % name, text, re.S).group(1)[:-1]
    body = "\n".join(l for l in body.split("\n") if not l.strip().startswith("//"))
    body = re.sub(r"'([^']*)'", lambda m: json.dumps(m.group(1), ensure_ascii=False), body)
    body = re.sub(r"([{,]\s*)(\w+):", r'\1"\2":', body); body = re.sub(r",(\s*[}\]])", r"\1", body)
    return json.loads(body)
T = lit("TALK")[ID]
NUM = "零一兩三四五六七八九十"
def fill(s, *v): it = iter(v); return re.sub("%", lambda m: str(next(it)), s)
lines = []   # (shown text, spoken text)
SKIP = {"wrong", "win", "lose", "beatWin", "beatLose", "thanks"}
for k, v in T.items():
    if k in SKIP: continue
    lines += [(x, x) for x in (v if isinstance(v, list) else [v])]
if ID == "turtle":
    R = lit("RIDDLES")
    lines += [(x, x) for x in ["答案是哪一個呢？"]]
    for q in R:
        lines += [(q["q"], q["q"])] + ([(q["w"], q["w"])] if q.get("w") else [])
        lines += [(fill(w, q["a"]), fill(w, q["a"] + ("字" if q["c"] == "打一字" else ""))) for w in T["wrong"]]
        lines += [(q["q"] + "（" + q["c"] + "）", q["q"] + q["c"] + "。")]
    for n in (4, 5): lines += [(fill(w, 5, n), fill(w, NUM[5], NUM[n])) for w in T["win"]]
    for n in range(4): lines += [(fill(w, 5, n), fill(w, NUM[5], NUM[n])) for w in T["lose"]]
if ID == "dolphin":
    names = re.findall(r"name:'([^']*)'", open(os.path.join(GAME, "js", "tunes.js"), encoding="utf-8").read())
    for nm in names:
        lines += [(fill(w, nm), fill(w, nm)) for w in T["wrong"]]
        lines += [(f"這首是「{nm}」～", f"這首是「{nm}」～")]
    lines += [("想聽哪一首？姊姊彈給你聽！", "想聽哪一首？姊姊彈給你聽！")]
    for n in range(4): lines += [(fill(w, 5, n), fill(w, NUM[5], NUM[n])) for w in T["lose"]]
    for w in T["beatWin"] + T["beatLose"]: tail = re.sub(r"^%分.", "", w); lines += [(tail, tail)]   # (the score itself is only on screen)
seen, todo = set(), []
for shown, spoken in lines:
    if shown not in seen: seen.add(shown); todo.append((shown, spoken))
if a.list:   # just print every line as the model will read it, then stop
    for s, p in todo: print(s, "	", prep(p))
    sys.exit()
idx_path = os.path.join(OUT, "index.json")
index = json.load(open(idx_path, encoding="utf-8")) if os.path.exists(idx_path) else {}
todo = [(s, p) for s, p in todo if s in a.redo or fnv(s) not in index or not os.path.exists(os.path.join(OUT, fnv(s) + ".mp3"))]
print("lines to make", len(todo), flush=True)

m = AutoModel(model_dir=r"E:\CosyVoice\models\CosyVoice2-0.5B"); sr = m.sample_rate
if ID == "turtle":
    REF = r"E:\CosyVoice\out\me\ref.wav"
    SCRIPT = prep("呵呵……孩子，你來啦。爺爺在這池塘邊住了好久好久囉。來，猜猜看這個燈謎，慢慢想，不著急。猜對了，爺爺有好東西要送你喔！")
    say = lambda text: m.inference_zero_shot(text, SCRIPT, REF)
else:
    REF = r"E:\CosyVoice\out\dolphin\ref.wav"
    INS = "用活泼开朗、充满元气的大姐姐语气，开心地说<|endofprompt|>"
    say = lambda text: m.inference_instruct2(text, INS, REF, speed=1.12)
asr = whisper.load_model(r"E:\CosyVoice\models\whisper\large-v3-turbo.pt", device="cuda")
PUNC = re.compile(r"[^\u4e00-\u9fff0-9A-Za-z]")
def py(t): return lazy_pinyin(PUNC.sub("", t2s(t)))
def pyt(t): return lazy_pinyin(PUNC.sub("", t2s(t)), style=Style.TONE3, neutral_tone_with_five=True)
def sim(x, y): return 0.5*difflib.SequenceMatcher(None, py(x), py(y)).ratio() + 0.5*difflib.SequenceMatcher(None, pyt(x), pyt(y)).ratio()
def trim(y):
    v = np.abs(y); on = np.where(v > 0.02*v.max())[0]
    if len(on): y = y[max(0, on[0]-int(0.08*sr)): on[-1]+int(0.15*sr)]
    return (y/max(1e-6, np.abs(y).max())*0.9).astype(np.float32)
weak = []
for i, (shown, spoken) in enumerate(todo):
    key = fnv(shown); text = prep(spoken); n = max(1, len(py(text))); best = None
    for tr in range(8):
        random.seed(tr + a.seed); np.random.seed(tr + a.seed); torch.manual_seed(tr + a.seed)
        y = trim(torch.cat([j["tts_speech"] for j in say(text)], dim=1).squeeze(0).numpy())
        wav = os.path.join(TMP, key + ".wav"); sf.write(wav, y, sr)
        heard = asr.transcribe(wav, language="zh", initial_prompt="以下是简体中文的句子。")["text"]
        score = sim(text, heard); pace = (len(y)/sr - 0.3)/n
        if not (0.1 < pace < 0.6): score -= 0.3   # (far too fast or slow: babbling or skipped words)
        if best is None or score > best[0]: best = (score, y, heard)
        if score >= 0.95: break
    score, y, heard = best; sf.write(os.path.join(TMP, key + ".wav"), y, sr)
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", os.path.join(TMP, key + ".wav"),
                    "-ac", "1", "-ar", "24000", "-b:a", "48k", os.path.join(OUT, key + ".mp3")], check=True)
    index[key] = shown; json.dump(index, open(idx_path, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    print(f"[{i+1}/{len(todo)}] {score:.2f} tries={tr+1} {shown} | heard: {heard}", flush=True)
    if score < 0.88: weak.append((score, shown, heard))
print("WEAK", len(weak)); [print(f"  {s:.2f} {x} | {h}") for s, x, h in weak]
print("DONE", flush=True)
