# Converts the realistic rigged Sketchfab animals (assets/source/sketchfab, not committed; see assets/models/CREDITS.md) into
# light game models: assets/models/real/<name>.glb.   blender.exe -b --factory-startup -P real_build.py   (env ONLY=tiger,elk to pick)
# - meshes stuck to a bone become skinned (one vertex group at weight 1), then everything with the same material is joined -> few draw calls
# - drops parts the game doesn't want (saddles, helper spheres), decimates to a phone-friendly triangle budget
# - textures shrunk to 512 px WebP; spec/gloss materials come out as standard metal/rough (three.js reads those)
# - only the clips the game uses are kept, renamed to short names (idle, walk, run, eat, lie, ...)
import bpy, bmesh, os
SRC = r"C:\Users\User\Documents\wombat-pet\assets\source\sketchfab"
OUT = r"C:\Users\User\Documents\wombat-pet\assets\models\real"
# name: (source file, triangle budget, {game clip: source clip}, material names to drop)
MODELS = {
    "tiger": ("tiger", 9000, {"walk": "Walk", "trot": "Walk Fast", "run": "Run", "eat": "Eat", "attack": "Attack"}, ["Mouth_mat"]),   # (its Howl clip leaves the hips unkeyed: upside down)
    "deer":  ("elk", 7000, {"idle": "Stand_Breathing_01", "walk": "Walk", "trot": "Trot", "run": "Sprint", "eat": "Stand_Eating_01",
                            "lie": "Lying_Breathing_01", "lieDown": "Trans_Stand_to_Lying", "getUp": "Trans_Lying_to_Stand", "jump": "JumpStand", "sit": "SittingSpec_Breathing_01"}, []),
    "wolf":  ("wolf", 7000, {"walk": "Wolf_WalkFast_F", "howl": "Wolf_Howl"}, []),
    "moose": ("moose", 7000, {"idle": "Moose_Idle", "walk": "Moose_WalkFast_F"}, []),
    "horse": ("horse", 11000, {"idle": "Horse_Idle", "walk": "Horse_Walk"}, ["M_Saddle1", "M_Saddle2"]),
    "croc":  ("alligator", 8000, {"idle": "AmericanAlligator_Idle", "walk": "AmericanAlligator_Trot_F"}, []),
    "eagle": ("baldeagle", 7000, {"fly": "GltfAnimation 0"}, []),
    "hermit": ("hermit_k", 4000, {"walk": "Animation"}, []),
    "seaturtle": ("seaturtle", 6000, {"swim": "Swim Cycle"}, []),
    "fiddler": ("fiddler", 3000, {"dance": "Dance"}, ["AOFLoor"]),
    "penguin": ("penguin", 3500, {"idle": "Iddle", "walk": "Walk", "slide": "Slide", "peck": "Bite", "fall": "Fall"}, []),
    "bug_cicada": ("bug_cicada", 7000, {"walk": "Animation"}, []),   # (CC0 scan with its own rig: five-joint legs, wings; its clip is a slow walk)
    "pondturtle": ("pondturtle", 24000, {"walk": "Animation"}, ["Object_8"]),   # (CC0 scan with its own rig: neck + head, three bones a limb, five in the tail; one diagonal crawl clip)
}
# these keep the file's own rest pose (Blender's bind-pose guess tips them on their side)
RAW_BIND = {"wolf", "croc", "moose", "horse", "penguin"}
os.makedirs(OUT, exist_ok=True)
only = [s for s in os.environ.get("ONLY", "").split(",") if s]

def nearest_bone(arm, o):
    """The bone closest to a loose part (antlers sit on the head: a head bone wins when it is nearly as close as any)."""
    from mathutils import Vector
    from mathutils.geometry import intersect_point_line
    c = sum((o.matrix_world @ Vector(b) for b in o.bound_box), Vector())/8
    def dist(b):
        h, t = arm.matrix_world @ b.head_local, arm.matrix_world @ b.tail_local
        p, f = intersect_point_line(c, h, t); return (c - (h if f < 0 else t if f > 1 else p)).length
    ds = sorted((dist(b), b.name) for b in arm.data.bones)
    heads = [d for d in ds if 'head' in d[1].lower() and 'nub' not in d[1].lower() and 'end' not in d[1].lower()]
    return heads[0][1] if heads and heads[0][0] < 2.5*ds[0][0] + 1e-6 else ds[0][1]

def bones_slot(ac):
    """The action slot whose curves animate pose bones."""
    for sl in getattr(ac, "slots", []):
        for ly in ac.layers:
            for sp in ly.strips:
                cb = sp.channelbag(sl)
                if cb and any(fc.data_path.startswith("pose.bones") for fc in cb.fcurves): return sl
    return None

def hold_rest(arm, ac, slot):
    """Key every bone channel a clip leaves out at its rest value, so no pose leaks in from another clip."""
    cb = next(sp.channelbag(slot) for ly in ac.layers for sp in ly.strips if sp.channelbag(slot))
    have = {(fc.data_path, fc.array_index) for fc in cb.fcurves}; f0 = ac.frame_range[0]
    for pb in arm.pose.bones:
        for prop, val in (("rotation_quaternion", (1, 0, 0, 0)), ("location", (0, 0, 0)), ("scale", (1, 1, 1))):
            dp = 'pose.bones["%s"].%s' % (pb.name, prop)
            for i, v in enumerate(val):
                if (dp, i) not in have: cb.fcurves.new(dp, index=i, group_name=pb.name).keyframe_points.insert(f0, v)

def build(name, src, budget, clips, drop):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, src + ".glb"), guess_original_bind_pose=name not in RAW_BIND)
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    arm.data.pose_position = 'REST'; bpy.context.view_layer.update()   # rigid parts are baked where they sit on the rest skeleton
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    skinned = next(o for o in meshes if any(md.type == 'ARMATURE' for md in o.modifiers))
    for o in meshes:
        mats = [m.name.split('.')[0] for m in o.data.materials if m]
        if not o.data.polygons or (len(o.data.polygons) <= 80 and not mats) or any(m in drop for m in mats) or o.name in drop:   # helper spheres, saddles (drop: material or object names)
            bpy.data.objects.remove(o, do_unlink=True); continue
        if not any(md.type == 'ARMATURE' for md in o.modifiers):   # rigid part: weight it to the bone it hangs from, in the body mesh's space
            bone = o.parent_bone if o.parent_type == 'BONE' else nearest_bone(arm, o)
            mw = o.matrix_world.copy(); o.parent = None; o.data.transform(skinned.matrix_world.inverted() @ mw)
            vg = o.vertex_groups.new(name=bone); vg.add(range(len(o.data.vertices)), 1.0, 'REPLACE')
            md = o.modifiers.new("Armature", 'ARMATURE'); md.object = arm
            o.parent = skinned.parent; o.parent_type = skinned.parent_type; o.matrix_world = skinned.matrix_world.copy()
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    by = {}
    for o in meshes: by.setdefault(o.data.materials[0].name if o.data.materials else "", []).append(o)
    for objs in by.values():   # one mesh per material
        if len(objs) > 1:
            bpy.ops.object.select_all(action='DESELECT')
            for o in objs: o.select_set(True)
            bpy.context.view_layer.objects.active = objs[0]; bpy.ops.object.join()
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    total = sum(len(o.data.polygons) for o in meshes)   # (quads count once; close enough for a budget)
    ratio = min(1.0, budget/max(1, sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)))
    for o in meshes:
        bm = bmesh.new(); bm.from_mesh(o.data); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=max(o.dimensions)*2e-5); bm.to_mesh(o.data); bm.free()   # (scans come in loose 65k pieces)
        if ratio < 0.98:
            d = o.modifiers.new("Dec", 'DECIMATE'); d.ratio = ratio; d.use_collapse_triangulate = True
            bpy.context.view_layer.objects.active = o
            while o.modifiers[0].name != "Dec": bpy.ops.object.modifier_move_up(modifier="Dec")
            bpy.ops.object.modifier_apply(modifier="Dec")
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
    for im in bpy.data.images:
        if im.size[0] > 512: im.scale(512, max(1, 512*im.size[1]//im.size[0]))
    # keep and rename the wanted clips; drop the rest
    keep = {}
    for ac in list(bpy.data.actions):
        short = ac.name.split('|')[-1]
        g = next((k for k, v in clips.items() if v == short or v == ac.name), None)
        if g and g not in keep: ac.name = g; keep[g] = ac
        else: bpy.data.actions.remove(ac)
    ad = arm.animation_data or arm.animation_data_create()
    for tr in list(ad.nla_tracks): ad.nla_tracks.remove(tr)
    for g, ac in keep.items():   # one NLA track per clip so the exporter writes each as its own animation
        tr = ad.nla_tracks.new(); tr.name = g; st = tr.strips.new(g, int(ac.frame_range[0]), ac); st.name = g; tr.mute = True
        bone_slot = bones_slot(ac)
        if bone_slot: st.action_slot = bone_slot   # an action can hold several objects' channels; the armature takes the bones' ones
        if bone_slot: hold_rest(arm, ac, bone_slot)
    ad.action = None; arm.data.pose_position = 'POSE'
    if name in EXTRA: add_clips(arm, ad, *EXTRA[name])   # clips made here for what the model lacks (a turtle crawling on land, a penguin swimming)
    for ac in keep.values(): print("  CLIP", ac.name, [sl.identifier for sl in getattr(ac, "slots", [])], "bones:", bones_slot(ac).identifier if bones_slot(ac) else None)
    print("MODEL", name, "faces", total, "->", tris, "tris; clips", sorted(keep), "missing", sorted(set(clips) - set(keep)))
    bpy.ops.object.select_all(action='SELECT')
    p = os.path.join(OUT, name + ".glb")
    bpy.ops.export_scene.gltf(filepath=p, export_format='GLB', export_image_format='WEBP', export_animations=True, export_animation_mode='NLA_TRACKS',
        export_skins=True, export_all_influences=False, export_yup=True, export_apply=False,
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7, export_draco_position_quantization=14,
        export_draco_normal_quantization=10, export_draco_texcoord_quantization=12)
    print("EXPORTED", p, os.path.getsize(p))


# ---------------------------------------------------------------- clips made here, keyed on the model's own bones
import math
from mathutils import Vector, Quaternion
FPS = 30
def add_clips(arm, ad, head, tail, clips):
    """clips: {name: (seconds, [(t 0..1, {bone prefix: (pitch, yaw, roll[, lift])})])}. Angles are about the animal's own axes:
    pitch about its side (positive tips a forward-pointing bone down), yaw about the up axis, roll about its length; lift raises the bone.
    Every bone starts from the model's own first clip (its rest pose may stand it on end), so the new clips are changes to a real pose."""
    B = arm.data.bones
    bone = lambda p: next((b for b in B if b.name.startswith(p)), None)
    ref = ad.nla_tracks[0].strips[0].action; ad.action = ref
    sl = bones_slot(ref)
    if sl: ad.action_slot = sl
    bpy.context.scene.frame_set(int(ref.frame_range[0])); bpy.context.view_layer.update()
    base = {pb.name: (pb.rotation_quaternion.copy(), pb.location.copy(), (arm.matrix_world @ pb.matrix).to_3x3().normalized(), (arm.matrix_world @ pb.matrix).to_3x3()) for pb in arm.pose.bones}
    P = lambda n: arm.matrix_world @ arm.pose.bones[bone(n).name].head
    up = Vector((0, 0, 1)); fwd = P(head) - P(tail); fwd.z = 0; fwd.normalize(); side = up.cross(fwd)
    for cname, (secs, frames) in clips.items():
        act = bpy.data.actions.new(cname); ad.action = act
        names = {pfx: bone(pfx).name for _, poses in frames for pfx in poses}
        for t, poses in frames:
            f = 1 + t*secs*FPS
            want = {names[p]: v for p, v in poses.items()}
            for pb in arm.pose.bones:
                qb, lb, Wr, Ws = base[pb.name]; pb.rotation_mode = 'QUATERNION'
                v = want.get(pb.name, (0, 0, 0)); pr, yw, rl = v[:3]
                M = (Wr @ qb.to_matrix().inverted()).inverted()   # world axes into the bone's own frame
                q = Quaternion((M @ up).normalized(), yw) @ Quaternion((M @ side).normalized(), pr) @ Quaternion((M @ fwd).normalized(), rl)
                pb.rotation_quaternion = q @ qb; pb.keyframe_insert("rotation_quaternion", frame=f)
                lv = (side*v[3][0] + up*v[3][1] + fwd*v[3][2]) if len(v) > 3 and isinstance(v[3], tuple) else up*v[3] if len(v) > 3 else None   # lift: up, or (side, up, forward)
                pb.location = lb + ((Ws @ qb.to_matrix().inverted()).inverted() @ lv if lv is not None else Vector((0, 0, 0))); pb.keyframe_insert("location", frame=f)
        tr = ad.nla_tracks.new(); tr.name = cname; st = tr.strips.new(cname, 1, act); st.name = cname; tr.mute = True
        ad.action = None
        print("  EXTRA CLIP", cname)

def _turtle_crawl():
    # loggerheads on sand: diagonal pairs — the front flipper reaches forward and plants, then hauls the body (lifted a little) over it
    fr = []
    for i in range(13):
        t = i/12; ph = t*2*math.pi
        def limb(p, fore):
            reach = math.sin(p); lift = max(0, math.cos(p))
            return ((-0.25*lift if fore else -0.15*lift), (0.55 if fore else 0.35)*reach, 0)
        fl, fr_ = limb(ph, True), limb(ph + math.pi, True); hl, hr = limb(ph + math.pi, False), limb(ph, False)
        flip = lambda v, s: (v[0], v[1]*s, v[2]*s)
        fr.append((t, {"flipper-left.001": flip(fl, 1), "flipper-right.001": flip(fr_, -1), "hind-left.001": flip(hl, 1), "hind-right.001": flip(hr, -1),
                       "Main": (0, 0.05*math.sin(ph), 0.04*math.sin(ph), 0.012*abs(math.sin(ph))), "head.002": (0.05*math.sin(2*ph), 0, 0)}))
    rest = [(t, {"head.002": (0.06*math.sin(t*2*math.pi), 0.15*math.sin(t*2*math.pi), 0), "Main": (0, 0, 0, 0.004*math.sin(t*2*math.pi))}) for t in (0, 0.25, 0.5, 0.75, 1)]
    return {"crawl": (2.2, fr), "rest": (4.0, rest)}

def _penguin_swim():
    # in the water the body lies flat and the flippers beat like wings; a dive tips it head-down and back up
    flat = lambda extra={}: {"Hips": (1.45, 0, 0), **extra}
    swim = [(t, flat({"Flipper1_l": (0, 0, -0.9*math.sin(t*2*math.pi)), "Flipper1_r": (0, 0, 0.9*math.sin(t*2*math.pi)),
                      "Flipper2_l": (0, 0, -0.4*math.sin(t*2*math.pi - 0.8)), "Flipper2_r": (0, 0, 0.4*math.sin(t*2*math.pi - 0.8)),
                      "Leg_l": (0.6, 0, 0), "Leg_r": (0.6, 0, 0), "Neck": (-0.5, 0, 0)})) for t in [i/8 for i in range(9)]]
    dive = [(0, flat({"Neck": (-0.5, 0, 0)})), (0.3, flat({"Hips": (2.2, 0, 0), "Neck": (0.1, 0, 0), "Flipper1_l": (0, 0, -1.0), "Flipper1_r": (0, 0, 1.0)})),
            (0.6, flat({"Hips": (2.2, 0, 0), "Neck": (0.2, 0, 0), "Jaw": (0.4, 0, 0)})), (1.0, flat({"Neck": (-0.5, 0, 0)}))]
    return {"swim": (0.7, swim), "dive": (1.6, dive)}

def _pond_turtle():
    # its own clip is a swim (body tipped up, head out of the water, diagonal strokes); on a stone it lies level:
    # bask - shell flat, hind feet stretched back, the head slowly turning in the sun
    # hide - pulls its head back into the shell: the neck slides in and folds (an S-bend, as cryptodire turtles do), then pokes out again
    lv = (0.35, 0, 0); FRONT = {"Bone.008": (0, 0, -1.0), "Bone.011": (0, 0, 1.0)}   # front legs spread out flat to the sides (not hanging into the stone)
    bask = [(t, {**FRONT, "Bone_93": lv, "Bone.006": (0.15 + 0.05*math.sin(t*2*math.pi), 0.2*math.sin(t*2*math.pi), 0), "Bone.007": (0.1, 0.15*math.sin(t*2*math.pi + 1), 0)}) for t in [i/8 for i in range(9)]]
    inn = {**FRONT, "Bone_93": lv, "Bone.006": (-0.3, 0, 0, (0, -0.05, -0.42)), "Bone.007": (0.9, 0, 0)}
    hide = [(0, {**FRONT, "Bone_93": lv, "Bone.006": (0.15, 0, 0), "Bone.007": (0.1, 0, 0)}), (0.12, inn), (0.85, inn), (1.0, {**FRONT, "Bone_93": lv, "Bone.006": (0.15, 0, 0), "Bone.007": (0.1, 0, 0)})]
    return {"bask": (6.0, bask), "hide": (3.0, hide)}

EXTRA = {"seaturtle": ("head.001", "tail.001", _turtle_crawl()), "penguin": ("Head", "Tail1", _penguin_swim()), "pondturtle": ("Bone.007", "Bone.005", _pond_turtle())}
for name, (src, budget, clips, drop) in MODELS.items():
    if only and name not in only: continue
    build(name, src, budget, clips, drop)
