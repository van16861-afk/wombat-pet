# The pond's koi: 7PLUS's "Koi Fish" (Sketchfab, CC BY 4.0; source in assets/source/sketchfab, not committed), packed for the game:
#   blender.exe -b --factory-startup -P koi_build.py  ->  assets/models/real/koi.glb
# It has no skeleton: its swim is baked as shape keys (the whole body bends and the fins ripple), so it is kept as it is, with
# the textures made phone-sized; the game plays the shape-key clip like any other ("swim").
import bpy, os
SRC = r"C:\Users\User\Documents\wombat-pet\assets\source\sketchfab\real_koi.glb"
OUT = r"C:\Users\User\Documents\wombat-pet\assets\models\real\koi.glb"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
for im in bpy.data.images:
    if im.size[0] > 512: im.scale(512, max(1, 512*im.size[1]//im.size[0]))
# one shape key a frame (151): every fifth is kept and the clip crossfades between them (a fifth of the file, the same swim)
STEP = 5
for o in [o for o in bpy.data.objects if o.type == 'MESH' and o.data.shape_keys]:
    sk = o.data.shape_keys; kb = list(sk.key_blocks)[1:]
    keep = kb[::STEP]
    for k in kb:
        if k not in keep: o.shape_key_remove(k)
    if sk.animation_data: sk.animation_data_clear()
    act = bpy.data.actions.new("swim"); sk.animation_data_create(); sk.animation_data.action = act
    n = len(keep)
    for i, k in enumerate(keep):   # each kept key rises to 1 on its frame and falls to 0 on the neighbours'; the loop wraps round
        for j, w in ((i - 1, 0.0), (i, 1.0), (i + 1, 0.0)):
            k.value = w; k.keyframe_insert("value", frame=1 + j*STEP)
        if i == 0: k.value = 1.0; k.keyframe_insert("value", frame=1 + n*STEP)
        k.value = 0.0
for ac in [a for a in bpy.data.actions if a.name != "swim"]: bpy.data.actions.remove(ac)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_image_format='WEBP', export_animations=True, export_morph=True, export_morph_animation=True,
    export_force_sampling=True, export_draco_mesh_compression_enable=False)
print("EXPORTED", OUT, os.path.getsize(OUT), "shape keys", [len(o.data.shape_keys.key_blocks) for o in bpy.data.objects if o.type == 'MESH' and o.data.shape_keys])
