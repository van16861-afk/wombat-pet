# Three candidate voices for 寄居蟹弟弟 (a lively, curious little boy), same line -> E:\CosyVoice\out\hermit\kid_<k>.wav
#  1  CosyVoice2 voiced from the built-in Mandarin male, told to sound like a playful little boy
#  2  CosyVoice2 voiced from the built-in Mandarin female, told to sound like a little boy (the way cartoons often cast boys)
#  3  as 2, quicker and more excited
# run with E:\CosyVoice\venv\Scripts\python.exe
import sys, os
sys.stdout.reconfigure(encoding="utf-8"); sys.stderr.reconfigure(encoding="utf-8")
import truststore; truststore.inject_into_ssl()
sys.path[:0] = [r"E:\CosyVoice\repo", r"E:\CosyVoice\repo\third_party\Matcha-TTS"]
import numpy as np, torch, soundfile as sf
from opencc import OpenCC
from cosyvoice.cli.cosyvoice import AutoModel
t2s = OpenCC("t2s").convert
OUT = r"E:\CosyVoice\out\hermit"; os.makedirs(OUT, exist_ok=True)
LINE = t2s("嘿！你好你好！我是寄居蟹弟弟，住在這片沙灘上！我最喜歡撿貝殼了，我們來比賽好不好？").replace("著", "着")
REF = t2s("哈囉！今天天氣真好，我們一起去海邊撿貝殼吧！")
def cat(gen): return torch.cat([j["tts_speech"] for j in gen], dim=1).squeeze(0).numpy()
def norm(y): return (y/max(1e-6, np.abs(y).max())*0.9).astype(np.float32)
sft = AutoModel(model_dir=r"E:\CosyVoice\models\CosyVoice-300M-SFT"); sr1 = sft.sample_rate
sf.write(os.path.join(OUT, "ref_m.wav"), norm(cat(sft.inference_sft(REF, "中文男", speed=1.0))), sr1)
del sft; torch.cuda.empty_cache()
cv2 = AutoModel(model_dir=r"E:\CosyVoice\models\CosyVoice2-0.5B"); sr = cv2.sample_rate
REF_F = r"E:\CosyVoice\out\dolphin\ref.wav"   # (the built-in female, made for 海豚姊姊)
ins = "用小男孩活泼调皮、充满好奇心的语气，开心地说<|endofprompt|>"
torch.manual_seed(1); sf.write(os.path.join(OUT, "kid_1.wav"), norm(cat(cv2.inference_instruct2(LINE, ins, os.path.join(OUT, "ref_m.wav"), speed=1.1))), sr)
torch.manual_seed(2); sf.write(os.path.join(OUT, "kid_2.wav"), norm(cat(cv2.inference_instruct2(LINE, ins, REF_F, speed=1.1))), sr)
ins3 = "用小男孩的声音，非常兴奋、蹦蹦跳跳地说<|endofprompt|>"
torch.manual_seed(3); sf.write(os.path.join(OUT, "kid_3.wav"), norm(cat(cv2.inference_instruct2(LINE, ins3, REF_F, speed=1.2))), sr)
print("DONE", flush=True)
