# Builds the trees and bushes (assets/models/trees.glb), headless:  blender.exe -b --factory-startup -P trees_build.py
# Canopies are many leaf clumps merged into one soft mass (voxel remesh + smooth), painted with vertex colours:
# darker and cooler underneath and inside, lighter and warmer on top, with a little speckle so it reads as leaves.
# The game tints each tree a little differently and sways the canopy in the wind.
import bpy, bmesh, math, random, sys, os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "animals_build.py"), encoding="utf-8").read().split("# ================================================================== birds")[0].replace(
    'OUT = r"C:\\Users\\User\\Documents\\wombat-pet\\assets\\models\\animals.glb"', 'OUT = r"C:\\Users\\User\\Documents\\wombat-pet\\assets\\models\\trees.glb"'))
random.seed(11)

def noise3(v, f=3.0):
    return (math.sin(v.x*f + 1.3)*math.sin(v.y*f*1.17 + 2.1)*math.sin(v.z*f*0.93 + 0.7) + math.sin(v.x*f*2.3 + 0.2)*math.sin(v.z*f*2.1 + 1.0)*0.5)/1.5

def foliage_shade(lo, hi, top, bottom, warm):
    """Colour by height inside the canopy, with leafy speckle."""
    def shade(co, c, f):
        t = max(0, min(1, (co.z - bottom)/(top - bottom)))
        col = mixc(lin(lo), lin(hi), t**0.8)
        n = noise3(co, 9.0)
        col = mixc(col, lin(warm), max(0, n)*0.35*t)
        col = [x*(0.86 + 0.18*(0.5 + 0.5*noise3(co, 23.0))) for x in col]
        return col, 0
    return shade

def trunk_piece(name, h, r0, branches, col='#7a5634', dark='#4e3622', voxel=0.035):
    p = Piece(name, voxel, target=900)
    p.add(limb((0, 0, -0.1), (0, 0, h), r0, r0*0.55, seg=14), col)
    for a in range(4):   # root flare
        ang = a/4*math.tau + 0.4; p.add(limb((0, 0, 0.25), (math.cos(ang)*r0*2.0, math.sin(ang)*r0*2.0, -0.05), r0*0.55, r0*0.25), dark)
    for (bz, ang, L, up) in branches:
        a, b = Vector((0, 0, bz)), Vector((math.cos(ang)*L, math.sin(ang)*L, bz + up))
        p.add(limb(a, b, r0*0.45, r0*0.22), col)
    def shade(co, c, f):
        t = max(0, min(1, co.z/0.9)); base = mixc(lin(dark), lin(col), t)
        stripe = 0.5 + 0.5*math.sin(math.atan2(co.y, co.x)*9 + co.z*3)
        return [x*(0.85 + 0.2*stripe) for x in base], 0
    return p, shade

def clumps(p, centers, col):
    for (x, y, z, r) in centers:
        for k in range(5):   # each clump is a few overlapping balls, so the outline is bumpy like leaf masses
            o = Vector((random.uniform(-0.5, 0.5), random.uniform(-0.5, 0.5), random.uniform(-0.3, 0.4)))*r*0.6
            p.add(bm_ball(r*random.uniform(0.55, 0.8), at=Vector((x, y, z)) + o, seg=14), col)

# ---------- broadleaf (oak-like) ----------
def oak(name, seed):
    random.seed(seed); g = empty(name)
    tp, ts = trunk_piece(name + "_trunk", 1.6, 0.2, [(1.25, 0.5, 0.7, 0.5), (1.35, 2.6, 0.6, 0.45), (1.45, 4.3, 0.55, 0.5)])
    tp.build(g, shade=ts)
    p = Piece(name + "_canopy", 0.06, target=1800); cs = []
    for i in range(16):
        a = random.uniform(0, math.tau); r = random.uniform(0, 0.85); z = random.uniform(1.6, 2.6)
        cs.append((math.cos(a)*r, math.sin(a)*r, z + (0.85 - r)*0.4, random.uniform(0.45, 0.7)))
    clumps(p, cs, '#5f8f3e')
    p.build(g, shade=foliage_shade('#2f5a26', '#8cc25a', 3.2, 1.2, '#c9d36a'), smooth=4)
    return g

# ---------- pine ----------
def pine(name, seed):
    random.seed(seed); g = empty(name)
    tp, ts = trunk_piece(name + "_trunk", 2.6, 0.17, [], col='#6e4a30'); tp.build(g, shade=ts)
    p = Piece(name + "_canopy", 0.055, target=1600)
    for i, (z, r) in enumerate([(0.9, 1.05), (1.5, 0.88), (2.05, 0.7), (2.55, 0.52), (2.95, 0.34), (3.25, 0.18)]):
        prof = [(0.0, 0.05, 0.05, 0)]
        for k in range(10):   # a skirt with drooping, scalloped edge
            a = k/10*math.tau
        p.add(bm_cone(r, 0.04, 0.75, at=(0, 0, z + 0.2)), '#3f6f45')
        for k in range(7):
            a = k/7*math.tau + i*0.4; p.add(bm_ball(r*0.38, at=(math.cos(a)*r*0.8, math.sin(a)*r*0.8, z - 0.05), scale=(1, 1, 0.55), seg=10), '#3f6f45')
    p.build(g, shade=foliage_shade('#1f3f2a', '#5e9a5a', 3.4, 0.6, '#9cbf6a'), smooth=3)
    return g

# ---------- eucalyptus (outback) ----------
def euc(name, seed):
    random.seed(seed); g = empty(name)
    tp, ts = trunk_piece(name + "_trunk", 2.9, 0.15, [(2.2, 0.3, 0.8, 0.6), (2.4, 2.4, 0.7, 0.5), (2.6, 4.4, 0.6, 0.5)], col='#e6ddcc', dark='#b9ab94'); tp.build(g, shade=ts)
    p = Piece(name + "_canopy", 0.06, target=1300); cs = []
    for i in range(9):
        a = random.uniform(0, math.tau); r = random.uniform(0.4, 1.1); cs.append((math.cos(a)*r, math.sin(a)*r, random.uniform(2.9, 3.6), random.uniform(0.35, 0.55)))
    clumps(p, cs, '#8fa58a')
    p.build(g, shade=foliage_shade('#5d7462', '#b3c7a6', 4.0, 2.6, '#d6dcb0'), smooth=4)
    return g

# ---------- bushes ----------
def bush(name, seed, n=6, size=0.5):
    random.seed(seed); g = empty(name)
    p = Piece(name + "_canopy", 0.04, target=900); cs = []
    for i in range(n):
        a = random.uniform(0, math.tau); r = random.uniform(0, 0.4); cs.append((math.cos(a)*r, math.sin(a)*r, random.uniform(0.25, 0.5), random.uniform(0.28, 0.4)*size/0.5))
    clumps(p, cs, '#5d9440')
    p.build(g, shade=foliage_shade('#2c5226', '#86bd5a', 0.95, 0.0, '#c3d46a'), smooth=4)
    return g

oak("tree_oak1", 1); oak("tree_oak2", 2); oak("tree_oak3", 3)
pine("tree_pine1", 4); pine("tree_pine2", 5)
euc("tree_euc1", 6); euc("tree_euc2", 7)
bush("tree_bush1", 8); bush("tree_bush2", 9, 7, 0.55); bush("tree_bush3", 10, 5, 0.45)
for o in scene.objects: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_apply=True, export_vertex_color='ACTIVE', export_yup=True)
print("EXPORTED", OUT, len(bpy.data.objects))
