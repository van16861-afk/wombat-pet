# The motor yacht passing far out at sea: Sergei's "Yacht" (Sketchfab, sergeif, CC BY 4.0; source in assets/source/sketchfab, not
# committed), packed for the game:  blender.exe -b --factory-startup -P yacht_build.py  ->  assets/models/real/yacht.glb (static,
# game size: 30 units long, about 20 m; origin on the waterline at the middle of the hull, bow toward +Z like the game's boats).
import bpy, os
from mathutils import Vector, Matrix
SRC = r"C:\Users\User\Documents\wombat-pet\assets\source\sketchfab\yacht.glb"
OUT = r"C:\Users\User\Documents\wombat-pet\assets\models\real\yacht.glb"
LEN, DRAFT = 30.0, 0.12   # length in game units; the waterline sits this far up the hull's height from the keel
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
ms = [o for o in bpy.data.objects if o.type == 'MESH']
for o in ms:
    mw = o.matrix_world.copy(); o.parent = None; o.data.transform(mw); o.matrix_world.identity()
for o in [o for o in bpy.data.objects if o.type != 'MESH']: bpy.data.objects.remove(o, do_unlink=True)
vs = [v.co for o in ms for v in o.data.vertices]
lo = Vector([min(v[k] for v in vs) for k in range(3)]); hi = Vector([max(v[k] for v in vs) for k in range(3)])
hull = min((v for v in vs), key=lambda v: v.z).z   # keel
s = LEN/(hi.y - lo.y); wl = hull + DRAFT*(hi.z - lo.z)
for o in ms: o.data.transform(Matrix.Scale(s, 4) @ Matrix.Translation(-Vector(((lo.x + hi.x)/2, (lo.y + hi.y)/2, wl))))
for im in bpy.data.images:
    if im.size[0] > 512: im.scale(512, 512)
for m in bpy.data.materials:   # (no specular links: the game makes its own materials)
    bs = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None) if m.node_tree else None
    if bs:
        for sk in ('Specular Tint', 'Specular IOR Level'):
            for l in list(bs.inputs[sk].links) if sk in bs.inputs else []: m.node_tree.links.remove(l)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_image_format='WEBP', export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
    export_draco_position_quantization=14, export_draco_normal_quantization=10, export_draco_texcoord_quantization=12)
print("EXPORTED", OUT, os.path.getsize(OUT), "tris", sum(len(p.vertices) - 2 for o in ms for p in o.data.polygons))
