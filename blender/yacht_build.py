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
# the lit windows at night: an emission map holding only the dark glass painted on the superstructure (the black boot-top
# along the waterline stays dark): the surfaces 1-6.5 units up are drawn into a UV mask, and only dark texels inside it glow
import numpy as np
for o in ms:
    me = o.data; mat0 = me.materials[0]; nt = mat0.node_tree
    img = next(n.image for n in nt.nodes if n.type == 'TEX_IMAGE' and any(l.to_socket.name == 'Base Color' for l in n.outputs[0].links))
    W_, H_ = img.size; px = np.array(img.pixels[:]).reshape(H_, W_, 4); mask = np.zeros((H_, W_), bool)
    uv = me.uv_layers.active.data; me.calc_loop_triangles()
    for tri in me.loop_triangles:
        c = sum((me.vertices[v].co for v in tri.vertices), Vector())/3
        if not (1.0 < c.z < 6.5): continue
        P = np.array([uv[l].uv[:] for l in tri.loops]) % 1.0*np.array([W_ - 1, H_ - 1])
        x0, y0 = np.floor(P.min(0)).astype(int); x1, y1 = np.ceil(P.max(0)).astype(int)
        xs, ys = np.meshgrid(np.arange(max(x0, 0), min(x1, W_ - 1) + 1), np.arange(max(y0, 0), min(y1, H_ - 1) + 1))
        (ax, ay), (bx, by), (cx, cy) = P; den = (by - cy)*(ax - cx) + (cx - bx)*(ay - cy)
        if abs(den) < 1e-9: continue
        w1 = ((by - cy)*(xs - cx) + (cx - bx)*(ys - cy))/den; w2 = ((cy - ay)*(xs - cx) + (ax - cx)*(ys - cy))/den
        m_ = (w1 >= 0) & (w2 >= 0) & (1 - w1 - w2 >= 0); mask[ys[m_], xs[m_]] = True
    lum = 0.2126*px[..., 0] + 0.7152*px[..., 1] + 0.0722*px[..., 2]
    sat = px[..., :3].max(-1) - px[..., :3].min(-1)
    lit = mask & (lum > 0.18) & (lum < 0.46) & (sat < 0.06)   # (the windows are mid-grey glass; pixels here are display values, not linear)
    em = np.zeros((H_, W_, 4), np.float32); em[..., 3] = 1; em[lit] = (1.0, 0.72, 0.38, 1.0)
    eim = bpy.data.images.new("yacht_windows", W_, H_); eim.pixels = em.ravel(); eim.pack()
    bs = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    for l in list(bs.inputs["Emission Color"].links): nt.links.remove(l)
    et = nt.nodes.new("ShaderNodeTexImage"); et.image = eim; nt.links.new(et.outputs["Color"], bs.inputs["Emission Color"]); bs.inputs["Emission Strength"].default_value = 1.0
    print("WINDOW texels", int(lit.sum()), "of", int(mask.sum()))
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
