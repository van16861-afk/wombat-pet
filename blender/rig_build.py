# Rigs and animates the static Sketchfab animals (assets/source/sketchfab, not committed; see assets/models/CREDITS.md):
#   blender.exe -b --factory-startup -P rig_build.py            (env ONLY=kangaroo to pick, PREP=1 for step 1 only)
# Step 1 (prep): join the meshes, turn the body so it runs front to back with the head forward (-Y in Blender = +Z in the game),
#   feet on the ground, length 1, phone-sized polygons and textures -> assets/source/rigprep/<name>.glb (for placing the bones:
#   tools/view.html?f=../assets/source/rigprep/<name>.glb&side=x shows it side-on with a 10 x 10 grid).
# Step 2 (rig): a skeleton from the bone list (positions as fractions of the body: f 0 = nose .. 1 = tail end, u 0 = ground .. 1 = top,
#   s -1 = right .. 1 = left side), skin weights from the distance to each bone (limited to the bones allowed for that part of the
#   body), and clips keyed bone by bone -> assets/models/real/<name>.glb, played by fauna.js like the other rigged animals.
import bpy, bmesh, os, math
from mathutils import Vector, Matrix, Quaternion
SRC = r"C:\Users\User\Documents\wombat-pet\assets\source\sketchfab"
PREP = r"C:\Users\User\Documents\wombat-pet\assets\source\rigprep"
OUT = r"C:\Users\User\Documents\wombat-pet\assets\models\real"
os.makedirs(PREP, exist_ok=True); os.makedirs(OUT, exist_ok=True)

def prep(name, src, budget, flip=False, turn=0, drop=()):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, src + ".glb"))
    meshes = [o for o in bpy.data.objects if o.type == "MESH" and len(o.data.polygons) > 0 and not any(m and m.name.split(".")[0] in drop for m in o.data.materials)]   # (drop: e.g. a colour chart scanned with the animal)
    for o in [o for o in bpy.data.objects if o not in meshes]: bpy.data.objects.remove(o, do_unlink=True) if o.type == 'MESH' else None
    for o in meshes:   # bake transforms
        mw = o.matrix_world.copy(); o.parent = None; o.data.transform(mw); o.matrix_world.identity()
    for o in [o for o in bpy.data.objects if o.type != 'MESH']: bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes: o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1: bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active; ob.name = name; me = ob.data
    # main horizontal axis (PCA on the ground plane) -> Y
    vs = [v.co for v in me.vertices]; n = len(vs)
    mx = sum(v.x for v in vs)/n; my = sum(v.y for v in vs)/n
    cxx = sum((v.x - mx)**2 for v in vs)/n; cyy = sum((v.y - my)**2 for v in vs)/n; cxy = sum((v.x - mx)*(v.y - my) for v in vs)/n
    ang = 0.5*math.atan2(2*cxy, cxx - cyy)   # major axis angle from +X
    me.transform(Matrix.Rotation(math.pi/2 - ang, 4, 'Z'))
    vs = [v.co for v in me.vertices]; y0 = min(v.y for v in vs); y1 = max(v.y for v in vs); L = y1 - y0
    # head forward: the end with the highest points is the front (head and ears stand higher than a tail)
    lo_end = [v.z for v in vs if v.y < y0 + 0.2*L]; hi_end = [v.z for v in vs if v.y > y1 - 0.2*L]
    if (max(hi_end) > max(lo_end)) != flip: me.transform(Matrix.Rotation(math.pi, 4, 'Z'))
    if turn: me.transform(Matrix.Rotation(math.radians(turn), 4, "Z"))   # (e.g. a crab: wider than it is long)
    vs = [v.co for v in me.vertices]
    lo = Vector([min(v[k] for v in vs) for k in range(3)]); hi = Vector([max(v[k] for v in vs) for k in range(3)])
    s = 1/(hi.y - lo.y); c = Vector(((lo.x + hi.x)/2, (lo.y + hi.y)/2, lo.z))
    me.transform(Matrix.Scale(s, 4) @ Matrix.Translation(-c))
    # decimate
    tris = sum(len(p.vertices) - 2 for p in me.polygons)
    for _ in range(4):   # very dense scans need more than one pass
        now = sum(len(p.vertices) - 2 for p in me.polygons)
        if now <= budget*1.1: break
        d = ob.modifiers.new("Dec", 'DECIMATE'); d.ratio = budget/now; d.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = ob; bpy.ops.object.modifier_apply(modifier="Dec")
    for im in bpy.data.images:
        if im.size[0] > 1024: im.scale(1024, max(1, 1024*im.size[1]//im.size[0]))
    for m in bpy.data.materials: m.use_backface_culling = False   # heavy reduction flips a few faces: draw both sides so they don't show as holes
    print("PREP", name, "tris", tris, "->", sum(len(p.vertices) - 2 for p in me.polygons), "size", tuple(round(v, 3) for v in ob.dimensions))
    return ob

def export(path, anim):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_image_format='WEBP', export_animations=anim, export_animation_mode='NLA_TRACKS',
        export_skins=True, export_yup=True, export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
        export_draco_position_quantization=14, export_draco_normal_quantization=10, export_draco_texcoord_quantization=12)
    print("EXPORTED", path, os.path.getsize(path))

# ---------------------------------------------------------------- the skeleton
def P(ob, f, u, s=0.0):
    """A point on the body: f 0 = front .. 1 = back, u 0 = ground .. 1 = top, s -1 = right .. 1 = left."""
    d = ob.dimensions; return Vector((s*d.x/2, -0.5 + f, u*d.z))

def build_rig(ob, bones):
    arm_d = bpy.data.armatures.new(ob.name + "_rig"); arm = bpy.data.objects.new(ob.name + "_rig", arm_d); bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm; bpy.ops.object.mode_set(mode='EDIT')
    for b in bones:
        e = arm_d.edit_bones.new(b["n"]); e.head = P(ob, *b["h"]); e.tail = P(ob, *b["t"])
        if b.get("p"): e.parent = arm_d.edit_bones[b["p"]]; e.use_connect = False
        e.roll = 0
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in arm.pose.bones: pb.rotation_mode = 'QUATERNION'
    return arm

def seg_dist(p, a, b):
    ab = b - a; t = max(0.0, min(1.0, (p - a).dot(ab)/max(ab.length_squared, 1e-9))); return (p - (a + ab*t)).length

def skin(ob, arm, bones):
    """Weights from the distance to each bone; `zone(f, u, s)` says which bones a vertex may follow."""
    d = ob.dimensions; segs = {b["n"]: (P(ob, *b["h"]), P(ob, *b["t"]), b.get("zone")) for b in bones}
    groups = {n: ob.vertex_groups.new(name=n) for n in segs}
    for v in ob.data.vertices:
        p = v.co; f = p.y + 0.5; u = p.z/max(d.z, 1e-6); s = p.x/max(d.x/2, 1e-6)
        cand = [(seg_dist(p, a, b), n) for n, (a, b, z) in segs.items() if z is None or z(f, u, s)]
        if not cand: cand = [(seg_dist(p, a, b), n) for n, (a, b, z) in segs.items()]
        cand.sort(); cand = cand[:3]; w = [1/(c[0] + 0.004)**4 for c in cand]; tw = sum(w)
        for (dd, n), wi in zip(cand, w):
            if wi/tw > 0.02: groups[n].add([v.index], wi/tw, 'REPLACE')
    md = ob.modifiers.new("Armature", 'ARMATURE'); md.object = arm; ob.parent = arm

# ---------------------------------------------------------------- clips
FPS = 30
def key(arm, act, frame, poses):
    """poses: {bone: (pitch, yaw, roll)} in radians about the body's side (X), up (Z) and length (Y) axes, plus 'lift' for the root."""
    for pb in arm.pose.bones:
        rest = pb.bone.matrix_local.to_3x3().inverted()
        pr, yw, rl = poses.get(pb.name, (0, 0, 0))[:3]
        q = Quaternion(rest @ Vector((0, 0, 1)), yw) @ Quaternion(rest @ Vector((1, 0, 0)), pr) @ Quaternion(rest @ Vector((0, 1, 0)), rl)
        pb.rotation_quaternion = q; pb.keyframe_insert("rotation_quaternion", frame=frame)
        lift = poses.get(pb.name, (0, 0, 0, None))[3] if len(poses.get(pb.name, ())) > 3 else None
        pb.location = rest @ Vector(lift) if lift else Vector((0, 0, 0)); pb.keyframe_insert("location", frame=frame)
        sc = poses.get(pb.name, ())[4] if len(poses.get(pb.name, ())) > 4 else None   # optional 5th item: scale in the bone's own axes (x = across, e.g. a peacock spreading its train)
        pb.scale = Vector(sc) if sc else Vector((1, 1, 1)); pb.keyframe_insert("scale", frame=frame)

def clip(arm, name, seconds, frames):
    """frames: list of (t 0..1, poses); the last pose should match the first for loops."""
    act = bpy.data.actions.new(name); arm.animation_data_create(); arm.animation_data.action = act
    for t, poses in frames: key(arm, act, 1 + t*seconds*FPS, poses)
    tr = arm.animation_data.nla_tracks.new(); tr.name = name; st = tr.strips.new(name, 1, act); st.name = name; tr.mute = True
    arm.animation_data.action = None
    return act

def lerp_pose(a, b, k):
    out = {}
    for n in set(a) | set(b):
        pa = a.get(n, (0, 0, 0)); pb = b.get(n, (0, 0, 0))
        r = tuple(pa[i]*(1 - k) + pb[i]*k for i in range(3))
        la = pa[3] if len(pa) > 3 else (0, 0, 0); lb = pb[3] if len(pb) > 3 else (0, 0, 0)
        out[n] = r + (tuple(la[i]*(1 - k) + lb[i]*k for i in range(3)),)
    return out

# ---------------------------------------------------------------- the animals
from rig_specs import SPECS   # bone lists and clips per animal (blender/rig_specs.py)

only = [s for s in os.environ.get("ONLY", "").split(",") if s]
for name, sp in SPECS.items():
    if only and name not in only: continue
    ob = prep(name, sp["src"], sp["budget"], sp.get("flip", False), sp.get("turn", 0), sp.get("drop", ()))
    if os.environ.get("PREP"):
        export(os.path.join(PREP, name + ".glb"), False); continue
    arm = build_rig(ob, sp["bones"]); skin(ob, arm, sp["bones"])
    for cname, (secs, frames) in sp["clips"](lerp_pose).items(): clip(arm, cname, secs, frames)
    export(os.path.join(OUT, name + ".glb"), True)
