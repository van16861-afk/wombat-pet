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

def clump_shade(cs, dark, mid, light, warm, crevice=0.55):
    """Ghibli-style leaf masses: every clump is lit on its own (warm yellow-green on top, cool blue-green underneath),
    and the creases where two clumps meet go dark, so the crown reads as separate painted lumps of leaves."""
    D, M, L, Wm = lin(dark), lin(mid), lin(light), lin(warm)
    def shade(co, c, f):
        near = sorted(((Vector(cc[:3]) - co).length/cc[3], i) for i, cc in enumerate(cs))
        (d0, i0), d1 = near[0], (near[1][0] if len(near) > 1 else 9)
        x, y, z, r = cs[i0]; t = max(-1.0, min(1.0, (co.z - z)/r*1.1 + (co.x*0.15 + co.y*0.1)/r))
        col = mixc(D, M, (t + 1)) if t < 0 else mixc(M, L, t**0.8)
        col = mixc(col, Wm, max(0.0, t)*0.35*max(0.0, noise3(co, 7.0)))           # sunny warm patches on the tops
        crease = max(0.0, 1.0 - (d1 - d0)*3.2)                                      # where two clumps meet
        col = mixc(col, D, crease*crevice*(1.0 - 0.5*max(0.0, t)))
        col = [v*(0.88 + 0.16*(0.5 + 0.5*noise3(co, 21.0))) for v in col]           # leafy speckle
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
    cs = [(0, 0, 3.05, 0.78)]                                  # crown top, then a ring of side clumps, then a few low ones
    n = random.choice((5, 6)); a0 = random.uniform(0, math.tau)
    for i in range(n):
        a = a0 + i/n*math.tau + random.uniform(-0.25, 0.25); rr = random.uniform(0.95, 1.2)
        cs.append((math.cos(a)*rr, math.sin(a)*rr, random.uniform(2.25, 2.6), random.uniform(0.58, 0.72)))
    for i in range(random.choice((2, 3))):
        a = a0 + random.uniform(0, math.tau); rr = random.uniform(1.15, 1.4)
        cs.append((math.cos(a)*rr, math.sin(a)*rr, random.uniform(1.75, 1.95), random.uniform(0.42, 0.52)))
    br = [(1.3 + 0.1*i, math.atan2(y, x), math.hypot(x, y)*0.75, z - 1.5 - 0.1*i) for i, (x, y, z, r) in enumerate(cs[1:])]
    tp, ts = trunk_piece(name + "_trunk", 2.0, 0.21, br); tp.build(g, shade=ts)
    p = Piece(name + "_canopy", 0.055, target=2400)
    clumps(p, cs, '#5f8f3e')
    p.build(g, shade=clump_shade(cs, '#23493b', '#4d8a3c', '#b4d968', '#e6d77a'), smooth=3)
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
    tiers = [(0, 0, z + 0.25, r*0.9) for (z, r) in [(0.9, 1.05), (1.5, 0.88), (2.05, 0.7), (2.55, 0.52), (2.95, 0.34), (3.25, 0.18)]]
    p.build(g, shade=clump_shade(tiers, '#16352c', '#2f6646', '#7fb86a', '#b9cf78', crevice=0.7), smooth=3)
    return g

# ---------- eucalyptus (outback) ----------
def euc(name, seed):
    random.seed(seed); g = empty(name)
    tp, ts = trunk_piece(name + "_trunk", 2.9, 0.15, [(2.2, 0.3, 0.8, 0.6), (2.4, 2.4, 0.7, 0.5), (2.6, 4.4, 0.6, 0.5)], col='#e6ddcc', dark='#b9ab94'); tp.build(g, shade=ts)
    p = Piece(name + "_canopy", 0.06, target=1300); cs = []
    for i in range(9):
        a = random.uniform(0, math.tau); r = random.uniform(0.4, 1.1); cs.append((math.cos(a)*r, math.sin(a)*r, random.uniform(2.9, 3.6), random.uniform(0.35, 0.55)))
    clumps(p, cs, '#8fa58a')
    p.build(g, shade=clump_shade(cs, '#4a6556', '#7f9c80', '#c8d8a8', '#e0dca8'), smooth=3)
    return g

# ---------- bushes ----------
def bush(name, seed, n=6, size=0.5):
    random.seed(seed); g = empty(name)
    p = Piece(name + "_canopy", 0.04, target=900); cs = []
    for i in range(n):
        a = random.uniform(0, math.tau); r = random.uniform(0, 0.4); cs.append((math.cos(a)*r, math.sin(a)*r, random.uniform(0.25, 0.5), random.uniform(0.28, 0.4)*size/0.5))
    clumps(p, cs, '#5d9440')
    p.build(g, shade=clump_shade(cs, '#22462f', '#4f8b3e', '#a8d468', '#dcd57a'), smooth=3)
    return g

oak("tree_oak1", 1); oak("tree_oak2", 2); oak("tree_oak3", 3)
pine("tree_pine1", 4); pine("tree_pine2", 5)
euc("tree_euc1", 6); euc("tree_euc2", 7)
bush("tree_bush1", 8); bush("tree_bush2", 9, 7, 0.55); bush("tree_bush3", 10, 5, 0.45)
for o in scene.objects: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_apply=True, export_vertex_color='ACTIVE', export_yup=True,
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7, export_draco_position_quantization=13, export_draco_normal_quantization=9, export_draco_color_quantization=8, export_draco_texcoord_quantization=10)   # Draco: about a quarter of the size
print("EXPORTED", OUT, len(bpy.data.objects))
