# Builds the yard props (burrow house, street lamp, flower bed, foods) in a "Props" scene and exports
# assets/models/props.glb. Front of every prop faces -Y in Blender (= +Z in the game).
# Run inside Blender:  exec(open(r"C:\Users\User\Documents\wombat-pet\blender\props_build.py", encoding="utf-8").read())
import bpy, bmesh, math, random
from mathutils import Vector, Matrix

random.seed(7)
OUT = r"C:\Users\User\Documents\wombat-pet\assets\models\props.glb"

def lin(h):
    h = h.lstrip('#'); c = [int(h[i:i+2], 16)/255 for i in (0, 2, 4)]
    return [x/12.92 if x <= 0.04045 else ((x + 0.055)/1.055)**2.4 for x in c]

def mat(name, hexc, rough=0.7, metal=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name); m.use_nodes = True
    bs = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bs.inputs["Base Color"].default_value = (*lin(hexc), 1); bs.inputs["Roughness"].default_value = rough; bs.inputs["Metallic"].default_value = metal
    m.diffuse_color = (*lin(hexc), 1); return m

scene = bpy.data.scenes.get("Props") or bpy.data.scenes.new("Props")
bpy.context.window.scene = scene
for o in list(scene.objects): bpy.data.objects.remove(o, do_unlink=True)

def obj_from_bm(name, bm, material, parent=None, smooth=True):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = smooth
    o = bpy.data.objects.new(name, me); scene.collection.objects.link(o); me.materials.append(material)
    if parent: o.parent = parent
    return o

def empty(name, parent=None):
    e = bpy.data.objects.new(name, None); scene.collection.objects.link(e)
    if parent: e.parent = parent
    return e

def sphere(name, r, m, at=(0,0,0), scale=(1,1,1), seg=24, ring=16, parent=None, smooth=True):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=ring, radius=r)
    bmesh.ops.transform(bm, matrix=Matrix.Diagonal((*scale, 1)), verts=bm.verts)
    o = obj_from_bm(name, bm, m, parent, smooth); o.location = at; return o

def cyl(name, r1, r2, h, m, at=(0,0,0), seg=16, parent=None, rot=None, smooth=True):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r1, radius2=r2, depth=h)
    if rot: bmesh.ops.rotate(bm, cent=Vector((0,0,0)), matrix=rot, verts=bm.verts)
    o = obj_from_bm(name, bm, m, parent, smooth); o.location = at; return o

def torus(name, R, r, m, at=(0,0,0), rot=None, parent=None, arc=1.0, seg=32, tseg=10):
    bm = bmesh.new(); verts = []
    n = seg if arc >= 1 else seg + 1
    for i in range(n):
        a = i/seg*2*math.pi*arc
        ring = []
        for j in range(tseg):
            b = j/tseg*2*math.pi
            ring.append(bm.verts.new(((R + r*math.cos(b))*math.cos(a), (R + r*math.cos(b))*math.sin(a), r*math.sin(b))))
        verts.append(ring)
    for i in range(n if arc >= 1 else n - 1):
        a, b_ = verts[i], verts[(i + 1) % n]
        for j in range(tseg): bm.faces.new((a[j], a[(j+1) % tseg], b_[(j+1) % tseg], b_[j]))
    if rot: bmesh.ops.rotate(bm, cent=Vector((0,0,0)), matrix=rot, verts=bm.verts)
    o = obj_from_bm(name, bm, m, parent); o.location = at; return o

def box(name, size, m, at=(0,0,0), parent=None, bevel=0.02, rotz=0.0):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.transform(bm, matrix=Matrix.Diagonal((*size, 1)), verts=bm.verts)
    if rotz: bmesh.ops.rotate(bm, cent=Vector((0,0,0)), matrix=Matrix.Rotation(rotz, 3, 'Z'), verts=bm.verts)
    o = obj_from_bm(name, bm, m, parent, smooth=False); o.location = at
    if bevel:
        bv = o.modifiers.new("bevel", 'BEVEL'); bv.width = bevel; bv.segments = 2
    return o

def lumpy(o, amt, scale=1.6):
    """Organic wobble: displace along normals with low-frequency noise."""
    tex = bpy.data.textures.new(o.name + "_n", 'CLOUDS'); tex.noise_scale = scale
    d = o.modifiers.new("lumpy", 'DISPLACE'); d.texture = tex; d.strength = amt; d.mid_level = 0.5

R = Matrix.Rotation
# ------------------------------------------------------------------ cottage (Ghibli style: stone, plaster, red tiles, ivy)
house = empty("house")
PLASTER, BEAM = mat("Plaster", '#eadbbd', 0.95), mat("Beam", '#7a5233', 0.85)
STONES = [mat("Stone", '#b3aa98', 0.9), mat("Stone2", '#9d9483', 0.9), mat("Stone3", '#c4b9a3', 0.9)]
TILES = [mat("Tile", '#c25a3a', 0.75), mat("Tile2", '#b04c30', 0.75), mat("Tile3", '#d16c46', 0.75), mat("Tile4", '#a8452c', 0.75)]
IVY = [mat("Ivy", '#4f7f3a', 0.9), mat("Ivy2", '#6a9a45', 0.9), mat("Ivy3", '#3d6a33', 0.9)]
BLOOM = [mat("Pink", '#f2a6be', 0.6), mat("White", '#fbf8f0', 0.6), mat("Yellow", '#f3d250', 0.6)]
GLASS, IRON, SHUT = mat("Glass", '#ffe6a3', 0.2), mat("Iron", '#3a3430', 0.4, 0.6), mat("Shutter", '#5f8a6a', 0.8)
W2, D2, H = 1.8, 1.6, 2.0                       # half width (x), half depth (y), wall height
walls = box("walls", (W2*2, D2*2, H), PLASTER, at=(0, 0, H/2 + 0.25), parent=house, bevel=0.04)
# stone footing all round, and stones showing through the plaster on the front
for side in range(4):
    L = (W2 if side % 2 == 0 else D2)*2 + 0.2
    for i in range(int(L/0.42)):
        t = -L/2 + 0.21 + i*0.42
        x, y = ((t, -D2 - 0.05) if side == 0 else (W2 + 0.05, t) if side == 1 else (t, D2 + 0.05) if side == 2 else (-W2 - 0.05, t))
        st = sphere(f"foot{side}_{i}", 0.24, STONES[(i + side) % 3], at=(x, y, 0.18), scale=(1.0, 1.0, 0.8), seg=10, ring=6, parent=house); lumpy(st, 0.06, 0.4)
for i in range(16):
    x, z = random.uniform(-W2 + 0.3, W2 - 0.3), random.uniform(0.6, H)
    if abs(x) < 0.8 and z < 1.9: continue                                   # keep the doorway clear
    if 0.7 < abs(x) < 1.6 and 0.85 < z < 1.75: continue                     # and the windows
    st = sphere(f"wst{i}", random.uniform(0.12, 0.2), STONES[i % 3], at=(x, -D2 - 0.01, z), scale=(1.3, 0.35, 0.9), seg=10, ring=6, parent=house); lumpy(st, 0.03, 0.3)
# timber frame: corner posts and a beam under the eaves
for sx in (-1, 1):
    for sy in (-1, 1): box(f"post{sx}{sy}", (0.2, 0.2, H + 0.1), BEAM, at=(sx*(W2 - 0.04), sy*(D2 - 0.04), H/2 + 0.25), parent=house, bevel=0.02)
for sy in (-1, 1): box(f"beam{sy}", (W2*2 + 0.2, 0.18, 0.18), BEAM, at=(0, sy*(D2 + 0.02), H + 0.25), parent=house, bevel=0.02)
# gable roof: the ridge runs front to back, so the triangle faces the front like the reference cottage
top, pitch, over = H + 0.25, math.radians(38), 0.35
run = W2 + over; rise = run*math.tan(pitch); peak = W2*math.tan(pitch)
for sx in (-1, 1):
    rows, cols = 7, 11
    for r in range(rows):
        u = (r + 0.5)/rows
        for c in range(cols):
            y = -D2 - over + (c + 0.5)/cols*(2*(D2 + over)) + (0.07 if r % 2 else 0)
            if abs(y) > D2 + over: continue
            x = sx*run*(1 - u); z = top - over*math.tan(pitch) + rise*u + 0.07
            t = box(f"tile{sx}_{r}_{c}", (run/math.cos(pitch)/rows*1.25, 2*(D2 + over)/cols*0.96, 0.08), TILES[(r*3 + c*7 + (sx > 0)) % 4], at=(x, y, z), parent=house, bevel=0.025)
            t.rotation_euler = (random.uniform(-0.03, 0.03), sx*pitch + random.uniform(-0.04, 0.04), random.uniform(-0.03, 0.03))
    slab = box(f"roofslab{sx}", (run/math.cos(pitch), 2*(D2 + over), 0.1), TILES[3], at=(sx*run/2, 0, top - over*math.tan(pitch) + rise/2), parent=house, bevel=0.0)
    slab.rotation_euler = (0, sx*pitch, 0)
box("ridge", (0.22, 2*(D2 + over) + 0.1, 0.16), TILES[1], at=(0, 0, top - over*math.tan(pitch) + rise + 0.1), parent=house, bevel=0.05)
for sy in (-1, 1):                                                          # plastered gable triangles with a king post
    bm = bmesh.new(); vs = [bm.verts.new((x, 0, z)) for x, z in ((-W2, top), (W2, top), (0, top + peak))]; bm.faces.new(vs)
    g_ = obj_from_bm(f"gable{sy}", bm, PLASTER, house, smooth=False); g_.location = (0, sy*D2, 0)
    m = g_.modifiers.new("t", 'SOLIDIFY'); m.thickness = 0.12; m.offset = 0
    box(f"gbeam{sy}", (0.14, 0.12, peak), BEAM, at=(0, sy*(D2 + 0.06), top + peak/2), parent=house, bevel=0.02)
cyl("attic", 0.2, 0.2, 0.08, GLASS, at=(0.45, -D2 - 0.08, top + 0.5), seg=20, rot=R(math.pi/2, 3, 'X'), parent=house)
torus("atticrim", 0.22, 0.045, BEAM, at=(0.45, -D2 - 0.1, top + 0.5), rot=R(math.pi/2, 3, 'X'), parent=house)
# arched plank door with a little round window, stone arch and steps
for i in range(5): box(f"plank{i}", (0.26, 0.08, 1.35), BEAM, at=(-0.52 + i*0.26, -D2 - 0.06, 0.25 + 0.67), parent=house, bevel=0.015)
sphere("doortop", 0.65, BEAM, at=(0, -D2 - 0.06, 1.6), scale=(1, 0.06, 0.6), seg=24, ring=10, parent=house)
for i in range(9):
    a = math.pi*i/8
    st = sphere(f"arch{i}", 0.13, STONES[i % 3], at=(math.cos(a)*0.72, -D2 - 0.08, 1.6 + math.sin(a)*0.55), scale=(1, 0.8, 1), seg=10, ring=6, parent=house); lumpy(st, 0.03, 0.3)
cyl("doorwin", 0.13, 0.13, 0.05, GLASS, at=(0, -D2 - 0.13, 1.38), seg=16, rot=R(math.pi/2, 3, 'X'), parent=house)
sphere("knob", 0.05, IRON, at=(0.38, -D2 - 0.14, 0.95), parent=house)
for i, (y, z, w) in enumerate([(-D2 - 0.35, 0.1, 1.6), (-D2 - 0.75, 0.04, 1.8)]):
    st = box(f"step{i}", (w, 0.45, 0.16), STONES[i], at=(0, y, z), parent=house, bevel=0.06); lumpy(st, 0.03, 0.5)
# windows with shutters and flower boxes
def window(name, at, rotz=0.0):
    g = empty(name, house); g.location = at; g.rotation_euler = (0, 0, rotz)
    box(name + "_glass", (0.62, 0.06, 0.62), GLASS, parent=g, bevel=0.0)
    for k, x in enumerate((-0.33, 0.33)): box(name + f"_f{k}", (0.07, 0.1, 0.72), BEAM, at=(x, -0.02, 0), parent=g, bevel=0.01)
    for k, z in enumerate((-0.33, 0.33)): box(name + f"_h{k}", (0.72, 0.1, 0.07), BEAM, at=(0, -0.02, z), parent=g, bevel=0.01)
    box(name + "_mull", (0.04, 0.08, 0.62), BEAM, at=(0, -0.03, 0), parent=g, bevel=0.0); box(name + "_mulh", (0.62, 0.08, 0.04), BEAM, at=(0, -0.03, 0), parent=g, bevel=0.0)
    for k, x in enumerate((-0.55, 0.55)): box(name + f"_sh{k}", (0.34, 0.05, 0.74), SHUT, at=(x, -0.05, 0), parent=g, bevel=0.015)
    box(name + "_box", (0.8, 0.22, 0.16), BEAM, at=(0, -0.13, -0.42), parent=g, bevel=0.02)
    for i in range(7):
        sphere(name + f"_fl{i}", 0.07, BLOOM[i % 3] if i % 2 else IVY[1], at=(-0.33 + i*0.11, -0.15, -0.3 + random.uniform(0, 0.06)), seg=8, ring=6, parent=g)
window("winL", (-1.2, -D2 - 0.04, 1.3)); window("winR", (1.2, -D2 - 0.04, 1.3))
window("winS", (W2 + 0.04, 0.2, 1.3), math.pi/2); window("winS2", (-W2 - 0.04, -0.2, 1.3), -math.pi/2)
# stone chimney at the back right
for i in range(10):
    st = box(f"chim{i}", (0.62, 0.62, 0.24), STONES[i % 3], at=(0.95 + random.uniform(-0.02, 0.02), 0.75, top + 0.3 + i*0.23), parent=house, bevel=0.06); lumpy(st, 0.025, 0.4)
box("chimcap", (0.74, 0.74, 0.1), STONES[1], at=(0.95, 0.75, top + 0.3 + 10*0.23), parent=house, bevel=0.03)
# ivy climbing the front-left corner and over the eave, with little flowers
nid = [0]
def ivy(path, n, spread):
    for i in range(n):
        u = i/(n - 1); x, y, z = [path[0][k] + (path[1][k] - path[0][k])*u for k in range(3)]
        for k in range(3):
            nid[0] += 1
            bl = sphere(f"ivy{nid[0]}", random.uniform(0.12, 0.22), IVY[(i + k) % 3], at=(x + random.uniform(-spread, spread), y + random.uniform(-0.06, 0.02), z + random.uniform(-spread, spread)), scale=(1, 0.55, 0.9), seg=10, ring=6, parent=house)
            lumpy(bl, 0.05, 0.25)
        if i % 2 == 0:
            nid[0] += 1; sphere(f"ivyfl{nid[0]}", 0.06, BLOOM[i % 3], at=(x + random.uniform(-spread, spread), y - 0.12, z + random.uniform(-spread, spread)), seg=8, ring=6, parent=house)
ivy([(-W2 - 0.02, -D2 - 0.08, 0.3), (-W2 + 0.2, -D2 - 0.08, H + 0.3)], 9, 0.22)
ivy([(-W2 + 0.2, -D2 - 0.14, H + 0.4), (-0.6, -D2 - 0.25, H + 0.75)], 6, 0.18)
ivy([(W2 + 0.08, D2 - 0.4, 0.3), (W2 + 0.08, -0.6, 1.0)], 6, 0.2)
# flower pots and a lantern by the door, stepping stones
for i, x in enumerate((-0.95, 0.95)):
    cyl(f"pot{i}", 0.2, 0.15, 0.3, mat("Pot", '#b8653f', 0.8), at=(x, -D2 - 0.5, 0.33), seg=14, parent=house)
    for k in range(5): sphere(f"potfl{i}{k}", 0.09, BLOOM[(k + i) % 3] if k % 2 else IVY[k % 3], at=(x + random.uniform(-0.12, 0.12), -D2 - 0.5 + random.uniform(-0.12, 0.12), 0.55 + random.uniform(0, 0.1)), seg=8, ring=6, parent=house)
box("lantarm", (0.06, 0.3, 0.06), IRON, at=(0.85, -D2 - 0.15, 1.85), parent=house, bevel=0.0)
cyl("lantern", 0.1, 0.12, 0.24, GLASS, at=(0.85, -D2 - 0.3, 1.7), seg=8, parent=house)
for i, (x, y) in enumerate([(0.1, -D2 - 1.25), (-0.2, -D2 - 1.7), (0.15, -D2 - 2.1)]):
    sphere(f"path{i}", 0.26, STONES[i % 3], at=(x, y, 0.02), scale=(1.2, 0.9, 0.18), seg=14, ring=8, parent=house)

# ------------------------------------------------------------------ street lamp
lamp = empty("lamp")
IRON, BRASS, BULB = mat("Iron", '#2f3433', 0.45, 0.3), mat("Brass", '#c9a24d', 0.35, 0.6), mat("Bulb", '#fff3c4', 0.3)
cyl("lampbase", 0.3, 0.26, 0.14, IRON, at=(0, 0, 0.07), seg=12, parent=lamp)
cyl("lampbase2", 0.2, 0.16, 0.3, IRON, at=(0, 0, 0.29), seg=12, parent=lamp)
cyl("pole", 0.065, 0.055, 2.2, IRON, at=(0, 0, 1.5), seg=12, parent=lamp)
for z in (0.5, 1.0, 2.4): torus(f"ring{z}", 0.075, 0.025, BRASS, at=(0, 0, z), parent=lamp, seg=16, tseg=6)
cyl("collar", 0.14, 0.09, 0.12, IRON, at=(0, 0, 2.62), seg=12, parent=lamp)
for i in range(4):   # lantern cage
    a = i/4*2*math.pi + math.pi/4
    cyl(f"cage{i}", 0.018, 0.018, 0.42, IRON, at=(math.cos(a)*0.2, math.sin(a)*0.2, 2.9), seg=6, parent=lamp)
sphere("bulb", 0.15, BULB, at=(0, 0, 2.88), seg=18, ring=12, parent=lamp)
cyl("lamproof", 0.32, 0.05, 0.22, IRON, at=(0, 0, 3.2), seg=4, parent=lamp).rotation_euler = (0, 0, math.pi/4)
sphere("finial", 0.06, BRASS, at=(0, 0, 3.36), seg=10, ring=8, parent=lamp)

# ------------------------------------------------------------------ flower bed
bed = empty("flowers")
SOIL, BRICK, STEM, LEAF = mat("Soil", '#6b4f37', 1.0), mat("Brick", '#b07a55', 0.85), mat("Stem", '#5a8a42', 0.8), mat("Leaf", '#6aa845', 0.7)
bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=12, radius=1.05)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.02], context='VERTS')
bmesh.ops.transform(bm, matrix=Matrix.Diagonal((1, 1, 0.16, 1)), verts=bm.verts)
obj_from_bm("soil", bm, SOIL, bed)
for i in range(18):   # rounded brick border
    a = i/18*2*math.pi
    b = box(f"brick{i}", (0.34, 0.16, 0.16), BRICK, at=(math.cos(a)*1.12, math.sin(a)*1.12, 0.07), parent=bed, bevel=0.035, rotz=a + math.pi/2)
PET = [mat("TulipRed", '#e0504a', 0.5), mat("TulipYellow", '#f3c84a', 0.5), mat("TulipPink", '#ef8fb0', 0.5), mat("Violet", '#9b6fc4', 0.5)]
WHITE, CORE = mat("DaisyWhite", '#fbf8f0', 0.6), mat("DaisyCore", '#f0b72f', 0.6)
for i in range(16):
    a, r = random.uniform(0, 2*math.pi), math.sqrt(random.uniform(0.02, 0.8))*0.95
    base, h = Vector((math.cos(a)*r, math.sin(a)*r, 0.1)), random.uniform(0.3, 0.5)
    cyl(f"stem{i}", 0.018, 0.014, h, STEM, at=base + Vector((0, 0, h/2)), seg=6, parent=bed)
    lf = sphere(f"leaf{i}", 0.1, LEAF, at=base + Vector((0.05, 0, h*0.35)), scale=(1, 0.35, 0.12), seg=10, ring=6, parent=bed); lf.rotation_euler = (0, -0.6, a)
    top = base + Vector((0, 0, h))
    if i % 3 == 2:   # daisy: ring of petals + golden centre
        for k in range(8):
            ka = k/8*2*math.pi
            p = sphere(f"petal{i}_{k}", 0.05, WHITE, at=top + Vector((math.cos(ka)*0.07, math.sin(ka)*0.07, 0)), scale=(1.4, 0.6, 0.25), seg=8, ring=5, parent=bed); p.rotation_euler = (0, 0, ka)
        sphere(f"core{i}", 0.04, CORE, at=top + Vector((0, 0, 0.01)), seg=10, ring=6, parent=bed)
    else:            # tulip: closed cup of petals
        for k in range(3):
            ka = k/3*2*math.pi
            sphere(f"tulip{i}_{k}", 0.065, PET[i % 4], at=top + Vector((math.cos(ka)*0.03, math.sin(ka)*0.03, 0.06)), scale=(0.75, 0.75, 1.35), seg=10, ring=8, parent=bed)

# ------------------------------------------------------------------ foods (lying on the ground)
carrot = empty("food_carrot")
ORANGE, TOP = mat("Carrot", '#e8833a', 0.55), mat("CarrotTop", '#6aa845', 0.7)
bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=14, radius1=0.08, radius2=0.012, depth=0.5)
for v in bm.verts: v.co.x += 0.006*math.sin(v.co.z*60)   # little growth rings
bmesh.ops.rotate(bm, cent=Vector((0,0,0)), matrix=R(math.pi/2, 3, 'Y'), verts=bm.verts); bmesh.ops.translate(bm, vec=Vector((0, 0, 0.08)), verts=bm.verts)
obj_from_bm("carrotbody", bm, ORANGE, carrot)
for k, a in enumerate((-0.5, 0, 0.5)):
    f = cyl(f"frond{k}", 0.025, 0.004, 0.28, TOP, at=(-0.36, 0, 0.12), seg=6, parent=carrot); f.rotation_euler = (a, -1.2, 0)
apple = empty("food_apple")
bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=16, radius=0.15)
for v in bm.verts:   # dimple at the top and bottom
    d = 1 - 0.35*math.exp(-((v.co.x**2 + v.co.y**2)/0.004)) if abs(v.co.z) > 0.08 else 1
    v.co.z *= d*0.92
bmesh.ops.translate(bm, vec=Vector((0, 0, 0.14)), verts=bm.verts)
obj_from_bm("applebody", bm, mat("Apple", '#d8423c', 0.35), apple)
cyl("applestem", 0.012, 0.009, 0.09, mat("Twig", '#6b4a2e', 0.8), at=(0, 0, 0.29), seg=6, parent=apple).rotation_euler = (0.25, 0, 0)
sphere("appleleaf", 0.05, LEAF, at=(0.04, 0, 0.31), scale=(1.4, 0.6, 0.15), seg=10, ring=6, parent=apple).rotation_euler = (0, -0.5, 0)
potato = empty("food_potato")
bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=14, radius=0.12)
for v in bm.verts:
    t = v.co.x/0.12
    v.co.x *= 2.3; v.co.y *= 0.9*(1 - 0.35*t*t); v.co.z *= 0.85*(1 - 0.35*t*t)
bmesh.ops.translate(bm, vec=Vector((0, 0, 0.1)), verts=bm.verts)
pb = obj_from_bm("potatobody", bm, mat("SweetPotato", '#9a4f6a', 0.75), potato); lumpy(pb, 0.025, 0.08)
root = empty("food_root")
BARK = mat("Root", '#8a6040', 0.9)
for k in range(5):
    a = k/5*2*math.pi + random.uniform(-0.3, 0.3)
    br = cyl(f"rootbr{k}", 0.05 - k*0.006, 0.012, random.uniform(0.35, 0.5), BARK, at=(0, 0, 0.06), seg=7, parent=root)
    br.rotation_euler = (math.pi/2 + random.uniform(-0.25, 0.1), 0, a); lumpy(br, 0.02, 0.05)
sphere("rootknot", 0.08, BARK, at=(0, 0, 0.06), scale=(1, 1, 0.8), seg=12, ring=8, parent=root)

# spread them out for viewing (export resets to the origin)
for o, x in ((house, 0), (lamp, 4), (bed, 7), (carrot, 9.5), (apple, 10.5), (potato, 11.5), (root, 12.7)): o.location.x = x
print("props built:", len(scene.objects), "objects")

def merge_props():
    """Bake modifiers and join each prop into one mesh (one draw per material) — far cheaper on phones."""
    for top in [o for o in scene.objects if o.parent is None and o.type == 'EMPTY']:
        kids = [o for o in top.children_recursive if o.type == 'MESH']
        if not kids: continue
        bpy.ops.object.select_all(action='DESELECT')
        for k in kids: k.select_set(True)
        bpy.context.view_layer.objects.active = kids[0]
        bpy.ops.object.convert(target='MESH')
        mw = top.matrix_world.copy()
        bpy.ops.object.join()
        j = bpy.context.view_layer.objects.active; j.name = top.name + "_mesh"
        j.parent = top; j.matrix_parent_inverse = mw.inverted()

def export_props():
    merge_props()
    tops = [o for o in scene.objects if o.parent is None]
    saved = {o.name: o.location.copy() for o in tops}
    for o in tops: o.location = (0, 0, 0)
    bpy.ops.object.select_all(action='DESELECT')
    for o in scene.objects: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, use_active_scene=True, export_apply=True,
        export_animations=False, export_yup=True, export_cameras=False, export_lights=False,
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7, export_draco_position_quantization=13, export_draco_normal_quantization=9)
    for o in tops: o.location = saved[o.name]
    import os; return os.path.getsize(OUT)
