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
# ------------------------------------------------------------------ burrow house
house = empty("house")
EARTH, GRASS, WOOD, DARK, STONE = mat("Earth", '#8b6a48', 0.95), mat("Grass", '#7a9a4c', 0.9), mat("Wood", '#8a5a36', 0.8), mat("Hole", '#140e0a', 1.0), mat("Stone", '#a7a299', 0.9)
bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=24, radius=2.2)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.02], context='VERTS')
bmesh.ops.transform(bm, matrix=Matrix.Diagonal((1, 1, 0.9, 1)), verts=bm.verts)
mound = obj_from_bm("mound", bm, EARTH, house); lumpy(mound, 0.14)
bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=24, radius=2.27)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < 1.1 + 0.18*math.sin(math.atan2(v.co.y, v.co.x)*7)], context='VERTS')
bmesh.ops.transform(bm, matrix=Matrix.Diagonal((1, 1, 0.9, 1)), verts=bm.verts)
cap = obj_from_bm("grasscap", bm, GRASS, house); lumpy(cap, 0.12)
sol = cap.modifiers.new("thick", 'SOLIDIFY'); sol.thickness = 0.08
# grass tufts on the cap
for i in range(26):
    a, el = random.uniform(0, 2*math.pi), random.uniform(0.55, 1.25)
    p = Vector((math.cos(a)*math.cos(el), math.sin(a)*math.cos(el), math.sin(el)*0.9))*2.3
    t = cyl(f"tuft{i}", 0.07, 0.0, random.uniform(0.25, 0.4), GRASS, at=p, seg=5, parent=house)
    t.rotation_euler = (random.uniform(-0.4, 0.4), random.uniform(-0.4, 0.4), 0)
# entrance: dark hole, wooden arch frame, little plank awning
hole = cyl("hole", 0.78, 0.78, 0.2, DARK, at=(0, -2.06, 0.55), seg=32, rot=R(math.pi/2, 3, 'X'))
hole.parent = house
torus("doorframe", 0.86, 0.1, WOOD, at=(0, -2.12, 0.55), rot=R(math.pi/2, 3, 'X'), parent=house, arc=0.5, seg=24)
for s in (-1, 1): cyl(f"doorpost{s}", 0.1, 0.1, 0.6, WOOD, at=(0.86*s, -2.12, 0.27), seg=10, parent=house)
for i in range(5):
    b = box(f"awning{i}", (0.28, 0.6, 0.05), WOOD, at=(-0.56 + i*0.28, -2.3, 1.55), parent=house); b.rotation_euler = (0.45, 0, 0)
# round window with cross bars on the side
win = cyl("window", 0.32, 0.32, 0.1, mat("Glass", '#ffe6a3', 0.2), at=(1.62, -1.13, 0.95), seg=24, rot=R(math.pi/2, 3, 'X'))
win.parent = house; win.rotation_euler = (0, 0, 0.96)
wf = torus("winframe", 0.34, 0.06, WOOD, at=(1.65, -1.15, 0.95), rot=R(math.pi/2, 3, 'X'), parent=house); wf.rotation_euler = (0, 0, 0.96)
# stone chimney
for i in range(4):
    st = cyl(f"chimney{i}", 0.26 - i*0.01, 0.25 - i*0.01, 0.2, STONE, at=(0.7, 0.6, 1.95 + i*0.2), seg=10, parent=house); lumpy(st, 0.03, 0.5)
cyl("chimneycap", 0.31, 0.31, 0.06, mat("DarkStone", '#6f6a63', 0.9), at=(0.7, 0.6, 2.78), seg=10, parent=house)
# stepping stones and a few flowers at the base
for i, (x, y) in enumerate([(0.1, -2.75), (-0.25, -3.25), (0.15, -3.7)]):
    s = sphere(f"step{i}", 0.26, STONE, at=(x, y, 0.02), scale=(1.2, 0.9, 0.18), seg=14, ring=8, parent=house)
for i in range(7):
    a = random.uniform(-2.6, -0.5) if i % 2 else random.uniform(0.5, 2.6)
    p = Vector((math.sin(a)*2.25, -math.cos(a)*2.25, 0.08))
    if abs(p.x) < 1.1 and p.y < 0: continue
    sphere(f"bud{i}", 0.09, mat(["Pink", "Yellow", "White"][i % 3], ['#f2a6be', '#f3d250', '#fbf8f0'][i % 3], 0.6), at=p, seg=10, ring=6, parent=house)

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
        export_animations=False, export_yup=True, export_cameras=False, export_lights=False)
    for o in tops: o.location = saved[o.name]
    import os; return os.path.getsize(OUT)
