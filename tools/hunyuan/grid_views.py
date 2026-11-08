# Blender (headless): a prepped animal (length 1 along Y, nose at -Y, ground z=0) seen side-on and from above, with a 0.1 grid,
# to place bones by eye.  blender -b --factory-startup -P grid_views.py -- in.glb out_prefix
import bpy, sys, math
a = sys.argv[sys.argv.index("--") + 1:]; src, out = a[0], a[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
sc = bpy.context.scene; sc.render.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else sc.render.engine
sc.render.resolution_x = 1000; sc.render.resolution_y = 700; sc.render.film_transparent = False
w = bpy.data.worlds.new("w"); w.color = (0.9, 0.9, 0.9); sc.world = w
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")); sun.data.energy = 4; sun.rotation_euler = (0.6, 0.3, 0.8); sc.collection.objects.link(sun)
mat = bpy.data.materials.new("grid"); mat.use_nodes = True
bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"); bsdf.inputs["Base Color"].default_value = (0.8, 0.1, 0.1, 1)
def line(p0, p1, r=0.002):
    import mathutils
    d = mathutils.Vector(p1) - mathutils.Vector(p0)
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=d.length, location=(mathutils.Vector(p0) + d/2))
    o = bpy.context.object; o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler(); o.data.materials.append(mat)
for i in range(11):
    f = i/10; y = -0.5 + f
    line((0.4, y, -0.05), (0.4, y, 0.65)); line((-0.4, y, -0.05), (-0.4, y, 0.65))   # side grid behind / in front (x = ±0.4)
    line((-0.45, y, -0.06), (0.45, y, -0.06))   # top view grid on the floor
for i in range(8):
    z = i/10; line((0.4, -0.5, z), (0.4, 0.5, z))
for i in range(-4, 5):
    x = i/10; line((x, -0.5, -0.06), (x, 0.5, -0.06))
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = 1.25
cam.location = (-3, 0, 0.3); cam.rotation_euler = (math.pi/2, 0, -math.pi/2); sc.render.filepath = out + "_side.png"; bpy.ops.render.render(write_still=True)
cam.location = (0, 0, 3); cam.rotation_euler = (0, 0, 0); sc.render.filepath = out + "_top.png"; bpy.ops.render.render(write_still=True)
