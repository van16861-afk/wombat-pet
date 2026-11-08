# Three candidate voices for 海豚姊姊 (a lively big sister), same line -> E:\CosyVoice\out\dolphin\sis_<k>.wav
#  1  the built-in Mandarin female, as is
#  2  CosyVoice2 voiced from the built-in female, told to sound lively and cheerful
#  3  as 2, a little quicker and brighter
import sys, os
sys.stdout.reconfigure(encoding="utf-8"); sys.stderr.reconfigure(encoding="utf-8")
import truststore; truststore.inject_into_ssl()
sys.path[:0] = [r"E:\CosyVoice\repo", r"E:\CosyVoice\repo\third_party\Matcha-TTS"]
import numpy as np, torch, soundfile as sf
from opencc import OpenCC
from cosyvoice.cli.cosyvoice import AutoModel
_t2s = OpenCC("t2s").convert
t2s = lambda s: _t2s(s).replace("姊", "姐")
OUT = r"E:\CosyVoice\out\dolphin"; os.makedirs(OUT, exist_ok=True)
LINE = t2s("嗨嗨，你就是新來的小袋熊吧？我是住在這片海裡的海豚姊姊！我最喜歡音樂了，來來來，一起玩吧！")
REF = t2s("哈囉！今天天氣真好，我們一起去海邊玩水、唱歌吧！")
def cat(gen): return torch.cat([j["tts_speech"] for j in gen], dim=1).squeeze(0).numpy()
def norm(y): return (y/max(1e-6, np.abs(y).max())*0.9).astype(np.float32)
sft = AutoModel(model_dir=r"E:\CosyVoice\models\CosyVoice-300M-SFT"); sr1 = sft.sample_rate
sf.write(os.path.join(OUT, "ref.wav"), norm(cat(sft.inference_sft(REF, "中文女", speed=1.0))), sr1)
sf.write(os.path.join(OUT, "sis_1.wav"), norm(cat(sft.inference_sft(LINE, "中文女", speed=1.0))), sr1)
del sft; torch.cuda.empty_cache()
cv2 = AutoModel(model_dir=r"E:\CosyVoice\models\CosyVoice2-0.5B"); sr = cv2.sample_rate
ins = "用活泼开朗、充满元气的大姐姐语气，开心地说<|endofprompt|>"
torch.manual_seed(1); sf.write(os.path.join(OUT, "sis_2.wav"), norm(cat(cv2.inference_instruct2(LINE, ins, os.path.join(OUT, "ref.wav"), speed=1.0))), sr)
torch.manual_seed(2); sf.write(os.path.join(OUT, "sis_3.wav"), norm(cat(cv2.inference_instruct2(LINE, ins, os.path.join(OUT, "ref.wav"), speed=1.12))), sr)
print("DONE", flush=True)
