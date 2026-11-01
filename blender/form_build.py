# The 27 evolved forms as game models: the textured Hunyuan3D-2mv meshes (made from the four-view sheets on E:\Hunyuan3D, see
# E:\Hunyuan3D\gen_mv.py) are fitted onto the wombat's own skeleton (blender/wombat.blend), so every W_* clip, the leg/ear/head
# motion in game.js and the outfits keep working: same bones, same rest pose, only the skin changes.
#   blender.exe -b blender/wombat.blend -P blender/form_build.py               (env ONLY=g_good,u_gold to pick, CHECK=1 for preview renders)
# Fitting: scaled by the trunk to the wombat body's size, nose where the wombat's is, feet on the ground (the feet then stand on the
# leg bones); skin weights use the same falloffs as wombat_build.py (legs, tail, head).
# Output: assets/models/forms/<formId>.glb (Draco, ~12k triangles, one 1024 JPEG texture, rig without clips).
import bpy, bmesh, os, sys, math
from mathutils import Vector

SRC = r"E:\Hunyuan3D\out"
OUT = r"C:\Users\User\Documents\wombat-pet\assets\models\forms"
CHK = r"E:\Hunyuan3D\out\fit"
FACES = int(os.environ.get("FACES", "12000")); TEX = int(os.environ.get("TEX", "1024"))
os.makedirs(OUT, exist_ok=True); os.makedirs(CHK, exist_ok=True)

def ss(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t)

LEGS = {"leg.F.L": (0.54, -0.5), "leg.F.R": (-0.54, -0.5), "leg.B.L": (0.6, 0.9), "leg.B.R": (-0.6, 0.9)}
EARS = {"ear.L": (0.5, -0.82, 1.3), "ear.R": (-0.5, -0.82, 1.3)}
rig = bpy.data.objects["WombatRig"]
KEEP = {rig.name}

def clean_scene():
    for o in list(bpy.data.objects):
        if o.name not in KEEP: bpy.data.objects.remove(o, do_unlink=True)
    rig.animation_data_clear() if rig.animation_data else None
    for pb in rig.pose.bones: pb.location = (0, 0, 0); pb.rotation_euler = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.scale = (1, 1, 1)

def load(fid):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, f"{fid}_textured.glb"))
    new = [o for o in bpy.data.objects if o not in before]
    ms = [o for o in new if o.type == "MESH"]
    for o in ms:
        mw = o.matrix_world.copy(); o.parent = None; o.data.transform(mw); o.matrix_world.identity()
    for o in new:
        if o.type != "MESH": bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in ms: o.select_set(True)
    bpy.context.view_layer.objects.active = ms[0]
    if len(ms) > 1: bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active; ob.name = f"Form_{fid}"; return ob

def fit(ob):
    # sized by the trunk (a band from just above the feet to mid-height, so crowns, ears and halos don't count): its length and
    # width against the wombat body's (3.48 x 1.88); the larger of the two scales wins, as capes and wings only ever add size.
    # The nose then goes where the wombat's is (y -1.9) and the feet on the ground.
    me = ob.data; P = [v.co.copy() for v in me.vertices]
    z0 = min(p.z for p in P); z1 = max(p.z for p in P); H = z1 - z0
    band = [p for p in P if z0 + 0.12*H < p.z < z0 + 0.6*H]
    pc = lambda a, k: sorted(a)[int(k*(len(a) - 1))]
    ys = [p.y for p in band]; xs = [p.x for p in band]
    L = pc(ys, 0.995) - pc(ys, 0.005); W = pc(xs, 0.99) - pc(xs, 0.01)
    s = max(3.48/L, 1.88/W)
    cx = (pc(xs, 0.99) + pc(xs, 0.01))/2; front = pc(ys, 0.005)
    for v in me.vertices: v.co = Vector(((v.co.x - cx)*s, (v.co.y - front)*s - 1.9, (v.co.z - z0)*s))
    me.update(); return s

def reduce(ob):
    bm = bmesh.new(); bm.from_mesh(ob.data); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5); bm.to_mesh(ob.data); bm.free()
    n = len(ob.data.polygons)
    if n > FACES:
        bpy.context.view_layer.objects.active = ob
        d = ob.modifiers.new("dec", 'DECIMATE'); d.ratio = FACES/n; d.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=d.name)
    for p in ob.data.polygons: p.use_smooth = True
    for m in ob.data.materials:
        if not m or not m.use_nodes: continue
        for n in m.node_tree.nodes:
            if n.type == 'TEX_IMAGE' and n.image and max(n.image.size) > TEX: n.image.scale(TEX, TEX)
        bs = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if bs: bs.inputs["Metallic"].default_value = 0.0; bs.inputs["Roughness"].default_value = 0.85
        # drop any metallic-roughness texture Hunyuan may add (one colour map keeps the download small)
        for l in list(m.node_tree.links):
            if bs and l.to_node == bs and l.to_socket.name in ("Metallic", "Roughness", "Normal"): m.node_tree.links.remove(l)

def skin(ob):
    for g in list(ob.vertex_groups): ob.vertex_groups.remove(g)
    names = [b.name for b in rig.data.bones]
    G = {n: ob.vertex_groups.new(name=n) for n in names}
    W = []
    for v in ob.data.vertices:
        x, y, z = v.co; w = {}
        for n, (lx, ly) in LEGS.items(): w[n] = ss(0.46, 0.26, math.hypot(x - lx, y - ly)) * ss(0.58, 0.3, z)
        w["tail"] = ss(1.3, 1.45, y) * ss(0.45, 0.25, abs(x)) * ss(1.1, 0.8, z)
        # (the forms' heads are bigger than the wombat's: the neck sits further back, around the head bone's pivot at y -0.55)
        hd = ss(-0.3, -0.7, y) * ss(0.3, 0.55, z) * (1 - max(w["leg.F.L"], w["leg.F.R"]))
        for n in EARS: w[n] = 0.0   # (the forms' ears sit wider and higher than the ear bones and crowns crowd them: they move with the head)
        w["head"] = hd * (1 - max(w["ear.L"], w["ear.R"]))
        w["spine"] = max(0.0, 1.0 - sum(w.values())); tot = sum(w.values())
        W.append({n: val/tot for n, val in w.items()})
    # loose pieces (crowns, halos, wings, flowers) move as one: each gets its pieces' average weights, so nothing stretches
    # when the head bends away from the back
    bm = bmesh.new(); bm.from_mesh(ob.data); bm.verts.ensure_lookup_table(); seen = set(); n = len(bm.verts)
    for v0 in bm.verts:
        if v0.index in seen: continue
        isl, st = [], [v0]; seen.add(v0.index)
        while st:
            v = st.pop(); isl.append(v.index)
            for e in v.link_edges:
                o = e.other_vert(v)
                if o.index not in seen: seen.add(o.index); st.append(o)
        if len(isl) < 0.25*n:
            avg = {k: sum(W[i][k] for i in isl)/len(isl) for k in W[0]}
            for i in isl: W[i] = avg
    bm.free()
    for v, w in zip(ob.data.vertices, W):
        for k, val in w.items():
            if val > 0.001: G[k].add([v.index], val, 'REPLACE')
    ob.parent = rig; am = ob.modifiers.new("rig", 'ARMATURE'); am.object = rig

def check(ob, fid):
    # side and top views with the leg bones drawn as red sticks, to see that the feet land on them
    sc = bpy.context.scene; sc.render.engine = "BLENDER_WORKBENCH"; sc.display.shading.color_type = "TEXTURE"
    sc.render.resolution_x, sc.render.resolution_y = 512, 384; sc.world = sc.world or bpy.data.worlds.new("w")
    marks = []
    for n, (lx, ly) in LEGS.items():
        bpy.ops.mesh.primitive_cylinder_add(radius=0.05, depth=0.7, location=(lx, ly, 0.35)); marks.append(bpy.context.object)
    for n, (ex, ey, ez) in EARS.items():
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.08, location=(ex, ey, ez)); marks.append(bpy.context.object)
    red = bpy.data.materials.new("mk"); red.diffuse_color = (1, 0, 0, 1)
    for m in marks: m.data.materials.append(red); m.show_in_front = True
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.type = "ORTHO"; cam.data.ortho_scale = 5.2
    out = []
    for i, (loc, rot) in enumerate([((8, -0.1, 1.1), (math.pi/2, 0, math.pi/2)), ((0, -0.1, 8), (0, 0, 0))]):
        cam.location = loc; cam.rotation_euler = rot; p = os.path.join(CHK, f"{fid}_{i}.png"); sc.render.filepath = p
        bpy.ops.render.render(write_still=True); out.append(p)
    for m in marks: bpy.data.objects.remove(m, do_unlink=True)
    bpy.data.objects.remove(cam, do_unlink=True)

def export(ob, fid):
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); rig.select_set(True); bpy.context.view_layer.objects.active = rig
    path = os.path.join(OUT, f"{fid}.glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=False,
        export_animations=False, export_skins=True, export_morph=False, export_yup=True, export_cameras=False, export_lights=False,
        export_image_format='JPEG', export_jpeg_quality=82, export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6)
    return os.path.getsize(path)

ids = sorted(f[:-len("_textured.glb")] for f in os.listdir(SRC) if f.endswith("_textured.glb"))
if os.environ.get("ONLY"): ids = [i for i in ids if i in os.environ["ONLY"].split(",")]
for fid in ids:
    clean_scene(); ob = load(fid); s = fit(ob); reduce(ob); skin(ob)
    if os.environ.get("CHECK"): check(ob, fid)
    kb = export(ob, fid)//1024
    print(f"FORM {fid} scale {s:.3f} faces {len(ob.data.polygons)} {kb} KB", flush=True)
