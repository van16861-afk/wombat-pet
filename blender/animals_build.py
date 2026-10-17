# Builds the wild animals and exports assets/models/animals.glb (run headless:
#   blender.exe -b --factory-startup -P animals_build.py ).
# Every body is "organic": simple shapes are merged, voxel-remeshed and smoothed into ONE soft surface, then painted with
# vertex colours. Alpha means: fur length on "*_fur" meshes (the game grows fur shells), feather-pattern strength on
# "*_feather" meshes (the game draws overlapping feathers on them, no fluff) and glossiness on everything else.
# Parts the game animates are separate objects named "<animal>_<part>" with their origin at the joint
# (wingL/wingR at the shoulder, handL/handR at the wrist, tail at its base, head/neck at the neck, legXX at the hip, jaw at the hinge).
# Small hard parts (beaks, feet, claws, teeth, eyes) are merged into vertex-coloured "Painted" meshes: one draw call each.
# Eyes are set INTO the surface (a ray finds the skin) and get upper and lower lids in the skin colour, so they look
# alive and relaxed instead of round and staring.
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
def sstep(a, b, x): t = max(0.0, min(1.0, (x - a)/(b - a))); return t*t*(3 - 2*t)
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
def bm_torus(R1, r, seg=20, sides=8):
    """A ring lying in the XZ plane (axis = Y)."""
    bm = bmesh.new(); rings = []
    for i in range(seg):
        a = i/seg*2*math.pi; c = Vector((math.cos(a)*R1, 0, math.sin(a)*R1)); out = Vector((math.cos(a), 0, math.sin(a)))
        rings.append([bm.verts.new(c + out*math.cos(b/sides*2*math.pi)*r + Vector((0, math.sin(b/sides*2*math.pi)*r, 0))) for b in range(sides)])
    for i in range(seg):
        r0, r1 = rings[i], rings[(i+1) % seg]
        for k in range(sides): bm.faces.new((r0[k], r0[(k+1) % sides], r1[(k+1) % sides], r1[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); return bm
def bm_cap(r, nrm, h, seg=18):
    """The part of a sphere on the far side of a plane (v.nrm > h): an eyelid."""
    bm = bm_ball(r, seg=seg); nrm = Vector(nrm).normalized()
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.dot(nrm) < h], context='VERTS'); return bm
def xf(bm, M=None, T=(0, 0, 0)):
    if M is not None: bmesh.ops.transform(bm, matrix=M.to_4x4(), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(T), verts=bm.verts); return bm

class Piece:
    """Collects shapes, each with a colour and fur length; build() merges them into one smooth painted mesh."""
    def __init__(self, name, voxel, target=None): self.name, self.voxel, self.shapes, self.paint = name, voxel, [], []; self.target = target or (1500 if "body" in name else 380)
    def add(self, bm, color, fur=1.0): self.shapes.append((bm, lin(color) if isinstance(color, str) else color, fur)); return self
    def build(self, parent=None, at=(0, 0, 0), smooth=6, shade=None, deform=None):
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
        if deform:   # surface relief (scute seams, bony bumps) pushed along the normals
            moves = [deform(v.co.copy(), v.normal.copy()) for v in out.vertices]
            for v, co in zip(out.vertices, moves): v.co = co
            out.update()
        # paint: blend the colours of the nearest shapes (soft seams), then optional shading rules
        ca = out.color_attributes.new("Col", 'FLOAT_COLOR', 'POINT')
        for v in out.vertices:
            acc, wsum, fur = [0, 0, 0], 0, 0
            for tree, col, f in trees:
                hit = tree.find_nearest(v.co)
                if not hit[0]: continue
                w = math.exp(-max(hit[3], 0)/(self.voxel*1.6))
                acc = [acc[i] + col[i]*w for i in range(3)]; wsum += w; fur += f*w
            c = [x/max(wsum, 1e-6) for x in acc]; fz = fur/max(wsum, 1e-6)
            if shade: c, fz = shade(v.co, c, fz)
            ca.data[v.index].color = (*c, fz)
        out.color_attributes.active_color = ca
        for p in out.polygons: p.use_smooth = True
        out.materials.append(FURMAT)
        o = link(bpy.data.objects.new(self.name, out), parent, at); return o

class Painted:
    """Small hard parts kept as modelled (no remesh), each with a colour and a gloss (alpha), merged into one mesh."""
    def __init__(self, name): self.name, self.parts = name, []
    def add(self, bm, color, gloss=0.3): self.parts.append((bm, lin(color) if isinstance(color, str) else list(color), gloss)); return self
    def build(self, parent=None, at=(0, 0, 0)):
        big = bmesh.new(); cols = []
        for bm, col, g in self.parts:
            me = bpy.data.meshes.new("tmp"); bm.to_mesh(me); bm.free(); n0 = len(big.verts); big.from_mesh(me); bpy.data.meshes.remove(me)
            cols += [(col, g)]*(len(big.verts) - n0)
        me = bpy.data.meshes.new(self.name); big.to_mesh(me); big.free()
        ca = me.color_attributes.new("Col", 'FLOAT_COLOR', 'POINT')
        for i, (c, g) in enumerate(cols): ca.data[i].color = (*c, g)
        me.color_attributes.active_color = ca
        for p in me.polygons: p.use_smooth = True
        me.materials.append(FURMAT)
        return link(bpy.data.objects.new(self.name, me), parent, at)

def solid(name, bm, m, parent=None, at=(0, 0, 0), sub=1):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    me.materials.append(m); o = link(bpy.data.objects.new(name, me), parent, at)
    if sub: s = o.modifiers.new("sub", 'SUBSURF'); s.levels = sub; s.render_levels = sub
    return o

def basis(f, up=(0, 0, 1)):
    """Rotation taking local -Y to `f` (where the eye looks) and local +Z towards `up`."""
    f = Vector(f).normalized(); up = Vector(up); u = up - f*f.dot(up)
    if u.length < 1e-4: u = Vector((0, 1, 0))
    u.normalize(); Y = -f; X = Y.cross(u)
    return Matrix((X, Y, u)).transposed()
def surface_hit(body, origin, d):
    """Ray from inside `body` (in its parent's space) out along d: the skin point, its normal and its painted colour."""
    me = body.data; bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table(); bvh = BVHTree.FromBMesh(bm)
    ca = me.color_attributes.get("Col"); loc = body.location
    hit, n, idx, dist = bvh.ray_cast(Vector(origin) - loc, Vector(d).normalized())
    if hit is None: bm.free(); return None
    col = [sum(ca.data[v.index].color[i] for v in bm.faces[idx].verts)/len(bm.faces[idx].verts) for i in range(3)] if ca else lin('#666666')
    bm.free(); n = n.normalized()
    if n.dot(Vector(d)) < 0: n = -n
    return hit + loc, n, col
def clear_fur(body, p, rad):
    """No fur or feather pattern right round the eyes (it would grow over them)."""
    ca = body.data.color_attributes.get("Col"); p = Vector(p) - body.location
    if not ca: return
    for v in body.data.vertices:
        d = (v.co - p).length
        if d < rad: c = list(ca.data[v.index].color); c[3] *= (d/rad)**2; ca.data[v.index].color = c

def eyes(prefix, body, parent, origin, d, r, iris='#2e1d12', pupil='round', lid=0.3, low=0.12, slant=0.0, ring=None, bulge=0.45,
         look=0.5, glow=False, lidcol=None, up=(0, 0, 1), shine=True):
    """A pair of eyes (mirrored in x) set into `body`: a ray from `origin` along `d` finds the skin, the eyeball sinks in a little,
    and lids in the skin colour cover the top (`lid`, tilted inwards by `slant` for a keen look) and the bottom (`low`)."""
    P = Painted(prefix + "_eyes")
    for s in (1, -1):
        o = Vector((origin[0]*s, origin[1], origin[2])); dd = Vector((d[0]*s, d[1], d[2])).normalized()
        h = surface_hit(body, o, dd) if body else None
        if h: hit, n, col = h
        else: hit, n, col = o, dd, lin(lidcol or '#666666')
        f = (n*(1 - look) + dd*look).normalized(); C = hit - n*r*bulge
        M = basis(f, up); lc = lin(lidcol) if lidcol else col
        ball = xf(bm_ball(r, scale=(1, 0.84, 1), seg=16), M, C)
        if glow: solid(prefix + "_iris" + ("L" if s > 0 else "R"), ball, mat("Iris_" + iris, iris, 0.15), parent, (0, 0, 0), 0)
        else: P.add(ball, iris, 0.85)
        px, pz = {'round': (0.5, 0.5), 'slit': (0.13, 0.62), 'hbar': (0.5, 0.22), 'big': (0.66, 0.66)}[pupil]
        P.add(xf(bm_ball(r, scale=(px, 0.2, pz), at=(0, -0.7*r, 0), seg=12), M, C), '#080808', 1.0)
        if shine: P.add(xf(bm_ball(r*0.12, at=(0.3*r, -0.86*r, 0.34*r), seg=6), M, C), '#ffffff', 1.0)
        if lid > 0:
            R1 = r*1.1; nl = Vector((-s*math.sin(slant), 0, math.cos(slant)))
            P.add(xf(bm_cap(R1, nl, R1*(1 - 2*lid)), M, C), lc, 0.1)
        if low > 0:
            R2 = r*1.07; P.add(xf(bm_cap(R2, (0, 0, -1), R2*(1 - 2*low)), M, C), lc, 0.1)
        if ring: P.add(xf(bm_torus(r*0.92, r*0.16, 20, 6), M, C + f*(-0.0)), ring, 0.3)
        if body: clear_fur(body, hit, r*2.4)
    return P.build(parent)

def bird_wing(a, s, side, g, shoulder, arm_len, arm, hand, voxel, shade_arm=None, shade_hand=None, quills=None):
    """A two-part wing along +X: "<a>_wing<side>" holds the inner wing (joint at the shoulder) and "<a>_hand<side>" the
    outer wing (joint at the wrist). The game folds it the way birds do: the arm tucks in and the hand lies back along the body."""
    w = empty(a + "_wing" + side, g, shoulder)
    ap = Piece(a + "_wing%s_feather" % side, voxel, target=600); arm(ap); ao = ap.build(w, shade=shade_arm); ao.scale.x = s
    h = empty(a + "_hand" + side, w, (arm_len*s, 0, 0))
    hp = Piece(a + "_hand%s_feather" % side, voxel, target=600); hand(hp); ho = hp.build(h, shade=shade_hand); ho.scale.x = s
    if quills: q = Painted(a + "_quills" + side); quills(q); qo = q.build(h); qo.scale.x = s
    return w

def feather_quill(q, base, ang, L, w, col, gloss=0.15, droop=0.0):
    """One long flight feather from `base`, pointing along angle `ang` from +X (towards +Y = backwards)."""
    d = Vector((math.cos(ang), math.sin(ang), 0))
    prof = [(0.0, w*0.55, 0.004, 0), (L*0.25, w, 0.0045, droop*0.3), (L*0.7, w*0.85, 0.0035, droop*0.7), (L*0.93, w*0.45, 0.003, droop), (L, w*0.06, 0.002, droop)]
    bm = bm_tube(prof, axis='X', seg=8); bmesh.ops.rotate(bm, cent=Vector(), matrix=R(ang, 3, 'Z'), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(base), verts=bm.verts); q.add(bm, col, gloss)

# ================================================================== birds
# ---------- seagull (common gull: white head and body, pale grey back and wings, black wingtips with white "mirrors",
# yellow bill with a red spot, yellow legs, dark eye with a red eye-ring) ----------
def gull():
    g = empty("gull"); W_, G_, BK = '#f7f7f4', '#9fa9b4', '#1d1d1f'
    def shade(co, c, f):
        back = sstep(0.345, 0.385, co.z)*sstep(-0.09, -0.05, co.y)*(1 - sstep(0.22, 0.27, co.y))
        return mixc(c, lin(G_), back), 0.45 + 0.5*back
    p = Piece("gull_body_feather", 0.008, target=1800)
    p.add(bm_tube([(-0.15, 0.001, 0.001, 0.0), (-0.12, 0.065, 0.07, 0.0), (-0.06, 0.1, 0.105, -0.01), (0.03, 0.105, 0.1, -0.005), (0.13, 0.08, 0.07, 0.01),
                   (0.22, 0.045, 0.035, 0.025), (0.3, 0.02, 0.012, 0.035)], at=(0, 0, 0.3)), W_, 0.5)
    p.add(limb((0, -0.1, 0.33), (0, -0.165, 0.44), 0.058, 0.047), W_, 0.4)
    p.add(bm_ball(0.058, at=(0, -0.19, 0.465), scale=(0.88, 1.12, 0.93)), W_, 0.35).add(bm_ball(0.032, at=(0, -0.232, 0.47)), W_, 0.3)
    p.add(bm_tube([(0.2, 0.045, 0.014, 0), (0.3, 0.055, 0.01, 0.005), (0.38, 0.05, 0.006, 0.01)], at=(0, 0, 0.335)), W_, 0.6)
    body = p.build(g, shade=shade)
    eyes("gull", body, g, (0.0, -0.2, 0.475), (1, -0.3, 0.12), 0.0095, iris='#2a1a12', ring='#c8352a', lid=0.24, low=0.1, bulge=0.3, look=0.35)
    bits = Painted("gull_bits")
    h = surface_hit(body, (0, -0.19, 0.462), (0, -1, -0.12)); B = h[0] + Vector((0, 0.008, 0))
    bits.add(bm_tube([(0.008, 0.013, 0.016, 0.0), (-0.02, 0.011, 0.014, -0.001), (-0.045, 0.008, 0.012, -0.002), (-0.06, 0.006, 0.011, -0.004), (-0.07, 0.004, 0.008, -0.009),
                      (-0.075, 0.002, 0.003, -0.014)], seg=12, at=B), '#f2c230', 0.45)
    bits.add(bm_ball(0.006, at=B + Vector((0, -0.057, -0.011)), scale=(1.15, 1.6, 0.8), seg=8), '#d63c2a', 0.4)
    bits.add(bm_ball(0.004, at=B + Vector((0, -0.03, -0.002)), scale=(3.4, 7, 0.4), seg=8), '#3a2a1a', 0.2)   # the gape line
    bits.build(g)
    legs = empty("gull_legs", g, (0, 0.0, 0.25)); L = Painted("gull_legsP"); LY = '#d9c14a'
    for s in (1, -1):
        A = Vector((0.04*s, -0.01, -0.225))
        L.add(limb((0.035*s, 0.012, 0.05), (0.035*s, 0.0, 0.0), 0.016, 0.012), W_, 0.1)
        L.add(limb((0.035*s, 0.0, 0.0), A, 0.009, 0.007), LY, 0.35)
        for dx in (-0.024, 0, 0.024): L.add(limb(A, A + Vector((dx*s, -0.055, -0.018)), 0.005, 0.004), LY, 0.35)
        L.add(bm_ball(0.03, at=A + Vector((0, -0.036, -0.016)), scale=(0.85, 1.0, 0.1)), LY, 0.3)   # webbing
        L.add(limb(A, A + Vector((0, 0.02, -0.012)), 0.004, 0.003), LY, 0.3)
    L.build(legs)
    def arm(ap): ap.add(bm_tube([(0.0, 0.07, 0.022, 0), (0.1, 0.075, 0.02, 0.0), (0.2, 0.07, 0.016, 0)], axis='X', at=(0, 0.05, 0)), G_, 1.0)
    def hand(hp): hp.add(bm_tube([(0.0, 0.068, 0.016, 0), (0.12, 0.06, 0.013, 0), (0.24, 0.045, 0.01, 0), (0.32, 0.02, 0.006, 0), (0.35, 0.003, 0.002, 0)], axis='X', at=(0, 0.045, 0), rot=R(0.22, 3, 'Z')), G_, 1.0)
    def sh_arm(co, c, f): return mixc(c, lin(W_), sstep(0.095, 0.112, co.y)), f            # white trailing edge
    def sh_hand(co, c, f):
        col = mixc(c, lin(W_), sstep(0.09, 0.105, co.y)*(1 - sstep(0.13, 0.17, co.x)))
        tip = sstep(0.16, 0.2, co.x); col = mixc(col, lin(BK), tip)
        for mx, my, rx, ry in ((0.3, 0.115, 0.03, 0.018), (0.235, 0.105, 0.016, 0.012)):     # white "mirrors" in the black tip
            if ((co.x - mx)/rx)**2 + ((co.y - my)/ry)**2 < 1: col = lin(W_)
        return col, f*(1 - tip*0.6)
    for s, side in ((1, "L"), (-1, "R")):
        bird_wing("gull", s, side, g, (0.08*s, -0.07, 0.38), 0.2, arm, hand, 0.0065, sh_arm, sh_hand)
    return g

# ---------- eagle (bald eagle: dark brown body and wings, white head and tail, big hooked yellow bill, pale fierce eye
# under a heavy brow, yellow feet with black talons; spread "finger" primaries) ----------
def eagle():
    g = empty("eagle"); BR, DK, WH, YL = '#4a3220', '#24170e', '#f4f2ec', '#f2a91c'
    def shade(co, c, f): return mixc(c, lin(WH), sstep(-0.15, -0.19, co.y)), f
    p = Piece("eagle_body_feather", 0.01, target=1800)
    p.add(bm_tube([(-0.2, 0.001, 0.001, 0.02), (-0.17, 0.075, 0.075, 0.02), (-0.1, 0.125, 0.12, 0.0), (0.02, 0.14, 0.13, -0.01), (0.14, 0.12, 0.11, -0.005),
                   (0.24, 0.08, 0.07, 0.0), (0.31, 0.045, 0.035, 0.01)]), BR, 1.0)
    p.build(g, shade=shade)
    hd = empty("eagle_head", g, (0, -0.17, 0.035))
    hp = Piece("eagle_headP_feather", 0.007, target=1100)
    hp.add(limb((0, 0.05, -0.02), (0, -0.04, 0.02), 0.078, 0.066), WH, 0.4)
    hp.add(bm_ball(0.07, at=(0, -0.075, 0.04), scale=(0.82, 1.25, 0.82)), WH, 0.35)
    for s in (1, -1): hp.add(bm_ball(0.026, at=(0.034*s, -0.108, 0.074), scale=(1.15, 1.9, 0.55), rot=R(-0.25*s, 3, 'Y')), WH, 0.2)   # heavy brow
    head = hp.build(hd)
    eyes("eagle", head, hd, (0.015, -0.1, 0.05), (1, -0.75, 0.05), 0.0115, iris='#ecd25e', lid=0.36, slant=0.5, low=0.14, bulge=0.4, look=0.55)
    bk = Painted("eagle_beak"); h = surface_hit(head, (0, -0.075, 0.035), (0, -1, -0.12)); B = h[0] + Vector((0, 0.012, 0))
    bk.add(bm_tube([(0.012, 0.026, 0.026, 0.004), (-0.015, 0.022, 0.024, 0.002), (-0.04, 0.016, 0.02, -0.004), (-0.06, 0.01, 0.015, -0.014), (-0.072, 0.006, 0.01, -0.028),
                    (-0.076, 0.003, 0.005, -0.042), (-0.074, 0.001, 0.002, -0.05)], seg=14, at=B), YL, 0.5)
    bk.add(bm_tube([(0.0, 0.018, 0.01, -0.018), (-0.04, 0.012, 0.008, -0.022), (-0.058, 0.005, 0.004, -0.024)], seg=10, at=B), '#e0921a', 0.4)
    bk.add(bm_ball(0.004, at=B + Vector((0, -0.025, -0.012)), scale=(5.6, 6.5, 0.5), seg=8), '#3a2410', 0.2)   # gape
    bk.build(hd)
    t = empty("eagle_tail", g, (0, 0.27, 0.0))
    tp = Piece("eagle_tailP_feather", 0.006, target=600)
    for k in range(-3, 4):
        a = k*0.1; tp.add(bm_ball(0.04, at=(math.sin(a)*0.12, math.cos(a)*0.12, 0), scale=(0.55, 3.0, 0.12), rot=R(-a, 3, 'Z')), WH, 0.6)
    tp.build(t)
    lg = empty("eagle_legs", g, (0, 0.02, -0.07))
    lp = Piece("eagle_legsP_feather", 0.008, target=500)
    for s in (1, -1): lp.add(bm_ball(0.045, at=(0.045*s, 0, -0.02), scale=(0.9, 1.0, 1.5)), BR, 0.8)
    lp.build(lg)
    ft = Painted("eagle_feet")
    for s in (1, -1):
        A = Vector((0.047*s, -0.01, -0.15))
        ft.add(limb((0.045*s, -0.005, -0.06), A, 0.014, 0.012), '#f3b52a', 0.3)
        for dx, dy in ((-0.02, -0.05), (0.0, -0.055), (0.02, -0.048), (0.0, 0.04)):
            E = A + Vector((dx*s, dy, -0.012)); ft.add(limb(A, E, 0.009, 0.007), '#f3b52a', 0.3)
            ft.add(limb(E, E + Vector((0, -0.016 if dy < 0 else 0.016, -0.022)), 0.0065, 0.001), '#15110d', 0.6)
    ft.build(lg)
    def arm(ap):
        ap.add(bm_tube([(0.0, 0.1, 0.03, 0), (0.15, 0.11, 0.025, 0), (0.3, 0.105, 0.02, 0)], axis='X', at=(0, 0.07, 0)), BR, 1.0)
    def hand(hp): hp.add(bm_tube([(0.0, 0.1, 0.02, 0), (0.12, 0.09, 0.016, 0), (0.2, 0.075, 0.012, 0)], axis='X', at=(0, 0.065, 0)), BR, 1.0)
    def sh_arm(co, c, f): return mixc(c, lin(DK), sstep(0.12, 0.165, co.y)), f
    def sh_hand(co, c, f): return mixc(c, lin(DK), sstep(0.1, 0.15, co.y) + sstep(0.12, 0.2, co.x)*0.5), f
    def quills(q):
        for k in range(6):
            ang = -0.2 + k*0.15; feather_quill(q, (0.15 + k*0.008, 0.0 + k*0.028, 0), ang, 0.27 - k*0.017, 0.021, DK, droop=-0.01)
    for s, side in ((1, "L"), (-1, "R")):
        bird_wing("eagle", s, side, g, (0.1*s, -0.07, 0.05), 0.3, arm, hand, 0.008, sh_arm, sh_hand, quills)
    return g

# ---------- owl (eagle-owl: ear tufts, orange eyes in a pale facial disc, streaked chest; the eyes glow at night) ----------
def owl():
    g = empty("owl"); BR, LT, FC, DK = '#7d5d3e', '#d6bf98', '#e6d6b8', '#3f2b1a'
    def shade(co, c, f):
        chest = sstep(-0.05, -0.12, co.y)
        col = c
        if chest > 0.3 and math.sin(co.x*95) > 0.55: col = mixc(col, lin(DK), 0.55*chest)              # vertical streaks
        if co.y > -0.02 and math.sin(co.x*40 + co.z*70)*math.sin(co.z*55) > 0.5: col = mixc(col, lin(DK), 0.4)   # mottled back
        return col, f
    p = Piece("owl_body_feather", 0.011)
    p.add(bm_ball(0.19, at=(0, 0.02, 0.22), scale=(1, 0.9, 1.2)), BR, 1.0).add(bm_ball(0.14, at=(0, -0.08, 0.18), scale=(1, 0.6, 1.15)), LT, 1.0)
    for s in (1, -1): p.add(bm_ball(0.045, at=(0.06*s, -0.07, 0.02), scale=(1, 1.2, 0.6)), LT, 1.0)
    p.build(g, shade=shade)
    h = empty("owl_head", g, (0, 0, 0.44))
    hp = Piece("owl_headball_feather", 0.009, target=1000)
    hp.add(bm_ball(0.165, at=(0, 0, 0.03), scale=(1.12, 0.95, 0.92)), BR, 1.0)
    hp.add(bm_ball(0.06, at=(0, -0.12, -0.08), scale=(1.4, 0.6, 0.8)), '#f2ece0', 0.5)              # white throat
    for s in (1, -1):
        hp.add(bm_ball(0.08, at=(0.068*s, -0.11, 0.03), scale=(1.0, 0.45, 1.05)), FC, 0.5)        # facial disc
        hp.add(bm_cone(0.035, 0.004, 0.12, at=(0.11*s, -0.01, 0.17), rot=R(-0.4*s, 3, 'Y')), DK, 0.7)  # ear tufts
        hp.add(limb((0.018*s, -0.14, 0.07), (0.115*s, -0.105, 0.112), 0.014, 0.01), '#f1eadb', 0.3)   # pale "eyebrows" in a V
    def hshade(co, c, f):
        rim = abs(math.hypot(abs(co.x) - 0.068, co.z - 0.03) - 0.085)
        if co.y < -0.06 and rim < 0.012: return mixc(c, lin(DK), 0.7), f                          # dark rim of the facial disc
        return c, f
    head = hp.build(h, shade=hshade)
    eyes("owl", head, h, (0.066, -0.05, 0.045), (0.25, -1, 0.0), 0.03, iris='#f28a14', ring='#2a1a0e', lid=0.36, slant=0.6, low=0.12, bulge=0.4, look=0.8, glow=True, lidcol='#5a4430')
    for s, side in ((1, "L"), (-1, "R")):
        w = empty("owl_wing" + side, g, (0.16*s, 0.02, 0.33))
        wp = Piece("owl_wing%s_feather" % side, 0.01)
        wp.add(bm_ball(0.1, at=(0.0, 0.03, -0.12), scale=(0.35, 0.85, 1.35)), BR, 1.0)
        wo = wp.build(w); wo.scale.x = s
    bits = Painted("owl_bits")
    bits.add(bm_cone(0.02, 0.003, 0.06, rot=R(math.pi*0.62, 3, 'X'), at=(0, -0.155, -0.005)), '#3b3128', 0.5)
    bits.build(h)
    feet = Painted("owl_feet")
    for s in (1, -1):
        for k in (-1, 0, 1):
            A = Vector((0.06*s + k*0.018, -0.07, 0.02)); feet.add(limb(A, A + Vector((0, -0.035, -0.005)), 0.012, 0.01), LT, 0.1)
            feet.add(limb(A + Vector((0, -0.035, -0.005)), A + Vector((0, -0.05, -0.02)), 0.006, 0.001), '#15110d', 0.6)
    feet.build(g)
    return g

# ---------- heron ----------
def heron():
    g = empty("heron"); GR, WH, DK = '#a2a9b0', '#eef0f0', '#2b2b2b'
    p = Piece("heron_body_feather", 0.014)
    p.add(bm_tube([(-0.2, 0.001, 0.001, 0), (-0.14, 0.12, 0.12, 0), (0.05, 0.15, 0.14, 0), (0.25, 0.1, 0.08, -0.02), (0.42, 0.04, 0.02, -0.06)], at=(0, 0, 1.0)), GR, 1.0)
    p.build(g)
    n = empty("heron_neck", g, (0, -0.16, 1.06))
    np_ = Piece("heron_neckP_feather", 0.011)
    np_.add(limb((0, 0, 0), (0, -0.08, 0.32), 0.05, 0.035), WH, 0.4).add(limb((0, -0.08, 0.32), (0, -0.14, 0.55), 0.035, 0.03), WH, 0.4)
    np_.add(bm_ball(0.06, at=(0, -0.17, 0.58), scale=(0.9, 1.3, 0.9)), WH, 0.3).add(bm_ball(0.03, at=(0, -0.15, 0.625), scale=(0.9, 1.6, 0.5)), DK, 0.3)
    neck = np_.build(n)
    eyes("heron", neck, n, (0.0, -0.2, 0.6), (1, -0.4, 0.1), 0.011, iris='#e8cf3a', lid=0.28, slant=0.3, low=0.1, bulge=0.35)
    bits = Painted("heron_bits")
    bits.add(bm_cone(0.025, 0.003, 0.26, rot=R(math.pi/2, 3, 'X'), at=(0, -0.37, 0.58)), '#e2b43c', 0.5)
    for s in (1, -1): bits.add(limb((0.06*s, 0.16, 0.98), (0.07*s, 0.18, 0.0), 0.016, 0.012), '#d7b45a', 0.3)
    bits.build(n)
    legs = Painted("heron_legs")
    for s in (1, -1): legs.add(limb((0.06*s, 0.0, 0.98), (0.07*s, 0.02, 0.0), 0.016, 0.012), '#d7b45a', 0.3)
    legs.build(g)
    return g

# ================================================================== water animals
def dolphin():
    g = empty("dolphin")
    def shade(co, c, f): t = max(0, min(1, (co.z + 0.08)/0.2)); return mixc(lin('#dfe5e8'), lin('#6c8494'), t), 0.5
    p = Piece("dolphin_body", 0.022)
    p.add(bm_tube([(-1.15, 0.03, 0.03, -0.05), (-1.05, 0.08, 0.07, -0.05), (-0.9, 0.12, 0.1, -0.03), (-0.8, 0.2, 0.2, 0.03), (-0.5, 0.3, 0.3, 0.05), (0.0, 0.33, 0.33, 0.05),
            (0.5, 0.24, 0.23, 0.04), (0.9, 0.12, 0.13, 0.02), (1.15, 0.06, 0.06, 0.02), (1.22, 0.001, 0.001, 0.02)], seg=20), '#6c8494', 0)
    p.add(bm_tube([(0.0, 0.03, 0.17, 0), (0.15, 0.02, 0.1, 0.12), (0.26, 0.004, 0.02, 0.26)], at=(0, -0.05, 0.38)), '#6c8494', 0)   # dorsal fin
    for s in (1, -1): p.add(bm_tube([(0.0, 0.1, 0.02, 0), (0.18, 0.06, 0.015, -0.03), (0.3, 0.005, 0.005, -0.06)], axis='X', at=(0.25*s, -0.45, -0.12), rot=R(0.5*s, 3, 'Z') if s > 0 else R(math.pi - 0.5, 3, 'Z')), '#6c8494', 0)
    body = p.build(g, shade=shade)
    eyes("dolphin", body, g, (0.0, -0.8, 0.04), (1, -0.2, 0.0), 0.024, iris='#1e1a18', lid=0.25, low=0.18, bulge=0.4)
    t = empty("dolphin_tail", g, (0, 1.1, 0.02))
    tp = Piece("dolphin_flukeP", 0.016)
    for s in (1, -1): tp.add(bm_tube([(0.0, 0.1, 0.025, 0), (0.25, 0.08, 0.02, 0.0), (0.4, 0.01, 0.01, 0.0)], axis='X', rot=R(-0.35*s, 3, 'Z') if s > 0 else R(math.pi + 0.35, 3, 'Z')), '#6c8494', 0)
    tp.build(t, shade=lambda co, c, f: (c, 0.5))
    return g

def whale():
    g = empty("whale")
    def shade(co, c, f):
        t = max(0, min(1, (co.z + 0.5)/0.6)); col = mixc(lin('#c9cfd4'), lin('#3f4f63'), t)
        if co.z < -0.55 and co.y < 1.2 and math.sin(co.x*14) > 0.6: col = mixc(col, lin('#8f989e'), 0.6)   # throat grooves
        return col, 0.3
    p = Piece("whale_body", 0.09)
    p.add(bm_tube([(-4.0, 0.25, 0.18, -0.2), (-3.6, 0.8, 0.6, -0.15), (-2.6, 1.3, 1.1, 0), (-1.0, 1.5, 1.3, 0.1), (0.8, 1.3, 1.15, 0.1), (2.4, 0.8, 0.7, 0.05), (3.6, 0.35, 0.3, 0.05), (4.3, 0.12, 0.1, 0.05)], seg=22), '#3f4f63', 0)
    p.add(bm_ball(0.4, at=(0, 1.8, 1.05), scale=(0.3, 1.0, 0.6)), '#3f4f63', 0)
    for s in (1, -1): p.add(bm_tube([(0.0, 0.35, 0.08, 0), (1.4, 0.3, 0.07, -0.25), (2.6, 0.1, 0.04, -0.5)], axis='X', at=(1.1*s, -1.5, -0.6), rot=None if s > 0 else R(math.pi, 3, 'Z')), '#3f4f63', 0)
    for i in range(8): p.add(bm_ball(0.09, at=((i % 3 - 1)*0.5, -3.3 + i*0.12, 0.55 + (i % 2)*0.1)), '#2f3a48', 0)   # knobbly snout bumps
    body = p.build(g, shade=shade)
    eyes("whale", body, g, (0.0, -2.9, -0.15), (1, -0.1, 0.0), 0.08, iris='#1e1a18', lid=0.3, low=0.2, bulge=0.45)
    t = empty("whale_tail", g, (0, 4.15, 0.05))
    tp = Piece("whale_flukeP", 0.06)
    for s in (1, -1): tp.add(bm_tube([(0.0, 0.45, 0.09, 0), (0.9, 0.4, 0.07, 0.0), (1.55, 0.06, 0.03, 0.0)], axis='X', rot=R(-0.4*s, 3, 'Z') if s > 0 else R(math.pi + 0.4, 3, 'Z')), '#3f4f63', 0)
    tp.build(t, shade=lambda co, c, f: (c, 0.3))
    return g

def fish():
    # kept material-based so every fish can be recoloured (FishBody / FishSpot / FishFin)
    g = empty("fish")
    FB, FS, FF = mat("FishBody", '#f08a3c', 0.3), mat("FishSpot", '#ffffff', 0.35), mat("FishFin", '#f6b26b', 0.35)
    solid("fish_bodyM", bm_tube([(-0.16, 0.001, 0.001, 0), (-0.14, 0.03, 0.04, 0), (-0.08, 0.055, 0.075, 0.005), (0.02, 0.06, 0.08, 0.005), (0.12, 0.035, 0.05, 0), (0.2, 0.012, 0.018, 0)], seg=18), FB, g, sub=2)
    solid("fish_spot1", bm_ball(0.03, scale=(1.5, 1.7, 0.45)), FS, g, (0.0, -0.02, 0.068), 1)
    solid("fish_spot2", bm_ball(0.025, scale=(1.5, 1.5, 0.45)), FS, g, (0.0, 0.07, 0.048), 1)
    solid("fish_dorsal", bm_tube([(0.0, 0.004, 0.03, 0), (0.06, 0.003, 0.05, 0.02), (0.11, 0.002, 0.005, 0.03)], at=(0, -0.04, 0.07)), FF, g, sub=1)
    eyes("fish", None, g, (0.036, -0.1, 0.02), (1, -0.5, 0), 0.012, iris='#d8c070', lid=0, low=0, bulge=0, look=1)
    for s, side in ((1, "L"), (-1, "R")):
        solid("fish_pec" + side, bm_ball(0.035, scale=(1.4, 0.8, 0.15), rot=R(0.4*s, 3, 'Y')), FF, g, (0.055*s, -0.04, -0.025), 1)
    t = empty("fish_tail", g, (0, 0.19, 0))
    solid("fish_fin", bm_tube([(0.0, 0.004, 0.02, 0), (0.08, 0.003, 0.07, 0), (0.12, 0.002, 0.08, 0)]), FF, t, sub=1)
    return g

# ================================================================== reptiles & amphibians (no fur: painted skin, alpha = gloss)
def lizard():
    g = empty("lizard")
    def shade(co, c, f):
        n = math.sin(co.x*90)*math.sin(co.y*70)
        col = mixc(lin('#e2dc9a'), c, max(0, min(1, (co.z - 0.012)/0.02)))
        if co.z > 0.04 and n > 0.55: col = mixc(col, lin('#3f6a2a'), 0.7)
        return col, 0.35
    p = Piece("lizard_body", 0.0045)
    p.add(bm_tube([(-0.2, 0.001, 0.001, 0.035), (-0.18, 0.028, 0.02, 0.035), (-0.13, 0.038, 0.028, 0.036), (-0.09, 0.026, 0.022, 0.036), (0.0, 0.05, 0.034, 0.036), (0.1, 0.045, 0.03, 0.035), (0.16, 0.028, 0.02, 0.03)], seg=18), '#6f9a3a', 0)
    for s in (1, -1):
        for y in (-0.06, 0.1):
            p.add(limb((0.03*s, y, 0.03), (0.08*s, y - 0.01, 0.02), 0.012, 0.01), '#6f9a3a', 0).add(limb((0.08*s, y - 0.01, 0.02), (0.1*s, y - 0.02, 0.0), 0.01, 0.008), '#6f9a3a', 0)
    body = p.build(g, shade=shade)
    eyes("lizard", body, g, (0.0, -0.15, 0.045), (1, -0.3, 0.45), 0.008, iris='#c99a20', lid=0.28, low=0.18, bulge=0.4)
    t = empty("lizard_tail", g, (0, 0.15, 0.03))
    tp = Piece("lizard_tailP", 0.004); tp.add(bm_tube([(0.0, 0.026, 0.019, 0), (0.12, 0.016, 0.012, 0), (0.25, 0.007, 0.005, -0.008), (0.34, 0.001, 0.001, -0.012)], seg=14), '#6f9a3a', 0)
    tp.build(t, shade=shade)
    return g

# ---------- frog (pond frog sitting up: pointed snout, bulging golden eyes with a horizontal pupil, eardrum, light ridges
# down the back, dark spots, cream belly, folded hind legs with long webbed toes, slender fingers; wet and glossy) ----------
def frog():
    g = empty("frog"); GR, LT, BE, DK = '#5c9a3e', '#a9c76a', '#ece6bf', '#2c5a24'
    spots = [(random.uniform(-0.07, 0.07), random.uniform(-0.05, 0.12), random.uniform(0.012, 0.022)) for _ in range(9)]
    def shade(co, c, f):
        belly = (1 - sstep(0.05, 0.09, co.z))*(1 - sstep(0.06, 0.085, abs(co.x)))*(1 - sstep(0.1, 0.14, abs(co.y + 0.01)))
        col = mixc(c, lin('#b9c27a'), (1 - sstep(0.04, 0.1, co.z))*0.6)                          # paler, yellowish underneath
        col = mixc(col, lin(BE), belly)
        if abs(co.x) > 0.075 and co.z < 0.08 and math.sin(co.y*95 + co.x*30) > 0.45: col = mixc(col, lin(DK), 0.55)   # barred legs
        for x, y, r in spots:
            if co.z > 0.1 and math.hypot(abs(co.x) - abs(x), co.y - y) < r: col = mixc(col, lin(DK), 0.75)
        for s in (1, -1):
            if co.z > 0.11 and abs(co.x - 0.058*s) < 0.008 and -0.07 < co.y < 0.13: col = mixc(col, lin(LT), 0.8)   # dorsolateral ridges
            if math.hypot(co.x - 0.085*s, co.y + 0.075, co.z - 0.14) < 0.022 and abs(co.x) > 0.07: col = mixc(lin('#7a5a32'), lin('#5d4224'), 0.4)   # eardrum
        if co.y < -0.08 and abs(co.z - 0.095) < 0.005 and abs(co.x) > 0.02: col = mixc(col, lin('#2c3a1e'), 0.7)   # mouth line
        return col, 0.65
    p = Piece("frog_body", 0.0055, target=2600)
    p.add(bm_ball(0.12, at=(0, 0.03, 0.09), scale=(0.95, 1.25, 0.62), rot=R(0.2, 3, 'X')), GR, 0)
    p.add(bm_ball(0.085, at=(0, -0.1, 0.12), scale=(1.12, 1.0, 0.6)), GR, 0).add(bm_ball(0.05, at=(0, -0.165, 0.112), scale=(0.95, 1.05, 0.55)), GR, 0)
    for s in (1, -1):
        p.add(bm_ball(0.036, at=(0.052*s, -0.1, 0.162)), GR, 0)                                    # eye bumps
        p.add(limb((0.058*s, -0.07, 0.15), (0.068*s, 0.12, 0.125), 0.01, 0.008), LT, 0)            # ridges
        p.add(limb((0.075*s, -0.07, 0.08), (0.095*s, -0.11, 0.035), 0.02, 0.016), GR, 0)          # upper arm
        p.add(limb((0.095*s, -0.11, 0.035), (0.09*s, -0.13, 0.008), 0.016, 0.012), GR, 0)         # forearm
        p.add(bm_ball(0.05, at=(0.1*s, 0.08, 0.06), scale=(0.75, 1.75, 0.7), rot=R(0.5*s, 3, 'Z')), GR, 0)   # thigh (folded forward)
        p.add(limb((0.14*s, -0.01, 0.045), (0.125*s, 0.15, 0.03), 0.026, 0.018), GR, 0)           # shin back to the ankle
        p.add(limb((0.125*s, 0.15, 0.025), (0.16*s, 0.02, 0.012), 0.014, 0.01), GR, 0)            # foot forward again
    body = p.build(g, shade=shade)
    eyes("frog", body, g, (0.052, -0.1, 0.162), (0.65, -0.55, 0.55), 0.025, iris='#c9a02e', pupil='hbar', lid=0.22, low=0.16, bulge=0.35, look=0.4, lidcol=GR)
    toes = Painted("frog_toes")
    for s in (1, -1):
        W_ = Vector((0.09*s, -0.13, 0.008))
        for k, a in enumerate((-0.6, -0.15, 0.25, 0.65)):
            E = W_ + Vector((math.sin(a)*0.035*s, -math.cos(a)*0.03, -0.004)); toes.add(limb(W_, E, 0.004, 0.003), GR, 0.6)
            toes.add(bm_ball(0.005, at=E, seg=8), LT, 0.6)
        A = Vector((0.16*s, 0.02, 0.012))
        for k, a in enumerate((-0.5, -0.2, 0.1, 0.4, 0.7)):
            L = (0.05, 0.065, 0.08, 0.06, 0.045)[k]; E = A + Vector((math.sin(a)*L*s, -math.cos(a)*L, -0.008)); toes.add(limb(A, E, 0.0045, 0.003), GR, 0.6)
        toes.add(bm_ball(0.04, at=A + Vector((0.012*s, -0.04, -0.008)), scale=(1.0, 1.1, 0.06)), '#4f8a36', 0.5)   # webbing
    toes.build(g)
    sac = Painted("frog_sac"); sac.add(bm_ball(0.026, scale=(1.1, 0.9, 0.8), seg=14), '#efe9c4', 0.7); sac.build(g, (0, -0.13, 0.065))   # tucked under the chin; it swells when the frog croaks
    return g

# ---------- turtle (red-eared slider: domed olive shell made of scutes with dark seams and yellow markings, yellow plastron,
# striped head and legs, red patch behind the eye, clawed feet; head and legs move) ----------
def turtle():
    g = empty("turtle"); SH, SEAM, YL, SK = '#4d5a2c', '#232914', '#c9b64e', '#46572a'
    cen = [(0, y) for y in (-0.21, -0.105, 0.0, 0.105, 0.21)] + [(x*s, y) for s in (1, -1) for x, y in ((0.12, -0.15), (0.14, -0.05), (0.14, 0.05), (0.12, 0.15))]
    for i in range(24):
        a = i/24*2*math.pi; cen.append((math.sin(a)*0.235, -math.cos(a)*0.31))
    def vor(x, y):
        ds = sorted(math.hypot(x - cx, y - cy) for cx, cy in cen); return ds[0], ds[1]
    def deform(co, n):
        if co.z < 0.07: return co
        d1, d2 = vor(co.x, co.y); seam = sstep(0.0, 0.016, d2 - d1)
        return co - n*0.006*(1 - seam) + n*0.004*max(0, 1 - d1/0.07)
    def shade(co, c, f):
        if co.z < 0.035: col = mixc(lin(YL), lin('#3b3a20'), 0.6 if math.sin(co.x*40)*math.sin(co.y*35) > 0.55 else 0); return col, 0.3   # plastron
        d1, d2 = vor(co.x, co.y); seam = sstep(0.0, 0.016, d2 - d1)
        col = mixc(lin(SH), lin('#5f6b34'), 0.5 + 0.5*math.sin(d1*130))                      # growth rings
        if 0.03 < d1 < 0.05 and math.sin(math.atan2(co.y, co.x)*7 + d1*60) > 0.4: col = mixc(col, lin(YL), 0.45)   # yellow markings
        if 0.045 < co.z < 0.065: col = mixc(col, lin(YL), 0.35)                                # pale rim of the marginal scutes
        return mixc(lin(SEAM), col, seam), 0.45
    p = Piece("turtle_body", 0.0075, target=2600)
    p.add(bm_ball(0.28, at=(0, 0, 0.05), scale=(0.84, 1.13, 0.6)), SH, 0)
    p.add(bm_ball(0.285, at=(0, 0, 0.055), scale=(0.88, 1.16, 0.09)), SH, 0)                     # flared rim
    p.add(bm_ball(0.25, at=(0, 0, 0.03), scale=(0.78, 1.03, 0.07)), YL, 0)                       # plastron
    body = p.build(g, shade=shade, deform=deform)
    def skin(co, c, f):
        col = c
        if math.sin(co.x*210 + co.z*90) > 0.82: col = mixc(col, lin('#d6c64a'), 0.8)             # thin yellow stripes
        return col, 0.35
    hd = empty("turtle_head", g, (0, -0.27, 0.05))
    hp = Piece("turtle_headP", 0.005, target=900)
    hp.add(limb((0, 0.06, -0.005), (0, -0.05, 0.01), 0.045, 0.038), SK, 0)
    hp.add(bm_ball(0.045, at=(0, -0.075, 0.02), scale=(0.85, 1.3, 0.8)), SK, 0).add(bm_ball(0.022, at=(0, -0.122, 0.012), scale=(1, 1, 0.8)), SK, 0)
    def hshade(co, c, f):
        col, gl = skin(co, c, f)
        if co.y > -0.075 and co.y < -0.03 and abs(co.x) > 0.022 and abs(co.z - 0.025) < 0.012: col = lin('#c8302a')   # the red "ear"
        return col, gl
    head = hp.build(hd, shade=hshade)
    eyes("turtle", head, hd, (0.0, -0.09, 0.03), (1, -0.6, 0.25), 0.011, iris='#b9b24a', pupil='hbar', lid=0.3, low=0.2, bulge=0.4)
    beak = Painted("turtle_beak"); beak.add(bm_ball(0.016, at=(0, -0.135, 0.003), scale=(1.1, 0.6, 0.5), seg=10), '#3a3a24', 0.4); beak.build(hd)
    claws = Painted("turtle_claws")
    for s in (1, -1):
        for y, nm, fr in ((-0.2, "F", True), (0.2, "B", False)):
            leg = empty("turtle_leg%s%s" % (nm, "L" if s > 0 else "R"), g, (0.19*s, y, 0.035))
            lp = Piece("turtle_leg%s%sP" % (nm, "L" if s > 0 else "R"), 0.006, target=300)
            tip = Vector((0.1*s, -0.04 if fr else 0.05, -0.02))
            lp.add(limb((0, 0, 0), tip*0.6, 0.032, 0.026), SK, 0).add(bm_ball(0.035, at=tip, scale=(1.3, 0.9, 0.35)), SK, 0)
            lp.build(leg, shade=skin)
            for k in range(4 if not fr else 5):
                a = (k - 2)*0.3; E = tip + Vector((math.cos(a)*0.045*s, math.sin(a)*0.045 - (0.012 if fr else -0.012), -0.004))
                claws.add(limb(tip + (E - tip)*0.7 + leg.location, E + (E - tip)*0.4 + leg.location, 0.004, 0.0008), '#2a2418', 0.5)
    claws.build(g)
    tail = Painted("turtle_tail"); tail.add(bm_cone(0.025, 0.002, 0.08, at=(0, 0.33, 0.03), rot=R(-math.pi/2 - 0.2, 3, 'X')), SK, 0.3); tail.build(g)
    return g

# ---------- crocodile (long flat body with rows of bony bumps, a tall thin tail with a double crest, sprawling legs with
# webbed toes, a long snout with nostril and eye bumps, interlocking teeth showing outside the lips, slit-pupil eyes) ----------
def croc():
    g = empty("croc"); TOP, MID, BEL, DK = '#3e4a2a', '#5b6436', '#cbc290', '#2a3220'
    def bumps(co, n, x0=0.2, top=0.24):
        if co.z < top: return co
        gx = round(co.x/0.065)*0.065; gy_ = round(co.y/0.075)*0.075
        if abs(gx) > x0: return co
        d = math.hypot(co.x - gx, co.y - gy_); return co + n*0.016*math.exp(-(d/0.022)**2)*sstep(top, top + 0.05, co.z)
    def shade(co, c, f):
        col = mixc(lin(BEL), lin(MID), sstep(0.08, 0.16, co.z)); col = mixc(col, lin(TOP), sstep(0.2, 0.3, co.z))
        if math.sin(co.y*9) > 0.55 and co.z > 0.1: col = mixc(col, lin(DK), 0.45)              # dark bands
        gx = round(co.x/0.065)*0.065; gy_ = round(co.y/0.075)*0.075
        if co.z > 0.26 and math.hypot(co.x - gx, co.y - gy_) < 0.012: col = mixc(col, lin('#2a2f1c'), 0.5)
        return col, 0.25
    p = Piece("croc_body", 0.013, target=2600)
    p.add(bm_tube([(-0.62, 0.15, 0.1, 0.0), (-0.45, 0.25, 0.13, 0.01), (-0.2, 0.34, 0.16, 0.02), (0.15, 0.36, 0.16, 0.02), (0.45, 0.3, 0.14, 0.01), (0.62, 0.22, 0.12, 0.0)], at=(0, 0, 0.17), seg=22), MID, 0)
    p.build(g, shade=shade, deform=bumps)
    t = empty("croc_tail", g, (0, 0.58, 0.17))
    tp = Piece("croc_tailP", 0.012, target=1400)
    tp.add(bm_tube([(0.0, 0.21, 0.12, 0), (0.4, 0.15, 0.115, 0.01), (0.8, 0.09, 0.1, 0.02), (1.2, 0.05, 0.08, 0.02), (1.6, 0.012, 0.035, 0.02)], seg=18), MID, 0)
    for i in range(22):
        y = 0.05 + i*0.07; dbl = y < 0.65; h = 0.07 - i*0.002; z = 0.11 - i*0.0025 + (0.02 if y > 0.8 else 0)
        for xo in ((-0.06, 0.06) if dbl else (0,)): tp.add(bm_cone(0.028, 0.004, h, at=(xo, y, z + h/2)), TOP, 0)   # crest scutes
    tp.build(t, shade=lambda co, c, f: (mixc(c, lin(DK), 0.5) if math.sin(co.y*11) > 0.5 else c, 0.25))
    hd = empty("croc_head", g, (0, -0.6, 0.19))
    def hshade(co, c, f):
        col = mixc(lin(BEL), c, sstep(-0.01, 0.02, co.z))
        if math.sin(co.x*160)*math.sin(co.y*140) > 0.6 and co.z > 0.03: col = mixc(col, lin(DK), 0.35)
        return col, 0.3
    hp = Piece("croc_upper", 0.009, target=1500)
    hp.add(bm_tube([(0.05, 0.19, 0.1, 0.02), (-0.15, 0.17, 0.08, 0.01), (-0.4, 0.13, 0.055, 0.0), (-0.62, 0.1, 0.042, -0.005), (-0.74, 0.105, 0.04, -0.005), (-0.82, 0.06, 0.03, -0.008)], seg=18), TOP, 0)
    for s in (1, -1): hp.add(bm_ball(0.042, at=(0.075*s, -0.06, 0.085), scale=(1, 1.15, 0.85)), TOP, 0)   # eye bumps
    hp.add(bm_ball(0.035, at=(0, -0.79, 0.03), scale=(1.2, 1, 0.7)), TOP, 0)                                  # nostril bump
    head = hp.build(hd, shade=hshade, deform=lambda co, n: co + n*0.003*math.sin(co.x*120)*math.sin(co.y*90))
    eyes("croc", head, hd, (0.075, -0.06, 0.085), (0.5, -0.4, 1.0), 0.02, iris='#b8a83a', pupil='slit', lid=0.28, low=0.2, bulge=0.35, look=0.3)
    teeth = Painted("croc_teeth")
    for s in (1, -1):
        for k in range(13):
            y = -0.12 - k*0.055; x = (0.155 - k*0.0075 if k < 10 else 0.075 + (k - 10)*0.003)*s; L = 0.022 + (0.012 if k in (3, 11) else 0)
            teeth.add(bm_cone(0.0085, 0.0005, L, at=(x, y, -0.03 - L/2), rot=R(math.pi, 3, 'X'), seg=6), '#f1ecd8', 0.5)
    for x, y in ((0.018, -0.84), (-0.018, -0.84)): teeth.add(bm_ball(0.007, at=(x, y, 0.055), scale=(1, 1.3, 0.5), seg=8), '#1a1c12', 0.4)   # nostrils
    teeth.build(hd)
    jaw = empty("croc_jaw", hd, (0, 0.0, -0.02))
    jp = Piece("croc_lower", 0.009, target=900)
    jp.add(bm_tube([(0.05, 0.16, 0.045, -0.02), (-0.4, 0.105, 0.032, -0.012), (-0.66, 0.07, 0.025, -0.01), (-0.82, 0.06, 0.022, -0.01)], seg=16), '#7d7a4e', 0)
    jp.build(jaw, shade=lambda co, c, f: (mixc(lin(BEL), lin(MID), sstep(-0.02, 0.0, co.z)), 0.3))
    lt = Painted("croc_lowteeth")
    for s in (1, -1):
        for k in range(12):
            y = -0.15 - k*0.055; x = (0.12 - k*0.0055)*s; L = 0.02 + (0.012 if k == 2 else 0)
            lt.add(bm_cone(0.008, 0.0005, L, at=(x, y, 0.0 + L/2), seg=6), '#efe9d2', 0.5)
    lt.build(jaw)
    claws = Painted("croc_claws")
    for s in (1, -1):
        for y, nm in ((-0.36, "F"), (0.4, "B")):
            leg = empty("croc_leg%s%s" % (nm, "L" if s > 0 else "R"), g, (0.3*s, y, 0.15))
            lp = Piece("croc_leg%s%sP" % (nm, "L" if s > 0 else "R"), 0.01, target=500)
            K = Vector((0.2*s, -0.02, 0.02)); Fo = Vector((0.24*s, -0.06 if nm == "F" else 0.02, -0.13))
            lp.add(limb((0, 0, 0), K, 0.075 if nm == "B" else 0.06, 0.05), MID, 0).add(limb(K, Fo, 0.05, 0.04), MID, 0)
            lp.add(bm_ball(0.06, at=Fo + Vector((0, -0.04, -0.005)), scale=(1.2, 1.3, 0.3)), MID, 0)
            lp.build(leg, shade=lambda co, c, f: (mixc(lin(TOP), lin(MID), sstep(0.0, -0.12, co.z)) if math.sin(co.x*40 + co.y*30) < 0.6 else lin(DK), 0.25))
            n_ = 5 if nm == "F" else 4
            for k in range(n_):
                a = (k - (n_ - 1)/2)*0.38; E = Fo + Vector((math.sin(a)*0.1*s, -0.04 - math.cos(a)*0.08, -0.008)) + leg.location
                claws.add(limb(Fo + leg.location + Vector((0, -0.04, 0)), E, 0.012, 0.008), MID, 0.2)
                claws.add(limb(E, E + (E - Fo - leg.location).normalized()*0.025 + Vector((0, 0, -0.008)), 0.006, 0.0008), '#26261a', 0.5)
    claws.build(g)
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
    body = p.build(g)
    solid("beaver_nose", bm_ball(0.035, scale=(1.3, 0.9, 0.8)), mat("Nose", '#1e1612', 0.15), g, (0, -0.585, 0.36), 0)
    solid("beaver_teeth", bm_ball(0.05, scale=(0.8, 0.25, 0.9)), mat("BeaverTeeth", '#f0b83a', 0.25), g, (0, -0.56, 0.24), 0)
    eyes("beaver", body, g, (0.0, -0.36, 0.38), (0.09, -0.11, 0.08), 0.021, lid=0.3, low=0.15)
    t = empty("beaver_tail", g, (0, 0.38, 0.12))
    def scales(co, c, f): return (lin('#3a2a20') if math.sin(co.x*80)*math.sin(co.y*80) > 0 else lin('#4b3727')), 0.3
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
    body = p.build(g, shade=shade)
    solid("kangaroo_nose", bm_ball(0.03, scale=(1.3, 0.8, 0.9)), mat("Nose", '#1e1612', 0.15), g, (0, -0.37, 1.4), 0)
    eyes("kangaroo", body, g, (0.0, -0.12, 1.43), (0.075, -0.13, 0.05), 0.021, lid=0.32, low=0.14)
    j = empty("kangaroo_joey", g, (0, -0.24, 0.88))
    jp = Piece("kangaroo_joeyP_fur", 0.01); jp.add(bm_ball(0.07, scale=(0.9, 1.1, 0.9)), BR, 0.8)
    for s in (1, -1): jp.add(bm_ball(0.025, at=(0.04*s, 0.02, 0.07), scale=(0.6, 0.4, 1.6)), BR, 0.5)
    joey = jp.build(j)
    eyes("kangaroo_joey", joey, j, (0, 0, 0.01), (0.03, -0.06, 0.02), 0.011, lid=0.25, low=0.12)
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
    body = p.build(g)
    solid("quokka_nose", bm_ball(0.025, scale=(1.3, 0.8, 0.9)), mat("Nose", '#1e1612', 0.15), g, (0, -0.255, 0.44), 0)
    solid("quokka_smile", bm_ball(0.035, scale=(1.2, 0.3, 0.35)), mat("Smile", '#3a2418', 0.4), g, (0, -0.25, 0.405), 0)
    eyes("quokka", body, g, (0.0, -0.08, 0.45), (0.055, -0.11, 0.04), 0.018, iris='#1e140e', lid=0.25, low=0.12)
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
    neck = np_.build(n)
    solid("emu_beak", bm_cone(0.03, 0.006, 0.1, rot=R(math.pi/2, 3, 'X')), mat("EmuBeak", '#3b3530', 0.3), n, (0, -0.3, 0.67), 0)
    eyes("emu", neck, n, (0.0, -0.17, 0.68), (0.045, -0.05, 0.04), 0.016, iris='#a05a2a', lid=0.28, low=0.12)
    for s, side in ((1, "L"), (-1, "R")):
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
    body = p.build(g, shade=shade)
    solid("koala_nose", bm_ball(0.06, scale=(0.8, 0.7, 1.25)), mat("KoalaNose", '#222020', 0.12), g, (0, -0.215, 0.6), 1)
    eyes("koala", body, g, (0.0, -0.04, 0.64), (0.085, -0.13, 0.03), 0.017, iris='#2a1a10', lid=0.36, low=0.15)   # sleepy
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
    body = p.build(g, shade=shade)
    solid("deer_nose", bm_ball(0.03), mat("Nose", '#1e1612', 0.15), g, (0, -0.96, 1.58), 0)
    eyes("deer", body, g, (0.0, -0.72, 1.64), (0.075, -0.06, 0.02), 0.021, iris='#1e130c', lid=0.28, low=0.12, look=0.6)
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
    body = p.build(g, shade=shade)
    solid("wolf_nose", bm_ball(0.028), mat("Nose", '#1e1612', 0.15), g, (0, -1.01, 0.93), 0)
    eyes("wolf", body, g, (0.0, -0.72, 1.0), (0.06, -0.1, 0.03), 0.017, iris='#d29a28', lid=0.34, slant=0.35, low=0.15, look=0.7)
    t = empty("wolf_tail", g, (0, 0.48, 0.78))
    tp = Piece("wolf_tailP_fur", 0.012); tp.add(limb((0, 0, 0), (0, 0.42, -0.25), 0.07, 0.05), GR, 1.4).add(bm_ball(0.05, at=(0, 0.44, -0.27)), DK, 1.2); tp.build(t)
    for s in (1, -1):
        for y, nm in ((-0.34, "F"), (0.34, "B")):
            leg = empty("wolf_leg%s%s" % (nm, "L" if s > 0 else "R"), g, (0.12*s, y, 0.62))
            lp = Piece("wolf_leg%s%sP_fur" % (nm, "L" if s > 0 else "R"), 0.01)
            lp.add(limb((0, 0, 0.05), (0, 0.03, -0.3), 0.07, 0.045), GR, 0.7).add(limb((0, 0.03, -0.3), (0, 0.0, -0.58), 0.04, 0.035), GR, 0.4).add(bm_ball(0.045, at=(0, -0.03, -0.6), scale=(1, 1.3, 0.6)), LT, 0.3)
            lp.build(leg)
    return g

# ---------- wild rabbit (agouti brown, rufous nape, pale belly, white scut; long ears move) ----------
def rabbit():
    g = empty("rabbit"); BR, BE, RU = '#86705a', '#e2d8c4', '#a77548'
    def shade(co, c, f):
        col = c
        if co.z < 0.085 or (co.y < -0.06 and co.z < 0.2 and abs(co.x) < 0.06): col = mixc(col, lin(BE), 0.75)
        if -0.14 < co.y < -0.06 and co.z > 0.24: col = mixc(col, lin(RU), 0.6)                  # rufous nape
        n = math.sin(co.x*120 + co.z*80)*math.sin(co.y*110)
        return [x*(0.92 + 0.12*n) for x in col], f
    p = Piece("rabbit_body_fur", 0.0075, target=1700)
    p.add(bm_ball(0.13, at=(0, 0.05, 0.14), scale=(0.9, 1.35, 0.95)), BR, 1.0)
    for s in (1, -1): p.add(bm_ball(0.085, at=(0.075*s, 0.1, 0.11), scale=(0.8, 1.2, 1.0)), BR, 1.0)
    p.add(bm_ball(0.09, at=(0, -0.07, 0.15)), BR, 1.0)
    p.add(bm_ball(0.07, at=(0, -0.15, 0.25), scale=(0.85, 1.2, 0.92)), BR, 0.7).add(bm_ball(0.038, at=(0, -0.215, 0.232), scale=(1, 0.9, 0.85)), BR, 0.5)
    for s in (1, -1):
        p.add(bm_ball(0.03, at=(0.035*s, -0.18, 0.222)), BR, 0.6)
        p.add(limb((0.04*s, -0.1, 0.1), (0.04*s, -0.14, 0.0), 0.022, 0.016), BR, 0.5).add(bm_ball(0.018, at=(0.04*s, -0.155, 0.01), scale=(1, 1.4, 0.6)), BE, 0.4)
        p.add(limb((0.08*s, 0.12, 0.03), (0.07*s, -0.04, 0.012), 0.024, 0.018), BR, 0.5)
    p.add(bm_ball(0.035, at=(0, 0.215, 0.165)), '#f4f2ec', 1.5)                                  # white scut
    body = p.build(g, shade=shade)
    eyes("rabbit", body, g, (0.0, -0.15, 0.265), (1, -0.15, 0.15), 0.0135, iris='#24160e', lid=0.26, low=0.14, bulge=0.35, look=0.3)
    nose = Painted("rabbit_nose"); h = surface_hit(body, (0, -0.2, 0.235), (0, -1, 0.1))
    nose.add(bm_ball(0.009, at=h[0] + Vector((0, 0.003, 0.004)), scale=(1.3, 0.8, 0.9), seg=8), '#c4948a', 0.5); nose.build(g)
    for s, side in ((1, "L"), (-1, "R")):
        e = empty("rabbit_ear" + side, g, (0.026*s, -0.125, 0.305))
        ep = Piece("rabbit_ear%sP_fur" % side, 0.005, target=300)
        ep.add(bm_ball(0.03, at=(0, 0, 0.075), scale=(0.6, 0.32, 2.6)), BR, 0.4)
        def eshade(co, c, f): return (mixc(c, lin('#c9a99a'), 0.55) if co.y < -0.002 and 0.02 < co.z < 0.14 and abs(co.x) < 0.012 else mixc(c, lin('#3a2c22'), sstep(0.13, 0.15, co.z))), f*0.4
        eo = ep.build(e, shade=eshade); e.rotation_euler = (-0.3, 0.22*s, 0)
    return g

# ---------- beetles (glossy, Painted): rhinoceros beetle and stag beetle for tree trunks, a green scarab for rocks ----------
def beetle(kind):
    g = empty("beetle_" + kind); P = Painted("beetle_%s_body" % kind)
    EL, PR, LG = {'rhino': ('#3b2213', '#2c190d', '#1a0f08'), 'stag': ('#3a2a1c', '#2b1f15', '#1a120c'), 'green': ('#3f8f3a', '#4a9a40', '#22301c')}[kind]
    k = 0.8 if kind == 'green' else 1.0
    P.add(bm_ball(0.03*k, at=(0, 0.015*k, 0.022*k), scale=(0.85, 1.45, 0.62)), EL, 0.95)
    P.add(bm_ball(0.03*k, at=(0, 0.015*k, 0.0225*k), scale=(0.05, 1.44, 0.63)), LG, 0.9)       # the seam between the wing cases
    P.add(bm_ball(0.022*k, at=(0, -0.028*k, 0.022*k), scale=(1.05, 0.85, 0.7)), PR, 0.95)
    P.add(bm_ball(0.012*k, at=(0, -0.047*k, 0.016*k), scale=(1.1, 1, 0.8)), PR, 0.8)
    if kind == 'rhino':
        P.add(limb((0, -0.05, 0.02), (0, -0.075, 0.048), 0.006, 0.003), PR, 0.9)
        for s in (1, -1): P.add(limb((0, -0.075, 0.048), (0.006*s, -0.082, 0.056), 0.003, 0.0015), PR, 0.9)
        P.add(limb((0, -0.032, 0.036), (0, -0.054, 0.046), 0.005, 0.002), PR, 0.9)
    if kind == 'stag':
        for s in (1, -1):
            a = Vector((0.01*s, -0.055, 0.016)); b = Vector((0.03*s, -0.085, 0.02)); c = Vector((0.012*s, -0.105, 0.022))
            P.add(limb(a, b, 0.004, 0.0035), '#4a2a18', 0.9).add(limb(b, c, 0.0035, 0.0012), '#4a2a18', 0.9)
    for y in (-0.03, -0.008, 0.016):
        for s in (1, -1):
            a = Vector((0.016*s*k, y*k, 0.012*k)); b = Vector((0.036*s*k, (y + 0.004)*k, 0.016*k)); c = Vector((0.048*s*k, (y + 0.014 if y > -0.02 else y - 0.012)*k, 0.0))
            P.add(limb(a, b, 0.003*k, 0.0025*k, seg=6), LG, 0.5).add(limb(b, c, 0.0025*k, 0.0012*k, seg=6), LG, 0.5)
    for s in (1, -1): P.add(limb((0.008*s*k, -0.055*k, 0.018*k), (0.022*s*k, -0.07*k, 0.03*k), 0.0012, 0.0008, seg=5), LG, 0.4)   # feelers
    P.build(g)
    return g

# ================================================================== the grassland and more
def legs4(a, g, places, build, shade=None):
    """Four leg parts "<a>_legFL/FR/BL/BR" (joint at the hip/shoulder) built by build(piece, front, s)."""
    for s in (1, -1):
        for (x, y, z), nm in places:
            leg = empty("%s_leg%s%s" % (a, nm, "L" if s > 0 else "R"), g, (x*s, y, z))
            fur = "_fur" if a in ("horse", "tiger", "capybara") else ""
            lp = Piece("%s_leg%s%sP%s" % (a, nm, "L" if s > 0 else "R", fur), 0.012 if a != "tortoise" else 0.008, target=450)
            build(lp, nm == "F", s); lp.build(leg, shade=shade)

# ---------- horse (bay: red-brown coat, black mane, tail and lower legs; neck and head bend down to graze) ----------
def horse():
    g = empty("horse"); BAY, BK, LT = '#7b4526', '#1c1512', '#94603a'
    def shade(co, c, f):
        n = 0.5 + 0.5*math.sin(co.x*9 + co.y*7)*math.sin(co.z*8)
        return [x*(0.92 + 0.12*n) for x in c], f
    p = Piece("horse_body_fur", 0.02, target=2400)
    p.add(bm_tube([(-0.78, 0.17, 0.2, 0.05), (-0.62, 0.27, 0.36, 0.0), (-0.2, 0.31, 0.4, -0.04), (0.3, 0.3, 0.38, -0.01), (0.66, 0.28, 0.33, 0.04), (0.82, 0.16, 0.18, 0.06)], at=(0, 0, 1.17)), BAY, 0.5)
    p.add(bm_ball(0.3, at=(0, -0.6, 1.14), scale=(1, 0.9, 1.15)), BAY, 0.5).add(bm_ball(0.16, at=(0, -0.45, 1.5), scale=(0.9, 1.3, 0.7)), BAY, 0.5)   # chest and withers
    for s in (1, -1): p.add(bm_ball(0.24, at=(0.12*s, 0.56, 1.2), scale=(0.9, 1.1, 1.1)), BAY, 0.5)
    p.build(g, shade=shade)
    n = empty("horse_neck", g, (0, -0.66, 1.32))
    np_ = Piece("horse_neckP_fur", 0.015, target=1600)
    np_.add(limb((0, 0.06, -0.08), (0, -0.33, 0.55), 0.25, 0.13), BAY, 0.5).add(limb((0, 0.05, 0.12), (0, -0.3, 0.66), 0.12, 0.08), BAY, 0.5)   # neck with a crest
    np_.add(limb((0, -0.36, 0.6), (0, -0.78, 0.22), 0.12, 0.085), BAY, 0.4)
    np_.add(bm_ball(0.13, at=(0, -0.44, 0.48), scale=(0.75, 1.1, 1.0)), BAY, 0.4).add(bm_ball(0.095, at=(0, -0.8, 0.22), scale=(0.85, 1.1, 0.95)), '#5e3520', 0.3)
    for s in (1, -1): np_.add(bm_cone(0.045, 0.006, 0.14, at=(0.07*s, -0.36, 0.79), rot=R(0.2*s, 3, 'Y')), BAY, 0.3)
    np_.add(limb((0, 0.08, 0.16), (0, -0.33, 0.74), 0.045, 0.035), BK, 3.0)                       # the mane
    np_.add(bm_ball(0.045, at=(0, -0.42, 0.75), scale=(0.7, 1.4, 0.8)), BK, 2.5)                  # forelock
    def nshade(co, c, f):
        if co.y < -0.5 and abs(co.x) < 0.025 and co.z > 0.3: return mixc(c, lin('#efe8dc'), 0.85), f   # white blaze
        return c, f
    neck = np_.build(n, shade=nshade)
    eyes("horse", neck, n, (0, -0.48, 0.6), (1, -0.15, 0.2), 0.027, iris='#24160e', lid=0.32, low=0.14, look=0.3)
    bits = Painted("horse_bits")
    for s in (1, -1): bits.add(bm_ball(0.018, at=(0.035*s, -0.885, 0.22), scale=(0.7, 0.5, 1.2), seg=8), '#1a0f0a', 0.4)
    bits.build(n)
    t = empty("horse_tail", g, (0, 0.8, 1.27))
    tp = Piece("horse_tailP_fur", 0.012); tp.add(limb((0, 0, 0), (0, 0.16, -0.25), 0.06, 0.07), BK, 2.0).add(limb((0, 0.16, -0.25), (0, 0.2, -0.75), 0.07, 0.05), BK, 3.0); tp.build(t)
    def leg(lp, front, s):
        if front: lp.add(limb((0, 0, 0.12), (0, -0.02, -0.42), 0.11, 0.07), BAY, 0.5)
        else: lp.add(bm_ball(0.15, at=(0, 0.04, 0.0), scale=(0.75, 1.1, 1.3)), BAY, 0.5).add(limb((0, 0.06, -0.12), (0, 0.13, -0.45), 0.09, 0.065), BAY, 0.4)
        lp.add(limb((0, 0.13 if not front else -0.02, -0.45), (0, 0.0, -0.9), 0.06, 0.05), BK, 0.2)
        lp.add(bm_ball(0.065, at=(0, -0.01, -0.92), scale=(1, 1.1, 0.8)), BK, 0.2)
        lp.add(bm_cone(0.065, 0.075, 0.08, at=(0, -0.015, -0.98)), '#2a2420', 0)                   # hoof
    legs4("horse", g, [((0.17, -0.55, 1.0), "F"), ((0.17, 0.58, 1.0), "B")], leg, shade=lambda co, c, f: (mixc(c, lin(BK), sstep(-0.42, -0.5, co.z)), f*(1 - sstep(-0.4, -0.5, co.z))))
    return g

# ---------- tiger (orange with black stripes, white belly, cheeks and eye spots; head, legs and tail move) ----------
def tiger():
    g = empty("tiger"); OR, WH, BK = '#d9782a', '#f2ece0', '#1b1511'
    def body_shade(co, c, f):
        belly = (1 - sstep(0.55, 0.66, co.z))*(1 - sstep(0.12, 0.2, abs(co.x)))
        col = mixc(lin(OR), lin(WH), belly)
        st = math.sin(co.y*34 + math.sin(co.z*9 + co.x*4)*1.8 + abs(co.x)*5)
        if st > 0.8 and belly < 0.5 and math.sin(co.z*13 + co.y*5) > -0.6: col = lin(BK)
        return col, f
    p = Piece("tiger_body_fur", 0.013, target=4200)
    p.add(bm_tube([(-0.6, 0.15, 0.2, 0.0), (-0.45, 0.22, 0.28, -0.02), (-0.15, 0.22, 0.26, -0.04), (0.25, 0.2, 0.23, -0.01), (0.55, 0.19, 0.22, 0.02), (0.68, 0.11, 0.13, 0.04)], at=(0, 0, 0.64)), OR, 1.0)
    for s in (1, -1): p.add(bm_ball(0.12, at=(0.1*s, -0.38, 0.78)), OR, 1.0).add(bm_ball(0.15, at=(0.12*s, 0.48, 0.7)), OR, 1.0)
    p.build(g, shade=body_shade)
    hd = empty("tiger_head", g, (0, -0.64, 0.78))
    hp = Piece("tiger_headP_fur", 0.011, target=1500)
    hp.add(limb((0, 0.18, -0.06), (0, -0.04, 0.0), 0.17, 0.16), OR, 1.0)
    hp.add(bm_ball(0.16, at=(0, -0.12, 0.03), scale=(1.0, 1.1, 0.85)), OR, 1.0).add(bm_ball(0.1, at=(0, -0.31, -0.03), scale=(1.05, 1.1, 0.72)), WH, 0.4)
    hp.add(limb((0, -0.15, 0.08), (0, -0.34, 0.02), 0.065, 0.055), OR, 0.5)                          # bridge of the nose
    for s in (1, -1):
        hp.add(bm_ball(0.085, at=(0.13*s, -0.15, -0.04), scale=(1, 1.1, 0.9)), WH, 1.4)               # cheek ruff
        hp.add(bm_ball(0.045, at=(0.11*s, -0.03, 0.15), scale=(1, 0.45, 1)), OR, 0.6)                # ears
    def hshade(co, c, f):
        col = c
        if co.z > 0.06 and co.y < -0.08 and math.sin(co.x*55)*math.cos(co.y*30) > 0.6: col = lin(BK)   # forehead stripes
        if co.z > -0.02 and abs(co.x) > 0.13 and math.sin(co.z*45 + co.y*20) > 0.75: col = lin(BK)     # cheek stripes
        for s in (1, -1):
            if math.hypot(co.x - 0.065*s, co.z - 0.11) < 0.022 and co.y < -0.14: col = lin(WH)        # white spots over the eyes
            if math.hypot(co.x - 0.12*s, co.z - 0.17) < 0.03 and co.y > -0.04: col = lin(BK)          # black backs of the ears
        return col, f
    head = hp.build(hd, shade=hshade)
    eyes("tiger", head, hd, (0.0, -0.17, 0.07), (0.5, -1, 0.12), 0.02, iris='#d9a32a', lid=0.34, slant=0.35, low=0.16, look=0.6)
    nose = Painted("tiger_nose"); h = surface_hit(head, (0, -0.25, -0.01), (0, -1, 0.15))
    nose.add(bm_ball(0.026, at=h[0] + Vector((0, 0.006, 0)), scale=(1.3, 0.8, 0.8), seg=10), '#b3756a', 0.5)
    nose.add(bm_ball(0.004, at=h[0] + Vector((0, 0.004, -0.04)), scale=(1, 1, 6), seg=6), '#2a1a14', 0.2)
    nose.build(hd)
    t = empty("tiger_tail", g, (0, 0.66, 0.72))
    tp = Piece("tiger_tailP_fur", 0.011); tp.add(limb((0, 0, 0), (0, 0.42, -0.3), 0.05, 0.045), OR, 0.8).add(limb((0, 0.42, -0.3), (0, 0.85, -0.42), 0.045, 0.042), OR, 0.8)
    tp.build(t, shade=lambda co, c, f: (lin(BK) if (math.sin(co.y*32) > 0.55 or co.y > 0.78) else c, f))
    def leg(lp, front, s):
        if front: lp.add(limb((0, 0, 0.1), (0, -0.03, -0.3), 0.11, 0.08), OR, 0.9).add(limb((0, -0.03, -0.3), (0, 0.0, -0.5), 0.075, 0.07), OR, 0.6)
        else: lp.add(bm_ball(0.16, at=(0, 0.02, 0.02), scale=(0.8, 1.25, 1.25)), OR, 0.9).add(limb((0, 0.06, -0.12), (0, 0.16, -0.34), 0.095, 0.07), OR, 0.7).add(limb((0, 0.16, -0.34), (0, 0.06, -0.54), 0.065, 0.06), OR, 0.5)
        lp.add(bm_ball(0.085, at=(0, -0.05, -0.52 if front else -0.56), scale=(1.05, 1.35, 0.55)), WH, 0.5)
    legs4("tiger", g, [((0.15, -0.42, 0.56), "F"), ((0.15, 0.48, 0.6), "B")], leg, shade=lambda co, c, f: (lin(BK) if math.sin(co.z*28 + co.y*8) > 0.78 and co.z > -0.5 else c, f))
    return g

# ---------- hippo (huge glossy grey-purple barrel, pink underneath, big head with a jaw that opens wide to yawn, tusks) ----------
def hippo():
    g = empty("hippo"); GR, PK, DK = '#7a6670', '#c99790', '#5b4a54'
    def shade(co, c, f):
        col = mixc(lin(PK), lin(GR), sstep(0.22, 0.42, co.z) if abs(co.x) < 0.3 else 1); n = math.sin(co.x*13)*math.sin(co.y*11 + co.z*9)
        return [x*(0.94 + 0.08*n) for x in col], 0.45
    p = Piece("hippo_body", 0.035, target=2400)
    p.add(bm_ball(0.7, at=(0, 0.1, 0.7), scale=(0.88, 1.45, 0.8)), GR, 0)
    for s in (1, -1):
        for y in (-0.55, 0.75): p.add(limb((0.36*s, y, 0.45), (0.37*s, y, 0.0), 0.2, 0.19), GR, 0).add(bm_ball(0.2, at=(0.37*s, y - 0.03, 0.03), scale=(1.05, 1.1, 0.3)), DK, 0)
    p.add(bm_cone(0.08, 0.01, 0.25, at=(0, 1.12, 0.78), rot=R(-math.pi/2 - 0.5, 3, 'X')), GR, 0)
    p.build(g, shade=shade)
    hd = empty("hippo_head", g, (0, -0.85, 0.82))
    hp = Piece("hippo_headP", 0.022, target=1600)
    hp.add(limb((0, 0.25, -0.1), (0, -0.15, 0.0), 0.36, 0.3), GR, 0)
    hp.add(bm_ball(0.3, at=(0, -0.28, 0.06), scale=(0.95, 1.1, 0.8)), GR, 0).add(bm_ball(0.3, at=(0, -0.62, -0.02), scale=(1.25, 0.9, 0.55)), GR, 0)
    for s in (1, -1):
        hp.add(bm_ball(0.075, at=(0.1*s, -0.8, 0.12)), GR, 0)                                         # nostril bumps
        hp.add(bm_ball(0.08, at=(0.17*s, -0.28, 0.27)), GR, 0)                                         # eye bumps
        hp.add(bm_ball(0.05, at=(0.2*s, -0.08, 0.34), scale=(1, 0.6, 1.2)), DK, 0)                     # ears
    head = hp.build(hd, shade=lambda co, c, f: (mixc(lin(PK), c, sstep(-0.12, 0.02, co.z)), 0.45))
    eyes("hippo", head, hd, (0.17, -0.28, 0.27), (0.5, -0.7, 0.6), 0.032, iris='#3a2416', lid=0.38, low=0.22, look=0.3)
    jaw = empty("hippo_jaw", hd, (0, -0.12, -0.12))
    jp = Piece("hippo_jawP", 0.02, target=900)
    jp.add(bm_ball(0.28, at=(0, -0.42, -0.06), scale=(1.18, 1.05, 0.4)), PK, 0)
    jp.build(jaw, shade=lambda co, c, f: (mixc(lin('#d9837f'), lin(PK), sstep(-0.02, -0.08, co.z)), 0.5))
    tusk = Painted("hippo_tusks")
    for s in (1, -1): tusk.add(bm_cone(0.03, 0.004, 0.13, at=(0.23*s, -0.62, 0.03), rot=R(0.25*s, 3, 'Y'), seg=8), '#efe6cf', 0.5); tusk.add(bm_cone(0.02, 0.003, 0.08, at=(0.12*s, -0.72, 0.0), seg=8), '#efe6cf', 0.5)
    tusk.build(jaw)
    return g

# ---------- capybara (big calm rodent: coarse brown coat, blunt square face, tiny ears, no tail) ----------
def capybara():
    g = empty("capybara"); BR = '#8a6440'
    p = Piece("capybara_body_fur", 0.012, target=1900)
    p.add(bm_ball(0.3, at=(0, 0.05, 0.37), scale=(0.85, 1.45, 0.92)), BR, 1.0)
    p.add(bm_ball(0.13, at=(0, -0.44, 0.46), scale=(0.85, 1.35, 1.0)), BR, 0.7).add(bm_ball(0.1, at=(0, -0.59, 0.41), scale=(1.0, 0.8, 1.1)), '#7a5434', 0.5)
    for s in (1, -1):
        p.add(bm_ball(0.035, at=(0.075*s, -0.35, 0.59), scale=(1, 0.5, 1)), '#6a4a30', 0.4)
        p.add(limb((0.15*s, -0.27, 0.2), (0.15*s, -0.3, 0.02), 0.065, 0.05), BR, 0.6).add(bm_ball(0.05, at=(0.15*s, -0.33, 0.02), scale=(1, 1.3, 0.5)), '#5a3e28', 0.3)
        p.add(limb((0.17*s, 0.32, 0.2), (0.17*s, 0.24, 0.02), 0.085, 0.055), BR, 0.6).add(bm_ball(0.055, at=(0.17*s, 0.2, 0.02), scale=(1, 1.5, 0.5)), '#5a3e28', 0.3)
    body = p.build(g, shade=lambda co, c, f: ([x*(0.9 + 0.14*math.sin(co.x*60 + co.z*50)*math.sin(co.y*55)) for x in c], f))
    eyes("capybara", body, g, (0, -0.44, 0.5), (1, -0.3, 0.45), 0.018, iris='#1e130c', lid=0.4, low=0.16, look=0.3)
    nose = Painted("capybara_nose"); h = surface_hit(body, (0, -0.57, 0.43), (0, -1, 0.1))
    for s in (1, -1): nose.add(bm_ball(0.012, at=h[0] + Vector((0.025*s, 0.004, 0.012)), scale=(1, 0.5, 1.4), seg=8), '#2a1a12', 0.3)
    nose.build(g)
    return g

# ---------- tortoise (sulcata: tall domed shell of ridged brown-gold scutes, thick scaly elephant legs, slow head) ----------
def tortoise():
    g = empty("tortoise"); SH, LT, SEAM, SK = '#8a6a36', '#c9a35a', '#3c2c16', '#9a8a68'
    cen = [(0, y) for y in (-0.21, -0.1, 0.0, 0.1, 0.21)] + [(x*s, y) for s in (1, -1) for x, y in ((0.13, -0.15), (0.15, -0.05), (0.15, 0.05), (0.13, 0.15))]
    for i in range(22):
        a = i/22*2*math.pi; cen.append((math.sin(a)*0.27, -math.cos(a)*0.34))
    def vor(x, y): ds = sorted(math.hypot(x - cx, y - cy) for cx, cy in cen); return ds[0], ds[1]
    def deform(co, n):
        if co.z < 0.1: return co
        d1, d2 = vor(co.x, co.y); return co - n*0.004*(1 - sstep(0.0, 0.016, d2 - d1)) + n*0.004*max(0, 1 - d1/0.07)
    def shade(co, c, f):
        if co.z < 0.08: return lin('#b39a62'), 0.2
        d1, d2 = vor(co.x, co.y); seam = sstep(0.0, 0.018, d2 - d1)
        col = mixc(lin(LT), lin(SH), sstep(0.02, 0.07, d1)); col = mixc(col, lin('#6e5228'), 0.35*(0.5 + 0.5*math.sin(d1*150)))
        return mixc(lin(SEAM), col, seam), 0.25
    p = Piece("tortoise_body", 0.009, target=2600)
    p.add(bm_ball(0.33, at=(0, 0, 0.18), scale=(0.84, 1.08, 0.78)), SH, 0)
    p.add(bm_ball(0.33, at=(0, 0, 0.13), scale=(0.88, 1.12, 0.14)), SH, 0)
    p.add(bm_ball(0.3, at=(0, 0, 0.09), scale=(0.8, 1.04, 0.1)), '#b39a62', 0)
    p.build(g, shade=shade, deform=deform)
    scales = lambda co, c, f: ([x*(0.86 + 0.18*(0.5 + 0.5*math.sin(co.x*150)*math.sin(co.y*140 + co.z*120))) for x in c], 0.2)
    hd = empty("tortoise_head", g, (0, -0.33, 0.14))
    hp = Piece("tortoise_headP", 0.006, target=800)
    hp.add(limb((0, 0.08, -0.01), (0, -0.05, 0.03), 0.06, 0.05), SK, 0).add(bm_ball(0.055, at=(0, -0.09, 0.05), scale=(0.85, 1.25, 0.85)), SK, 0)
    head = hp.build(hd, shade=scales)
    eyes("tortoise", head, hd, (0.0, -0.1, 0.06), (1, -0.5, 0.3), 0.012, iris='#2a1a0e', lid=0.36, low=0.22, bulge=0.4)
    bk = Painted("tortoise_beak"); bk.add(bm_ball(0.02, at=(0, -0.14, 0.03), scale=(1.1, 0.7, 0.6), seg=10), '#4a3a24', 0.4); bk.build(hd)
    def leg(lp, front, s):
        F = Vector((0.06*s, -0.04 if front else 0.04, -0.105))
        lp.add(limb((0, 0, 0), F, 0.07, 0.06), SK, 0).add(bm_ball(0.07, at=F + Vector((0, 0, -0.005)), scale=(1.15, 1.2, 0.45)), SK, 0)
        for k in range(-2, 3): lp.add(bm_cone(0.012, 0.002, 0.03, at=F + Vector((k*0.022, -0.06 if front else 0.06, -0.02)), rot=R(math.pi/2 if front else -math.pi/2, 3, 'X')), '#3a3020', 0)
    legs4("tortoise", g, [((0.2, -0.2, 0.12), "F"), ((0.2, 0.22, 0.12), "B")], leg, shade=scales)
    return g

# ---------- snake (rat snake: olive with dark saddle blotches, cream belly; the game makes it slither) ----------
def snake():
    g = empty("snake"); OL, BL, BE = '#7a7a3a', '#3a3a1c', '#e2d9a8'
    prof = [(-0.86, 0.001, 0.001, 0.035), (-0.84, 0.022, 0.016, 0.035), (-0.8, 0.032, 0.024, 0.036), (-0.76, 0.03, 0.022, 0.034), (-0.72, 0.024, 0.02, 0.032)]
    for i in range(1, 15): t = -0.72 + i*0.11; r = 0.034*(1 - max(0, (t - 0.3)/0.6)**1.5) + 0.004; prof.append((t, r, r*0.85, 0.032))
    prof.append((0.86, 0.001, 0.001, 0.03))
    def shade(co, c, f):
        col = mixc(lin(BE), lin(OL), sstep(0.022, 0.034, co.z))
        if co.z > 0.03 and math.sin(co.y*36) > 0.35 and abs(co.x) < 0.025: col = mixc(col, lin(BL), 0.85)        # saddles
        if co.z > 0.025 and abs(co.x) > 0.022 and math.sin(co.y*36 + 1.6) > 0.6: col = mixc(col, lin(BL), 0.6)  # side spots
        return col, 0.55
    p = Piece("snake_body", 0.006, target=2400)
    p.add(bm_tube(prof, seg=14), OL, 0)
    body = p.build(g, shade=shade)
    eyes("snake", body, g, (0, -0.81, 0.045), (1, -0.4, 0.5), 0.0075, iris='#c9a13a', pupil='round', lid=0.18, low=0.0, bulge=0.4, look=0.5)
    t = empty("snake_tongue", g, (0, -0.86, 0.03))
    tg = Painted("snake_tongueP")
    tg.add(limb((0, 0, 0), (0, -0.05, 0), 0.0025, 0.002, seg=5), '#c8303a', 0.5)
    for s in (1, -1): tg.add(limb((0, -0.05, 0), (0.008*s, -0.07, 0), 0.002, 0.0008, seg=5), '#c8303a', 0.5)
    tg.build(t)
    return g

# ---------- peacock (blue neck and breast, bronze-green back, crest, a long train that rises into a fan of eyespots) ----------
def peacock():
    g = empty("peacock"); BL, GN, BZ = '#1d5fbf', '#2f7a52', '#8a6a2a'
    p = Piece("peacock_body_feather", 0.01, target=1500)
    p.add(bm_ball(0.16, at=(0, 0.05, 0.75), scale=(0.82, 1.35, 1.0)), GN, 0.9).add(bm_ball(0.12, at=(0, -0.09, 0.78), scale=(0.85, 0.9, 1.1)), BL, 0.6)
    p.build(g, shade=lambda co, c, f: (mixc(c, lin(BZ), 0.35) if co.y > 0.1 and co.z > 0.76 else c, f))
    n = empty("peacock_neck", g, (0, -0.13, 0.85))
    np_ = Piece("peacock_neckP_feather", 0.007, target=700)
    np_.add(limb((0, 0, 0), (0, -0.05, 0.27), 0.055, 0.035), BL, 0.5).add(bm_ball(0.045, at=(0, -0.07, 0.3), scale=(0.85, 1.2, 0.95)), BL, 0.4)
    neck = np_.build(n, shade=lambda co, c, f: ((lin('#f4f2ec') if co.z > 0.28 and abs(co.x) > 0.025 and co.y < -0.06 and abs(co.z - 0.305) < 0.01 else c), f))
    eyes("peacock", neck, n, (0, -0.07, 0.31), (1, -0.4, 0.2), 0.009, iris='#2a1a10', lid=0.25, low=0.12)
    bits = Painted("peacock_bits")
    bits.add(bm_cone(0.012, 0.002, 0.04, at=(0, -0.125, 0.3), rot=R(math.pi/2 + 0.2, 3, 'X'), seg=8), '#8a7a62', 0.4)
    for k in range(-2, 3):
        a = Vector((0, -0.06, 0.34)); b = a + Vector((k*0.012, 0.01, 0.07)); bits.add(limb(a, b, 0.0025, 0.0015, seg=5), BL, 0.4).add(bm_ball(0.008, at=b, scale=(1, 0.6, 1.2), seg=6), BL, 0.6)   # crest
    bits.build(n)
    legs = Painted("peacock_legs")
    for s in (1, -1):
        A = Vector((0.05*s, 0.02, 0.0)); legs.add(limb((0.05*s, 0.05, 0.62), A + Vector((0, 0, 0.01)), 0.012, 0.01), '#8a8070', 0.3)
        for dx in (-0.025, 0, 0.025): legs.add(limb(A, A + Vector((dx*s, -0.06, 0)), 0.006, 0.004), '#8a8070', 0.3)
    legs.build(g)
    def eyespot(d, base):
        if d < 0.028: return lin('#13235e')
        if d < 0.042: return lin('#1f8fa0')
        if d < 0.058: return lin('#c08a2a')
        if d < 0.068: return lin('#5aa04a')
        return base
    tr = empty("peacock_train", g, (0, 0.2, 0.74))
    tp = Piece("peacock_trainP", 0.01, target=900)
    tp.add(bm_tube([(0.0, 0.08, 0.03, 0), (0.4, 0.17, 0.025, -0.15), (0.8, 0.2, 0.02, -0.4), (1.15, 0.12, 0.015, -0.6), (1.25, 0.02, 0.01, -0.65)]), GN, 0)
    def tshade(co, c, f):
        best = 9
        for i in range(7):
            yy = 0.3 + i*0.14
            for xx in ((-0.08, 0.08) if i % 2 else (0.0, -0.15, 0.15)): best = min(best, math.hypot(co.x - xx, (co.y - yy)*0.8))
        return eyespot(best, c), 0.6
    tp.build(tr, shade=tshade)
    fan = empty("peacock_fan", g, (0, 0.2, 0.78))
    fp = Piece("peacock_fanP", 0.01, target=2400)
    for k in range(31):
        a = -1.45 + k*2.9/30; d = Vector((math.sin(a), 0, math.cos(a)))
        fp.add(bm_ball(0.075, at=d*0.42, scale=(1, 0.4, 5.6), rot=R(a, 3, 'Y'), seg=12), GN, 0)
    def fshade(co, c, f):
        r = math.hypot(co.x, co.z); a = math.atan2(co.x, co.z); best = 9
        for ring, step in ((0.38, 0.3), (0.56, 0.22), (0.74, 0.17)):
            k = round(a/step); best = min(best, math.hypot(r - ring, (a - k*step)*ring))
        base = mixc(lin(GN), lin(BZ), 0.15 + 0.1*math.sin(a*60))   # radial feather streaks
        if r < 0.18: base = lin('#3a6a4a')
        return eyespot(best, base), 0.6
    fp.build(fan, shade=fshade)
    return g

for f in (gull, eagle, owl, heron, dolphin, whale, fish, lizard, frog, turtle, croc, beaver, kangaroo, quokka, emu, koala, deer, wolf, rabbit, horse, tiger, hippo, capybara, tortoise, snake, peacock):
    f(); print("built", f.__name__)
for k in ('rhino', 'stag', 'green'): beetle(k); print("built beetle", k)

for o in scene.objects: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_apply=True, export_vertex_color='ACTIVE', export_yup=True)
print("EXPORTED", OUT, len(bpy.data.objects))
