# The 27 evolved forms as game models: the textured Hunyuan3D-2mv meshes (made from the four-view sheets on E:\Hunyuan3D, see
# E:\Hunyuan3D\gen_mv.py) are fitted onto the wombat's own skeleton (blender/wombat.blend), so every W_* clip, the leg/ear/head
# motion in game.js and the outfits keep working: same bones, same rest pose, only the skin changes.
#   blender.exe -b blender/wombat.blend -P blender/form_build.py               (env ONLY=g_good,u_gold to pick, CHECK=1 for preview renders)
# Fitting: scaled by the trunk to the wombat body's size, nose where the wombat's is, feet on the ground (the feet then stand on the
# leg bones); skin weights use the same falloffs as wombat_build.py (legs, tail, head).
# Source: <id>_hq.glb when E:\Hunyuan3D\retex.py has made one (20k faces, clean UVs, the drawings projected on, a normal map baked
# from the full-detail shape), else <id>_textured.glb.
# Eyes: retex.py paints the drawn eyes over and records where they were (<id>_eyes3d.json); they go along as the mesh's "eyes"
# extra (centre + radius in Blender model space) and the game puts real eyeballs there, which blink.
# Ears: each form's own ears get a bone (earF.L / earF.R, children of the head) from their base to their tip, so they twitch
# from where they really grow (the wombat's ear bones sit elsewhere).
# Output: assets/models/forms/<formId>.glb (Draco, JPEG colour + normal map, rig without clips).
import bpy, bmesh, os, sys, math, json
from mathutils import Vector

SRC = r"E:\Hunyuan3D\out"
OUT = r"C:\Users\User\Documents\wombat-pet\assets\models\forms"
CHK = r"E:\Hunyuan3D\out\fit"
FACES = int(os.environ.get("FACES", "20000")); TEX = int(os.environ.get("TEX", "2048"))
os.makedirs(OUT, exist_ok=True); os.makedirs(CHK, exist_ok=True)

def ss(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t)

LEGS = {"leg.F.L": (0.54, -0.5), "leg.F.R": (-0.54, -0.5), "leg.B.L": (0.6, 0.9), "leg.B.R": (-0.6, 0.9)}
EARS = {"ear.L": (0.5, -0.82, 1.3), "ear.R": (-0.5, -0.82, 1.3)}
rig = bpy.data.objects["WombatRig"]
KEEP = {rig.name}

def measure(P):
    # where clothes go: the top of the head (seat for hats), the head's half-width, and an ellipsoid round the trunk
    # (P: the body's vertices, without crowns or other loose pieces; Blender model space, front = -Y)
    pc = lambda a, k: sorted(a)[int(k*(len(a) - 1))]
    hd = [p for p in P if p.y < -0.45]; mid = [p for p in hd if abs(p.x) < 0.3]
    top = pc([p.z for p in mid], 0.98); topy = pc([p.y for p in mid if p.z > top - 0.08], 0.5)
    hw = pc([abs(p.x) for p in hd if top - 0.7 < p.z < top - 0.25], 0.97)
    tr = [p for p in P if p.y > -0.6 and p.z > 0.15]; ax = []
    for i in range(3):
        a = [p[i] for p in tr]; lo, hi = pc(a, 0.02), pc(a, 0.98); ax.append(((lo + hi)/2, (hi - lo)/2))
    return {"top": [0.0, topy, top], "hw": hw, "c": [a[0] for a in ax], "r": [a[1] for a in ax]}
_wb = bpy.data.objects["WombatBody"]
WOMBAT_FIT = measure([_wb.matrix_world @ v.co for v in _wb.data.vertices])   # (the same measures on the wombat: the clothes' reference)

def clean_scene():
    for o in list(bpy.data.objects):
        if o.name not in KEEP: bpy.data.objects.remove(o, do_unlink=True)
    rig.animation_data_clear() if rig.animation_data else None
    if any(b.name.startswith("earF") for b in rig.data.bones):   # (the last form's ear bones)
        bpy.context.view_layer.objects.active = rig; bpy.ops.object.mode_set(mode='EDIT')
        for e in [e for e in rig.data.edit_bones if e.name.startswith("earF")]: rig.data.edit_bones.remove(e)
        bpy.ops.object.mode_set(mode='OBJECT')
    for pb in rig.pose.bones: pb.location = (0, 0, 0); pb.rotation_euler = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.scale = (1, 1, 1)

def load(fid):
    before = set(bpy.data.objects)
    hq = os.path.join(SRC, f"{fid}_hq.glb")
    bpy.ops.import_scene.gltf(filepath=hq if os.path.exists(hq) else os.path.join(SRC, f"{fid}_textured.glb"))
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
    T = lambda p: Vector(((p[0] - cx)*s, (p[1] - front)*s - 1.9, (p[2] - z0)*s))
    for v in me.vertices: v.co = T(v.co)
    me.update(); return s, T

def islands(ob):
    bm = bmesh.new(); bm.from_mesh(ob.data); bm.verts.ensure_lookup_table(); seen = set(); out = []
    for v0 in bm.verts:
        if v0.index in seen: continue
        isl, st = [], [v0]; seen.add(v0.index)
        while st:
            v = st.pop(); isl.append(v.index)
            for e in v.link_edges:
                o = e.other_vert(v)
                if o.index not in seen: seen.add(o.index); st.append(o)
        out.append(isl)
    bm.free(); return sorted(out, key=len, reverse=True)

EAR_LEN = 0.38
def vcolors(ob):
    # each vertex's colour from the texture (for telling warm brown/orange ears from crystals, flames aside)
    import numpy as np
    img = next((n.image for m in ob.data.materials if m and m.use_nodes for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image and n.image.size[0] > 0), None)
    if img is None: return None
    W_, H_ = img.size; px = np.array(img.pixels[:], dtype=np.float32).reshape(H_, W_, img.channels)
    uv = ob.data.uv_layers.active.data; col = [None]*len(ob.data.vertices)
    for l in ob.data.loops:
        if col[l.vertex_index] is None:
            u, v = uv[l.index].uv; col[l.vertex_index] = px[min(H_ - 1, max(0, int(v*H_))), min(W_ - 1, max(0, int(u*W_))), :3]
    return col

def ears(ob, isl, eyes):
    # an ear's tip = the highest warm-coloured (brown/orange, as every form's ears are) point of the body in a column outside
    # and above that side's eye, at most ~1.45 above it (the plain forms' ears stand 1.1-1.2 above their eyes); the bone runs
    # from EAR_LEN below it, leaning out a little. If anything in that column reaches past the window (a flame, a mane) or
    # something cold-coloured (crystals, ice) stands higher than the ear, the ear is buried: no bone, it moves with the head.
    # (flames are warm too and stand where the ears would: those forms' ears move with the head)
    if ob.name[len("Form_"):] in ("p_flame", "m_ember"): return {}
    V = ob.data.vertices; out = {}; rel = {}; C = vcolors(ob)
    warm = lambda i: C is None or (C[i][0] > C[i][2] + 0.06 and C[i][0] >= C[i][1] - 0.02)
    E = {(1 if e.x > 0 else -1): e for e in eyes}
    for side, sg in (("L", 1), ("R", -1)):
        e = E.get(sg)
        if e is None:   # (no eyeballs, e.g. half-shut painted eyes: a typical eye spot from the head's top)
            hz = max(V[i].co.z for i in isl[0] if V[i].co.y < -0.45 and abs(V[i].co.x) < 0.3); e = Vector((sg*0.35, -1.5, hz - 0.95))
        x0, x1, z0, z1 = abs(e.x) + 0.05, abs(e.x) + 0.75, e.z + 0.2, e.z + 1.45
        col = [i for i in isl[0] if x0 < sg*V[i].co.x < x1 and -1.5 < V[i].co.y < -0.15 and V[i].co.z > z0]
        if not col: continue
        top = max(col, key=lambda i: V[i].co.z); w = [i for i in col if warm(i)]
        if V[top].co.z > z1 or not w: print(f"  ear {side}: buried (top {V[top].co.z - e.z:.2f} above the eye)", flush=True); continue
        tip = V[max(w, key=lambda i: V[i].co.z)].co.copy()
        if V[top].co.z > tip.z + 0.15 and not warm(top): print(f"  ear {side}: buried under something cold-coloured", flush=True); continue
        d = Vector((sg*0.25, 0, 1)).normalized()
        out[side] = (tip - d*EAR_LEN, tip, d); rel[side] = (tip.z - e.z, sg*tip.x - abs(e.x))
    # a real pair of ears matches: same height over the eyes and the same distance out (lopsided finds are a flame or a jewel on
    # one side), and not far out to the side (that is a wing); one twitching ear looks wrong, so it is both or neither
    ok = len(rel) == 2 and abs(rel["L"][0] - rel["R"][0]) < 0.12 and abs(rel["L"][1] - rel["R"][1]) < 0.2 and max(rel["L"][1], rel["R"][1]) < 0.5
    print("  ears", {k: tuple(round(x, 2) for x in v) for k, v in rel.items()}, "kept" if ok else "dropped", flush=True)
    if not ok: out = {}
    if out:
        bpy.context.view_layer.objects.active = rig; bpy.ops.object.mode_set(mode='EDIT')
        for side, (b, t, d) in out.items():
            e = rig.data.edit_bones.new(f"earF.{side}"); e.head = b; e.tail = t; e.parent = rig.data.edit_bones["head"]; e.align_roll(Vector((0, -1, 0)))
        bpy.ops.object.mode_set(mode='OBJECT')
    return out

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
        # drop any metallic-roughness texture Hunyuan may add (colour + normal map keep the download small)
        for l in list(m.node_tree.links):
            if bs and l.to_node == bs and l.to_socket.name in ("Metallic", "Roughness"): m.node_tree.links.remove(l)

def skin(ob, isl, ear):
    for g in list(ob.vertex_groups): ob.vertex_groups.remove(g)
    main = set(isl[0])
    names = [b.name for b in rig.data.bones]
    G = {n: ob.vertex_groups.new(name=n) for n in names}
    W = []
    for v in ob.data.vertices:
        x, y, z = v.co; w = {}
        for n, (lx, ly) in LEGS.items(): w[n] = ss(0.46, 0.26, math.hypot(x - lx, y - ly)) * ss(0.58, 0.3, z)
        w["tail"] = ss(1.3, 1.45, y) * ss(0.45, 0.25, abs(x)) * ss(1.1, 0.8, z)
        # (the forms' heads are bigger than the wombat's and have no real neck: a long, soft blend round the head bone's pivot
        # at y -0.55, so turning the head bends the round body gently instead of pinching a ring into it)
        hd = ss(0.0, -0.85, y) * ss(0.2, 0.65, z) * (1 - max(w["leg.F.L"], w["leg.F.R"]))
        for n in EARS: w[n] = 0.0   # (the forms' ears sit wider and higher than the ear bones and crowns crowd them: they move with the head)
        ef = 0.0
        if v.index in main:
            for side, (b, t, d) in ear.items():
                q = v.co - b; a = q.dot(d)/EAR_LEN; rad = (q - d*q.dot(d)).length
                w[f"earF.{side}"] = we = ss(0.0, 0.35, a) * ss(0.36, 0.22, rad) * hd; ef = max(ef, we)
        w["head"] = hd * (1 - ef)
        w["spine"] = max(0.0, 1.0 - sum(w.values())); tot = sum(w.values())
        W.append({n: val/tot for n, val in w.items()})
    # loose pieces (crowns, halos, wings, flowers) move as one: each gets its pieces' average weights, so nothing stretches
    # when the head bends away from the back
    n = len(ob.data.vertices)
    for piece in isl:
        if len(piece) < 0.25*n:
            keys = set().union(*(W[i] for i in piece))
            avg = {k: sum(W[i].get(k, 0.0) for i in piece)/len(piece) for k in keys}
            for i in piece: W[i] = avg
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
        export_extras=True, export_image_format='JPEG', export_jpeg_quality=88, export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6)
    return os.path.getsize(path)

ids = sorted(f[:-len("_textured.glb")] for f in os.listdir(SRC) if f.endswith("_textured.glb"))
if os.environ.get("ONLY"): ids = [i for i in ids if i in os.environ["ONLY"].split(",")]
for fid in ids:
    clean_scene(); ob = load(fid); s, T = fit(ob); reduce(ob)
    ej = os.path.join(SRC, f"{fid}_eyes3d.json"); eyes = [T(e["p"]) for e in json.load(open(ej))] if os.path.exists(ej) else []
    isl = islands(ob); ear = ears(ob, isl, eyes); skin(ob, isl, ear)
    m = measure([ob.data.vertices[i].co for i in isl[0]])
    # the neck line (0.62 of the eye height, just under the big heads' chins) and how far forward the chest is there, for the bow
    ez = sum(e.z for e in eyes)/len(eyes) if eyes else m["top"][2] - 1.0; nz = ez*0.62
    ch = [ob.data.vertices[i].co.y for i in isl[0] if abs(ob.data.vertices[i].co.x) < 0.25 and abs(ob.data.vertices[i].co.z - nz) < 0.08]
    m["neck"] = [0.0, min(ch) if ch else m["c"][1] - m["r"][1], nz]
    # the body's cross-section there (half width, half depth, centre), for a collar lying round it
    sl = [ob.data.vertices[i].co for i in isl[0] if abs(ob.data.vertices[i].co.z - nz) < 0.08]
    pc = lambda q, k: sorted(q)[int(k*(len(q) - 1))]
    if sl: y0, y1 = pc([p.y for p in sl], 0.02), pc([p.y for p in sl], 0.98); m["ring"] = [pc([abs(p.x) for p in sl], 0.97), (y1 - y0)/2, (y0 + y1)/2]
    ob["fit"] = json.dumps({"form": m, "wombat": WOMBAT_FIT})
    if os.path.exists(ej): ob["eyes"] = json.dumps([{"p": list(T(e["p"])), "r": e["r"]*s} for e in json.load(open(ej))])
    if os.environ.get("CHECK"): check(ob, fid)
    kb = export(ob, fid)//1024
    print(f"FORM {fid} scale {s:.3f} faces {len(ob.data.polygons)} {kb} KB ears {''.join(ear)} eyes {len(json.loads(ob.get('eyes', '[]')))}", flush=True)
