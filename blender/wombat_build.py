# Builds the game wombat in Blender: body, face, fur shells, rig and colour zones.
# Run inside Blender:  exec(open(r"C:\Users\User\Documents\wombat-pet\blender\wombat_build.py", encoding="utf-8").read())
# Animations live in separate actions (W_*) and survive a rebuild because bone names stay the same.
import bpy, bmesh, math
from mathutils import Vector, Euler, Matrix

COL = "Wombat"

def ss(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t)

def ell(p, c, r):
    return (((p[0]-c[0])/r[0])**2 + ((p[1]-c[1])/r[1])**2 + ((p[2]-c[2])/r[2])**2) ** 0.5

def lin(h):
    h = h.lstrip('#'); c = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]

def collection():
    col = bpy.data.collections.get(COL) or bpy.data.collections.new(COL)
    if col.name not in bpy.context.scene.collection.children: bpy.context.scene.collection.children.link(col)
    return col

def blob(col, name, loc, scale, p=1.0, seg=48, ring=32):
    """Ellipsoid; p < 1 squares it off (super-ellipsoid) for a broader, flatter shape."""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=ring, radius=1.0)
    for v in bm.verts:
        c = [math.copysign(abs(a) ** p, a) for a in v.co]
        v.co = Vector((c[0]*scale[0], c[1]*scale[1], c[2]*scale[2])) + Vector(loc)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); col.objects.link(ob); return ob

def part(col, name, loc, scale, mat, rot=(0, 0, 0), seg=32, ring=20, taper=0.0, shield=0.0):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=ring, radius=1.0)
    for v in bm.verts:
        k = (1 - taper * max(0, v.co.z)) * (1 - shield * max(0, -v.co.z))
        v.co = Vector((v.co.x * scale[0] * k, v.co.y * scale[1] * (1 - taper * 0.4 * max(0, v.co.z)), v.co.z * scale[2]))
    bm.to_mesh(me); bm.free()
    for f in me.polygons: f.use_smooth = True
    ob = bpy.data.objects.new(name, me); col.objects.link(ob)
    ob.location = loc; ob.rotation_euler = Euler(rot); me.materials.append(mat); return ob

def material(name, hexc, rough=0.6):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name); m.use_nodes = True
    bs = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bs.inputs["Base Color"].default_value = (*lin(hexc), 1); bs.inputs["Roughness"].default_value = rough
    m.diffuse_color = (*lin(hexc), 1); return m

# ---------------------------------------------------------------- body
def build_body(col):
    # real wombat proportions (reference photo): a long low barrel that is highest over the hips, a big rounded rump,
    # a broad rounded head carried low and forward, a long deep muzzle ending in a large leathery nose, short thick legs
    parts = [
        blob(col, "body",   (0, 0.26, 0.86), (0.94, 1.22, 0.78), p=0.92),
        blob(col, "rump",   (0, 0.95, 0.92), (0.88, 0.54, 0.75), p=0.9),
        blob(col, "chest",  (0, -0.42, 0.78), (0.86, 0.62, 0.68), p=0.92),
        blob(col, "neck",   (0, -0.72, 0.86), (0.7, 0.42, 0.56)),
        blob(col, "head",   (0, -1.0, 0.9), (0.76, 0.6, 0.58), p=0.95),
        blob(col, "brow",   (0, -1.12, 1.12), (0.56, 0.4, 0.3)),
        blob(col, "jowlL",  (0.36, -1.22, 0.72), (0.32, 0.36, 0.3)),
        blob(col, "jowlR",  (-0.36, -1.22, 0.72), (0.32, 0.36, 0.3)),
        blob(col, "muzzle", (0, -1.46, 0.76), (0.42, 0.4, 0.34), p=0.92),
        blob(col, "snout",  (0, -1.68, 0.78), (0.32, 0.22, 0.27)),
        blob(col, "tail",   (0, 1.46, 0.66), (0.12, 0.12, 0.12), seg=16, ring=12),
    ]
    for sx in (1, -1):
        parts.append(blob(col, "legF", (0.54*sx, -0.5, 0.3), (0.27, 0.31, 0.34)))
        parts.append(blob(col, "legB", (0.6*sx, 0.9, 0.3), (0.3, 0.34, 0.36)))
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts: o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join(); b = bpy.context.active_object; b.name = "WombatBody"
    rm = b.modifiers.new("remesh", 'REMESH'); rm.mode = 'VOXEL'; rm.voxel_size = 0.035
    bpy.ops.object.modifier_apply(modifier=rm.name)
    sm = b.modifiers.new("smooth", 'CORRECTIVE_SMOOTH'); sm.iterations = 12
    bpy.ops.object.modifier_apply(modifier=sm.name)
    bpy.ops.object.shade_smooth(); return b

def surf(b, x, z):
    ok, loc, nrm, _ = b.ray_cast(Vector((x, -3, z)), Vector((0, 1, 0)))
    return loc, nrm

# ---------------------------------------------------------------- colour zones (game re-colours these per pet)
def paint(b):
    me = b.data
    for a in list(me.color_attributes): me.color_attributes.remove(a)
    mask = me.color_attributes.new("Mask", 'FLOAT_COLOR', 'POINT')   # R cream, G blush, B paw
    cheeks = [surf(b, 0.42*sx, 0.8)[0] for sx in (1, -1)]   # blush sits on the cheek surface
    for v in me.vertices:
        p = v.co; x, y, z = p
        belly = ss(1.0, 0.72, ell(p, (0, -0.55, 0.5), (0.55, 0.5, 0.42)))
        under = ss(0.3, 0.12, z) * ss(0.65, 0.35, abs(x)) * 0.8
        muz = ss(1.0, 0.7, ell(p, (0, -1.62, 0.72), (0.36, 0.3, 0.28))) * 0.6
        blush = max(ss(0.16, 0.05, (p - c).length) for c in cheeks) * 0.6
        mask.data[v.index].color = (max(belly, under, muz), blush, ss(0.16, 0.06, z), 1.0)
    me.color_attributes.active_color = mask; me.color_attributes.render_color_index = 0
    m = bpy.data.materials.get("WombatFur") or bpy.data.materials.new("WombatFur")
    m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial"); bs = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bs.inputs["Roughness"].default_value = 0.9; nt.links.new(bs.outputs[0], out.inputs[0])
    ca = nt.nodes.new("ShaderNodeVertexColor"); ca.layer_name = "Mask"
    sep = nt.nodes.new("ShaderNodeSeparateColor"); nt.links.new(ca.outputs[0], sep.inputs[0])
    def rgb(hexc, label):
        n = nt.nodes.new("ShaderNodeRGB"); n.label = label; n.outputs[0].default_value = (*lin(hexc), 1); return n.outputs[0]
    def mixc(fac, a, b_):
        n = nt.nodes.new("ShaderNodeMix"); n.data_type = 'RGBA'; cs = [i for i in n.inputs if i.type == 'RGBA']
        nt.links.new(fac, n.inputs[0]); nt.links.new(a, cs[0]); nt.links.new(b_, cs[1])
        return next(o for o in n.outputs if o.type == 'RGBA')
    c = mixc(sep.outputs[0], rgb('#a07650', "Fur"), rgb('#f0dcbc', "Belly"))
    c = mixc(sep.outputs[1], c, rgb('#ef9e97', "Blush")); c = mixc(sep.outputs[2], c, rgb('#5b4232', "Paw"))
    nt.links.new(c, bs.inputs["Base Color"])
    me.materials.clear(); me.materials.append(m); return m

# ---------------------------------------------------------------- face, ears, toes
def features(col, b):
    NOSE, EYE = material("Nose", '#3a2a25', 0.4), material("Eye", '#1d1411', 0.25)
    EAR, EARIN = material("Ear", '#946c49', 0.85), material("EarInner", '#d99a92', 0.7)
    TOE, MOUTH = material("Toe", '#3e2f28', 0.5), material("Mouth", '#3a2a25', 0.6)
    # big, broad, leathery nose
    p, n = surf(b, 0, 0.84); part(col, "Nose", p + Vector((0, 0.03, 0)), (0.31, 0.13, 0.2), NOSE, shield=0.3)
    eyes = []
    for sx in (1, -1):
        p, n = surf(b, 0.34*sx, 1.07)
        eyes.append(part(col, "Eye", p + n*0.012, (0.048, 0.038, 0.05), EYE, seg=16, ring=10))
        # small rounded ears, set wide on the back corners of the head
        part(col, "Ear", (0.5*sx, -0.82, 1.42), (0.18, 0.09, 0.21), EAR, rot=(0.15, -0.55*sx, 0), taper=0.35)
        part(col, "EarIn", (0.51*sx, -0.9, 1.41), (0.11, 0.03, 0.13), EARIN, rot=(0.15, -0.55*sx, 0), taper=0.35)
        for (fy, fx) in ((-0.78, 0.54), (0.56, 0.6)):
            for dx in (-0.1, 0, 0.1):
                part(col, "Toe", (fx*sx + dx, fy, 0.07), (0.055, 0.07, 0.05), TOE, seg=12, ring=8)
    def stroke(name, pts):
        cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = 0.013; cu.bevel_resolution = 3
        sp = cu.splines.new('BEZIER'); sp.bezier_points.add(len(pts) - 1)
        for bp, (x, z) in zip(sp.bezier_points, pts):
            loc, nrm = surf(b, x, z); bp.co = loc + nrm*0.012; bp.handle_left_type = bp.handle_right_type = 'AUTO'
        ob = bpy.data.objects.new(name, cu); col.objects.link(ob); cu.materials.append(MOUTH)
        # glTF can't carry curves: bake the stroke into a mesh
        me = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
        bpy.data.objects.remove(ob, do_unlink=True); bpy.data.curves.remove(cu)
        mo = bpy.data.objects.new(name, me); col.objects.link(mo)
        if not me.materials: me.materials.append(MOUTH)
        return mo
    stroke("Mouth", [(-0.14, 0.6), (-0.07, 0.555), (0, 0.6), (0.07, 0.555), (0.14, 0.6)])
    stroke("Philtrum", [(0, 0.66), (0, 0.6)])
    return eyes

# ---------------------------------------------------------------- rig + weights
BONES = [  # name, head, tail, parent, z-axis
    ("root", (0, 0, 0), (0, 0, 0.3), None, (0, 0, 1)),
    ("spine", (0, 1.1, 0.86), (0, -0.3, 0.86), "root", (0, 0, 1)),
    ("head", (0, -0.55, 0.9), (0, -1.6, 0.86), "spine", (0, 0, 1)),
    ("tail", (0, 1.34, 0.68), (0, 1.64, 0.62), "spine", (0, 0, 1)),
] + [b for s, side in ((1, "L"), (-1, "R")) for b in (
    (f"ear.{side}", (0.48*s, -0.82, 1.26), (0.56*s, -0.8, 1.62), "head", (0, -1, 0)),
    (f"leg.F.{side}", (0.54*s, -0.5, 0.62), (0.54*s, -0.5, 0.04), "spine", (0, -1, 0)),
    (f"leg.B.{side}", (0.6*s, 0.9, 0.62), (0.6*s, 0.9, 0.04), "spine", (0, -1, 0)))]
LEGS = {"leg.F.L": (0.54, -0.5), "leg.F.R": (-0.54, -0.5), "leg.B.L": (0.6, 0.9), "leg.B.R": (-0.6, 0.9)}

def build_rig(col):
    arm = bpy.data.armatures.new("WombatRig"); rig = bpy.data.objects.new("WombatRig", arm); col.objects.link(rig)
    rig.show_in_front = True
    bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active = rig; rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    for name, h, t, parent, z in BONES:
        e = arm.edit_bones.new(name); e.head = h; e.tail = t
        if parent: e.parent = arm.edit_bones[parent]
        e.align_roll(Vector(z))
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in rig.pose.bones: pb.rotation_mode = 'XYZ'
    return rig

def skin(b, rig, eyes):
    for g in list(b.vertex_groups): b.vertex_groups.remove(g)
    G = {n: b.vertex_groups.new(name=n) for n in ["FurLen"] + [x[0] for x in BONES]}
    nose = bpy.data.objects["Nose"].location
    mask = b.data.color_attributes["Mask"].data
    for v in b.data.vertices:
        p = v.co; x, y, z = p; w = {}
        for n, (lx, ly) in LEGS.items(): w[n] = ss(0.44, 0.24, math.hypot(x - lx, y - ly)) * ss(0.58, 0.3, z)
        w["tail"] = ss(1.3, 1.42, y) * ss(0.35, 0.2, abs(x))
        w["head"] = ss(-0.5, -0.85, y) * ss(0.3, 0.55, z) * (1 - max(w["leg.F.L"], w["leg.F.R"]))
        w["spine"] = max(0.0, 1.0 - sum(w.values())); tot = sum(w.values())
        for n, val in w.items():
            if val > 0.001: G[n].add([v.index], val / tot, 'REPLACE')
        # fur length: short on the muzzle, around eyes and nose, and on the soles
        f = min(0.15 + 0.85*ss(0.85, 1.3, ell(p, (0, -1.62, 0.76), (0.38, 0.3, 0.3))), 0.3 + 0.7*ss(0.05, 0.2, z))
        for e in eyes: f = min(f, 0.05 + 0.95*ss(0.09, 0.22, (p - e.location).length))
        f = min(f, 0.05 + 0.95*ss(0.2, 0.34, (p - nose).length))
        G["FurLen"].add([v.index], f, 'REPLACE')
        mask[v.index].color[3] = f            # the game reads fur length from the mask's alpha
    # the game draws ~10 fur layers of this mesh, so export a lighter version
    dec = b.modifiers.new("lowpoly", 'DECIMATE'); dec.ratio = 0.16
    am = b.modifiers.new("rig", 'ARMATURE'); am.object = rig; b.parent = rig

def to_bone(rig, o, bname):
    bn = rig.data.bones[bname]; mw = o.matrix_world.copy()
    o.parent = rig; o.parent_type = 'BONE'; o.parent_bone = bname
    o.matrix_parent_inverse = (rig.matrix_world @ bn.matrix_local @ Matrix.Translation((0, bn.length, 0))).inverted()
    o.matrix_world = mw

def attach(col, rig):
    for o in col.objects:
        n, x, y = o.name, o.location.x, o.location.y; side = "L" if x > 0 else "R"
        if n.startswith(("Eye", "Nose", "Mouth", "Philtrum")): to_bone(rig, o, "head")
        elif n.startswith("Ear"): to_bone(rig, o, f"ear.{side}")
        elif n.startswith("Toe"): to_bone(rig, o, f"leg.{'F' if y < 0 else 'B'}.{side}")

# ---------------------------------------------------------------- fur shells (preview only; the game draws its own)
def shells(col, b, rig, base, n=10, length=0.07):
    names = [g.name for g in b.vertex_groups]
    for i in range(1, n + 1):
        t = i / n; name = f"FurShell{i:02d}"
        m = bpy.data.materials.get(name)
        if m: bpy.data.materials.remove(m)
        m = base.copy(); m.name = name; nt = m.node_tree
        bs = next(x for x in nt.nodes if x.type == "BSDF_PRINCIPLED")
        tc = nt.nodes.new("ShaderNodeTexCoord"); nz = nt.nodes.new("ShaderNodeTexNoise")
        nz.inputs["Scale"].default_value = 70.0; nz.inputs["Detail"].default_value = 1.0
        nt.links.new(tc.outputs["Object"], nz.inputs["Vector"])
        gt = nt.nodes.new("ShaderNodeMath"); gt.operation = 'GREATER_THAN'; gt.inputs[1].default_value = 0.38 + 0.32*t
        nt.links.new(nz.outputs["Fac"], gt.inputs[0]); nt.links.new(gt.outputs[0], bs.inputs["Alpha"])
        src = bs.inputs["Base Color"].links[0].from_socket
        mul = nt.nodes.new("ShaderNodeMix"); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs[0].default_value = 1.0
        cs = [s for s in mul.inputs if s.type == 'RGBA']; g = 0.75 + 0.35*t
        nt.links.new(src, cs[0]); cs[1].default_value = (g, g, g, 1)
        nt.links.new(next(o for o in mul.outputs if o.type == 'RGBA'), bs.inputs["Base Color"])
        try: m.surface_render_method = 'DITHERED'
        except Exception: m.blend_method = 'CLIP'
        sh = bpy.data.objects.new(name, b.data); col.objects.link(sh); sh.hide_select = True
        for nm in names: sh.vertex_groups.new(name=nm)
        am = sh.modifiers.new("rig", 'ARMATURE'); am.object = rig
        d = sh.modifiers.new("puff", 'DISPLACE'); d.direction = 'NORMAL'; d.mid_level = 0.0; d.strength = length * t; d.vertex_group = "FurLen"
        sh.material_slots[0].link = 'OBJECT'; sh.material_slots[0].material = m
        sh.parent = rig

# ---------------------------------------------------------------- go
def rebuild():
    if bpy.context.object and bpy.context.object.mode != 'OBJECT': bpy.ops.object.mode_set(mode='OBJECT')
    col = collection()
    for o in list(col.objects): bpy.data.objects.remove(o, do_unlink=True)
    for d in (bpy.data.meshes, bpy.data.curves, bpy.data.armatures):
        for x in list(d):
            if x.users == 0: d.remove(x)
    b = build_body(col)
    base = paint(b)
    eyes = features(col, b)
    rig = build_rig(col)
    skin(b, rig, eyes)
    attach(col, rig)
    shells(col, b, rig, base)
    rig.animation_data_create()
    if "W_idle" in bpy.data.actions: rig.animation_data.action = bpy.data.actions["W_idle"]
    return rig

rig = rebuild()
print("rebuilt:", len(bpy.data.collections[COL].objects), "objects")

# ---------------------------------------------------------------- export for the game
def export(path=r"C:\Users\User\Documents\wombat-pet\assets\models\wombat.glb"):
    """Rig + body + face parts (no preview fur shells) with every W_* action as a glTF animation."""
    col = bpy.data.collections[COL]; rig = bpy.data.objects["WombatRig"]
    hidden = rig.hide_get(); rig.hide_set(False)
    bpy.ops.object.select_all(action='DESELECT')
    for o in col.objects:
        if not o.name.startswith("FurShell"): o.select_set(True)
    bpy.context.view_layer.objects.active = rig
    rig.animation_data.action = bpy.data.actions["W_idle"]
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
        export_animations=True, export_animation_mode='ACTIONS', export_skins=True, export_morph=False,
        export_vertex_color='ACTIVE', export_yup=True, export_cameras=False, export_lights=False)
    rig.hide_set(hidden)
    import os; return os.path.getsize(path)
