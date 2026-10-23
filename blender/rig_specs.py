# Bone lists and clips for blender/rig_build.py. Bone ends are (f, u, s): f 0 = nose .. 1 = tail end, u 0 = ground .. 1 = top,
# s -1 = right .. 1 = left. `zone(f, u, s)` limits which vertices a bone may move. Clip poses give (pitch, yaw, roll) per bone in
# radians: pitch about the side axis (positive tips the bone's far end down and back), yaw about up, roll about the length.
import math
SPECS = {}

# ---------------------------------------------------------------- red kangaroo (Sketchfab "Kangaroo" by rinaskylark, CC BY 4.0)
def _kangaroo_clips(lp):
    legs = lambda th, sh, ft: {f"thigh{s}": (th, 0, 0) for s in "LR"} | {f"shin{s}": (sh, 0, 0) for s in "LR"} | {f"foot{s}": (ft, 0, 0) for s in "LR"}
    arms = lambda up, lo: {f"arm{s}": (up, 0, 0) for s in "LR"} | {f"fore{s}": (lo, 0, 0) for s in "LR"}
    tail = lambda p, y=0: {"tail1": (p, y, 0), "tail2": (p*0.8, y, 0), "tail3": (p*0.6, y*1.2, 0), "tail4": (p*0.4, y*1.4, 0)}
    rest = {}
    # hop: crouch on landing, legs kick back and the toes push off, the legs tuck up, then swing forward to land; the tail balances
    hop = [(0.0, {"spine1": (0.12, 0, 0), **legs(-0.35, 0.45, -0.2), **tail(-0.1), **arms(-0.15, 0.25)}),
           (0.22, {"spine1": (0.32, 0, 0), "neck": (-0.15, 0, 0), **legs(0.65, -0.25, 0.75), **tail(0.22), **arms(-0.25, 0.35)}),
           (0.5, {"spine1": (0.36, 0, 0), "neck": (-0.18, 0, 0), **legs(-0.35, 0.5, -0.3), **tail(0.32), **arms(-0.3, 0.4)}),
           (0.78, {"spine1": (0.2, 0, 0), "neck": (-0.08, 0, 0), **legs(-0.62, 0.3, -0.55), **tail(0.12), **arms(-0.2, 0.3)}),
           (1.0, {"spine1": (0.12, 0, 0), **legs(-0.35, 0.45, -0.2), **tail(-0.1), **arms(-0.15, 0.25)})]
    # idle: breathing, looking about, ears turning, the tail tip twitching
    idle = []
    for i in range(9):
        t = i/8; w = math.sin(t*2*math.pi)
        idle.append((t, {"spine2": (0.025*w, 0, 0), "neck": (0.03*w, 0.18*math.sin(t*2*math.pi + 1), 0), "head": (0.05*math.sin(t*4*math.pi), 0.3*math.sin(t*2*math.pi + 1.4), 0),
                         "earL": (0.25*max(0, math.sin(t*6*math.pi)), 0.3*math.sin(t*2*math.pi), 0), "earR": (0.2*max(0, math.sin(t*6*math.pi + 2)), -0.3*math.sin(t*2*math.pi + 0.7), 0),
                         **arms(-0.05*w, 0.08*w), **tail(0.02*w, 0.08*math.sin(t*2*math.pi))}))
    # graze: leans forward, forepaws down to the grass, nibbling
    lean = {"spine1": (0.38, 0, 0), "spine2": (0.22, 0, 0), "neck": (0.25, 0, 0), **arms(-0.45, -0.25), **legs(-0.2, 0.25, -0.05), **tail(-0.05)}
    eat = [(0.0, lp(rest, lean, 1.0))]
    for i in range(1, 9):
        t = i/8; c = math.sin(t*8*math.pi)
        eat.append((t, {**lean, "head": (0.3 + 0.1*c, 0.15*math.sin(t*2*math.pi), 0), "earL": (0.1*max(0, c), 0, 0), "earR": (0.1*max(0, -c), 0, 0)}))
    eat[-1] = (1.0, eat[0][1] | {"head": (0.3, 0, 0)}); eat[0] = (0.0, eat[0][1] | {"head": (0.3, 0, 0)})
    return {"idle": (3.2, idle), "hop": (0.6, hop), "eat": (3.0, eat)}

import math
_side = lambda k: (lambda s: s > -0.15) if k == "L" else (lambda s: s < 0.15)
def _limb(k):
    sd = _side(k); sg = 1 if k == "L" else -1
    return [
        {"n": f"arm{k}", "p": "spine2", "h": (0.175, 0.575, 0.45*sg), "t": (0.155, 0.47, 0.45*sg), "zone": lambda f, u, s, sd=sd: f < 0.25 and 0.3 < u < 0.62 and sd(s)},
        {"n": f"fore{k}", "p": f"arm{k}", "h": (0.155, 0.47, 0.45*sg), "t": (0.13, 0.35, 0.45*sg), "zone": lambda f, u, s, sd=sd: f < 0.23 and 0.25 < u < 0.5 and sd(s)},
        {"n": f"hand{k}", "p": f"fore{k}", "h": (0.13, 0.35, 0.45*sg), "t": (0.143, 0.29, 0.45*sg), "zone": lambda f, u, s, sd=sd: f < 0.22 and u < 0.38 and sd(s)},
        {"n": f"thigh{k}", "p": "root", "h": (0.39, 0.46, 0.5*sg), "t": (0.32, 0.31, 0.5*sg), "zone": lambda f, u, s, sd=sd: 0.22 < f < 0.52 and u < 0.55 and sd(s)},
        {"n": f"shin{k}", "p": f"thigh{k}", "h": (0.32, 0.31, 0.5*sg), "t": (0.34, 0.035, 0.5*sg), "zone": lambda f, u, s, sd=sd: 0.24 < f < 0.44 and u < 0.36 and sd(s)},
        {"n": f"foot{k}", "p": f"shin{k}", "h": (0.34, 0.035, 0.5*sg), "t": (0.1, 0.015, 0.5*sg), "zone": lambda f, u, s, sd=sd: f < 0.44 and u < 0.1 and sd(s)},
    ]
SPECS["kangaroo"] = {"src": "kangaroo", "budget": 7000, "clips": _kangaroo_clips, "bones": [
    {"n": "root", "h": (0.47, 0.34, 0), "t": (0.44, 0.51, 0)},
    {"n": "spine1", "p": "root", "h": (0.44, 0.51, 0), "t": (0.35, 0.62, 0)},
    {"n": "spine2", "p": "spine1", "h": (0.35, 0.62, 0), "t": (0.216, 0.68, 0)},
    {"n": "neck", "p": "spine2", "h": (0.216, 0.68, 0), "t": (0.115, 0.78, 0), "zone": lambda f, u, s: f < 0.3 and u > 0.55},
    {"n": "head", "p": "neck", "h": (0.115, 0.78, 0), "t": (0.015, 0.75, 0), "zone": lambda f, u, s: f < 0.2 and u > 0.64},
    {"n": "earL", "p": "head", "h": (0.08, 0.87, 0.3), "t": (0.06, 0.98, 0.35), "zone": lambda f, u, s: u > 0.85 and s > -0.1},
    {"n": "earR", "p": "head", "h": (0.08, 0.87, -0.3), "t": (0.06, 0.98, -0.35), "zone": lambda f, u, s: u > 0.85 and s < 0.1},
    *_limb("L"), *_limb("R"),
    {"n": "tail1", "p": "root", "h": (0.485, 0.32, 0), "t": (0.56, 0.13, 0), "zone": lambda f, u, s: f > 0.46 and u < 0.42},
    {"n": "tail2", "p": "tail1", "h": (0.56, 0.13, 0), "t": (0.70, 0.035, 0), "zone": lambda f, u, s: f > 0.52 and u < 0.25},
    {"n": "tail3", "p": "tail2", "h": (0.70, 0.035, 0), "t": (0.87, 0.016, 0), "zone": lambda f, u, s: f > 0.66},
    {"n": "tail4", "p": "tail3", "h": (0.87, 0.016, 0), "t": (1.0, 0.01, 0), "zone": lambda f, u, s: f > 0.84},
]}
