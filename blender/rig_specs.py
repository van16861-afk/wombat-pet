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

# models still waiting for their bones (prep only)
for _n, _b, _fl in [("heron", 7000, False), ("flamingo", 7000, False), ("crab", 5000, False), ("owl", 7000, False), ("peacock", 9000, False)]:
    SPECS.setdefault(_n, {"src": _n, "budget": _b, "flip": _fl, "bones": [], "clips": lambda lp: {}})

# ---------------------------------------------------------------- birds: shared helpers
def _bird_legs(hip, knee, foot, toe, side, zone_u):
    out = []
    for k, sg in (("L", 1), ("R", -1)):
        sd = _side(k)
        out += [{"n": f"thigh{k}", "p": "root", "h": (*hip, side*sg), "t": (*knee, side*sg), "zone": lambda f, u, s, sd=sd: u < zone_u and sd(s)},
                {"n": f"shin{k}", "p": f"thigh{k}", "h": (*knee, side*sg), "t": (*foot, side*sg), "zone": lambda f, u, s, sd=sd: u < zone_u*0.75 and sd(s)},
                {"n": f"foot{k}", "p": f"shin{k}", "h": (*foot, side*sg), "t": (*toe, side*sg), "zone": lambda f, u, s, sd=sd: u < 0.05 and sd(s)}]
    return out
def _bird_wings(sh, wr, tip, side, zone):
    out = []
    for k, sg in (("L", 1), ("R", -1)):
        z = (lambda f, u, s, zone=zone: zone(f, u, s) and s > 0.3) if k == "L" else (lambda f, u, s, zone=zone: zone(f, u, s) and s < -0.3)
        out += [{"n": f"wing{k}", "p": "chest", "h": (*sh, side*sg), "t": (*wr, side*sg), "zone": z},
                {"n": f"hand{k}", "p": f"wing{k}", "h": (*wr, side*sg), "t": (*tip, side*sg), "zone": z}]
    return out
def _walk_cycle(steps, swing, lift, extra=lambda w: {}):
    fr = []
    for i in range(steps + 1):
        t = i/steps; w = math.sin(t*2*math.pi)
        fr.append((t, {"thighL": (-swing*w, 0, 0), "thighR": (swing*w, 0, 0), "shinL": (lift*max(0, w), 0, 0), "shinR": (lift*max(0, -w), 0, 0),
                       "footL": (-0.3*max(0, w), 0, 0), "footR": (-0.3*max(0, -w), 0, 0), **extra(t)}))
    return fr

# ---------------------------------------------------------------- great blue heron (Sketchfab "Great blue heron" by faerbogdan99, CC BY 4.0)
def _heron_clips(lp):
    idle = []
    for i in range(9):
        t = i/8; w = math.sin(t*2*math.pi)
        idle.append((t, {"chest": (0.02*w, 0, 0), "neck1": (0.04*w, 0.1*math.sin(t*2*math.pi + 1), 0), "head": (0.06*math.sin(t*4*math.pi), 0.35*math.sin(t*2*math.pi + 2), 0),
                         "tail": (0.05*w, 0, 0)}))
    walk = _walk_cycle(8, 0.42, 0.9, lambda t: {"neck1": (0.12*math.sin(t*4*math.pi), 0, 0), "neck3": (-0.12*math.sin(t*4*math.pi), 0, 0), "root": (0.03*math.sin(t*4*math.pi), 0, 0)})
    strike = {"root": (0.2, 0, 0), "neck1": (0.55, 0, 0), "neck2": (0.75, 0, 0), "neck3": (-0.35, 0, 0), "head": (0.25, 0, 0)}
    stab = [(0.0, {}), (0.3, {"neck1": (-0.15, 0, 0), "neck2": (-0.25, 0, 0)}), (0.45, strike), (0.65, strike), (1.0, {})]
    return {"idle": (3.6, idle), "walk": (1.3, walk), "stab": (0.8, stab)}
SPECS["heron"] = {"src": "heron", "budget": 7000, "clips": _heron_clips, "bones": [
    {"n": "root", "h": (0.6, 0.45, 0), "t": (0.42, 0.62, 0)},
    {"n": "chest", "p": "root", "h": (0.42, 0.62, 0), "t": (0.37, 0.705, 0)},
    {"n": "neck1", "p": "chest", "h": (0.37, 0.705, 0), "t": (0.31, 0.79, 0), "zone": lambda f, u, s: u > 0.66 and f < 0.5},
    {"n": "neck2", "p": "neck1", "h": (0.31, 0.79, 0), "t": (0.42, 0.86, 0), "zone": lambda f, u, s: u > 0.74 and f < 0.5},
    {"n": "neck3", "p": "neck2", "h": (0.42, 0.86, 0), "t": (0.395, 0.955, 0), "zone": lambda f, u, s: u > 0.8 and f < 0.52},
    {"n": "head", "p": "neck3", "h": (0.395, 0.955, 0), "t": (0.02, 0.91, 0), "zone": lambda f, u, s: u > 0.86},
    {"n": "tail", "p": "root", "h": (0.86, 0.48, 0), "t": (0.995, 0.41, 0), "zone": lambda f, u, s: f > 0.84 and u > 0.3},
    *_bird_wings((0.46, 0.67), (0.8, 0.55), (0.975, 0.43), 0.85, lambda f, u, s: f > 0.42 and u > 0.38),
    *_bird_legs((0.6, 0.44), (0.648, 0.296), (0.61, 0.03), (0.47, 0.008), 0.22, 0.42),
]}

# ---------------------------------------------------------------- crab (Sketchfab model by LRURI01, CC BY 4.0): eight legs, two claws
def _crab_clips(lp):
    LEGS = [("L", 1), ("L", 2), ("L", 3), ("R", 1), ("R", 2), ("R", 3), ("L", 4), ("R", 4)]
    def legs(t, amp):
        out = {}
        for k, i in LEGS:
            ph = t*2*math.pi + (0 if (i % 2 == 1) == (k == "L") else math.pi)   # alternating sets of legs
            up = amp*max(0, math.sin(ph)); sw = 0.35*amp*math.cos(ph); sg = 1 if k == "L" else -1
            out[f"leg{k}{i}"] = (0, sw, -sg*up)               # lift: roll about the body's length; swing: yaw
            out[f"knee{k}{i}"] = (0, 0, sg*0.6*up)
        return out
    claws = lambda op, raise_=0: {f"claw{k}": (-raise_, 0.15*op*(1 if k == "L" else -1), 0) for k in "LR"} | {f"pincer{k}": (0, -0.35*op*(1 if k == "L" else -1), 0) for k in "LR"}
    walk = [(i/8, {**legs(i/8, 0.5), "root": (0, 0, 0.04*math.sin(i/8*4*math.pi)), **claws(0.2)}) for i in range(9)]
    idle = [(i/8, {**claws(0.5*max(0, math.sin(i/8*4*math.pi))), "root": (0.02*math.sin(i/8*2*math.pi), 0, 0)}) for i in range(9)]
    wave = [(0.0, {}), (0.25, claws(1.0, 0.7)), (0.5, claws(0.0, 0.8)), (0.75, claws(1.0, 0.7)), (1.0, {})]
    return {"walk": (0.5, walk), "idle": (2.4, idle), "wave": (1.0, wave)}
def _crab_bones():
    bones = [{"n": "root", "h": (0.62, 0.55, 0), "t": (0.3, 0.6, 0)}]
    for k, sg in (("L", 1), ("R", -1)):
        sd = _side(k)
        bones += [{"n": f"claw{k}", "p": "root", "h": (0.335, 0.5, 0.32*sg), "t": (0.17, 0.5, 0.52*sg), "zone": lambda f, u, s, sd=sd: f < 0.36 and (f < 0.24 or abs(s) > 0.3) and sd(s)},
                  {"n": f"fore{k}", "p": f"claw{k}", "h": (0.17, 0.5, 0.52*sg), "t": (0.03, 0.45, 0.41*sg), "zone": lambda f, u, s, sd=sd: f < 0.24 and sd(s)},
                  {"n": f"pincer{k}", "p": f"fore{k}", "h": (0.03, 0.45, 0.41*sg), "t": (0.054, 0.3, 0.07*sg), "zone": lambda f, u, s, sd=sd: f < 0.12 and sd(s)}]
        for i, fl in ((1, 0.465), (2, 0.61), (3, 0.76), (4, 0.88)):
            zf = lambda f, u, s, fl=fl, sd=sd: abs(f - fl) < 0.075 and abs(s) > 0.42 and sd(s)
            bones += [{"n": f"leg{k}{i}", "p": "root", "h": (fl, 0.62, 0.46*sg), "t": (fl, 0.86, 0.74*sg), "zone": zf},
                      {"n": f"knee{k}{i}", "p": f"leg{k}{i}", "h": (fl, 0.86, 0.74*sg), "t": (fl, 0.0, 0.98*sg), "zone": lambda f, u, s, zf=zf: zf(f, u, s) and abs(s) > 0.7}]
    return bones
SPECS["crab"] = {"src": "crab", "budget": 5000, "turn": -90, "clips": _crab_clips, "bones": _crab_bones()}

# ---------------------------------------------------------------- flamingo in flight (Sketchfab model by iRahulRajput, CC BY 4.0): flock flying over
def _flamingo_clips(lp):
    def flap(k):   # k 0 = wings up (as modelled) .. 1 = full downstroke; the hands follow a little behind
        return {"wingL": (0, 0, 1.15*k), "wingR": (0, 0, -1.15*k), "handL": (0, 0, 0.35*k), "handR": (0, 0, -0.35*k)}
    fly = []
    for i in range(9):
        t = i/8; down = 0.5 - 0.5*math.cos(t*2*math.pi); lag = 0.5 - 0.5*math.cos(t*2*math.pi - 0.9)
        f = flap(down); f["handL"] = (0, 0, 0.35*lag); f["handR"] = (0, 0, -0.35*lag)
        fly.append((t, {**f, "root": (0.04*math.sin(t*2*math.pi), 0, 0), "neck1": (-0.05*math.sin(t*2*math.pi), 0, 0)}))
    glide = [(t, {**flap(0.55), "neck1": (0.02*math.sin(t*2*math.pi), 0, 0)}) for t in (0, 0.5, 1)]
    return {"fly": (0.9, fly), "glide": (3.0, glide)}
SPECS["flamingo"] = {"src": "flamingo", "budget": 7000, "turn": 90, "clips": _flamingo_clips, "bones": [
    {"n": "root", "h": (0.64, 0.375, 0), "t": (0.42, 0.42, 0)},
    {"n": "neck1", "p": "root", "h": (0.42, 0.42, 0), "t": (0.27, 0.365, 0), "zone": lambda f, u, s: f < 0.4 and abs(s) < 0.2},
    {"n": "neck2", "p": "neck1", "h": (0.27, 0.365, 0), "t": (0.12, 0.40, 0), "zone": lambda f, u, s: f < 0.3 and abs(s) < 0.2},
    {"n": "head", "p": "neck2", "h": (0.12, 0.40, 0), "t": (0.01, 0.41, 0), "zone": lambda f, u, s: f < 0.15},
    {"n": "wingL", "p": "root", "h": (0.5, 0.45, 0.11), "t": (0.65, 0.75, 0.6), "zone": lambda f, u, s: s > 0.15 and u > 0.42},
    {"n": "handL", "p": "wingL", "h": (0.65, 0.75, 0.6), "t": (0.58, 0.97, 0.99), "zone": lambda f, u, s: s > 0.5},
    {"n": "wingR", "p": "root", "h": (0.5, 0.45, -0.11), "t": (0.42, 0.75, -0.56), "zone": lambda f, u, s: s < -0.15 and u > 0.42},
    {"n": "handR", "p": "wingR", "h": (0.42, 0.75, -0.56), "t": (0.29, 0.8, -0.99), "zone": lambda f, u, s: s < -0.5},
    *[b for k, sg in (("L", 1), ("R", -1)) for b in (
        {"n": f"thigh{k}", "p": "root", "h": (0.64, 0.37, 0.06*sg), "t": (0.69, 0.27, 0.06*sg), "zone": lambda f, u, s, sg=sg: f > 0.62 and u < 0.36 and s*sg > -0.02},
        {"n": f"shin{k}", "p": f"thigh{k}", "h": (0.69, 0.27, 0.06*sg), "t": (0.87, 0.1, 0.06*sg), "zone": lambda f, u, s, sg=sg: f > 0.66 and u < 0.3 and s*sg > -0.02},
        {"n": f"foot{k}", "p": f"shin{k}", "h": (0.87, 0.1, 0.06*sg), "t": (0.99, 0.1, 0.06*sg), "zone": lambda f, u, s, sg=sg: f > 0.84 and s*sg > -0.02})],
]}
