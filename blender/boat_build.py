# The fisherman's rowing boat out at sea: a real wooden rowboat (donnichols, CC-BY) with the old fisherman (Bente.Schoone, CC-BY)
# sitting on its middle bench, both from assets/source/sketchfab (not committed; see assets/models/CREDITS.md).
#   blender.exe -b --factory-startup -P boat_build.py   ->  assets/models/real/fishboat.glb
# The man gets a proper skeleton (hips, spine, chest, neck, head; collarbone, upper arm, forearm and hand each side; thigh, shin
# and foot each side) and each oar a bone at its oarlock. Clips:
#   row    - a full stroke: lean forward with arms reaching (catch), blades in, lean back and pull the handles to the chest (drive),
#            hands drop to lift the blades out and push forward again (recovery). The hands are put on the oar grips with a
#            two-bone arm solve every frame, so they never leave the handles.
#   fish   - oars shipped along the gunwales, holding the rod: breathing, small rod jigs, a glance about
#   strike - a bite: arms lift the rod sharply, the body sways back
#   look   - turns his head to look round over each shoulder
# The boat travels bow first (+Z in the game) with the rower's back to the way it goes, like real rowing.
import bpy, os, math
from mathutils import Vector, Matrix, Quaternion
SRC = r"C:\Users\User\Documents\wombat-pet\assets\source\sketchfab"
OUT = r"C:\Users\User\Documents\wombat-pet\assets\models\real\fishboat.glb"
K = 6.0/487   # boat units (the source is ~487 long) -> game units: a 4 m boat at the game's ~1.5 units a metre
FPS = 30

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene; scene.render.fps = FPS

def bake(objs):
    for o in objs:
        mw = o.matrix_world.copy(); o.parent = None; o.data.transform(mw); o.matrix_world.identity()
def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1: bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active; o.name = name; return o
def decimate(o, tris):
    have = sum(len(p.vertices) - 2 for p in o.data.polygons)
    if have > tris:
        d = o.modifiers.new("Dec", 'DECIMATE'); d.ratio = tris/have; d.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier="Dec")

# ---------------------------------------------------------------- the boat
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, "rowboat.glb"))
bm = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
for o in [o for o in bpy.data.objects if o not in before and o.type != 'MESH']: pass
bake(bm)
for o in [o for o in bpy.data.objects if o.type != 'MESH']: bpy.data.objects.remove(o, do_unlink=True)
oars = {s: next(o for o in bm if o.name.startswith("Paddle" + s + "_")) for s in "LR"}
hull = join([o for o in bm if o not in oars.values()], "boat")
decimate(hull, 3600)
for o in oars.values(): decimate(o, 160)
PIV = {"L": Vector((89.7, 55.3, 69.9)), "R": Vector((-89.7, 55.3, 69.9))}   # the oarlock pins
def oar_ends(o, s):
    vs = [v.co for v in o.data.vertices]
    inner = min(vs, key=lambda c: abs(c.x)); outer = max(vs, key=lambda c: abs(c.x))
    return inner.copy(), outer.copy()
END = {s: oar_ends(oars[s], s) for s in "LR"}

# ---------------------------------------------------------------- the fisherman, into the boat's space: turned to face the stern (+Y),
# sat on the middle bench
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, "fisherman.glb"))
KEEP = ("Body_LP", "Skin_LP", "Eyebrows_LP", "EyeInner_LP", "EyeOuter_LP", "Hat_LP", "Rod_LP")
fm = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
for o in fm:
    if not o.name.startswith(KEEP): bpy.data.objects.remove(o, do_unlink=True)
fm = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
bake(fm)
for o in [o for o in bpy.data.objects if o.type == 'EMPTY']: bpy.data.objects.remove(o, do_unlink=True)
SC = 1580; T = Vector((0, 45, 141))
F = lambda p: Vector((-p[0]*SC, -p[1]*SC, p[2]*SC)) + T          # fisherman model -> boat units
FM = Matrix.Translation(T) @ Matrix.Diagonal((-SC, -SC, SC, 1))
for o in fm: o.data.transform(FM); o.data.flip_normals() if False else None
part = lambda pfx: next(o for o in fm if o.name.startswith(pfx))
rod = part("Rod_LP"); tip = max((v.co for v in rod.data.vertices), key=lambda c: c.y).copy()   # (the rod now points to +Y)
body = join([part("Body_LP"), part("Skin_LP")], "man")
headparts = join([part("Eyebrows_LP"), part("EyeInner_LP"), part("EyeOuter_LP"), part("Hat_LP")], "man_head")
decimate(body, 6500); decimate(headparts, 1400); decimate(rod, 500)

# everything down to game size
ALL = [hull, *oars.values(), body, headparts, rod]
for o in ALL: o.data.transform(Matrix.Diagonal((K, K, K, 1)))
for s in "LR": PIV[s] *= K; END[s] = (END[s][0]*K, END[s][1]*K)
tip *= K
for im in bpy.data.images:
    if im.size[0] > 512: im.scale(512, max(1, 512*im.size[1]//im.size[0]))

# ---------------------------------------------------------------- skeleton (fisherman model coordinates, measured off its side and front views)
J = {"hips": (0, 0.016, -0.054), "spine": (0, 0.015, -0.040), "chest": (0, 0.012, -0.024), "neck": (0, 0.006, -0.011),
     "head": (0, 0.003, -0.005), "top": (0, 0.0, 0.012)}
for side, sx in (("L", 1), ("R", -1)):   # his left is +x in the source model
    J.update({"clav" + side: (sx*0.004, 0.010, -0.016), "sho" + side: (sx*0.014, 0.009, -0.019), "elb" + side: (sx*0.016, 0.003, -0.039),
              "wri" + side: (sx*0.006, -0.017, -0.035), "fin" + side: (sx*0.004, -0.023, -0.034),
              "hip" + side: (sx*0.008, 0.013, -0.054), "kne" + side: (sx*0.009, -0.011, -0.049), "ank" + side: (sx*0.009, -0.002, -0.083), "toe" + side: (sx*0.009, -0.013, -0.087)})
P = {k: F(v)*K for k, v in J.items()}
arm_data = bpy.data.armatures.new("rig"); arm = bpy.data.objects.new("fishboat", arm_data); scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm; bpy.ops.object.mode_set(mode='EDIT')
E = arm_data.edit_bones
def eb(name, h, t, parent=None, conn=False):
    b = E.new(name); b.head = h; b.tail = t; b.roll = 0
    if parent: b.parent = E[parent]; b.use_connect = conn
    return b
eb("root", Vector((0, 0, 0)), Vector((0, 0.3, 0)))
eb("hips", P["hips"], P["spine"], "root"); eb("spine", P["spine"], P["chest"], "hips", True); eb("chest", P["chest"], P["neck"], "spine", True)
eb("neck", P["neck"], P["head"], "chest", True); eb("head", P["head"], P["top"], "neck", True)
for s in "LR":
    eb("clav" + s, P["clav" + s], P["sho" + s], "chest"); eb("upper" + s, P["sho" + s], P["elb" + s], "clav" + s, True)
    eb("fore" + s, P["elb" + s], P["wri" + s], "upper" + s, True); eb("hand" + s, P["wri" + s], P["fin" + s], "fore" + s, True)
    eb("thigh" + s, P["hip" + s], P["kne" + s], "hips"); eb("shin" + s, P["kne" + s], P["ank" + s], "thigh" + s, True); eb("foot" + s, P["ank" + s], P["toe" + s], "shin" + s, True)
    inner, outer = END[s]
    eb("oar" + s, PIV[s], inner, "root")
eb("rod", P["wriR"], P["wriR"] + (tip - P["wriR"])*0.3, "handR")
eb("rodtip", tip, tip + Vector((0, 0.05, 0)), "rod")
bpy.ops.object.mode_set(mode='OBJECT')

# ---------------------------------------------------------------- skinning
def rigid(o, bone):
    vg = o.vertex_groups.new(name=bone); vg.add(range(len(o.data.vertices)), 1.0, 'REPLACE')
    md = o.modifiers.new("Armature", 'ARMATURE'); md.object = arm; o.parent = arm
rigid(headparts, "head"); rigid(rod, "rod"); rigid(oars["L"], "oarL"); rigid(oars["R"], "oarR")
hull.parent = arm
# a lid over the open hull at gunwale height: the game draws it depth-only, so the sea never shows inside the boat
import bmesh
pts = sorted({(round(v.co.x, 4), round(v.co.y, 4)) for v in hull.data.vertices if v.co.z > 50*K})
def half(ps):   # monotone-chain convex hull of the hull's top edge, seen from above
    h = []
    for p in ps:
        while len(h) >= 2 and (h[-1][0] - h[-2][0])*(p[1] - h[-2][1]) - (h[-1][1] - h[-2][1])*(p[0] - h[-2][0]) <= 0: h.pop()
        h.append(p)
    return h[:-1]
ring = half(pts) + half(pts[::-1])
bm = bmesh.new(); f = bm.faces.new([bm.verts.new((x*0.97, y*0.985, 58*K)) for x, y in ring])
bmesh.ops.triangulate(bm, faces=[f])
cme = bpy.data.meshes.new("boat_cap"); bm.to_mesh(cme); cap = bpy.data.objects.new("boat_cap", cme); scene.collection.objects.link(cap)
cm = bpy.data.materials.new("Cap"); cme.materials.append(cm); cap.parent = arm
# the man's body: heat weights over his own bones only (the oar and rod bones stay off him)
bpy.ops.object.select_all(action='DESELECT'); body.select_set(True); arm.select_set(True); bpy.context.view_layer.objects.active = arm
for b in arm_data.bones: b.use_deform = not b.name.startswith(("oar", "rod", "root"))
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
for b in arm_data.bones: b.use_deform = True
print("WEIGHT GROUPS", sorted(g.name for g in body.vertex_groups), "unweighted",
      sum(1 for v in body.data.vertices if not any(g.weight > 0.01 for g in v.groups)))

# ---------------------------------------------------------------- posing helpers (world-space, as the bones sit now)
PB = arm.pose.bones
ORDER = [b.name for b in arm_data.bones]   # parents come before children
def upd(): bpy.context.view_layer.update()
def reset():
    for pb in PB: pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0); pb.scale = (1, 1, 1)
    upd()
def turn(name, axis, ang):
    """Turn a bone (and so everything below it) about a world axis through its joint."""
    pb = PB[name]; h = pb.head.copy()
    pb.matrix = Matrix.Translation(h) @ Quaternion(Vector(axis).normalized(), ang).to_matrix().to_4x4() @ Matrix.Translation(-h) @ pb.matrix; upd()
def aim(name, target):
    """Swing a bone about its joint so it points at a world point."""
    pb = PB[name]; h = pb.head.copy(); q = (pb.tail - h).normalized().rotation_difference((target - h).normalized())
    pb.matrix = Matrix.Translation(h) @ q.to_matrix().to_4x4() @ Matrix.Translation(-h) @ pb.matrix; upd()
def reach(s, target, out):
    """Two-bone arm solve: shoulder -> elbow -> wrist on `target`, the elbow bending out towards `out`."""
    S = PB["upper" + s].head.copy(); a = (PB["upper" + s].tail - S).length; b = (PB["fore" + s].tail - PB["fore" + s].head).length
    d = target - S; L = min(d.length, (a + b)*0.999); dn = d.normalized()
    x = (a*a - b*b + L*L)/(2*L); h = math.sqrt(max(0.0, a*a - x*x))
    o = Vector(out); o = (o - dn*o.dot(dn)).normalized()
    elbow = S + dn*x + o*h
    aim("upper" + s, elbow); aim("fore" + s, S + dn*L)
UP, LEFT, FWD = (0, 0, 1), (-1, 0, 0), (0, 1, 0)   # he faces +Y (the stern); +X is his right
def oar(s, sweep, lift):
    """Oar angle: sweep 0 = square out from the boat, + swings the handle towards the stern; lift + raises the handle (blade dips)."""
    sx = 1 if s == "L" else -1
    inward = Vector((-sx, 0, 0)); d = Quaternion(Vector(UP), -sx*sweep) @ inward
    d = (d*math.cos(lift) + Vector(UP)*math.sin(lift)).normalized()
    pb = PB["oar" + s]; length = (pb.tail - pb.head).length
    aim("oar" + s, pb.head + d*length)
def grip(s): return PB["oar" + s].head + (PB["oar" + s].tail - PB["oar" + s].head)*0.9

def key(f):
    for pb in PB:
        pb.keyframe_insert("rotation_quaternion", frame=f); pb.keyframe_insert("location", frame=f); pb.keyframe_insert("scale", frame=f)
ad = arm.animation_data_create()
def clip(name, secs, n, pose):
    act = bpy.data.actions.new(name); ad.action = act
    for i in range(n + 1):
        t = i/n; reset(); pose(t); key(1 + t*secs*FPS)
    tr = ad.nla_tracks.new(); tr.name = name; st = tr.strips.new(name, 1, act); st.name = name; tr.mute = True
    ad.action = None; print("  CLIP", name)

def shipped():
    for s in "LR": oar(s, 1.25, 0.12)   # oars pulled in along the gunwales, blades out of the water towards the bow
def row(t):
    ph = t*2*math.pi
    drive = 0.5 - 0.5*math.cos(ph)                      # 0 at the catch (t=0) .. 1 at the finish (t=0.5) .. 0
    blade_in = 1.0 if 0.02 < t < 0.48 else 0.0          # blades in the water through the drive
    lean = 0.32 - 0.62*drive                            # leaning forward at the catch, back at the finish
    turn("hips", LEFT, lean*0.55); turn("spine", LEFT, lean*0.3); turn("chest", LEFT, lean*0.15)   # (+ about his left tips him forward)
    turn("neck", LEFT, -lean*0.8)                       # head stays level
    for s in "LR": turn("thigh" + s, LEFT, -0.14*(1 - drive)); turn("shin" + s, LEFT, 0.16*(1 - drive))   # knees rise as he slides forward
    for s in "LR": oar(s, 0.75 - 1.25*drive, (0.30 if blade_in else 0.12) + 0.03*math.sin(ph))
    reach("L", grip("R"), (-1.0, -0.6, -0.7)); reach("R", grip("L"), (1.0, -0.6, -0.7))   # his left hand is on the oar at -X
    PB["rod"].scale = (0.001, 0.001, 0.001); upd()     # the rod is laid down while he rows
def fish(t):
    ph = t*2*math.pi
    shipped()
    turn("chest", LEFT, 0.02*math.sin(ph*2)); turn("head", UP, 0.25*math.sin(ph)); turn("head", LEFT, 0.06*math.sin(ph*2 + 1))
    for s in "LR": turn("fore" + s, LEFT, -0.06*max(0, math.sin(ph*3)))   # little jigs of the rod tip
def strike(t):
    shipped()
    k = math.sin(min(1, t*2.2)*math.pi/2)*(1 - max(0, t - 0.7)/0.3*0.6)
    turn("spine", LEFT, -0.22*k); turn("head", LEFT, -0.1*k)
    for s in "LR": turn("upper" + s, LEFT, -0.5*k); turn("fore" + s, LEFT, -0.35*k)
def look(t):
    shipped()
    y = math.sin(t*2*math.pi); turn("chest", UP, 0.25*y); turn("neck", UP, 0.45*y); turn("head", UP, 0.35*y)
clip("fish", 6.0, 24, fish); clip("row", 2.4, 24, row); clip("strike", 1.6, 12, strike); clip("look", 5.0, 20, look)
reset()

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_image_format='WEBP', export_animations=True, export_animation_mode='NLA_TRACKS',
    export_skins=True, export_yup=True, export_apply=False,
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7, export_draco_position_quantization=14,
    export_draco_normal_quantization=10, export_draco_texcoord_quantization=12)
print("EXPORTED", OUT, os.path.getsize(OUT))
