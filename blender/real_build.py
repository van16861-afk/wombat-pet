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
    "hippo2": ("real_hippo", 9000, {"yawn": "Play_anim_Hippo"}, []),   # (its one clip opens the mouth wide: the yawn; it walks, grazes and swims with clips made below)
    "capybara2": ("real_capybara", 9000, {"base": "Take 001"}, []),   # (its one clip only rolls the eyes: the standing pose the clips below start from)
    "whale2": ("real_whale", 5000, {"swim": "Take 001"}, []),
    "tortoise2": ("real_tortoise", 8000, {"walk": "walking", "look": "looking"}, []),
    "koala2": ("real_koala", 7000, {"idle": "Animations"}, ["Material_32", "material", "Text"]),   # (drops the leg it clings to in the demo, and the caption)
    "butterfly2": ("real_butterfly", 4000, {"fly": "Animation"}, []),
    "rabbit2": ("real_rabbit", 7000, {"idle": "A_jackrabbit_idle_05", "eat": "jackrabbit_idle_eating", "walk": "jackrabbit_walk_fwd_01", "run": "jackrabbit_sprint_fwd_01", "look": "jackrabbit_idle_04"}, []),
    "trout": ("real_trout", 3500, {"swim": "Trout_Swim_1", "dart": "Trout_Swim_1_Fast"}, []),
    "fox": ("fox", 9000, {"idle": "A1_Stand_Idle_02", "eat": "A2_Stand_Eating_01", "walk": "Loco_Walk", "trot": "Trot", "run": "Run", "sneak": "Sneak", "pounce": "CanonBall",
                         "lie": "Lying_Idle_01", "lieDown": "Trans_Stand_to_Lying", "getUp": "Trans_Lying_to_Stand", "sit": "Sitting_Idle_01", "look": "A3_Stand_Idle_01"}, []),
    "bug_cicada": ("bug_cicada", 7000, {"walk": "Animation"}, []),   # (CC0 scan with its own rig: five-joint legs, wings; its clip is a slow walk)
    "pondturtle": ("pondturtle", 24000, {"walk": "Animation"}, ["Object_8"]),   # (CC0 scan with its own rig: neck + head, three bones a limb, five in the tail; one diagonal crawl clip)
}
# these keep the file's own rest pose (Blender's bind-pose guess tips them on their side)
RAW_BIND = {"wolf", "croc", "moose", "horse", "penguin", "fox", "rabbit2", "trout"}
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
    path = os.path.join(SRC, src + ".glb")
    if not os.path.exists(path): path = os.path.join(SRC, src, "scene.gltf")   # (some come as an unpacked glTF folder)
    bpy.ops.import_scene.gltf(filepath=path, guess_original_bind_pose=name not in RAW_BIND)
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    arm.data.pose_position = 'REST'; bpy.context.view_layer.update()   # rigid parts are baked where they sit on the rest skeleton
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    skinned = next(o for o in meshes if any(md.type == 'ARMATURE' for md in o.modifiers))
    for o in meshes:
        mats = [m.name.split('.')[0] for m in o.data.materials if m]
        if not o.data.polygons or (len(o.data.polygons) <= 80 and not mats) or any(m in drop for m in mats) or o.name in drop:   # helper spheres, saddles (drop: material or object names)
            bpy.data.objects.remove(o, do_unlink=True); continue
        if not any(md.type == 'ARMATURE' for md in o.modifiers):   # rigid part: weight it to the bone it hangs from, in the body mesh's space
            up_ = o   # (hung on a bone through empties, e.g. the capybara's eyes: that bone)
            while up_.parent and up_.parent_type != 'BONE': up_ = up_.parent
            bone = up_.parent_bone if up_.parent_type == 'BONE' else nearest_bone(arm, o)
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
        if ratio < 0.98 and not o.data.shape_keys:   # (a mesh with shape keys keeps its faces)
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
    if name in RIGCLIPS: RIGCLIPS[name](arm, ad, keep)   # clips keyed with the paws placed by a limb solve (the model has no real ones)
    if name in EXTRA: add_clips(arm, ad, *EXTRA[name])   # clips made here for what the model lacks (a turtle crawling on land, a penguin swimming)
    for ac in keep.values(): print("  CLIP", ac.name, [sl.identifier for sl in getattr(ac, "slots", [])], "bones:", bones_slot(ac).identifier if bones_slot(ac) else None)
    print("MODEL", name, "faces", total, "->", tris, "tris; clips", sorted(keep), "missing", sorted(set(clips) - set(keep)))
    for m in bpy.data.materials:   # drop textures that would not save (they leave dangling references in the file)
        if m.node_tree:
            for nd in [nd for nd in m.node_tree.nodes if nd.type == 'TEX_IMAGE' and (not nd.image or not nd.image.has_data or nd.image.size[0] == 0)]: m.node_tree.nodes.remove(nd)
            bs = next((nd for nd in m.node_tree.nodes if nd.type == 'BSDF_PRINCIPLED'), None)
            if bs:
                for sk in ('Specular Tint', 'Specular IOR Level'):
                    for l in list(bs.inputs[sk].links) if sk in bs.inputs else []: m.node_tree.links.remove(l)
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


def _quad(arm, ad, keep, S):
    # Clips keyed here for a rigged four-legged model whose file has none that move its legs (the capybara's one clip only rolls
    # its eyes, the hippo's only opens its mouth). 3ds Max rigs: bone tails point nowhere useful, so each bone is swung by where its
    # CHILD joint goes. The models face -Y, up is +Z; sizes are fractions of the hip height H.
    #   walk  - lateral-sequence walk (left hind, left fore, right hind, right fore): each foot stays planted through its stance while
    #           the body passes over it, then lifts with the knee/elbow folding and the toes curling back, and plants ahead
    #   idle  - standing: breathing, ears flicking, the head turning a little
    #   eat   - grazing: neck down, muzzle in the grass, nibbling with small head bobs
    #   lie   - body lowered onto the belly, legs folded under it, head resting forward
    #   swim  - body level and low, the legs stroking in circles (diagonal pairs together), head held up
    #   float - resting in the water: slow strokes
    # S: base (the kept clip whose first frame is the standing pose), keep_base, pel, neck [(bone, share)], head, jaw, ears (L, R) or
    # None, tail or None, legs {HL/HR/FL/FR: (upper, lower, paw, toe, toe tip)}, head0 (pitch added to every pose), cycle (walk seconds)
    import sys; sys.path.insert(0, os.path.dirname(__file__))
    from pose_kit import Rig
    from mathutils import Matrix
    PBN = [pb.name for pb in arm.pose.bones]
    B = lambda n: n if n is None or n in PBN else next(b for b in PBN if b.endswith(n))   # (names given whole or by their unique numeric ending)
    base = keep[S["base"]]; ad.action = base; sl = bones_slot(base)
    if sl: ad.action_slot = sl
    bpy.context.scene.frame_set(int(base.frame_range[0]) + 1); bpy.context.view_layer.update()
    B0 = {pb.name: pb.matrix_basis.copy() for pb in arm.pose.bones}
    ad.action = None
    if not S.get("keep_base"):
        keep.pop(S["base"])
        for tr in [tr for tr in ad.nla_tracks if tr.name == S["base"]]: ad.nla_tracks.remove(tr)
        bpy.data.actions.remove(base)
    class R_(Rig):
        def reset(self):
            for pb in self.PB: pb.rotation_mode = 'QUATERNION'; pb.matrix_basis = B0[pb.name]
            self.upd()
        def J(self, n): return self.PB[n].head.copy()
        def swing(self, n, child, target):   # turn bone n about its joint so its child's joint heads for `target`
            h = self.J(n); q = (self.J(child) - h).rotation_difference(Vector(target) - h)
            pb = self.PB[n]; pb.matrix = Matrix.Translation(h) @ q.to_matrix().to_4x4() @ Matrix.Translation(-h) @ pb.matrix; self.upd()
    R = R_(arm); R.reset()
    M3 = arm.matrix_world.to_3x3(); Mi = M3.inverted(); W = lambda x, y, z: Mi @ Vector((x, y, z))   # world offsets into the armature's frame (the hippo's is turned and scaled)
    X, Y, Z = W(1, 0, 0).normalized(), W(0, 1, 0).normalized(), W(0, 0, 1).normalized()
    PEL, HEAD, JAW, TAIL = B(S["pel"]), B(S["head"]), B(S.get("jaw")), B(S.get("tail"))
    NECK = [(B(n), w) for n, w in S["neck"]]; EARS = [B(n) for n in S["ears"]] if S.get("ears") else None
    LEGS = {k: tuple(B(n) for n in v) + (-Y if k[0] == "H" else Y,) for k, v in S["legs"].items()}   # knees bend forward, elbows back
    REST = {k: [R.J(n) for n in v[:5]] for k, v in LEGS.items()}   # hip, knee, hock, toe joint, toe tip in the standing pose
    H = (M3 @ (REST["HL"][0] - REST["HL"][4])).z
    def place(k, tip, curl=0.0):
        """Put a foot's toe tip on `tip`: the foot keeps its standing angle, turned back by `curl` (radians) as it lifts."""
        up, lo, paw, toe, tipb, bend = LEGS[k]; hp0, kn0, hk0, t0, tp0 = REST[k]
        d = Quaternion(X, curl) @ (tp0 - hk0)   # hock (wrist) -> toe tip
        hk = Vector(tip) - d; S_ = R.J(up)
        a = (kn0 - hp0).length; b = (hk0 - kn0).length
        dv = hk - S_; L = min(dv.length, (a + b)*0.999); dn = dv.normalized()
        x = (a*a - b*b + L*L)/(2*L); h = math.sqrt(max(0.0, a*a - x*x)); o = Vector(bend); o = (o - dn*o.dot(dn)).normalized()
        R.swing(up, lo, S_ + dn*x + o*h); R.swing(lo, paw, S_ + dn*L)
        if tipb != paw: R.swing(paw, tipb, R.J(paw) + d)   # (tip = paw: the leg ends at that joint)
    def step(t, off, duty, stride, lift):   # (forward offset, height) of a foot over the cycle
        p = (t - off) % 1.0
        if p < duty: return stride/2 - stride*(p/duty), 0.0
        q = (p - duty)/(1 - duty); return -stride/2 + stride*(0.5 - 0.5*math.cos(math.pi*q)), lift*math.sin(math.pi*q)
    def head(pitch=0.0, yaw=0.0, jaw=0.0, ears=(0.0, 0.0)):
        pitch += S.get("head0", 0.0)
        for n, w in NECK: R.turn(n, X, pitch*w)
        R.turn(HEAD, Z, yaw)
        if jaw and JAW: R.turn(JAW, X, -jaw)
        if EARS: R.turn(EARS[0], Y, ears[0]); R.turn(EARS[1], Y, -ears[1])
    def body(drop=0.0, pitch=0.0, sway=0.0):   # the whole body lowered / tipped nose-down / swayed side to side
        R.move(PEL, W(sway*H, 0, -drop*H))
        if pitch: R.turn(PEL, X, pitch, about=R.J(PEL) + W(0, -0.52*H, 0))
    def tail(a):
        if TAIL: R.turn(TAIL, Z, a)
    STRIDE, DUTY, LIFT, CYC = 0.49*H*S.get("stride", 1.0), 0.66, 0.103*H, S.get("cycle", 1.2)
    def walk(t):
        ph = t*2*math.pi
        body(drop=0.014*math.cos(2*ph), sway=0.012*math.sin(ph)); tail(0.08*math.sin(ph))
        head(pitch=0.04*math.sin(2*ph + 0.6), yaw=0.04*math.sin(ph), ears=(0.05*math.sin(2*ph), 0.05*math.sin(2*ph)))
        for k, off in (("HL", 0.0), ("FL", 0.25), ("HR", 0.5), ("FR", 0.75)):
            f, l = step(t, off, DUTY, STRIDE, LIFT); tp = REST[k][4]
            place(k, tp + W(0, -f, l), curl=(0.9 if k[0] == "H" else 0.7)*l/LIFT)
    R.clip("walk", CYC, 24, walk)
    def stand(t):
        ph = t*2*math.pi; flick = max(0, math.sin(ph*3 - 1))**8
        body(drop=0.0056*math.sin(ph*2)); head(pitch=0.05*math.sin(ph), yaw=0.18*math.sin(ph + 0.7), ears=(0.5*flick, 0.3*flick)); tail(0.1*math.sin(ph*2))
        for k in LEGS: place(k, REST[k][4])
    R.clip("idle", 6.0, 36, stand)
    def graze(t):
        ph = t*2*math.pi
        body(drop=0.028, pitch=0.12)
        head(pitch=S.get("graze", 1.05) + 0.05*math.sin(ph*4), yaw=0.12*math.sin(ph), jaw=0.12*max(0, math.sin(ph*8)), ears=(0.1, 0.1))
        for k in LEGS: place(k, REST[k][4])
    R.clip("eat", 3.0, 36, graze)
    def lie(t):
        ph = t*2*math.pi
        body(drop=S.get("lie", 0.366) + 0.007*math.sin(ph)); head(pitch=-0.05 + 0.03*math.sin(ph), yaw=0.06*math.sin(ph*0.5), ears=(0.15*max(0, math.sin(ph*2))**6, 0))
        for k in LEGS:   # feet tucked under the body, flat on the ground
            tp = REST[k][4]; place(k, tp + W(0, -0.14*H if k[0] == "H" else 0.117*H, 0), curl=-0.3 if k[0] == "H" else 0.9)
    R.clip("lie", 5.0, 30, lie)
    def paddle(t, amp=1.0):
        ph = t*2*math.pi
        body(drop=0.047); tail(0.05*math.sin(ph))
        head(pitch=S.get("swimHead", -0.25), yaw=0.05*math.sin(ph*0.5))
        for k, off in (("HL", 0.0), ("FL", 0.5), ("HR", 0.5), ("FR", 0.0)):   # diagonal pairs stroke together, as swimming mammals do
            q = 2*math.pi*(t - off); tp = REST[k][4]
            place(k, tp + W(0, 0.21*H*amp*math.cos(q), 0.19*H + 0.13*H*amp*math.sin(q)), curl=0.4 + 0.4*math.sin(q))
    R.clip("swim", S.get("swimCycle", 1.0), 20, paddle)
    R.clip("float", 2.4, 24, lambda t: paddle(t, 0.35))
    for c in ("walk", "idle", "eat", "lie", "swim", "float"): keep[c] = bpy.data.actions[c]
    print("  QUAD ground speed (world units/s at rate 1):", STRIDE/(DUTY*CYC), "H", H)
CAPYBARA = {"base": "base", "pel": "PantherPelvis_01", "neck": [("PantherNeck1_046", 0.55), ("PantherNeck2_047", 0.25), ("PantherHead_048", 0.2)],
            "head": "PantherHead_048", "jaw": "PantherHeadBone003_051", "ears": ("PantherHeadBone002_050", "PantherHeadBone001_049"), "tail": "PantherTail1_052",
            "head0": 0.3,   # (the file stands it nose-up, sniffing the air: level by default)
            "legs": {"HL": ("PantherLLeg1_02", "PantherLLeg2_00", "PantherLLegPalm_03", "PantherLLegDigit11_06", "PantherLLegDigit12_07"),
                     "HR": ("PantherRLeg1_010", "PantherRLeg2_011", "PantherRLegPalm_012", "PantherRLegDigit11_015", "PantherRLegDigit12_016"),
                     "FL": ("PantherLLeg1_023", "PantherLLeg2_024", "PantherLLegPalm_025", "PantherLLegDigit11_028", "PantherLLegDigit12_029"),
                     "FR": ("PantherRLeg1_035", "PantherRLeg2_036", "PantherRLegPalm_037", "PantherRLegDigit11_040", "PantherRLegDigit12_041")}}
# the hippo's bones are named in Cyrillic, given here by their numeric endings; its own clip (mouth opening wide) is kept as the yawn
HIPPO = {"base": "yawn", "keep_base": True, "pel": "_01", "neck": [("_026", 0.4), ("_036", 0.3), ("_046", 0.3)], "head": "_046", "jaw": "_062",
         "ears": None, "tail": None, "cycle": 1.6, "stride": 0.8, "graze": 0.8, "lie": 0.3, "swimHead": -0.1, "swimCycle": 1.6,
         "legs": {"HL": ("_03", "_04", "_05", "_06", "_06"), "HR": ("_08", "_09", "_010", "_011", "_011"),
                  "FL": ("_018", "_019", "_020", "_020", "_020"), "FR": ("_022", "_023", "_024", "_024", "_024")}}   # (its end bones sit off in space: the legs stop a joint short)

def _tortoise(arm, ad, keep):
    # The tortoise file's walk tips the body up and paddles the front legs in the air, so its clips are keyed here from the rest
    # pose (a Blender rig: two bones a leg, the lower one's tail is the foot; it faces -Y, up is +Z, all four feet on the ground):
    #   walk  - slow lateral-sequence walk; each foot stays planted while the heavy body passes over it, lifts a little and is set
    #           down ahead; elbows point out and back, knees out and forward; the head nods with each step
    #   idle  - standing, breathing, the head turning slowly to look about
    #   eat   - the neck stretched down and forward, biting at the grass
    #   hide  - pulls in: the body sinks onto its plastron, legs folded against the shell, head and neck drawn back in
    import sys; sys.path.insert(0, os.path.dirname(__file__))
    from pose_kit import Rig
    for n in list(keep): keep.pop(n); [ad.nla_tracks.remove(tr) for tr in list(ad.nla_tracks) if tr.name == n]
    R = Rig(arm); R.reset()
    M3 = arm.matrix_world.to_3x3(); Mi = M3.inverted(); W = lambda x, y, z: Mi @ Vector((x, y, z))
    X = W(1, 0, 0).normalized(); Z = W(0, 0, 1).normalized()
    LEGS = {"HL": ("leg_hind-001.L", "leg_hind.L", (1, -0.6, 0)), "HR": ("leg_hind-001.R", "leg_hind.R", (-1, -0.6, 0)),
            "FL": ("leg_front-001.L", "leg_front.L", (1, 0.6, 0)), "FR": ("leg_front-001.R", "leg_front.R", (-1, 0.6, 0))}
    PB = [pb.name for pb in arm.pose.bones]; B = lambda n: next(b for b in PB if b == n or b.startswith(n + "_"))
    LEGS = {k: (B(u), B(l), W(*bd)) for k, (u, l, bd) in LEGS.items()}
    ROOT = B("GLTF_created_0_rootJoint"); NECK = [B(n) for n in ("neck", "neck.001", "neck.002", "neck.003", "neck.004")]; HEAD = B("head"); TAIL = B("tail")
    FOOT = {k: R.tail(l) for k, (u, l, bd) in LEGS.items()}   # rest feet, on the ground
    H = (M3 @ (R.head(LEGS["FL"][0]) - FOOT["FL"])).z
    # the scan stands reared up (shell nose-up, front legs reaching forward): every pose first levels the shell about the hips, and
    # the body is set at the height that puts the soles of the posed MESH on the root joint's level (the game stands animals on
    # their lowest bone; the root stays put). (This file's mesh is ~2.5x its skeleton, so the height is found by measuring.)
    HIPS = (R.head(LEGS["HL"][0]) + R.head(LEGS["HR"][0]))/2; BODY = [B("torso"), B("torso.001")]; LEVEL = 0.26
    G = [0.0]
    def body(drop=0.0, roll=0.0, fwd=0.0):
        for b in BODY:
            R.turn(b, X, LEVEL, about=HIPS); R.move(b, W(0, -fwd*H, -drop*H + G[0]))
            if roll: R.turn(b, W(0, 1, 0).normalized(), roll, about=HIPS)
    def lowest():
        dg = bpy.context.evaluated_depsgraph_get(); z = 1e9
        for o in [o for o in bpy.data.objects if o.type == 'MESH']:
            e = o.evaluated_get(dg); me = e.to_mesh(); z = min([z] + [(e.matrix_world @ v.co).z for v in me.vertices]); e.to_mesh_clear()
        return z - (arm.matrix_world @ R.head(ROOT)).z
    def feet(pos):
        for k, (u, l, bd) in LEGS.items(): R.reach(u, l, pos.get(k, FOOT[k]) + W(0, 0, G[0]), bd)
    def neck(pitch=0.0, yaw=0.0, back=0.0):
        if back: R.move(NECK[0], W(0, back*H, -0.2*back*H))
        pitch += 0.35   # (its neck stands straight up at rest: carried forward)
        for n in NECK: R.turn(n, X, pitch/len(NECK)); R.turn(n, Z, yaw/len(NECK))
    def standing(): R.reset(); body(); feet({}); return lowest()
    g0, m0 = 0.0, standing(); G[0] = 0.05*H; m1 = standing()
    for _ in range(4):   # secant steps to the height where the soles touch
        g1 = G[0]; G[0] = g1 - m1*(g1 - g0)/((m1 - m0) or 1e-9); g0, m0 = g1, m1; m1 = standing()
    print("  TORTOISE body height", G[0], "sole", m1)
    STRIDE, DUTY, LIFT, CYC = 0.42*H, 0.75, 0.16*H, 2.4
    def step(t, off):
        p = (t - off) % 1.0
        if p < DUTY: return STRIDE/2 - STRIDE*(p/DUTY), 0.0
        q = (p - DUTY)/(1 - DUTY); return -STRIDE/2 + STRIDE*(0.5 - 0.5*math.cos(math.pi*q)), LIFT*math.sin(math.pi*q)
    def walk(t):
        ph = t*2*math.pi
        body(drop=0.01*math.cos(2*ph), roll=0.03*math.sin(ph)); R.turn(TAIL, Z, 0.1*math.sin(ph))
        pos = {}
        for k, off in (("HL", 0.0), ("FL", 0.25), ("HR", 0.5), ("FR", 0.75)):
            f, l = step(t, off); pos[k] = FOOT[k] + W(0, -f, l)
        feet(pos); neck(pitch=0.06*math.sin(2*ph), yaw=0.05*math.sin(ph))
    R.clip("walk", CYC, 32, walk)
    def stand(t):
        ph = t*2*math.pi
        body(drop=0.006*math.sin(ph*2)); feet({}); neck(pitch=0.05*math.sin(ph), yaw=0.35*math.sin(ph + 0.5))
    R.clip("idle", 8.0, 32, stand)
    def graze(t):
        ph = t*2*math.pi; bite = max(0, math.sin(ph*3))**2
        body(drop=0.04, fwd=0.02); feet({}); neck(pitch=1.0 + 0.12*bite, yaw=0.1*math.sin(ph))
    R.clip("eat", 3.0, 30, graze)
    def hide(t):
        k_ = min(1.0, t/0.15) if t < 0.5 else min(1.0, (1 - t)/0.15)   # pull in, stay, come out again
        body(drop=0.22*k_)
        feet({k: FOOT[k] + W((-1 if k[1] == "L" else 1)*0.12*H*k_, (0.1 if k[0] == "F" else -0.1)*H*k_, 0.02*H*k_) for k in LEGS})
        neck(pitch=0.5*k_, back=0.55*k_)
    R.clip("hide", 4.0, 40, hide)
    for c in ("walk", "idle", "eat", "hide"): keep[c] = bpy.data.actions[c]
    print("  TORTOISE ground speed (world units/s at rate 1):", STRIDE/(DUTY*CYC), "H", H)

RIGCLIPS = {"capybara2": lambda arm, ad, keep: _quad(arm, ad, keep, CAPYBARA), "hippo2": lambda arm, ad, keep: _quad(arm, ad, keep, HIPPO), "tortoise2": _tortoise}

EXTRA = {"seaturtle": ("head.001", "tail.001", _turtle_crawl()), "penguin": ("Head", "Tail1", _penguin_swim()), "pondturtle": ("Bone.007", "Bone.005", _pond_turtle())}
for name, (src, budget, clips, drop) in MODELS.items():
    if only and name not in only: continue
    build(name, src, budget, clips, drop)
