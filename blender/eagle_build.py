# Adds the clips a bald eagle needs to the converted Sketchfab eagle (assets/models/real/eagle.glb from real_build.py, which only
# has its flapping flight):  blender.exe -b --factory-startup -P eagle_build.py   (run after real_build.py ONLY=eagle)
# Its skeleton: spine, neck, head, two tail bones, each wing in three parts (upper arm, forearm, hand), each leg thigh + tarsus
# and four toes of two or three joints. Wing and leg bones are aimed in the body's own frame, so the poses are real bird poses:
#   perch  - sitting up on a branch: wings folded in a Z against the body (arm back, forearm forward, hand back over the tail),
#            legs straight down with the toes gripping, the head turning to look round
#   spread - on the perch, wings opened out to the sides to stretch and dry (mantling)
#   glide  - wings held straight out with the primaries slightly swept, legs tucked back under the tail
#   stoop  - the dive: wings half folded back against the body
#   land   - the landing flare: body up, wings forward and beating hard, legs and open talons swung forward
#   eat    - on the ground over its catch: wings half open over it, head down tearing
import bpy, os, sys, math
from mathutils import Vector, Matrix, Quaternion
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pose_kit import Rig
PATH = r"C:\Users\User\Documents\wombat-pet\assets\models\real\eagle.glb"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=PATH)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
ad = arm.animation_data
for tr in list(ad.nla_tracks):   # keep only the original flight clip
    if tr.name != "fly": ad.nla_tracks.remove(tr)
if not any(t.name == "fly" for t in ad.nla_tracks):   # (the importer puts each animation on its own track)
    act = next(a for a in bpy.data.actions if a.name.startswith("fly")); tr = ad.nla_tracks.new(); tr.name = "fly"; st = tr.strips.new("fly", int(act.frame_range[0]), act); st.name = "fly"
for tr in ad.nla_tracks: tr.mute = True
ad.action = None
B = arm.data.bones
def bn(pfx): return next(b.name for b in B if b.name.startswith(pfx))
ROOT = bn("GLTF_created_0_rootJoint"); SPINE = bn("SETUP-HAWK-SPINE"); NECK = bn("SETUP-HAWK-NECK"); HEAD = bn("SETUP-HAWK-HEAD")
TAIL1 = bn("SETUP-HAWK-TAIL-01"); TAIL2 = bn("SETUP-HAWK-TAIL-02")
WING = {k: [bn(f"SETUP-HAWK-{s}-WING-0{i}") for i in (1, 2, 3)] for k, s in (("L", "LEFT"), ("R", "RIGHT"))}
LEG = {k: [bn(f"SETUP-HAWK-{s}-LEG-0{i}") for i in (1, 2)] for k, s in (("L", "LEFT"), ("R", "RIGHT"))}
def kids(name): return [c.name for c in B[name].children]
TOES = {"L": [c for c in kids(bn("SETUP-HAWK-LEFT-FOOT-01"))] + [n for n in kids(LEG["L"][1]) if not n.startswith("SETUP-HAWK-LEFT-FOOT")],
        "R": [n for f in kids(LEG["R"][1]) for n in ([f] if not kids(f) or f.endswith("_48") else kids(f))]}
print("TOES", TOES)
# The feather and body pieces came in tied to the root alone (so the wings never moved): weight every vertex of those to its two
# nearest bones, measured along each bone's segment (joint to the next joint)
from mathutils.geometry import intersect_point_line
segs = []
for b in B:
    if b.name == ROOT: continue
    h = arm.matrix_world @ b.head_local; t = arm.matrix_world @ (b.children[0].head_local if b.children else b.tail_local)
    segs.append((b.name, h, t))
def segd(p, h, t):
    q, f = intersect_point_line(p, h, t); q = h if f < 0 else t if f > 1 else q; return (p - q).length
for o in [o for o in bpy.data.objects if o.type == 'MESH' and o.vertex_groups]:
    gi = {g.index: g.name for g in o.vertex_groups}
    if sum(1 for v in o.data.vertices if v.groups and gi[max(v.groups, key=lambda g: g.weight).group] != ROOT) > 0.02*len(o.data.vertices): continue   # (properly skinned already)
    o.vertex_groups.clear(); vg = {n: o.vertex_groups.new(name=n) for n, _, _ in segs}
    for v in o.data.vertices:
        p = o.matrix_world @ v.co; ds = sorted((segd(p, h, t), n) for n, h, t in segs)[:2]
        w = [1/(d + 0.5)**4 for d, _ in ds]; s = sum(w)
        for (d, n), wi in zip(ds, w): vg[n].add([v.index], wi/s, 'REPLACE')
    print("REWEIGHT", o.name, len(o.data.vertices))
for o in [o for o in bpy.data.objects if o.type == 'MESH' and any('LEFT-WING' in g.name for g in o.vertex_groups) and any('RIGHT-WING' in g.name for g in o.vertex_groups)]:
    # the right wing's guessed hand bone points off into space, so its primaries went to the forearm and split away from the hand
    # in a glide: the bird is symmetric, so every right-side vertex takes the weights of its mirror image on the left
    from mathutils.kdtree import KDTree
    left = [v for v in o.data.vertices if (o.matrix_world @ v.co).x > 0.002]
    kd = KDTree(len(left))
    for i, v in enumerate(left): kd.insert(o.matrix_world @ v.co, i)
    kd.balance()
    swap = lambda n: n.replace("LEFT", "\0").replace("RIGHT", "LEFT").replace("\0", "RIGHT")
    names = {g.name for g in o.vertex_groups}; idx = {g.index: g.name for g in o.vertex_groups}; n_m = 0
    for v in o.data.vertices:
        p = o.matrix_world @ v.co
        if p.x >= -0.002: continue
        _, j, _ = kd.find(Vector((-p.x, p.y, p.z))); src = left[j]
        for g in list(v.groups): o.vertex_groups[idx[g.group]].remove([v.index])
        for g in src.groups:
            pre = swap(idx[g.group]).rsplit("_", 1)[0]   # (the two sides' bones end in different numbers)
            nm = next((n for n in names if n.rsplit("_", 1)[0] == pre), idx[g.group])
            o.vertex_groups[nm].add([v.index], g.weight, 'ADD')
        n_m += 1
    print("MIRRORED", o.name, n_m)
# where a bone with no child bone really points: towards the middle of the skin it carries (a wing hand -> its primaries)
TIPDIR = {}
_acc = {}
for o in [o for o in bpy.data.objects if o.type == 'MESH' and o.vertex_groups]:
    gi = {g.index: g.name for g in o.vertex_groups}
    for v in o.data.vertices:
        if not v.groups: continue
        g = max(v.groups, key=lambda g: g.weight); n = gi[g.group]
        if n in B and not B[n].children and g.weight > 0.6:
            s = _acc.setdefault(n, [Vector(), 0]); s[0] += arm.matrix_world.inverted() @ (o.matrix_world @ v.co); s[1] += 1
for n, (s, c) in _acc.items():
    if c > 10: TIPDIR[n] = (s/c - B[n].head_local).normalized()
print("TIPDIR", sorted(TIPDIR))
R = Rig(arm)
def point(b, target):
    """Swing bone b about its joint so the segment it drives (joint -> its first child's joint; its tail if it has none) points at
    `target` (imported bones' tails are only guessed, so they don't follow the limb)."""
    pb = R.PB[b]; h = pb.head.copy(); ch = B[b].children
    if ch: cur = (R.head(ch[0].name) - h).normalized()
    elif b in TIPDIR: cur = (pb.matrix.to_3x3() @ B[b].matrix_local.to_3x3().inverted() @ TIPDIR[b]).normalized()   # its rest direction, as posed now
    else: cur = (pb.tail - h).normalized()
    q = cur.rotation_difference((Vector(target) - h).normalized())
    pb.matrix = Matrix.Translation(h) @ q.to_matrix().to_4x4() @ Matrix.Translation(-h) @ pb.matrix; R.upd()
W = arm.matrix_world.to_3x3()
AI = arm.matrix_world.to_3x3().normalized().inverted()   # world directions -> the armature's own space (the import turns it)
UP, X = AI @ Vector((0, 0, 1)), AI @ Vector((1, 0, 0))   # model faces -Y in the world; its left is +X
def body(pitch):
    """Tip the whole bird about its middle (negative = head up), then return a function giving directions in its own frame."""
    c = R.head(SPINE)
    if pitch: R.turn(ROOT, X, pitch, about=c)
    q = Quaternion(Vector((1, 0, 0)), pitch).to_matrix()
    return lambda v: AI @ (q @ Vector(v))
def wing(k, d, a, f, h):
    """Aim one wing's upper arm, forearm and hand along body-frame directions (x out to the side, y back, z up)."""
    sx = 1 if k == "L" else -1
    for b, v in zip(WING[k], (a, f, h)):
        point(b, R.head(b) + d((sx*v[0], v[1], v[2]))*10)
def legs(d, thigh, tarsus, toe_dir, spread=0.5):
    for k, sx in (("L", 1), ("R", -1)):
        point(LEG[k][0], R.head(LEG[k][0]) + d(thigh)*10); point(LEG[k][1], R.head(LEG[k][1]) + d(tarsus)*10)
        for i, t in enumerate(TOES[k]):
            back = "Bone12" in t or t.endswith(("_133", "_48"))   # the hind toe (hallux) points backwards
            ang = (i - 1.5)*spread*sx
            v = Vector(toe_dir) if not back else Vector((0, -toe_dir[1], toe_dir[2]))
            v = Quaternion(Vector((0, 0, 1)), ang) @ v if not back else v
            point(t, R.head(t) + d(v)*10)
def look(t, amt=1.0):
    y = math.sin(t*2*math.pi); R.turn(NECK, UP, 0.5*amt*y); R.turn(HEAD, UP, 0.5*amt*math.sin(t*2*math.pi + 0.7))
FOLD = ((0.22, 0.95, -0.25), (0.12, -0.98, -0.05), (0.06, 0.98, -0.18))   # arm back, forearm forward, hand back: the folded Z
def perch_base(t, d):
    wing("L", d, *FOLD); wing("R", d, *FOLD)
    legs(d, (0, -0.1, -1), (0, 0.1, -1), (0, -1, -0.35), 0.45)
def perch(t):
    d = body(-0.75); R.turn(NECK, X, 0.45); R.turn(HEAD, X, 0.3)   # sitting up, the head held level
    perch_base(t, d); look(t); R.turn(TAIL1, X, 0.25 + 0.03*math.sin(t*4*math.pi))
def spread(t):
    d = body(-0.7); R.turn(NECK, X, 0.4); R.turn(HEAD, X, 0.3)
    k = math.sin(min(1, t*3)*math.pi/2)*(1 - max(0, (t - 0.75)/0.25))   # open, hold (a shiver), fold again
    sh = 0.04*math.sin(t*40)
    op = ((1.0, 0.1, 0.35 + sh), (0.95, 0.05, 0.45 + sh), (0.85, 0.3, 0.6))
    wing("L", d, *[tuple(f*(1 - k) + o*k for f, o in zip(fv, ov)) for fv, ov in zip(FOLD, op)])
    wing("R", d, *[tuple(f*(1 - k) + o*k for f, o in zip(fv, ov)) for fv, ov in zip(FOLD, op)])
    legs(d, (0, -0.1, -1), (0, 0.1, -1), (0, -1, -0.35), 0.45); R.turn(TAIL1, X, 0.3)
def glide(t):
    d = body(0); w = 0.03*math.sin(t*2*math.pi)
    for k in "LR": wing(k, d, (1, 0.12, 0.1 + w), (1, -0.05, 0.08 + w), (1, 0.25, 0.05 + w))
    legs(d, (0, 1, -0.25), (0, 1, -0.1), (0, 1, 0.2), 0.2); look(t, 0.3)
def stoop(t):
    d = body(0.2)
    for k in "LR": wing(k, d, (0.55, 0.75, 0.15), (0.35, 0.9, 0.0), (0.1, 1, -0.05))
    legs(d, (0, 1, -0.2), (0, 1, -0.05), (0, 1, 0.2), 0.2); R.turn(HEAD, X, -0.25)
def land(t):
    d = body(-0.85); ph = t*2*math.pi*2
    up = 0.5 + 0.5*math.sin(ph)
    for k in "LR": wing(k, d, (0.75, -0.45, -0.35 + 0.95*up), (0.8, -0.3, -0.3 + 0.9*up), (0.7, -0.1, -0.35 + 0.95*up))
    legs(d, (0, -0.8, -0.6), (0, -0.85, -0.5), (0, -0.7, 0.7), 0.7); R.turn(NECK, X, 0.5); R.turn(HEAD, X, 0.35)
    R.turn(TAIL1, X, -0.35)   # tail fanned down as a brake
def eat(t):
    d = body(-0.15)
    half = ((0.75, 0.55, 0.2), (0.6, 0.3, 0.1), (0.4, 0.7, -0.1))   # wings half open over the catch
    for k in "LR": wing(k, d, *half)
    legs(d, (0, -0.2, -1), (0, 0.15, -1), (0, -1, -0.3), 0.45)
    tear = max(0, math.sin(t*2*math.pi*2)); R.turn(NECK, X, 0.75 + 0.25*tear); R.turn(HEAD, X, 0.55 + 0.3*tear)
R.clip("glide", 4.0, 8, glide); R.clip("stoop", 1.0, 2, stoop)   # (sitting is the other model, eagleperch.glb: these feathers are rigid cards that cannot fold)
R.clip("land", 1.0, 16, land)
R.reset()
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=PATH, export_format='GLB', export_image_format='WEBP', export_animations=True, export_animation_mode='NLA_TRACKS',
    export_skins=True, export_yup=True, export_apply=False,
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7, export_draco_position_quantization=14,
    export_draco_normal_quantization=10, export_draco_texcoord_quantization=12)
print("EXPORTED", PATH, os.path.getsize(PATH))
