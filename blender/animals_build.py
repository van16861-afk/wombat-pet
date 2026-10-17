# Builds the wild animals and exports assets/models/animals.glb (run headless:
#   blender.exe -b --factory-startup -P animals_build.py ).
# Every body is "organic": simple shapes are merged, voxel-remeshed and smoothed into ONE soft surface, then painted with
# vertex colours (alpha = fur length) so the game can draw fur or feathers on it the same way as the wombat.
# Parts the game animates are separate objects named "<animal>_<part>" with their origin at the joint
# (wingL/wingR at the shoulder, tail at its base, head/neck at the neck, legXX at the hip, jaw at the hinge).
# Meshes whose name ends in "_fur" get fur/feather shells in the game; eyes, beaks and claws are plain glossy parts.
# Front faces -Y in Blender (= +Z in the game); Z is up.
import bpy, bmesh, math, random
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

OUT = r"C:\Users\User\Documents\wombat-pet\assets\models\animals.glb"
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
scene = bpy.context.scene
random.seed(3)
R = Matrix.Rotation

def lin(h):
    h = h.lstrip('#'); c = [int(h[i:i+2], 16)/255 for i in (0, 2, 4)]
    return [x/12.92 if x <= 0.04045 else ((x + 0.055)/1.055)**2.4 for x in c]
def mixc(a, b, t): return [a[i] + (b[i] - a[i])*t for i in range(3)]
def mat(name, hexc, rough=0.5, emit=None):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name); m.use_nodes = True
    bs = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bs.inputs["Base Color"].default_value = (*lin(hexc), 1); bs.inputs["Roughness"].default_value = rough; bs.inputs["Metallic"].default_value = 0
    return m
FURMAT = mat("Fur", '#ffffff', 0.9)
def link(o, parent=None, at=None):
    scene.collection.objects.link(o)
    if parent: o.parent = parent
    if at is not None: o.location = at
    return o
def empty(name, parent=None, at=(0, 0, 0)): return link(bpy.data.objects.new(name, None), parent, at)

# ---------- primitives as bmesh (in the piece's local space) ----------
def bm_ball(r, at=(0, 0, 0), scale=(1, 1, 1), rot=None, seg=20):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=max(8, seg//2), radius=r)
    bmesh.ops.transform(bm, matrix=Matrix.Diagonal((*scale, 1)), verts=bm.verts)
    if rot: bmesh.ops.rotate(bm, cent=Vector(), matrix=rot, verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(at), verts=bm.verts); return bm
def bm_tube(prof, axis='Y', seg=16, rot=None, at=(0, 0, 0)):
    """prof: (t, half-width, half-height, offset-up) along the axis; closed ends."""
    bm = bmesh.new(); rings = []
    for (t, rx, rz, zo) in prof:
        ring = []
        for i in range(seg):
            a = i/seg*2*math.pi; x, z = math.cos(a)*rx, math.sin(a)*rz + zo
            ring.append(bm.verts.new((x, t, z) if axis == 'Y' else (t, x, z) if axis == 'X' else (x, z, t)))
        rings.append(ring)
    for r0, r1 in zip(rings, rings[1:]):
        for i in range(seg): bm.faces.new((r0[i], r0[(i+1) % seg], r1[(i+1) % seg], r1[i]))
    for ring in (rings[0], rings[-1]):
        c = bm.verts.new(sum((v.co for v in ring), Vector())/len(ring))
        for i in range(seg): bm.faces.new((ring[i], ring[(i+1) % seg], c))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if rot: bmesh.ops.rotate(bm, cent=Vector(), matrix=rot, verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(at), verts=bm.verts); return bm
def bm_cone(r1, r2, h, at=(0, 0, 0), rot=None, seg=14):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=True, segments=seg, radius1=r1, radius2=r2, depth=h)
    if rot: bmesh.ops.rotate(bm, cent=Vector(), matrix=rot, verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(at), verts=bm.verts); return bm
def limb(a, b, r1, r2, seg=12):
    """A tapered limb from point a to point b."""
    a, b = Vector(a), Vector(b); d = b - a; L = d.length
    bm = bm_cone(r1, r2, L, seg=seg); bmesh.ops.translate(bm, vec=Vector((0, 0, L/2)), verts=bm.verts)
    q = Vector((0, 0, 1)).rotation_difference(d.normalized()); bmesh.ops.rotate(bm, cent=Vector(), matrix=q.to_matrix(), verts=bm.verts)
    bmesh.ops.translate(bm, vec=a, verts=bm.verts); return bm

class Piece:
    """Collects shapes, each with a colour and fur length; build() merges them into one smooth painted mesh."""
    def __init__(self, name, voxel, target=None): self.name, self.voxel, self.shapes, self.paint = name, voxel, [], []; self.target = target or (1500 if "body" in name else 380)
    def add(self, bm, color, fur=1.0): self.shapes.append((bm, lin(color) if isinstance(color, str) else color, fur)); return self
    def build(self, parent=None, at=(0, 0, 0), smooth=6, shade=None):
        big = bmesh.new(); trees = []
        for bm, col, fur in self.shapes:
            me = bpy.data.meshes.new("tmp"); bm.to_mesh(me); big.from_mesh(me); bpy.data.meshes.remove(me)
            trees.append((BVHTree.FromBMesh(bm), col, fur))
        me = bpy.data.meshes.new(self.name + "_src"); big.to_mesh(me); big.free()
        src = link(bpy.data.objects.new(self.name + "_src", me))
        rm = src.modifiers.new("remesh", 'REMESH'); rm.mode = 'VOXEL'; rm.voxel_size = self.voxel; rm.adaptivity = 0
        sm = src.modifiers.new("smooth", 'SMOOTH'); sm.factor = 0.6; sm.iterations = smooth
        dg = bpy.context.evaluated_depsgraph_get(); ev = src.evaluated_get(dg)
        out = bpy.data.meshes.new_from_object(ev); bpy.data.objects.remove(src, do_unlink=True); bpy.data.meshes.remove(me)
        # keep it light for phones: simplify to about `self.target` triangles
        if len(out.polygons) > self.target:
            tmp = link(bpy.data.objects.new(self.name + "_dec", out)); dm = tmp.modifiers.new("dec", 'DECIMATE'); dm.ratio = self.target/len(out.polygons)
            ev2 = tmp.evaluated_get(bpy.context.evaluated_depsgraph_get()); out2 = bpy.data.meshes.new_from_object(ev2)
            bpy.data.objects.remove(tmp, do_unlink=True); bpy.data.meshes.remove(out); out = out2
        # paint: blend the colours of the nearest shapes (soft seams), then optional shading rules
        ca = out.color_attributes.new("Col", 'FLOAT_COLOR', 'POINT')
        for v in out.vertices:
            acc, wsum, fur = [0, 0, 0], 0, 0
            for tree, col, f in trees:
                hit = tree.find_nearest(v.co)
                if not hit[0]: continue
                inside = 0
                w = math.exp(-max(hit[3], 0)/(self.voxel*1.6))
                acc = [acc[i] + col[i]*w for i in range(3)]; wsum += w; fur += f*w
            c = [x/max(wsum, 1e-6) for x in acc]; fz = fur/max(wsum, 1e-6)
            if shade: c, fz = shade(v.co, c, fz)
            ca.data[v.index].color = (*c, fz)
        out.color_attributes.active_color = ca
        for p in out.polygons: p.use_smooth = True
        out.materials.append(FURMAT)
        o = link(bpy.data.objects.new(self.name, out), parent, at); return o

def solid(name, bm, m, parent=None, at=(0, 0, 0), sub=1):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    me.materials.append(m); o = link(bpy.data.objects.new(name, me), parent, at)
    if sub: s = o.modifiers.new("sub", 'SUBSURF'); s.levels = sub; s.render_levels = sub
    return o
EYE_W, PUPIL, SHINE = mat("EyeWhite", '#f8f8f2', 0.15), mat("Pupil", '#0d0d0d', 0.08), mat("Shine", '#ffffff', 0.05)
def eye(prefix, at, r, parent, iris=None, look=(0, -1, 0)):
    """A glossy eye: (white or coloured) ball, pupil and a small highlight, looking along `look`."""
    d = Vector(look).normalized(); at = Vector(at)
    solid(prefix + "_eye", bm_ball(r, seg=10), mat("Iris_" + iris, iris, 0.15) if iris else EYE_W, parent, at, 0)
    solid(prefix + "_pupil", bm_ball(r*(0.55 if iris else 0.62), scale=(1, 0.5, 1), seg=8), PUPIL, parent, at + d*r*0.72, 0)
    solid(prefix + "_shine", bm_ball(r*0.18, seg=6), SHINE, parent, at + d*r*0.95 + Vector((r*0.3, 0, r*0.35)), 0)

# ================================================================== birds
# ---------- seagull ----------
def gull():
    g = empty("gull"); W_, G_, BK = '#f5f5f2', '#aab4be', '#2c2c2c'
    p = Piece("gull_body_fur", 0.012)
    p.add(bm_tube([(-0.16, 0.001, 0.001, 0.02), (-0.1, 0.09, 0.09, 0.02), (0.0, 0.12, 0.11, 0.0), (0.14, 0.09, 0.08, 0.0), (0.26, 0.04, 0.03, 0.02), (0.3, 0.001, 0.001, 0.03)], at=(0, 0, 0.3)), W_, 0.5)
    p.add(bm_ball(0.075, at=(0, -0.2, 0.38)), W_, 0.4).add(bm_ball(0.06, at=(0, -0.13, 0.35), scale=(1, 1.3, 1)), W_, 0.4)
    p.add(bm_ball(0.1, at=(0, 0.06, 0.37), scale=(1.05, 1.6, 0.35)), G_, 0.4)              # grey back
    p.add(bm_tube([(0.24, 0.05, 0.015, 0), (0.36, 0.06, 0.01, 0)], at=(0, 0, 0.33)), W_, 0.3)   # tail
    p.build(g)
    solid("gull_beak", bm_cone(0.022, 0.006, 0.1, rot=R(math.pi/2, 3, 'X')), mat("GullBeak", '#f1c33a', 0.3), g, (0, -0.31, 0.37), 1)
    solid("gull_beakdot", bm_ball(0.008), mat("Red", '#d8452f'), g, (0, -0.33, 0.355), 0)
    for s, side in ((1, "L"), (-1, "R")):
        eye("gull_" + side, (0.045*s, -0.235, 0.405), 0.013, g, look=(0.4*s, -1, 0.1))
        w = empty("gull_wing" + side, g, (0.09*s, -0.02, 0.37))
        wp = Piece("gull_wing%s_fur" % side, 0.01)
        wp.add(bm_tube([(0.0, 0.11, 0.025, 0), (0.25, 0.1, 0.02, 0), (0.5, 0.07, 0.015, 0), (0.68, 0.035, 0.008, 0), (0.74, 0.005, 0.004, 0)], axis='X'), G_, 0.3)
        wp.add(bm_ball(0.06, at=(0.66, 0.0, 0), scale=(1.8, 0.7, 0.2)), BK, 0.2)
        wo = wp.build(w); wo.scale.x = s
        for k in (-1, 1): solid("gull_leg%s%d" % (side, k), limb((0.04*s, 0.04, 0.24), (0.04*s, 0.05, 0.08), 0.012, 0.01), mat("GullLeg", '#e8894a'), g)
    return g

# ---------- eagle ----------
def eagle():
    g = empty("eagle"); BR, DK, WH = '#5b3f2b', '#3a271a', '#f4f1ea'
    p = Piece("eagle_body_fur", 0.014)
    p.add(bm_tube([(-0.22, 0.001, 0.001, 0.0), (-0.15, 0.1, 0.1, 0), (0.0, 0.15, 0.14, -0.01), (0.2, 0.11, 0.1, 0), (0.32, 0.05, 0.04, 0.01)], at=(0, 0, 0)), BR, 0.6)
    p.add(bm_ball(0.09, at=(0, -0.28, 0.08), scale=(0.95, 1.15, 0.95)), WH, 0.5).add(bm_ball(0.075, at=(0, -0.2, 0.05)), WH, 0.5)
    p.add(bm_tube([(0.28, 0.06, 0.015, 0), (0.48, 0.12, 0.012, 0)], at=(0, 0, 0.02)), WH, 0.4)
    p.add(bm_ball(0.06, at=(0.07, 0.05, -0.12)), BR, 0.6).add(bm_ball(0.06, at=(-0.07, 0.05, -0.12)), BR, 0.6)   # feathered "trousers"
    p.build(g)
    hb = bm_cone(0.032, 0.006, 0.09, rot=R(math.pi/2 + 0.45, 3, 'X')); solid("eagle_beak", hb, mat("EagleBeak", '#f0b62e', 0.3), g, (0, -0.37, 0.065), 1)
    for s, side in ((1, "L"), (-1, "R")):
        eye("eagle_" + side, (0.045*s, -0.33, 0.11), 0.014, g, iris='#e8b030', look=(0.5*s, -1, 0))
        solid("eagle_brow" + side, bm_ball(0.02, scale=(1.6, 0.8, 0.5)), mat("EagleBrowM", '#efe9dc', 0.6), g, (0.045*s, -0.33, 0.13), 0)
        w = empty("eagle_wing" + side, g, (0.11*s, -0.04, 0.05))
        wp = Piece("eagle_wing%s_fur" % side, 0.012)
        wp.add(bm_tube([(0.0, 0.16, 0.03, 0), (0.4, 0.17, 0.025, 0), (0.8, 0.13, 0.02, 0), (0.95, 0.08, 0.015, 0)], axis='X'), BR, 0.35)
        for k in range(5):
            wp.add(bm_tube([(0.0, 0.025, 0.01, 0), (0.25, 0.022, 0.008, 0), (0.33, 0.002, 0.002, 0)], axis='X', at=(0.88, -0.09 + k*0.045, 0), rot=R((k - 2)*0.12, 3, 'Z')), DK, 0.2)
        wo = wp.build(w); wo.scale.x = s
        for k in (-1, 1): solid("eagle_talon%s%d" % (side, k), bm_cone(0.012, 0.004, 0.06, rot=R(math.pi/2, 3, 'X')), mat("Talon", '#f0c040'), g, (0.07*s + k*0.015, 0.0, -0.2), 0)
    return g

# ---------- owl ----------
def owl():
    g = empty("owl"); BR, LT, FC = '#8a6a4a', '#d9c4a2', '#f1e6cf'
    p = Piece("owl_body_fur", 0.012)
    p.add(bm_ball(0.19, at=(0, 0.02, 0.22), scale=(1, 0.9, 1.2)), BR, 1.0).add(bm_ball(0.14, at=(0, -0.08, 0.18), scale=(1, 0.6, 1.15)), LT, 1.0)
    for s in (1, -1): p.add(bm_ball(0.045, at=(0.06*s, -0.07, 0.02), scale=(1, 1.2, 0.6)), LT, 1.0)
    p.build(g)
    h = empty("owl_head", g, (0, 0, 0.44))
    hp = Piece("owl_headball_fur", 0.011)
    hp.add(bm_ball(0.165, at=(0, 0, 0.03), scale=(1.12, 0.95, 0.92)), BR, 1.0)
    for s in (1, -1):
        hp.add(bm_ball(0.08, at=(0.068*s, -0.11, 0.03), scale=(1.0, 0.45, 1.05)), FC, 0.6)        # facial disc, part of the head surface
        hp.add(bm_cone(0.035, 0.004, 0.11, at=(0.11*s, -0.01, 0.17), rot=R(-0.35*s, 3, 'Y')), BR, 0.7)   # ear tufts
    hp.build(h)
    for s, side in ((1, "L"), (-1, "R")):
        eye("owl_" + side, (0.066*s, -0.135, 0.04), 0.04, h, iris='#f2b81f', look=(0.12*s, -1, 0))   # iris material "Iris_#f2b81f" glows at night (game.js)
        w = empty("owl_wing" + side, g, (0.16*s, 0.02, 0.33))
        wp = Piece("owl_wing%s_fur" % side, 0.01)
        wp.add(bm_ball(0.1, at=(0.0, 0.03, -0.12), scale=(0.35, 0.85, 1.35)), BR, 0.6)
        wo = wp.build(w); wo.scale.x = s
        for k in (-1, 0, 1): solid("owl_toe%s%d" % (side, k), bm_cone(0.014, 0.004, 0.05, rot=R(math.pi/2, 3, 'X')), mat("OwlToe", '#7a6a4a'), g, (0.06*s + k*0.018, -0.1, 0.02), 0)
    solid("owl_beak", bm_cone(0.022, 0.003, 0.06, rot=R(math.pi*0.62, 3, 'X')), mat("OwlBeak", '#5f5135', 0.3), h, (0, -0.15, -0.01), 0)
    return g

# ---------- heron ----------
def heron():
    g = empty("heron"); GR, WH, DK = '#a2a9b0', '#eef0f0', '#2b2b2b'
    p = Piece("heron_body_fur", 0.014)
    p.add(bm_tube([(-0.2, 0.001, 0.001, 0), (-0.14, 0.12, 0.12, 0), (0.05, 0.15, 0.14, 0), (0.25, 0.1, 0.08, -0.02), (0.42, 0.04, 0.02, -0.06)], at=(0, 0, 1.0)), GR, 0.5)
    p.build(g)
    n = empty("heron_neck", g, (0, -0.16, 1.06))
    np_ = Piece("heron_neckP_fur", 0.012)
    np_.add(limb((0, 0, 0), (0, -0.08, 0.32), 0.05, 0.035), WH, 0.4).add(limb((0, -0.08, 0.32), (0, -0.14, 0.55), 0.035, 0.03), WH, 0.4)
    np_.add(bm_ball(0.06, at=(0, -0.17, 0.58), scale=(0.9, 1.3, 0.9)), WH, 0.4).add(bm_ball(0.03, at=(0, -0.17, 0.62), scale=(0.9, 1.5, 0.5)), DK, 0.3)
    np_.build(n)
    solid("heron_beak", bm_cone(0.025, 0.003, 0.26, rot=R(math.pi/2, 3, 'X')), mat("HeronBeak", '#e2b43c', 0.3), n, (0, -0.37, 0.58), 0)
    for s, side in ((1, "L"), (-1, "R")):
        eye("heron_" + side, (0.035*s, -0.21, 0.6), 0.012, n, iris='#f0d040', look=(0.6*s, -1, 0))
        solid("heron_leg" + side, limb((0.06*s, 0.0, 0.98), (0.07*s, 0.02, 0.0), 0.016, 0.012), mat("HeronLeg", '#d7b45a'), g)
    return g

# ================================================================== water animals
def dolphin():
    g = empty("dolphin")
    def shade(co, c, f): t = max(0, min(1, (co.z + 0.08)/0.2)); return mixc(lin('#dfe5e8'), lin('#6c8494'), t), 0
    p = Piece("dolphin_body", 0.022)
    p.add(bm_tube([(-1.15, 0.03, 0.03, -0.05), (-1.05, 0.08, 0.07, -0.05), (-0.9, 0.12, 0.1, -0.03), (-0.8, 0.2, 0.2, 0.03), (-0.5, 0.3, 0.3, 0.05), (0.0, 0.33, 0.33, 0.05),
            (0.5, 0.24, 0.23, 0.04), (0.9, 0.12, 0.13, 0.02), (1.15, 0.06, 0.06, 0.02), (1.22, 0.001, 0.001, 0.02)], seg=20), '#6c8494', 0)
    p.add(bm_tube([(0.0, 0.03, 0.17, 0), (0.15, 0.02, 0.1, 0.12), (0.26, 0.004, 0.02, 0.26)], at=(0, -0.05, 0.38)), '#6c8494', 0)   # dorsal fin
    for s in (1, -1): p.add(bm_tube([(0.0, 0.1, 0.02, 0), (0.18, 0.06, 0.015, -0.03), (0.3, 0.005, 0.005, -0.06)], axis='X', at=(0.25*s, -0.45, -0.12), rot=R(0.5*s, 3, 'Z') if s > 0 else R(math.pi - 0.5, 3, 'Z')), '#6c8494', 0)
    p.build(g, shade=shade)
    for s, side in ((1, "L"), (-1, "R")): eye("dolphin_" + side, (0.2*s, -0.8, 0.04), 0.028, g, look=(1*s, -0.6, 0))
    t = empty("dolphin_tail", g, (0, 1.1, 0.02))
    tp = Piece("dolphin_flukeP", 0.016)
    for s in (1, -1): tp.add(bm_tube([(0.0, 0.1, 0.025, 0), (0.25, 0.08, 0.02, 0.0), (0.4, 0.01, 0.01, 0.0)], axis='X', rot=R(-0.35*s, 3, 'Z') if s > 0 else R(math.pi + 0.35, 3, 'Z')), '#6c8494', 0)
    tp.build(t)
    return g

def whale():
    g = empty("whale")
    def shade(co, c, f):
        t = max(0, min(1, (co.z + 0.5)/0.6)); col = mixc(lin('#c9cfd4'), lin('#3f4f63'), t)
        if co.z < -0.55 and co.y < 1.2 and math.sin(co.x*14) > 0.6: col = mixc(col, lin('#8f989e'), 0.6)   # throat grooves
        return col, 0
    p = Piece("whale_body", 0.09)
    p.add(bm_tube([(-4.0, 0.25, 0.18, -0.2), (-3.6, 0.8, 0.6, -0.15), (-2.6, 1.3, 1.1, 0), (-1.0, 1.5, 1.3, 0.1), (0.8, 1.3, 1.15, 0.1), (2.4, 0.8, 0.7, 0.05), (3.6, 0.35, 0.3, 0.05), (4.3, 0.12, 0.1, 0.05)], seg=22), '#3f4f63', 0)
    p.add(bm_ball(0.4, at=(0, 1.8, 1.05), scale=(0.3, 1.0, 0.6)), '#3f4f63', 0)
    for s in (1, -1): p.add(bm_tube([(0.0, 0.35, 0.08, 0), (1.4, 0.3, 0.07, -0.25), (2.6, 0.1, 0.04, -0.5)], axis='X', at=(1.1*s, -1.5, -0.6), rot=None if s > 0 else R(math.pi, 3, 'Z')), '#3f4f63', 0)
    for i in range(8): p.add(bm_ball(0.09, at=((i % 3 - 1)*0.5, -3.3 + i*0.12, 0.55 + (i % 2)*0.1)), '#2f3a48', 0)   # knobbly snout bumps
    p.build(g, shade=shade)
    for s, side in ((1, "L"), (-1, "R")): eye("whale_" + side, (1.18*s, -2.9, -0.15), 0.1, g, look=(1*s, -0.4, 0))
    t = empty("whale_tail", g, (0, 4.15, 0.05))
    tp = Piece("whale_flukeP", 0.06)
    for s in (1, -1): tp.add(bm_tube([(0.0, 0.45, 0.09, 0), (0.9, 0.4, 0.07, 0.0), (1.55, 0.06, 0.03, 0.0)], axis='X', rot=R(-0.4*s, 3, 'Z') if s > 0 else R(math.pi + 0.4, 3, 'Z')), '#3f4f63', 0)
    tp.build(t)
    return g

def fish():
    # kept material-based so every fish can be recoloured (FishBody / FishSpot / FishFin)
    g = empty("fish")
    FB, FS, FF = mat("FishBody", '#f08a3c', 0.3), mat("FishSpot", '#ffffff', 0.35), mat("FishFin", '#f6b26b', 0.35)
    solid("fish_bodyM", bm_tube([(-0.16, 0.001, 0.001, 0), (-0.14, 0.03, 0.04, 0), (-0.08, 0.055, 0.075, 0.005), (0.02, 0.06, 0.08, 0.005), (0.12, 0.035, 0.05, 0), (0.2, 0.012, 0.018, 0)], seg=18), FB, g, sub=2)
    solid("fish_spot1", bm_ball(0.03, scale=(1.5, 1.7, 0.45)), FS, g, (0.0, -0.02, 0.068), 1)
    solid("fish_spot2", bm_ball(0.025, scale=(1.5, 1.5, 0.45)), FS, g, (0.0, 0.07, 0.048), 1)
    solid("fish_dorsal", bm_tube([(0.0, 0.004, 0.03, 0), (0.06, 0.003, 0.05, 0.02), (0.11, 0.002, 0.005, 0.03)], at=(0, -0.04, 0.07)), FF, g, sub=1)
    for s, side in ((1, "L"), (-1, "R")):
        eye("fish_" + side, (0.04*s, -0.1, 0.02), 0.012, g, look=(1*s, -0.5, 0))
        solid("fish_pec" + side, bm_ball(0.035, scale=(1.4, 0.8, 0.15), rot=R(0.4*s, 3, 'Y')), FF, g, (0.055*s, -0.04, -0.025), 1)
    t = empty("fish_tail", g, (0, 0.19, 0))
    solid("fish_fin", bm_tube([(0.0, 0.004, 0.02, 0), (0.08, 0.003, 0.07, 0), (0.12, 0.002, 0.08, 0)]), FF, t, sub=1)
    return g

# ================================================================== reptiles & amphibians (no fur: plain painted surface)
def lizard():
    g = empty("lizard")
    def shade(co, c, f):
        n = math.sin(co.x*90)*math.sin(co.y*70)
        col = mixc(lin('#e2dc9a'), c, max(0, min(1, (co.z - 0.012)/0.02)))
        if co.z > 0.04 and n > 0.55: col = mixc(col, lin('#3f6a2a'), 0.7)
        return col, 0
    p = Piece("lizard_body", 0.0045)
    p.add(bm_tube([(-0.2, 0.001, 0.001, 0.035), (-0.18, 0.028, 0.02, 0.035), (-0.13, 0.038, 0.028, 0.036), (-0.09, 0.026, 0.022, 0.036), (0.0, 0.05, 0.034, 0.036), (0.1, 0.045, 0.03, 0.035), (0.16, 0.028, 0.02, 0.03)], seg=18), '#6f9a3a', 0)
    for s in (1, -1):
        for y in (-0.06, 0.1):
            p.add(limb((0.03*s, y, 0.03), (0.08*s, y - 0.01, 0.02), 0.012, 0.01), '#6f9a3a', 0).add(limb((0.08*s, y - 0.01, 0.02), (0.1*s, y - 0.02, 0.0), 0.01, 0.008), '#6f9a3a', 0)
    p.build(g, shade=shade)
    for s, side in ((1, "L"), (-1, "R")): eye("lizard_" + side, (0.026*s, -0.15, 0.055), 0.01, g, iris='#d9a420', look=(1*s, -0.5, 0.2))
    t = empty("lizard_tail", g, (0, 0.15, 0.03))
    tp = Piece("lizard_tailP", 0.004); tp.add(bm_tube([(0.0, 0.026, 0.019, 0), (0.12, 0.016, 0.012, 0), (0.25, 0.007, 0.005, -0.008), (0.34, 0.001, 0.001, -0.012)], seg=14), '#6f9a3a', 0)
    tp.build(t, shade=shade)
    return g

def frog():
    g = empty("frog")
    def shade(co, c, f):
        col = mixc(lin('#e6e7b4'), lin('#5aa04a'), max(0, min(1, (co.z - 0.06)/0.06)))
        if co.z > 0.12 and math.sin(co.x*60 + 1)*math.sin(co.y*55) > 0.7: col = mixc(col, lin('#2f6a2e'), 0.6)
        return col, 0
    p = Piece("frog_body", 0.007)
    p.add(bm_ball(0.15, at=(0, 0.0, 0.1), scale=(1.0, 1.2, 0.68)), '#5aa04a', 0)
    p.add(bm_ball(0.1, at=(0, -0.13, 0.13), scale=(1.15, 0.9, 0.62)), '#5aa04a', 0)
    for s in (1, -1):
        p.add(bm_ball(0.045, at=(0.065*s, -0.15, 0.2)), '#5aa04a', 0)                            # eye bumps
        p.add(bm_ball(0.07, at=(0.13*s, 0.08, 0.06), scale=(0.8, 1.6, 0.6)), '#5aa04a', 0)        # folded thighs
        p.add(limb((0.14*s, 0.15, 0.03), (0.16*s, -0.02, 0.015), 0.03, 0.02), '#5aa04a', 0)
        p.add(limb((0.08*s, -0.14, 0.07), (0.1*s, -0.2, 0.01), 0.022, 0.016), '#5aa04a', 0)
    p.build(g, shade=shade)
    for s, side in ((1, "L"), (-1, "R")): eye("frog_" + side, (0.07*s, -0.17, 0.215), 0.032, g, iris='#d8b33a', look=(0.7*s, -1, 0.3))
    solid("frog_sac", bm_ball(0.06, scale=(1, 0.8, 0.7)), mat("FrogSac", '#f1efc3', 0.4), g, (0, -0.19, 0.06), 1)
    return g

def turtle():
    g = empty("turtle")
    def shade(co, c, f):
        if co.z > 0.06:
            a = math.atan2(co.y, co.x); hexish = math.sin(co.x*30)*math.sin(co.y*26)
            return mixc(lin('#5b6b3a'), lin('#7f8f4a'), 0.5 + 0.5*hexish), 0
        return c, 0
    p = Piece("turtle_body", 0.012)
    p.add(bm_ball(0.3, at=(0, 0, 0.04), scale=(1, 1.2, 0.55)), '#5b6b3a', 0)
    p.add(bm_ball(0.31, at=(0, 0, 0.0), scale=(1.02, 1.22, 0.12)), '#c9b77a', 0)                 # rim / underside
    p.add(bm_ball(0.085, at=(0, -0.42, 0.04), scale=(0.95, 1.3, 0.85)), '#7c9a52', 0).add(limb((0, -0.3, 0.02), (0, -0.4, 0.04), 0.05, 0.05), '#7c9a52', 0)
    for s in (1, -1):
        for y in (-0.22, 0.22): p.add(bm_ball(0.08, at=(0.28*s, y, -0.01), scale=(1.5, 0.9, 0.35)), '#7c9a52', 0)
    p.add(bm_cone(0.04, 0.0, 0.1, at=(0, 0.38, 0.0), rot=R(-math.pi/2, 3, 'X')), '#7c9a52', 0)
    p.build(g, shade=shade)
    for s, side in ((1, "L"), (-1, "R")): eye("turtle_" + side, (0.05*s, -0.48, 0.07), 0.017, g, look=(1*s, -0.6, 0.1))
    return g

def croc():
    g = empty("croc")
    def shade(co, c, f):
        col = mixc(lin('#b7b27a'), lin('#4c5c33'), max(0, min(1, (co.z - 0.08)/0.1)))
        if co.z > 0.24 and math.sin(co.y*22) > 0.3: col = mixc(col, lin('#3a4727'), 0.5)
        return col, 0
    p = Piece("croc_body", 0.02)
    p.add(bm_tube([(-0.55, 0.16, 0.1, 0.0), (-0.3, 0.32, 0.17, 0.02), (0.1, 0.38, 0.18, 0.03), (0.5, 0.3, 0.15, 0.02), (1.0, 0.18, 0.11, 0.0), (1.6, 0.09, 0.07, 0.0), (2.1, 0.02, 0.03, 0.0)], at=(0, 0, 0.16), seg=20), '#4c5c33', 0)
    for i in range(14): p.add(bm_cone(0.05, 0.005, 0.1, at=(((i % 2) - 0.5)*0.16, -0.25 + i*0.17, 0.32 - i*0.008)), '#3a4727', 0)   # back scutes
    for s in (1, -1):
        for y in (-0.3, 0.45):
            p.add(limb((0.28*s, y, 0.14), (0.42*s, y - 0.05, 0.08), 0.07, 0.06), '#4c5c33', 0).add(limb((0.42*s, y - 0.05, 0.08), (0.48*s, y - 0.12, 0.0), 0.06, 0.04), '#4c5c33', 0)
    p.build(g, shade=shade)
    hd = empty("croc_head", g, (0, -0.55, 0.18))
    hp = Piece("croc_upper", 0.012)
    hp.add(bm_tube([(0.0, 0.16, 0.08, 0.02), (-0.35, 0.12, 0.05, 0.0), (-0.75, 0.08, 0.035, -0.01), (-0.82, 0.06, 0.03, -0.01)], seg=16), '#4c5c33', 0)
    for s in (1, -1): hp.add(bm_ball(0.045, at=(0.08*s, -0.05, 0.08)), '#4c5c33', 0)
    hp.build(hd, shade=lambda co, c, f: (mixc(lin('#4c5c33'), lin('#3a4727'), 0.3), 0))
    for s, side in ((1, "L"), (-1, "R")):
        eye("croc_" + side, (0.08*s, -0.07, 0.115), 0.025, hd, iris='#c8b23a', look=(0.5*s, -1, 0.4))
        for k in range(5): solid("croc_tooth%s%d" % (side, k), bm_cone(0.012, 0.0, 0.035, rot=R(math.pi, 3, 'X')), mat("Tooth", '#f3efe0'), hd, (0.085*s, -0.2 - k*0.11, -0.02), 0)
    jaw = empty("croc_jaw", hd, (0, 0.0, -0.02))
    jp = Piece("croc_lower", 0.012); jp.add(bm_tube([(0.0, 0.14, 0.04, 0), (-0.4, 0.1, 0.03, 0), (-0.78, 0.06, 0.02, 0)], seg=14), '#b7b27a', 0); jp.build(jaw)
    return g

# ================================================================== mammals (furry)
def beaver():
    g = empty("beaver"); BR, DK = '#7a5233', '#4a3324'
    p = Piece("beaver_body_fur", 0.012)
    p.add(bm_ball(0.3, at=(0, 0.02, 0.26), scale=(1, 1.35, 0.85)), BR, 1.0)
    p.add(bm_ball(0.18, at=(0, -0.36, 0.36), scale=(1, 1.05, 0.9)), BR, 0.9)
    p.add(bm_ball(0.09, at=(0, -0.5, 0.31), scale=(1.15, 0.9, 0.8)), '#8e6646', 0.6)
    for s in (1, -1):
        p.add(bm_ball(0.045, at=(0.13*s, -0.3, 0.52), scale=(1, 0.6, 1)), DK, 0.4)
        p.add(limb((0.16*s, -0.22, 0.12), (0.17*s, -0.3, 0.0), 0.05, 0.04), DK, 0.6).add(limb((0.2*s, 0.2, 0.14), (0.22*s, 0.24, 0.0), 0.07, 0.05), DK, 0.6)
    p.build(g)
    solid("beaver_nose", bm_ball(0.035, scale=(1.3, 0.9, 0.8)), mat("Nose", '#1e1612', 0.15), g, (0, -0.585, 0.36), 0)
    solid("beaver_teeth", bm_ball(0.05, scale=(0.8, 0.25, 0.9)), mat("BeaverTeeth", '#f0b83a', 0.25), g, (0, -0.56, 0.24), 0)
    for s, side in ((1, "L"), (-1, "R")): eye("beaver_" + side, (0.09*s, -0.47, 0.44), 0.025, g, look=(0.6*s, -1, 0.1))
    t = empty("beaver_tail", g, (0, 0.38, 0.12))
    def scales(co, c, f): return (lin('#3a2a20') if math.sin(co.x*80)*math.sin(co.y*80) > 0 else lin('#4b3727')), 0
    tp = Piece("beaver_tailP", 0.01); tp.add(bm_ball(0.15, at=(0, 0.17, 0), scale=(0.95, 1.6, 0.18)), '#3a2a20', 0); tp.build(t, shade=scales)
    return g

def kangaroo():
    g = empty("kangaroo"); BR, LT = '#b77a4e', '#e9d0b0'
    def shade(co, c, f):   # paler chest and belly
        if co.y < -0.05 and 0.4 < co.z < 1.15 and abs(co.x) < 0.2: return mixc(c, lin(LT), 0.75), f
        return c, f
    p = Piece("kangaroo_body_fur", 0.018)
    p.add(bm_ball(0.33, at=(0, 0.02, 0.8), scale=(0.85, 0.95, 1.25), rot=R(-0.3, 3, 'X')), BR, 1.0)
    p.add(limb((0, 0.05, 1.12), (0, -0.05, 1.35), 0.13, 0.1), BR, 1.0)
    p.add(bm_ball(0.15, at=(0, -0.12, 1.43), scale=(0.9, 1.25, 0.9)), BR, 0.8).add(bm_ball(0.07, at=(0, -0.3, 1.38), scale=(1, 1.2, 0.85)), BR, 0.6)
    for s in (1, -1):
        p.add(bm_ball(0.06, at=(0.08*s, -0.05, 1.62), scale=(0.6, 0.4, 1.7), rot=R(-0.25*s, 3, 'Y')), BR, 0.6)              # ears
        p.add(bm_ball(0.17, at=(0.16*s, 0.12, 0.45), scale=(0.75, 1.3, 1.25)), BR, 1.0)                                     # thighs
        p.add(limb((0.16*s, 0.05, 0.3), (0.17*s, -0.05, 0.05), 0.07, 0.05), BR, 0.7).add(limb((0.17*s, 0.05, 0.03), (0.17*s, -0.35, 0.02), 0.05, 0.035), '#8a5a38', 0.4)   # long feet
        p.add(limb((0.12*s, -0.2, 1.08), (0.13*s, -0.32, 0.88), 0.04, 0.03), BR, 0.6)                                       # little arms
    p.add(limb((0, 0.3, 0.45), (0, 0.85, 0.08), 0.13, 0.05), BR, 0.8)                                                       # tail
    p.build(g, shade=shade)
    solid("kangaroo_nose", bm_ball(0.03, scale=(1.3, 0.8, 0.9)), mat("Nose", '#1e1612', 0.15), g, (0, -0.37, 1.4), 0)
    for s, side in ((1, "L"), (-1, "R")): eye("kangaroo_" + side, (0.075*s, -0.25, 1.48), 0.025, g, look=(0.7*s, -1, 0))
    j = empty("kangaroo_joey", g, (0, -0.24, 0.88))
    jp = Piece("kangaroo_joeyP_fur", 0.01); jp.add(bm_ball(0.07, scale=(0.9, 1.1, 0.9)), BR, 0.8)
    for s in (1, -1): jp.add(bm_ball(0.025, at=(0.04*s, 0.02, 0.07), scale=(0.6, 0.4, 1.6)), BR, 0.5)
    jp.build(j)
    for s, side in ((1, "L"), (-1, "R")): eye("kangaroo_joey" + side, (0.03*s, -0.06, 0.02), 0.012, j, look=(0.5*s, -1, 0))
    return g

def quokka():
    g = empty("quokka"); BR, FC = '#8c6a4c', '#a8896c'
    p = Piece("quokka_body_fur", 0.009)
    p.add(bm_ball(0.2, at=(0, 0.02, 0.24), scale=(0.95, 1.05, 1.1)), BR, 1.0)
    p.add(bm_ball(0.14, at=(0, -0.08, 0.45), scale=(1.05, 1.0, 0.95)), FC, 0.8).add(bm_ball(0.06, at=(0, -0.2, 0.42), scale=(1.1, 0.9, 0.8)), '#b8987a', 0.5)
    for s in (1, -1):
        p.add(bm_ball(0.05, at=(0.09*s, -0.02, 0.58), scale=(1, 0.5, 1.05)), BR, 0.6)
        p.add(limb((0.1*s, 0.05, 0.12), (0.11*s, -0.08, 0.02), 0.05, 0.035), BR, 0.6).add(limb((0.07*s, -0.12, 0.3), (0.08*s, -0.16, 0.16), 0.025, 0.02), BR, 0.6)
    p.add(limb((0, 0.18, 0.12), (0, 0.38, 0.04), 0.04, 0.02), BR, 0.6)
    p.build(g)
    solid("quokka_nose", bm_ball(0.025, scale=(1.3, 0.8, 0.9)), mat("Nose", '#1e1612', 0.15), g, (0, -0.255, 0.44), 0)
    solid("quokka_smile", bm_ball(0.035, scale=(1.2, 0.3, 0.35)), mat("Smile", '#3a2418', 0.4), g, (0, -0.25, 0.405), 0)
    for s, side in ((1, "L"), (-1, "R")): eye("quokka_" + side, (0.055*s, -0.19, 0.49), 0.021, g, look=(0.5*s, -1, 0))
    return g

def emu():
    g = empty("emu"); FE = '#5d4f42'
    p = Piece("emu_body_fur", 0.02)
    p.add(bm_ball(0.42, at=(0, 0.05, 1.05), scale=(0.85, 1.2, 0.78)), FE, 1.0)
    p.add(bm_ball(0.2, at=(0, 0.45, 1.0), scale=(0.9, 1, 0.9)), FE, 1.0)
    for s in (1, -1): p.add(bm_ball(0.09, at=(0.12*s, 0.0, 0.75), scale=(0.9, 1, 1.3)), FE, 0.9)
    p.build(g)
    n = empty("emu_neck", g, (0, -0.28, 1.2))
    np_ = Piece("emu_neckP_fur", 0.012)
    np_.add(limb((0, 0, 0), (0, -0.12, 0.62), 0.07, 0.05), '#6a7790', 0.4).add(bm_ball(0.075, at=(0, -0.17, 0.68), scale=(0.9, 1.35, 0.9)), '#5d6b86', 0.3)
    np_.build(n)
    solid("emu_beak", bm_cone(0.03, 0.006, 0.1, rot=R(math.pi/2, 3, 'X')), mat("EmuBeak", '#3b3530', 0.3), n, (0, -0.3, 0.67), 0)
    for s, side in ((1, "L"), (-1, "R")):
        eye("emu_" + side, (0.045*s, -0.22, 0.72), 0.018, n, iris='#a05a2a', look=(0.8*s, -1, 0))
        legs = empty("emu_leg" + side, g, (0.13*s, 0.05, 0.78))
        solid("emu_legM" + side, limb((0, 0, 0), (0, 0.06, -0.4), 0.05, 0.035), mat("EmuLeg", '#6b6158', 0.6), legs)
        solid("emu_legL" + side, limb((0, 0.06, -0.4), (0, 0.0, -0.76), 0.035, 0.03), mat("EmuLeg", '#6b6158', 0.6), legs)
        for k in (-1, 0, 1): solid("emu_toe%s%d" % (side, k), limb((0, 0.0, -0.76), (k*0.06, -0.12, -0.78), 0.015, 0.008), mat("EmuLeg", '#6b6158', 0.6), legs)
    return g

def koala():
    g = empty("koala"); GR, WH = '#9aa0a6', '#ecebe6'
    def shade(co, c, f):
        if co.y < -0.12 and 0.12 < co.z < 0.45 and abs(co.x) < 0.14: return mixc(c, lin(WH), 0.7), f
        return c, f
    p = Piece("koala_body_fur", 0.011)
    p.add(bm_ball(0.24, at=(0, 0.02, 0.3), scale=(1, 0.95, 1.15)), GR, 1.0)
    p.add(bm_ball(0.2, at=(0, -0.04, 0.62), scale=(1.18, 1.0, 0.95)), GR, 1.0)
    for s in (1, -1):
        p.add(bm_ball(0.12, at=(0.22*s, 0.0, 0.74), scale=(1, 0.5, 1)), GR, 1.6).add(bm_ball(0.08, at=(0.22*s, -0.04, 0.74), scale=(1, 0.3, 1)), WH, 1.8)   # big fluffy ears
        p.add(limb((0.15*s, -0.12, 0.42), (0.1*s, -0.24, 0.3), 0.06, 0.05), GR, 1.0)    # arms hugging the trunk
        p.add(limb((0.15*s, -0.05, 0.12), (0.1*s, -0.2, 0.05), 0.07, 0.05), GR, 1.0)
    p.build(g, shade=shade)
    solid("koala_nose", bm_ball(0.06, scale=(0.8, 0.7, 1.25)), mat("KoalaNose", '#222020', 0.12), g, (0, -0.215, 0.6), 1)
    for s, side in ((1, "L"), (-1, "R")): eye("koala_" + side, (0.085*s, -0.17, 0.67), 0.022, g, look=(0.4*s, -1, 0))
    return g

def deer():
    g = empty("deer"); BR, LT, DK = '#a8743f', '#f3e6cc', '#5a3b22'
    def shade(co, c, f):
        if co.z < 0.78 and co.y > -0.3 and co.y < 0.5 and abs(co.x) < 0.14: return mixc(c, lin(LT), 0.7), f   # pale belly
        if co.z > 1.0 and co.y > -0.3 and math.sin(co.x*30 + co.y*20)*math.sin(co.y*26) > 0.75: return mixc(c, lin(LT), 0.85), f   # dappled spots
        return c, f
    p = Piece("deer_body_fur", 0.018)
    p.add(bm_tube([(-0.45, 0.16, 0.2, 0.0), (-0.2, 0.2, 0.24, 0.0), (0.2, 0.19, 0.23, 0.0), (0.45, 0.16, 0.2, 0.02)], at=(0, 0, 1.0)), BR, 0.6)
    p.add(limb((0, -0.4, 1.1), (0, -0.62, 1.55), 0.11, 0.07), BR, 0.6)
    p.add(bm_ball(0.11, at=(0, -0.72, 1.62), scale=(0.85, 1.3, 0.9)), BR, 0.5).add(bm_ball(0.06, at=(0, -0.88, 1.57), scale=(0.8, 1.3, 0.7)), DK, 0.3)
    for s in (1, -1): p.add(bm_ball(0.07, at=(0.1*s, -0.66, 1.75), scale=(0.5, 0.25, 1.1), rot=R(0.5*s, 3, 'Y')), BR, 0.4)
    p.add(bm_ball(0.06, at=(0, 0.5, 1.1), scale=(0.9, 0.6, 1.1)), LT, 0.8)                     # white tail tuft
    p.build(g, shade=shade)
    solid("deer_nose", bm_ball(0.03), mat("Nose", '#1e1612', 0.15), g, (0, -0.96, 1.58), 0)
    for s, side in ((1, "L"), (-1, "R")): eye("deer_" + side, (0.075*s, -0.78, 1.66), 0.024, g, look=(1*s, -0.7, 0))
    a = empty("deer_antlers", g, (0, -0.7, 1.72)); AM = mat("Antler", '#d9c7a2', 0.6)
    for s in (1, -1):
        b = Vector((0.06*s, 0, 0)); m_ = Vector((0.2*s, 0.08, 0.28)); top = Vector((0.26*s, 0.12, 0.5))
        solid("deer_ant1%d" % s, limb(b, m_, 0.02, 0.015), AM, a); solid("deer_ant2%d" % s, limb(m_, top, 0.015, 0.008), AM, a)
        solid("deer_ant3%d" % s, limb(m_, m_ + Vector((0.12*s, -0.06, 0.12)), 0.012, 0.006), AM, a); solid("deer_ant4%d" % s, limb(b + (m_ - b)*0.5, b + (m_ - b)*0.5 + Vector((0.0, -0.1, 0.14)), 0.012, 0.006), AM, a)
    for s in (1, -1):
        for y, nm in ((-0.32, "F"), (0.32, "B")):
            leg = empty("deer_leg%s%s" % (nm, "L" if s > 0 else "R"), g, (0.11*s, y, 0.92))
            lp = Piece("deer_leg%s%sP_fur" % (nm, "L" if s > 0 else "R"), 0.01)
            lp.add(limb((0, 0, 0.05), (0, 0.03, -0.45), 0.065, 0.04), BR, 0.4).add(limb((0, 0.03, -0.45), (0, 0.0, -0.88), 0.035, 0.028), BR, 0.3).add(bm_ball(0.035, at=(0, -0.01, -0.9), scale=(1, 1.3, 0.7)), DK, 0)
            lp.build(leg)
    return g

def wolf():
    g = empty("wolf"); GR, LT, DK = '#7d7f84', '#d9d8d2', '#3f4045'
    def shade(co, c, f):
        if co.z < 0.55 and abs(co.x) < 0.13: return mixc(c, lin(LT), 0.7), f
        if co.z > 0.78 and co.y > -0.4: return mixc(c, lin(DK), 0.35), f     # darker saddle
        return c, f
    p = Piece("wolf_body_fur", 0.016)
    p.add(bm_tube([(-0.5, 0.17, 0.2, 0.0), (-0.25, 0.2, 0.23, 0.0), (0.15, 0.17, 0.2, 0.0), (0.45, 0.15, 0.17, 0.02)], at=(0, 0, 0.7)), GR, 1.0)
    p.add(limb((0, -0.42, 0.75), (0, -0.62, 0.92), 0.14, 0.1), GR, 1.1)      # thick ruff
    p.add(bm_ball(0.13, at=(0, -0.7, 0.98), scale=(1, 1.1, 0.95)), GR, 0.8)
    p.add(bm_tube([(0.0, 0.07, 0.06, 0.0), (-0.16, 0.045, 0.04, -0.01), (-0.2, 0.03, 0.03, -0.02)], at=(0, -0.8, 0.94)), LT, 0.3)   # snout
    for s in (1, -1): p.add(bm_cone(0.05, 0.005, 0.12, at=(0.07*s, -0.68, 1.12), rot=R(0.2*s, 3, 'Y')), DK, 0.4)
    p.build(g, shade=shade)
    solid("wolf_nose", bm_ball(0.028), mat("Nose", '#1e1612', 0.15), g, (0, -1.01, 0.93), 0)
    for s, side in ((1, "L"), (-1, "R")): eye("wolf_" + side, (0.06*s, -0.8, 1.02), 0.02, g, iris='#d9a72a', look=(0.5*s, -1, 0))
    t = empty("wolf_tail", g, (0, 0.48, 0.78))
    tp = Piece("wolf_tailP_fur", 0.012); tp.add(limb((0, 0, 0), (0, 0.42, -0.25), 0.07, 0.05), GR, 1.4).add(bm_ball(0.05, at=(0, 0.44, -0.27)), DK, 1.2); tp.build(t)
    for s in (1, -1):
        for y, nm in ((-0.34, "F"), (0.34, "B")):
            leg = empty("wolf_leg%s%s" % (nm, "L" if s > 0 else "R"), g, (0.12*s, y, 0.62))
            lp = Piece("wolf_leg%s%sP_fur" % (nm, "L" if s > 0 else "R"), 0.01)
            lp.add(limb((0, 0, 0.05), (0, 0.03, -0.3), 0.07, 0.045), GR, 0.7).add(limb((0, 0.03, -0.3), (0, 0.0, -0.58), 0.04, 0.035), GR, 0.4).add(bm_ball(0.045, at=(0, -0.03, -0.6), scale=(1, 1.3, 0.6)), LT, 0.3)
            lp.build(leg)
    return g

for f in (gull, eagle, owl, heron, dolphin, whale, fish, lizard, frog, turtle, croc, beaver, kangaroo, quokka, emu, koala, deer, wolf):
    f(); print("built", f.__name__)

for o in scene.objects: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_apply=True, export_vertex_color='ACTIVE', export_yup=True)
print("EXPORTED", OUT, len(bpy.data.objects))
