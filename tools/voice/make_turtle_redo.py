# Every line 烏龜爺爺 says, in the user's own cloned voice -> wombat-pet/voice/turtle/<key>.mp3 + index.json
# key = FNV-1a (32-bit, over UTF-16 code units) of the exact text shown on screen, the same hash js/masters.js computes.
# Each line is heard back with Whisper and compared by pinyin; a take that doesn't match is redone (up to 6 tries, best kept).
import sys, os, re, json, random, subprocess, difflib
sys.stdout.reconfigure(encoding="utf-8"); sys.stderr.reconfigure(encoding="utf-8")
import truststore; truststore.inject_into_ssl()
sys.path[:0] = [r"E:\CosyVoice\repo", r"E:\CosyVoice\repo\third_party\Matcha-TTS"]
import numpy as np, torch, soundfile as sf, whisper
from opencc import OpenCC
from pypinyin import lazy_pinyin, Style
from cosyvoice.cli.cosyvoice import AutoModel

GAME = r"C:\Users\User\Documents\wombat-pet"; OUT = os.path.join(GAME, "voice", "turtle"); os.makedirs(OUT, exist_ok=True)
REF = r"E:\CosyVoice\out\me\ref.wav"; TMP = r"E:\CosyVoice\out\turtle"; os.makedirs(TMP, exist_ok=True)
t2s = OpenCC("t2s").convert
def prep(t):   # what the model reads: no stage directions or corner quotes, simplified characters
    t = re.sub(r"（[^）]*）", "", t).replace("……", "，").replace("「", "").replace("」", "")
    return t2s(t.replace("牠", "它")).replace("啰", "喽").strip()
SCRIPT = prep("呵呵……孩子，你來啦。爺爺在這池塘邊住了好久好久囉。來，猜猜看這個燈謎，慢慢想，不著急。猜對了，爺爺有好東西要送你喔！")
def fnv(s):
    h = 0x811c9dc5; b = s.encode("utf-16-le")
    for i in range(0, len(b), 2): h = ((h ^ (b[i] | b[i+1] << 8)) * 0x01000193) & 0xffffffff
    return format(h, "08x")

# ---- the lines, read out of js/masters.js ----
src = open(os.path.join(GAME, "js", "masters.js"), encoding="utf-8").read()
def lit(name):
    body = re.search(r"const %s = (\{.*?\n\};|\[.*?\n\];)" % name, src.replace("export const", "const"), re.S).group(1)[:-1]
    body = "\n".join(l for l in body.split("\n") if not l.strip().startswith("//"))
    body = re.sub(r"'([^']*)'", lambda m: json.dumps(m.group(1), ensure_ascii=False), body)
    body = re.sub(r"([{,]\s*)(\w+):", r'\1"\2":', body); body = re.sub(r",(\s*[}\]])", r"\1", body)
    return json.loads(body)
T = lit("TALK")["turtle"]; R = lit("RIDDLES")
NUM = "零一兩三四五六七八九十"
def fill(s, *v): it = iter(v); return re.sub("%", lambda m: str(next(it)), s)
lines = []   # (shown text, spoken text)
for k, v in T.items():
    if k in ("wrong", "win", "lose"): continue
    lines += [(x, x) for x in v]
lines += [(x, x) for x in ["還有什麼想跟爺爺說的嗎？", "答案是哪一個呢？", "這些都是你的了。有空常來陪爺爺說說話。", "今天的禮物已經送過囉，不過答得好，爺爺還是很開心。"]]
for q in R:
    lines += [(q["q"], q["q"])] + ([(q["w"], q["w"])] if q.get("w") else [])
    lines += [(fill(w, q["a"]), fill(w, q["a"] + ("字" if q["c"] == "打一字" else ""))) for w in T["wrong"]]   # (a lone character is easy to mishear: "答案是告字")
    lines += [(q["q"] + "（" + q["c"] + "）", q["q"] + q["c"] + "。")]   # the riddle read out with its hint, as one line
lines += [(c, c) for c in sorted({q["c"] for q in R})]
for n in (4, 5): lines += [(fill(w, 5, n), fill(w, NUM[5], NUM[n])) for w in T["win"]]
for n in range(4): lines += [(fill(w, 5, n), fill(w, NUM[5], NUM[n])) for w in T["lose"]]
seen, todo = set(), []
for shown, spoken in lines:
    if shown not in seen: seen.add(shown); todo.append((shown, spoken))
REDO = {q["q"] + "（" + q["c"] + "）" for q in R} | {fill(w, q["a"]) for q in R if q["c"] == "打一字" for w in T["wrong"]}
print("redo", len(REDO), flush=True)

idx_path = os.path.join(OUT, "index.json")
index = json.load(open(idx_path, encoding="utf-8")) if os.path.exists(idx_path) else {}
m = AutoModel(model_dir=r"E:\CosyVoice\models\CosyVoice2-0.5B"); sr = m.sample_rate
asr = whisper.load_model(r"E:\CosyVoice\models\whisper\large-v3-turbo.pt", device="cuda")
PUNC = re.compile(r"[^\u4e00-\u9fff0-9A-Za-z]")
def py(t): return lazy_pinyin(PUNC.sub("", t2s(t)))
def pyt(t): return lazy_pinyin(PUNC.sub("", t2s(t)), style=Style.TONE3, neutral_tone_with_five=True)
def sim(a, b): return 0.5*difflib.SequenceMatcher(None, py(a), py(b)).ratio() + 0.5*difflib.SequenceMatcher(None, pyt(a), pyt(b)).ratio()
def trim(y):
    a = np.abs(y); on = np.where(a > 0.02*a.max())[0]
    if len(on): y = y[max(0, on[0]-int(0.08*sr)): on[-1]+int(0.15*sr)]
    return (y/max(1e-6, np.abs(y).max())*0.9).astype(np.float32)
report = []
for i, (shown, spoken) in enumerate(todo):
    key = fnv(shown)
    if shown not in REDO: continue
    text = prep(spoken); want = py(text); best = None
    for tr in range(10, 20):
        random.seed(tr); np.random.seed(tr); torch.manual_seed(tr)
        y = trim(torch.cat([j["tts_speech"] for j in m.inference_zero_shot(text, SCRIPT, REF)], dim=1).squeeze(0).numpy())
        wav = os.path.join(TMP, key + ".wav"); sf.write(wav, y, sr)
        heard = asr.transcribe(wav, language="zh", initial_prompt="以下是简体中文的句子。")["text"]
        score = sim(text, heard)
        secs = len(y)/sr; pace = (secs - 0.3)/max(1, len(want))
        if not (0.15 < pace < 0.6): score -= 0.3          # far too fast or slow: babbling or skipped words
        if best is None or score > best[0]: best = (score, y, heard)
        if score >= 0.95: break
    score, y, heard = best; sf.write(os.path.join(TMP, key + ".wav"), y, sr)
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", os.path.join(TMP, key + ".wav"),
                    "-ac", "1", "-ar", "24000", "-b:a", "48k", os.path.join(OUT, key + ".mp3")], check=True)
    index[key] = shown; json.dump(index, open(idx_path, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    print(f"[{i+1}/{len(todo)}] {score:.2f} tries={tr+1} {shown} | heard: {heard}", flush=True)
    if score < 0.9: report.append((score, shown, heard))
print("WEAK", len(report)); [print(f"  {s:.2f} {a} | {b}") for s, a, b in report]
print("DONE", flush=True)
