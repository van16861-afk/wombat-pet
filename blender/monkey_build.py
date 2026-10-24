# The forest monkey: a realistic macaque (Sketchfab "Low poly monkey animal 3d model free" by rt699448, CC-BY; source in
# assets/source/sketchfab, not committed) given a full primate skeleton and hand-keyed clips:
#   blender.exe -b --factory-startup -P monkey_build.py   ->  assets/models/real/monkey.glb
# Bones: hips, spine, chest, neck, head; each arm clavicle + upper arm + forearm + hand (+ finger tip); each leg thigh + shin + foot
# (+ toe tip); a three-bone tail. The model stands upright; the clips put it on all fours the way macaques walk (palms and soles
# flat on the ground, elbows pointing back, knees forward), every paw placed with a two-bone limb solve so nothing slides:
#   walk   - lateral-sequence walk (left hind, left fore, right hind, right fore), body bobbing and swaying a little
#   run    - a bounding gallop: hind feet together, then hands together, the back flexing and stretching
#   idle   - sitting on its haunches, feet in front, hands on the ground, looking about
#   eat    - sitting, one hand picks food off the ground and takes it to the mouth, chewing
#   climb  - on a trunk in front of it: opposite hand and foot reach up together, then the other pair (played backwards to climb down)
import bpy, os, sys, math
from mathutils import Vector
sys.path.insert(0, os.path.dirname(__file__))
from pose_kit import Rig
SRC = r"C:\Users\User\Documents\wombat-pet\assets\source\sketchfab\macaque.glb"
OUT = r"C:\Users\User\Documents\wombat-pet\assets\models\real\monkey.glb"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
ob = next(o for o in bpy.data.objects if o.type == 'MESH')
mw = ob.matrix_world.copy(); ob.parent = None; ob.data.transform(mw); ob.matrix_world.identity()
for o in [o for o in bpy.data.objects if o.type != 'MESH']: bpy.data.objects.remove(o, do_unlink=True)
ob.name = "monkey"
for m in bpy.data.materials: m.use_backface_culling = False
GROUND = min(v.co.z for v in ob.data.vertices)

# ---------------------------------------------------------------- skeleton: measured off the model's side and front views (it faces -Y, its left is +X)
J = {"hips": (0, 0.08, -0.10), "spine": (0, 0.06, 0.10), "chest": (0, 0.0, 0.33), "neck": (0, -0.17, 0.52), "head": (0, -0.30, 0.64), "snout": (0, -0.62, 0.64),
     "tail1": (0, 0.24, -0.22), "tail2": (0, 0.45, -0.42), "tail3": (0, 0.50, -0.75), "tail4": (0, 0.66, -0.89)}
for k, sx in (("L", 1), ("R", -1)):
    J.update({"clav" + k: (sx*0.08, -0.12, 0.45), "sho" + k: (sx*0.30, -0.19, 0.38), "elb" + k: (sx*0.47, -0.27, 0.0), "wri" + k: (sx*0.56, -0.25, -0.26),
              "fin" + k: (sx*0.60, -0.25, -0.42), "hip" + k: (sx*0.17, 0.07, -0.12), "kne" + k: (sx*0.17, -0.10, -0.50), "ank" + k: (sx*0.18, -0.20, -0.84),
              "toe" + k: (sx*0.18, -0.45, -0.92)})
J = {k: Vector(v) for k, v in J.items()}
ad_ = bpy.data.armatures.new("monkey_rig"); arm = bpy.data.objects.new("monkey_rig", ad_); bpy.context.scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm; bpy.ops.object.mode_set(mode='EDIT')
E = ad_.edit_bones
def eb(n, h, t, p=None, conn=False):
    b = E.new(n); b.head = J[h] if isinstance(h, str) else h; b.tail = J[t] if isinstance(t, str) else t; b.roll = 0
    if p: b.parent = E[p]; b.use_connect = conn
eb("hips", "hips", "spine"); eb("spine", "spine", "chest", "hips", True); eb("chest", "chest", "neck", "spine", True)
eb("neck", "neck", "head", "chest", True); eb("head", "head", "snout", "neck", True)
eb("tail1", "tail1", "tail2", "hips"); eb("tail2", "tail2", "tail3", "tail1", True); eb("tail3", "tail3", "tail4", "tail2", True)
for k in "LR":
    eb("clav" + k, "clav" + k, "sho" + k, "chest"); eb("upper" + k, "sho" + k, "elb" + k, "clav" + k, True)
    eb("fore" + k, "elb" + k, "wri" + k, "upper" + k, True); eb("hand" + k, "wri" + k, "fin" + k, "fore" + k, True)
    eb("finger" + k, "fin" + k, J["fin" + k] + Vector((0, 0, -0.03)), "hand" + k, True)
    eb("thigh" + k, "hip" + k, "kne" + k, "hips"); eb("shin" + k, "kne" + k, "ank" + k, "thigh" + k, True)
    eb("foot" + k, "ank" + k, "toe" + k, "shin" + k, True); eb("toes" + k, "toe" + k, J["toe" + k] + Vector((0, -0.03, 0)), "foot" + k, True)
bpy.ops.object.mode_set(mode='OBJECT')
for b in ad_.bones: b.use_deform = not b.name.startswith(("finger", "toes"))   # tip bones: only so the game can measure the paws
bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); arm.select_set(True); bpy.context.view_layer.objects.active = arm
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
# any vertex the heat solve missed goes to its nearest bone
from mathutils.geometry import intersect_point_line
segs = [(b.name, b.head_local.copy(), b.tail_local.copy()) for b in ad_.bones if b.use_deform]
def nearest(p):
    best = None
    for n, h, t in segs:
        q, f = intersect_point_line(p, h, t); q = h if f < 0 else t if f > 1 else q; d = (p - q).length
        if best is None or d < best[0]: best = (d, n)
    return best[1]
miss = [v for v in ob.data.vertices if not any(g.weight > 0.01 for g in v.groups)]
for v in miss: ob.vertex_groups[nearest(v.co)].add([v.index], 1.0, 'REPLACE')
print("WEIGHTS: groups", len(ob.vertex_groups), "unweighted fixed", len(miss), "of", len(ob.data.vertices))

# ---------------------------------------------------------------- clips
R = Rig(arm)
SIDE, UP, FWD = Vector((1, 0, 0)), Vector((0, 0, 1)), Vector((0, -1, 0))   # + about SIDE tips a bone's top forward (-Y)
G = GROUND
def body(drop, tilt, bob=0.0, roll=0.0, flex=0.0, head_down=0.15):
    """Lower the hips by `drop`, tip the trunk forward by `tilt` (spread over hips, spine, chest), keep the head looking ahead."""
    R.move("hips", (0, 0, -drop + bob))
    R.turn("hips", SIDE, tilt*0.7 + flex*0.3); R.turn("spine", SIDE, tilt*0.2 - flex*0.6); R.turn("chest", SIDE, tilt*0.1 + flex*0.3)   # (turns add up down the chain: the pelvis does most of it, the back stays long)
    if roll: R.turn("hips", FWD, roll)
    R.turn("neck", SIDE, -tilt*0.55 + head_down*0.5); R.turn("head", SIDE, -tilt*0.4 + head_down*0.5)
def paw_fore(k, sx, p, lift=0.0, flat=True):
    R.reach("upper" + k, "fore" + k, p + Vector((0, 0, 0.05 + lift)), (sx*0.25, 1.0, 0.0))   # elbow points back
    w = R.head("hand" + k); R.aim("hand" + k, w + Vector((0, -0.15, -0.045 + lift*0.4)) if flat else w + Vector((0, -0.05, -0.15)))
def paw_hind(k, sx, p, lift=0.0):
    R.reach("thigh" + k, "shin" + k, p + Vector((0, 0, 0.075 + lift)), (sx*0.15, -1.0, 0.0))   # knee points forward
    a = R.head("foot" + k); R.aim("foot" + k, a + Vector((0, -0.24, -0.07 + lift*0.5)))
def tail(lift=0.25, swing=0.0):
    h = R.head("tail1"); R.aim("tail1", h + Vector((swing*0.1, 0.25, -0.05 + lift*0.2)))
    h = R.head("tail2"); R.aim("tail2", h + Vector((swing*0.15, 0.22, -0.12 + lift*0.1)))
    h = R.head("tail3"); R.aim("tail3", h + Vector((swing*0.2, 0.12, -0.14)))
def foot_track(t, off, duty, stride, height):
    """Where a paw is (ahead +, behind -) and how high, at time t of a gait cycle."""
    p = (t - off) % 1.0
    if p < duty: return stride/2 - stride*(p/duty), 0.0
    q = (p - duty)/(1 - duty); return -stride/2 + stride*(0.5 - 0.5*math.cos(math.pi*q)), height*math.sin(math.pi*q)
QUAD_DROP, QUAD_TILT = 0.14, 1.3   # back level, shoulders just below the rump, limbs nearly straight (probed: shoulder ~0.68, hip 0.69 above ground)
def quad_gait(t, offs, duty, stride, height, flex_amp=0.0):
    ph = t*2*math.pi
    body(QUAD_DROP, QUAD_TILT, bob=0.012*math.cos(2*ph) - (0.03 if flex_amp else 0), roll=0.03*math.sin(ph), flex=flex_amp*math.sin(ph))
    for k, sx in (("L", 1), ("R", -1)):
        sh = R.head("upper" + k); hp = R.head("thigh" + k)
        a, l = foot_track(t, offs["F" + k], duty, stride, height); paw_fore(k, sx, Vector((sh.x*0.72, sh.y - 0.02 - a, G)), l)
        a, l = foot_track(t, offs["H" + k], duty, stride, height); paw_hind(k, sx, Vector((hp.x*1.05, hp.y - 0.02 - a, G)), l)
    tail(0.3, 0.3*math.sin(ph))
def walk(t): quad_gait(t, {"HL": 0.0, "FL": 0.25, "HR": 0.5, "FR": 0.75}, 0.65, 0.40, 0.10)
def run(t): quad_gait(t, {"HL": 0.0, "HR": 0.06, "FL": 0.5, "FR": 0.56}, 0.38, 0.62, 0.16, flex_amp=0.18)
SIT_DROP, SIT_TILT = 0.74, -0.12
def sit_base(t, look=True):
    ph = t*2*math.pi
    body(SIT_DROP, SIT_TILT, bob=0.006*math.sin(ph), head_down=0.05)
    if look: R.turn("neck", UP, 0.35*math.sin(ph)); R.turn("head", UP, 0.4*math.sin(ph + 0.8)); R.turn("head", SIDE, 0.12*math.sin(2*ph))
    for k, sx in (("L", 1), ("R", -1)):
        hp = R.head("thigh" + k); paw_hind(k, sx, Vector((sx*0.26, hp.y - 0.38, G)))
        R.reach("thigh" + k, "shin" + k, Vector((sx*0.26, hp.y - 0.38, G + 0.075)), (sx*0.8, -0.5, 1.0))   # knees up and out
        a = R.head("foot" + k); R.aim("foot" + k, a + Vector((sx*0.03, -0.24, -0.07)))
    h = R.head("tail1"); R.aim("tail1", Vector((h.x + 0.05, h.y + 0.3, G + 0.02))); R.aim("tail2", R.head("tail2") + Vector((0.12, 0.25, 0))); R.aim("tail3", R.head("tail3") + Vector((0.18, 0.1, 0)))
def idle(t):
    sit_base(t)
    for k, sx in (("L", 1), ("R", -1)):
        hp = R.head("thigh" + k); paw_fore(k, sx, Vector((sx*0.13, hp.y - 0.30, G)), 0, flat=True)
def eat(t):
    sit_base(t, look=False)
    hp = R.head("thighL"); paw_fore("L", 1, Vector((0.13, hp.y - 0.30, G)))
    # right hand: ground -> mouth -> chew -> back
    mouth = R.head("head") + (R.tail("head") - R.head("head"))*0.72 + Vector((0, 0.03, -0.07))
    ground = Vector((-0.10, R.head("thighR").y - 0.40, G))
    if t < 0.25: p = ground
    elif t < 0.45: u = (t - 0.25)/0.2; u = u*u*(3 - 2*u); p = ground.lerp(mouth - Vector((0, 0, 0.05)), u)
    elif t < 0.8: p = mouth - Vector((0, 0, 0.05)); R.turn("head", SIDE, 0.06*math.sin((t - 0.45)*30))
    else: u = (t - 0.8)/0.2; u = u*u*(3 - 2*u); p = (mouth - Vector((0, 0, 0.05))).lerp(ground, u)
    R.reach("upperR", "foreR", p, (-0.6, 0.4, -0.6)); w = R.head("handR"); R.aim("handR", w + Vector((0.03, -0.08, 0.1 if 0.3 < t < 0.85 else -0.12)))
    R.turn("head", SIDE, 0.1)   # looking down at it
CLIMB_PLANE = -0.42   # the trunk's front face in model space (y), just in front of the chest
def climb(t):
    ph = t*2*math.pi
    body(0.0, 0.22, roll=0.04*math.sin(ph), head_down=-0.25)   # leaning in to the trunk, head tipped up the trunk
    duty, stride = 0.6, 0.34
    for k, sx, off_h, off_f in (("L", 1, 0.0, 0.5), ("R", -1, 0.5, 0.0)):   # left hand with right foot, then right hand with left foot
        sh = R.head("upper" + k); hp = R.head("thigh" + k)
        a, l = foot_track(t, off_h, duty, stride, 0.07)
        hand = Vector((sx*0.20, CLIMB_PLANE + l, sh.z + 0.36 + a))   # reaching up above the head
        R.reach("upper" + k, "fore" + k, hand, (sx*1.0, 0.7, -0.4)); w = R.head("hand" + k)   # elbows out to the sides, never into the trunk; R.aim("hand" + k, w + Vector((0, -0.04, 0.15)))
        a, l = foot_track(t, off_f, duty, stride, 0.07)
        foot = Vector((sx*0.26, CLIMB_PLANE + 0.06 + l, hp.z - 0.42 + a))
        R.reach("thigh" + k, "shin" + k, foot, (sx*1.0, 0.25, 0.3)); a_ = R.head("foot" + k); R.aim("foot" + k, a_ + Vector((sx*0.03, -0.1, 0.2)))
    tail(-0.4, 0.2*math.sin(ph))
R.clip("walk", 0.95, 24, walk); R.clip("run", 0.55, 16, run); R.clip("idle", 6.0, 24, idle); R.clip("eat", 3.0, 30, eat); R.clip("climb", 1.1, 24, climb)
R.reset()
for im in bpy.data.images:
    if im.size[0] > 1024: im.scale(1024, max(1, 1024*im.size[1]//im.size[0]))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_image_format='WEBP', export_animations=True, export_animation_mode='NLA_TRACKS',
    export_skins=True, export_yup=True, export_apply=False,
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7, export_draco_position_quantization=14,
    export_draco_normal_quantization=10, export_draco_texcoord_quantization=12)
print("EXPORTED", OUT, os.path.getsize(OUT))
