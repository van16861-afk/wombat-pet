# Hunyuan3D-2mv: 海豚姊姊 (the music hall's dolphin) from her four views in E:\Hunyuan3D\views\dolphin\
#   -> E:\Hunyuan3D\out\dolphin_shape.glb, and dolphin_textured.glb with --texture
# usage: python gen_dolphin.py [--texture] [--reuse] [--seed 12345]
import sys, os, time, argparse
sys.path.insert(0, r"E:\Hunyuan3D\Hunyuan3D-2")
os.environ.setdefault("HF_HOME", r"E:\Hunyuan3D\hf")
os.environ.setdefault("HY3DGEN_MODELS", r"E:\Hunyuan3D\models")
import torch
from PIL import Image

ap = argparse.ArgumentParser(); ap.add_argument("--texture", action="store_true"); ap.add_argument("--reuse", action="store_true")
ap.add_argument("--seed", type=int, default=12345); a = ap.parse_args()
SRC = r"E:\Hunyuan3D\views\dolphin"; OUT = r"E:\Hunyuan3D\out"
VIEW = {"front": "1_front", "left": "2_left", "back": "3_back", "right": "4_right"}

from hy3dgen.rembg import BackgroundRemover
rembg = BackgroundRemover()
imgs = {k: rembg(Image.open(os.path.join(SRC, v + ".png")).convert("RGB")) for k, v in VIEW.items()}   # (white background -> transparent)
sp = os.path.join(OUT, "dolphin_shape.glb")
if a.reuse and os.path.exists(sp):
    import trimesh; mesh = trimesh.load(sp, force="mesh")
else:
    from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline
    shape = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained("tencent/Hunyuan3D-2mv", subfolder="hunyuan3d-dit-v2-mv", variant="fp16")
    t0 = time.time()
    mesh = shape(image=imgs, num_inference_steps=50, octree_resolution=380, num_chunks=20000, generator=torch.manual_seed(a.seed), output_type="trimesh")[0]
    mesh.export(sp); print("shape", round(time.time() - t0, 1), "s,", len(mesh.faces), "faces", flush=True)
    del shape; torch.cuda.empty_cache()
if a.texture:
    from hy3dgen.shapegen import FloaterRemover, DegenerateFaceRemover, FaceReducer
    from hy3dgen.texgen import Hunyuan3DPaintPipeline
    paint = Hunyuan3DPaintPipeline.from_pretrained("tencent/Hunyuan3D-2"); paint.enable_model_cpu_offload()
    mesh = FaceReducer()(DegenerateFaceRemover()(FloaterRemover()(mesh)), max_facenum=40000)
    t0 = time.time(); tm = paint(mesh, image=[imgs["front"], imgs["left"], imgs["back"], imgs["right"]])
    tm.export(os.path.join(OUT, "dolphin_textured.glb")); print("texture", round(time.time() - t0, 1), "s", flush=True)
print("DONE", flush=True)
