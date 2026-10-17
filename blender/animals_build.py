# Builds the wild animals (seagull, dolphin, whale, owl, eagle, lizard, fish) and exports assets/models/animals.glb.
# Each animal is an empty named after it; parts the game animates are separate children named "<animal>_<part>"
# with their origin at the joint (wingL/wingR at the shoulder, tail at its base, head at the neck).
# Front of every animal faces -Y in Blender (= +Z in the game); Z is up.
# Run headless:  blender.exe -b --factory-startup -P animals_build.py
import bpy, bmesh, math
from mathutils import Vector, Matrix

OUT = r"C:\Users\User\Documents\wombat-pet\assets\models\animals.glb"
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
scene = bpy.context.scene

def lin(h):
    h = h.lstrip('#'); c = [int(h[i:i+2], 16)/255 for i in (0, 2, 4)]
    return [x/12.92 if x <= 0.04045 else ((x + 0.055)/1.055)**2.4 for x in c]
def mat(name, hexc, rough=0.6):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name); m.use_nodes = True
    bs = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bs.inputs["Base Color"].default_value = (*lin(hexc), 1); bs.inputs["Roughness"].default_value = rough; bs.inputs["Metallic"].default_value = 0
    return m
def link(o, parent=None):
    scene.collection.objects.link(o)
    if parent: o.parent = parent
    return o
def empty(name, parent=None): return link(bpy.data.objects.new(name, None), parent)
def from_bm(name, bm, m, parent=None, smooth=True, sub=1):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = smooth
    me.materials.append(m); o = link(bpy.data.objects.new(name, me), parent)
    if sub: s = o.modifiers.new("sub", 'SUBSURF'); s.levels = sub; s.render_levels = sub
    return o

def loft(name, prof, m, parent=None, at=(0,0,0), seg=14, sub=1, flat=None):
    """Smooth body along -Y (front). prof: list of (y, half-width, half-height, z-offset) from nose to tail."""
    bm = bmesh.new(); rings = []
    for (y, rx, rz, zo) in prof:
        ring = []
        for i in range(seg):
            a = i/seg*2*math.pi; x, z = math.cos(a)*rx, math.sin(a)*rz
            if flat and z < 0: z *= flat   # flatter belly
            ring.append(bm.verts.new((x, y, z + zo)))
        rings.append(ring)
    for r0, r1 in zip(rings, rings[1:]):
        for i in range(seg): bm.faces.new((r0[i], r0[(i+1) % seg], r1[(i+1) % seg], r1[i]))
    for ring, rev in ((rings[0], True), (rings[-1], False)):
        c = bm.verts.new(sum((v.co for v in ring), Vector())/len(ring))
        for i in range(seg):
            f = (ring[i], ring[(i+1) % seg], c) if not rev else (ring[(i+1) % seg], ring[i], c)
            bm.faces.new(f)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = from_bm(name, bm, m, parent, True, sub); o.location = at; return o

def ball(name, r, m, at=(0,0,0), scale=(1,1,1), parent=None, seg=16, sub=0):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=max(6, seg//2), radius=r)
    bmesh.ops.transform(bm, matrix=Matrix.Diagonal((*scale, 1)), verts=bm.verts)
    o = from_bm(name, bm, m, parent, True, sub); o.location = at; return o

def cone(name, r1, r2, h, m, at=(0,0,0), rot=None, parent=None, seg=10):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=True, segments=seg, radius1=r1, radius2=r2, depth=h)
    if rot: bmesh.ops.rotate(bm, cent=Vector(), matrix=rot, verts=bm.verts)
    o = from_bm(name, bm, m, parent, True, 0); o.location = at; return o

def slab(name, pts, thick, m, parent=None, at=(0,0,0), sub=1):
    """A flat shape (wing, fin, fluke) from an outline in the XY plane, given thickness along Z."""
    bm = bmesh.new(); top = [bm.verts.new((x, y, thick/2)) for x, y in pts]; bot = [bm.verts.new((x, y, -thick/2)) for x, y in pts]
    bm.faces.new(top); bm.faces.new(list(reversed(bot)))
    n = len(pts)
    for i in range(n): bm.faces.new((top[i], bot[i], bot[(i+1) % n], top[(i+1) % n]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = from_bm(name, bm, m, parent, True, sub); o.location = at; return o

def eye(prefix, at, r, parent, white='#fbfbf6', iris=None):
    e = ball(prefix + "_eyeW", r, mat("EyeWhite", white, 0.2), at=at, parent=parent, seg=12)
    if iris: ball(prefix + "_iris", r*0.72, mat("Iris_" + iris, iris, 0.3), at=(at[0], at[1] - r*0.45, at[2]), parent=parent, seg=12)
    ball(prefix + "_pupil", r*0.42, mat("Pupil", '#101010', 0.15), at=(at[0], at[1] - r*0.78, at[2]), parent=parent, seg=10)
    return e

R = Matrix.Rotation

# ------------------------------------------------------------------ seagull
g = empty("gull")
WH, GR, YE, OR, BK = mat("GullWhite", '#f4f4f0', 0.7), mat("GullGrey", '#a9b2bb', 0.7), mat("Beak", '#f0c33c', 0.4), mat("Leg", '#e8894a', 0.5), mat("Tip", '#2a2a2a', 0.6)
loft("gull_body", [(-0.36, 0.001, 0.001, 0.02), (-0.3, 0.07, 0.07, 0.03), (-0.2, 0.11, 0.11, 0.02), (0.0, 0.13, 0.12, 0), (0.18, 0.1, 0.09, 0.01), (0.32, 0.05, 0.03, 0.03), (0.4, 0.001, 0.001, 0.04)], WH, g, (0, 0, 0.3))
cone("gull_beak", 0.03, 0.005, 0.12, YE, at=(0, -0.42, 0.33), rot=R(math.pi/2, 3, 'X'), parent=g)
for s, side in ((1, "L"), (-1, "R")):
    eye("gull_" + side, (0.055*s, -0.32, 0.36), 0.018, g)
    w = empty("gull_wing" + side, g); w.location = (0.1*s, -0.02, 0.36)
    slab("gull_wingM" + side, [(0, -0.08), (0.35*s, -0.1), (0.62*s, -0.04), (0.6*s, 0.06), (0.3*s, 0.12), (0, 0.1)], 0.025, GR, w)
    slab("gull_wingT" + side, [(0.58*s, -0.04), (0.78*s, 0.0), (0.6*s, 0.06)], 0.02, BK, w)
    cone("gull_leg" + side, 0.012, 0.012, 0.16, OR, at=(0.04*s, 0.05, 0.17), parent=g)
slab("gull_tail", [(-0.08, 0.32), (0.08, 0.32), (0.05, 0.46), (-0.05, 0.46)], 0.02, WH, g, (0, 0, 0.32))

# ------------------------------------------------------------------ dolphin
d = empty("dolphin")
DG, DB = mat("DolphinTop", '#6f8796', 0.35), mat("DolphinBelly", '#d7dde0', 0.4)
loft("dolphin_body", [(-1.15, 0.03, 0.03, -0.05), (-1.05, 0.08, 0.07, -0.05), (-0.9, 0.12, 0.1, -0.03), (-0.8, 0.2, 0.2, 0.03), (-0.5, 0.3, 0.3, 0.05), (0.0, 0.33, 0.33, 0.05),
     (0.5, 0.24, 0.23, 0.04), (0.9, 0.12, 0.13, 0.02), (1.15, 0.06, 0.06, 0.02), (1.25, 0.001, 0.001, 0.02)], DG, d, sub=1)
loft("dolphin_belly", [(-1.0, 0.05, 0.03, -0.07), (-0.7, 0.18, 0.12, -0.12), (0.0, 0.27, 0.2, -0.13), (0.6, 0.17, 0.12, -0.08), (0.95, 0.06, 0.05, -0.02)], DB, d, sub=1)
VF = (0, -math.pi/2, 0)   # vertical fins: outline given as (up, along the body)
slab("dolphin_dorsal", [(0, -0.15), (0, 0.25), (0.32, 0.14), (0.28, 0.04)], 0.05, DG, d, (0, -0.05, 0.28)).rotation_euler = VF
for s, side in ((1, "L"), (-1, "R")):
    fl = slab("dolphin_flipper" + side, [(0, 0), (0.32*s, 0.12), (0.3*s, 0.2), (0, 0.12)], 0.04, DG, d, (0.25*s, -0.45, -0.12)); fl.rotation_euler = (0, 0.4*s, 0)
    eye("dolphin_" + side, (0.2*s, -0.82, 0.05), 0.03, d)
t = empty("dolphin_tail", d); t.location = (0, 1.15, 0.02)
slab("dolphin_fluke", [(0, -0.05), (0.38, 0.18), (0.32, 0.26), (0.0, 0.14), (-0.32, 0.26), (-0.38, 0.18)], 0.04, DG, t)

# ------------------------------------------------------------------ whale (humpback)
w = empty("whale")
WG, WB = mat("WhaleTop", '#3f4f63', 0.5), mat("WhaleBelly", '#c9cfd4', 0.6)
loft("whale_body", [(-4.0, 0.2, 0.15, -0.2), (-3.6, 0.8, 0.6, -0.15), (-2.6, 1.3, 1.1, 0), (-1.0, 1.5, 1.3, 0.1), (0.8, 1.3, 1.15, 0.1), (2.4, 0.8, 0.7, 0.05), (3.6, 0.35, 0.3, 0.05), (4.3, 0.15, 0.12, 0.05)], WG, w, sub=1, flat=0.8)
loft("whale_belly", [(-3.7, 0.5, 0.3, -0.4), (-2.6, 1.05, 0.6, -0.65), (-1.0, 1.2, 0.7, -0.75), (0.6, 1.0, 0.6, -0.65), (1.8, 0.6, 0.3, -0.4)], WB, w, sub=1)
for i in range(7):
    cone("whale_groove%d" % i, 0.03, 0.03, 2.4, mat("Groove", '#9aa2a8', 0.7), at=((i - 3)*0.25, -2.0, -1.12), rot=R(math.pi/2, 3, 'X'), parent=w)
for s, side in ((1, "L"), (-1, "R")):
    pf = slab("whale_pec" + side, [(0, 0), (2.4*s, 0.5), (2.6*s, 0.8), (0.1*s, 0.6)], 0.12, WG, w, (1.2*s, -1.6, -0.6)); pf.rotation_euler = (0, -0.5*s, 0)
    eye("whale_" + side, (1.15*s, -2.9, -0.15), 0.1, w)
cone("whale_dorsal", 0.35, 0.05, 0.5, WG, at=(0, 1.8, 0.95), parent=w)
t = empty("whale_tail", w); t.location = (0, 4.2, 0.05)
slab("whale_fluke", [(0, -0.2), (1.5, 0.5), (1.3, 1.0), (0.4, 0.75), (0, 0.6), (-0.4, 0.75), (-1.3, 1.0), (-1.5, 0.5)], 0.14, WG, t)

# ------------------------------------------------------------------ owl
o = empty("owl")
OB, OL, OFc, OY = mat("OwlBrown", '#8a6a4a', 0.9), mat("OwlLight", '#d8c3a2', 0.9), mat("OwlFace", '#efe2c8', 0.9), mat("OwlBeak", '#6b5a3a', 0.5)
ball("owl_body", 0.2, OB, at=(0, 0.02, 0.24), scale=(1, 0.9, 1.25), parent=o, seg=20, sub=1)
ball("owl_chest", 0.15, OL, at=(0, -0.08, 0.2), scale=(1, 0.6, 1.1), parent=o, seg=16, sub=1)
h = empty("owl_head", o); h.location = (0, 0, 0.48)
ball("owl_headball", 0.17, OB, at=(0, 0, 0.02), scale=(1.1, 1, 0.95), parent=h, seg=20, sub=1)
for s, side in ((1, "L"), (-1, "R")):
    ball("owl_disc" + side, 0.085, OFc, at=(0.065*s, -0.12, 0.03), scale=(1, 0.4, 1), parent=h, seg=14)
    eye("owl_" + side, (0.065*s, -0.15, 0.035), 0.045, h, iris='#f2b81f')
    cone("owl_tuft" + side, 0.04, 0.005, 0.12, OB, at=(0.11*s, 0.0, 0.17), rot=R(-0.3*s, 3, 'Y'), parent=h)
    wg = empty("owl_wing" + side, o); wg.location = (0.17*s, 0.0, 0.35)
    ball("owl_wingball" + side, 0.12, OB, at=(0.02*s, 0.02, -0.12), scale=(0.35, 0.8, 1.3), parent=wg, seg=14, sub=1)
    cone("owl_toe" + side, 0.02, 0.01, 0.06, OY, at=(0.06*s, -0.1, 0.02), rot=R(math.pi/2, 3, 'X'), parent=o)
cone("owl_beak", 0.025, 0.002, 0.07, OY, at=(0, -0.16, -0.01), rot=R(math.pi*0.65, 3, 'X'), parent=h)

# ------------------------------------------------------------------ eagle
e = empty("eagle")
EB, EW, EY, EF = mat("EagleBrown", '#5a3e2a', 0.8), mat("EagleWhite", '#f2efe8', 0.8), mat("EagleBeak", '#f0b62e', 0.4), mat("EagleFeather", '#3f2a1c', 0.8)
loft("eagle_body", [(-0.3, 0.06, 0.06, 0.05), (-0.22, 0.13, 0.13, 0.03), (0.0, 0.17, 0.16, 0), (0.25, 0.12, 0.1, 0), (0.42, 0.05, 0.04, 0.02)], EB, e, (0, 0, 0.0))
ball("eagle_head", 0.1, EW, at=(0, -0.38, 0.1), scale=(0.9, 1.15, 0.95), parent=e, seg=16, sub=1)
cone("eagle_beak", 0.035, 0.008, 0.1, EY, at=(0, -0.5, 0.08), rot=R(math.pi/2 + 0.3, 3, 'X'), parent=e)
for s, side in ((1, "L"), (-1, "R")):
    eye("eagle_" + side, (0.055*s, -0.43, 0.13), 0.016, e, iris='#e8b030')
    wg = empty("eagle_wing" + side, e); wg.location = (0.12*s, -0.05, 0.06)
    slab("eagle_wingM" + side, [(0, -0.12), (0.5*s, -0.16), (0.95*s, -0.1), (0.95*s, 0.12), (0.5*s, 0.2), (0, 0.16)], 0.03, EB, wg)
    for k in range(5):   # spread primary feathers at the wing tip
        y0 = -0.08 + k*0.05
        slab("eagle_feather%d%s" % (k, side), [(0.93*s, y0), (1.22*s, y0 - 0.02 + k*0.012), (1.2*s, y0 + 0.03 + k*0.012), (0.93*s, y0 + 0.04)], 0.015, EF, wg, sub=0)
slab("eagle_tail", [(-0.07, 0.38), (0.07, 0.38), (0.14, 0.62), (-0.14, 0.62)], 0.02, EW, e, (0, 0, 0.02))

# ------------------------------------------------------------------ lizard
l = empty("lizard")
LG, LB = mat("LizardGreen", '#6f9a3a', 0.5), mat("LizardBelly", '#d8d79a', 0.6)
loft("lizard_body", [(-0.2, 0.001, 0.001, 0.035), (-0.18, 0.03, 0.022, 0.035), (-0.13, 0.04, 0.03, 0.035), (-0.08, 0.03, 0.025, 0.035), (0.0, 0.05, 0.035, 0.035), (0.1, 0.045, 0.03, 0.035), (0.15, 0.03, 0.02, 0.03)], LG, l, flat=0.6)
for s, side in ((1, "L"), (-1, "R")):
    eye("lizard_" + side, (0.028*s, -0.15, 0.06), 0.011, l, iris='#d9a420')
    for y in (-0.05, 0.11):
        lg = cone("lizard_leg%s%d" % (side, int(y*100)), 0.012, 0.008, 0.08, LG, at=(0.06*s, y, 0.02), rot=R(math.pi/2, 3, 'Y'), parent=l)
t = empty("lizard_tail", l); t.location = (0, 0.15, 0.03)
loft("lizard_tailmesh", [(0.0, 0.028, 0.02, 0), (0.12, 0.018, 0.013, 0), (0.25, 0.008, 0.006, -0.01), (0.34, 0.001, 0.001, -0.015)], LG, t)
for i in range(6): ball("lizard_spot%d" % i, 0.012, mat("LizardSpot", '#3f6a2a', 0.5), at=((i % 2 - 0.5)*0.04, -0.08 + i*0.04, 0.065), scale=(1, 1, 0.4), parent=l, seg=8)

# ------------------------------------------------------------------ fish (river / sea); FishBody and FishSpot are recoloured in the game
f = empty("fish")
FB, FS, FF = mat("FishBody", '#f08a3c', 0.35), mat("FishSpot", '#ffffff', 0.4), mat("FishFin", '#f6b26b', 0.4)
loft("fish_body", [(-0.16, 0.001, 0.001, 0), (-0.14, 0.03, 0.04, 0), (-0.08, 0.055, 0.075, 0.005), (0.02, 0.06, 0.08, 0.005), (0.12, 0.035, 0.05, 0), (0.2, 0.012, 0.018, 0)], FB, f)
ball("fish_spot1", 0.03, FS, at=(0, -0.02, 0.07), scale=(1.4, 1.6, 0.5), parent=f, seg=10)
ball("fish_spot2", 0.025, FS, at=(0, 0.07, 0.05), scale=(1.4, 1.4, 0.5), parent=f, seg=10)
slab("fish_dorsal", [(0, -0.05), (0, 0.07), (0.06, 0.05)], 0.008, FF, f, (0, 0, 0.07)).rotation_euler = VF
for s, side in ((1, "L"), (-1, "R")):
    eye("fish_" + side, (0.042*s, -0.1, 0.02), 0.012, f)
    pf = slab("fish_pec" + side, [(0, 0), (0.07*s, 0.03), (0.05*s, 0.06)], 0.006, FF, f, (0.05*s, -0.04, -0.02))
t = empty("fish_tail", f); t.location = (0, 0.19, 0)
slab("fish_fin", [(0, 0), (0.09, 0.13), (0, 0.08), (-0.09, 0.13)], 0.008, FF, t).rotation_euler = VF

# ------------------------------------------------------------------ export
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_apply=True, export_yup=True)
print("EXPORTED", OUT, len(bpy.data.objects))
