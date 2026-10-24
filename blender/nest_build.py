# The nest hanging in the yard's trees: RISD Nature Lab's "Paper Wasp Nest" scan (Sketchfab, CC BY 4.0; source in
# assets/source/sketchfab, not committed), rebuilt for the game:  blender.exe -b --factory-startup -P nest_build.py
# -> assets/models/real/waspnest.glb (static). The scan is a million loose-edged triangles that tear when reduced, so it is
# re-wrapped instead: a voxel remesh gives one closed shell, that is reduced to a few thousand faces, and the scan's colour
# is baked onto it (Cycles, selected-to-active; the scan is an unlit material, so its emission is what carries the colour). The nest is turned to hang the way real ones do, its stalk at the top.
import bpy, bmesh, os, math
from mathutils import Vector, Matrix
SRC = r"C:\Users\User\Documents\wombat-pet\assets\source\sketchfab\waspnest.glb"
OUT = r"C:\Users\User\Documents\wombat-pet\assets\models\real\waspnest.glb"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
ms = [o for o in bpy.data.objects if o.type == 'MESH' and o.data.polygons]
for o in ms:
    mw = o.matrix_world.copy(); o.parent = None; o.data.transform(mw); o.matrix_world.identity()
for o in [o for o in bpy.data.objects if o.type != 'MESH']: bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.object.select_all(action='DESELECT')
for o in ms: o.select_set(True)
bpy.context.view_layer.objects.active = ms[0]; bpy.ops.object.join(); hi = bpy.context.view_layer.objects.active; hi.name = "scan"
# normalise: 1 tall, centred, then turned over so the stalk is on top
vs = [v.co for v in hi.data.vertices]; lo_ = Vector([min(v[k] for v in vs) for k in range(3)]); hi_ = Vector([max(v[k] for v in vs) for k in range(3)])
s = 1/(hi_.z - lo_.z); hi.data.transform(Matrix.Rotation(math.pi, 4, 'X') @ Matrix.Scale(s, 4) @ Matrix.Translation(-(lo_ + hi_)/2))
hi.data.transform(Matrix.Translation(Vector((0, 0, -0.5))))   # stalk end (now the top) at z = 0: it hangs below the branch
# the game model: a closed voxel shell, reduced
lo = hi.copy(); lo.data = hi.data.copy(); lo.name = "waspnest"; bpy.context.scene.collection.objects.link(lo)
r = lo.modifiers.new("R", 'REMESH'); r.mode = 'VOXEL'; r.voxel_size = 0.008; bpy.context.view_layer.objects.active = lo; bpy.ops.object.modifier_apply(modifier="R")
d = lo.modifiers.new("D", 'DECIMATE'); d.ratio = min(1.0, 6000/max(1, len(lo.data.polygons))); bpy.ops.object.modifier_apply(modifier="D")
lo.data.materials.clear()
bpy.ops.object.select_all(action='DESELECT'); lo.select_set(True); bpy.context.view_layer.objects.active = lo
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.004); bpy.ops.object.mode_set(mode='OBJECT')
img = bpy.data.images.new("nest_col", 1024, 1024)
m = bpy.data.materials.new("Nest"); m.use_nodes = True; nt = m.node_tree; bs = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
tx = nt.nodes.new("ShaderNodeTexImage"); tx.image = img; bs.inputs["Roughness"].default_value = 0.95   # (linked to the colour only after the bake: no reading what is being written)
nt.nodes.active = tx; lo.data.materials.append(m)
sc = bpy.context.scene
try: sc.render.engine = 'CYCLES'
except TypeError as e: print("ENGINE", e)
sc.cycles.samples = 4; sc.cycles.device = 'CPU'
bk = sc.render.bake; bk.use_selected_to_active = True; bk.cage_extrusion = 0.02; bk.max_ray_distance = 0.06; bk.use_pass_direct = False; bk.use_pass_indirect = False; bk.margin = 4
bpy.ops.object.select_all(action='DESELECT'); hi.select_set(True); lo.select_set(True); bpy.context.view_layer.objects.active = lo
print('BAKE ret', bpy.ops.object.bake(type='EMIT', use_selected_to_active=True, cage_extrusion=0.05, max_ray_distance=0.25, margin=4, target='IMAGE_TEXTURES', use_clear=True))
import numpy as np; px = np.empty(1024*1024*4, dtype=np.float32); img.pixels.foreach_get(px); print("BAKE mean rgb", px[0::4].mean(), px[1::4].mean(), "nonzero", (px[0::4] > 0.01).mean())
nt.links.new(tx.outputs["Color"], bs.inputs["Base Color"]); img.pack()
bpy.data.objects.remove(hi, do_unlink=True)
print("HI mats", [ (m.name, [n.type for n in m.node_tree.nodes]) for m in hi.data.materials] if False else "", "NEST tris", sum(len(p.vertices) - 2 for p in lo.data.polygons))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_image_format='WEBP', export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
    export_draco_position_quantization=14, export_draco_normal_quantization=10, export_draco_texcoord_quantization=12)
print("EXPORTED", OUT, os.path.getsize(OUT))
