# Packs plants from Quaternius' Stylized Nature MegaKit (CC0, assets/source/nature_megakit, not committed) into
# assets/models/nature.glb for the game:  blender.exe -b --factory-startup -P nature_build.py
# Each model becomes one root object "nat_<kind><n>" with child meshes per material (bark / leaves / flowers ...),
# scaled to the game's units, with textures shrunk to 512 px (WebP, keeps the leaf alpha) and Draco-compressed meshes.
import bpy, os
from mathutils import Vector

KIT = r"C:\Users\User\Documents\wombat-pet\assets\source\nature_megakit\kit\glTF"
OUT = r"C:\Users\User\Documents\wombat-pet\assets\models\nature.glb"
# kind, kit models, target height in game units (the game scales each instance a little more), green leaves instead of red?
SETS = [
    ("oak",   ["CommonTree_1", "CommonTree_2", "CommonTree_3", "CommonTree_4", "CommonTree_5"], 4.2, False),
    ("pine",  ["Pine_1", "Pine_2", "Pine_3", "Pine_4", "Pine_5"], 4.4, False),
    ("bush",  ["Bush_Common_Flowers", "Bush_Common"], 1.15, True),
    ("grass", ["Grass_Common_Short", "Grass_Common_Tall", "Grass_Wispy_Short"], 0.5, False),
    ("flower", ["Flower_3_Group", "Flower_4_Group", "Flower_3_Single", "Flower_4_Single"], 0.55, False),
    ("fern",  ["Fern_1", "Plant_1", "Clover_1", "Clover_2"], 0.45, False),
    ("mush",  ["Mushroom_Common", "Mushroom_Laetiporus"], 0.3, False),
]

for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
scene = bpy.context.scene
green = None
for kind, names, height, greenify in SETS:
    for i, n in enumerate(names):
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(KIT, n + ".gltf"))
        new = [o for o in bpy.data.objects if o not in before]
        meshes = [o for o in new if o.type == 'MESH']
        bpy.context.view_layer.update()
        pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
        lo = Vector([min(p[k] for p in pts) for k in range(3)]); hi = Vector([max(p[k] for p in pts) for k in range(3)])
        s = height/(hi.z - lo.z); base = Vector(((lo.x + hi.x)/2, (lo.y + hi.y)/2, lo.z))
        root = bpy.data.objects.new("nat_%s%d" % (kind, i + 1), None); scene.collection.objects.link(root)
        for o in meshes:   # bake transforms, then centre on the trunk base and scale
            mw = o.matrix_world.copy(); o.parent = None; o.data.transform(mw); o.matrix_world.identity()
            for v in o.data.vertices: v.co = (v.co - base)*s
            o.parent = root
            for slot in o.material_slots:
                m = slot.material
                if greenify and m and "TwistedTree" in m.name:   # the kit's red autumn leaves -> the green ones
                    if green is None:
                        green = next((x for x in bpy.data.materials if "Leaves_NormalTree" in x.name), None)
                    if green: slot.material = green
            # one mesh per material, so the game can give bark and leaves their own shaders
            if len(o.material_slots) > 1:
                bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
                bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.separate(type='MATERIAL'); bpy.ops.object.mode_set(mode='OBJECT')
        for o in new:
            if o.type != 'MESH' and o.name in bpy.data.objects: bpy.data.objects.remove(o, do_unlink=True)
        for o in root.children: o.name = "%s_%s" % (root.name, (o.material_slots[0].material.name.split('.')[0] if o.material_slots and o.material_slots[0].material else "m"))
        print("SET", root.name, n, "faces", sum(len(o.data.polygons) for o in root.children), [o.name for o in root.children])
# smaller textures for phones
for im in bpy.data.images:
    if im.size[0] > 512: im.scale(512, 512*im.size[1]//max(1, im.size[0]))
# the kit's leaves are a dark olive meant for its own shader; brighten them to the light, warm greens of the reference scenes
import numpy as np
for im in bpy.data.images:
    if not any(k in im.name for k in ("Leaves", "Leaf_Pine", "Grass")) or im.size[0] == 0: continue
    px = np.array(im.pixels[:], dtype=np.float32).reshape(-1, 4)
    rgb = px[:, :3]; lum = rgb.mean(axis=1, keepdims=True)
    rgb = np.clip(rgb*1.38 + np.array([0.03, 0.045, 0.01]) + (lum - lum.mean())*0.25, 0, 1)
    px[:, :3] = rgb; im.pixels[:] = px.ravel(); im.update()
    print("BRIGHTENED", im.name)
for o in scene.objects: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_image_format='WEBP',
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7, export_draco_position_quantization=13, export_draco_normal_quantization=9, export_draco_texcoord_quantization=11)
print("EXPORTED", OUT, os.path.getsize(OUT))
