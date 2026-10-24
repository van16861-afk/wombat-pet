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
for _n, _b, _fl in [("heron", 7000, False), ("flamingo", 7000, False), ("crab", 5000, False), ("owl", 7000, False), ("peacock", 60000, False)]:
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

# ---------------------------------------------------------------- barn owl (Sketchfab "Realistic Barn Owl" by Pigcraft, CC BY 4.0): perches, swivels its head, hoots
def _owl_clips(lp):
    idle = [(i/8, {"root": (0.015*math.sin(i/8*2*math.pi), 0, 0), "wingL": (0, 0, 0.03*max(0, math.sin(i/8*4*math.pi))), "wingR": (0, 0, -0.03*max(0, math.sin(i/8*4*math.pi))),
                   "head": (0.04*math.sin(i/8*2*math.pi + 1), 0.15*math.sin(i/8*2*math.pi), 0)}) for i in range(9)]
    turn = lambda y: {"neck": (0, 0.3*y, 0), "head": (0, 0.7*y, 0)}
    look = [(0, {}), (0.12, turn(1.5)), (0.42, turn(1.55)), (0.55, turn(-1.5)), (0.85, turn(-1.55)), (1.0, {})]   # owls swivel a long way round
    hoot = [(0, {}), (0.2, {"head": (0.2, 0, 0), "neck": (0.1, 0, 0)}), (0.35, {}), (0.55, {"head": (0.2, 0, 0), "neck": (0.1, 0, 0)}), (0.7, {}), (1.0, {})]
    return {"idle": (4.0, idle), "look": (5.0, look), "hoot": (1.6, hoot)}
SPECS["owl"] = {"src": "owl", "budget": 7000, "clips": _owl_clips, "bones": [
    {"n": "root", "h": (0.45, 0.27, 0), "t": (0.3, 0.59, 0)},
    {"n": "neck", "p": "root", "h": (0.3, 0.59, 0), "t": (0.28, 0.69, 0), "zone": lambda f, u, s: u > 0.55 and f < 0.5},
    {"n": "head", "p": "neck", "h": (0.28, 0.69, 0), "t": (0.01, 0.78, 0), "zone": lambda f, u, s: u > 0.64 and f < 0.48},
    {"n": "tail", "p": "root", "h": (0.8, 0.2, 0), "t": (0.99, 0.14, 0), "zone": lambda f, u, s: f > 0.78 and u < 0.3},
    {"n": "wingL", "p": "root", "h": (0.34, 0.6, 0.75), "t": (0.93, 0.18, 0.75), "zone": lambda f, u, s: s > 0.45 and u < 0.66},
    {"n": "wingR", "p": "root", "h": (0.34, 0.6, -0.75), "t": (0.93, 0.18, -0.75), "zone": lambda f, u, s: s < -0.45 and u < 0.66},
    *[b for k, sg in (("L", 1), ("R", -1)) for b in (
        {"n": f"shin{k}", "p": "root", "h": (0.41, 0.26, 0.3*sg), "t": (0.41, 0.09, 0.3*sg), "zone": lambda f, u, s, sg=sg: u < 0.2 and s*sg > -0.05},
        {"n": f"foot{k}", "p": f"shin{k}", "h": (0.41, 0.09, 0.3*sg), "t": (0.28, 0.02, 0.3*sg), "zone": lambda f, u, s, sg=sg: u < 0.08 and s*sg > -0.05})],
]}


# ---------------------------------------------------------------- birds walking with planted feet (rig_build "rig_clips": a limb solve per frame)
def _step(t, off, duty, stride, lift):
    """A foot's place along the ground (+ ahead) and height at time t of a stride: planted and sliding back under the moving body,
    then lifted and carried forward."""
    p = (t - off) % 1.0
    if p < duty: return stride/2 - stride*(p/duty), 0.0
    q = (p - duty)/(1 - duty); return -stride/2 + stride*(0.5 - 0.5*math.cos(math.pi*q)), lift*math.sin(math.pi*q)
def bird_walk(R, P, name, secs, foot, toe, side, stride, lift, duty=0.62, head=None, extra=None, n=24):
    """Two-legged walk: one foot always on the ground; the heel (the bird's backward-bending joint) folds as the foot comes forward,
    the toes curl up while the foot is in the air and spread flat when it lands; the body rocks over the standing leg."""
    from mathutils import Vector
    def pose(t):
        ph = t*2*math.pi
        R.move("root", (0, 0, -0.012*abs(math.sin(ph))*P(0, 1).z))   # a dip between steps
        R.turn("root", (0, 1, 0), 0.035*math.sin(ph))                  # rocking onto the standing leg
        if head: head(R, t)
        if extra: extra(R, t)
        for k, sg, off in (("L", 1, 0.0), ("R", -1, 0.5)):
            a, l = _step(t, off, duty, stride, lift)
            f0 = P(foot[0], foot[1], side*sg); tgt = Vector((f0.x, f0.y - a, f0.z + l))   # (ahead = -Y)
            R.reach("thigh" + k, "shin" + k, tgt, (0, 1, 0.2))           # the heel points back
            an = R.head("foot" + k); ln = (P(toe[0], toe[1]) - P(foot[0], foot[1])).length
            curl = 0.6 if l > 0.002 else 0.0
            R.aim("foot" + k, an + Vector((0, -math.cos(curl), -math.sin(curl) - 0.08))*ln)
    R.clip(name, secs, n, pose)
# ---------------------------------------------------------------- Indian peafowl (Sketchfab "Indian Peacock" by Pigcraft, CC BY 4.0)
def _peacock_clips(lp):
    bob = lambda t: {"neck": (0.18*math.sin(t*4*math.pi), 0, 0), "head": (-0.12*math.sin(t*4*math.pi), 0, 0)}
    walk = _walk_cycle(8, 0.4, 0.8, lambda t: {**bob(t), "tail1": (0.04*math.sin(t*4*math.pi), 0, 0)})
    idle = [(i/8, {"neck": (0.03*math.sin(i/8*2*math.pi), 0.2*math.sin(i/8*2*math.pi + 1), 0), "head": (0, 0.3*math.sin(i/8*2*math.pi + 2), 0), "root": (0.01*math.sin(i/8*2*math.pi), 0, 0)}) for i in range(9)]
    pk = {"neck": (0.9, 0, 0), "head": (0.5, 0, 0), "root": (0.15, 0, 0)}
    peck = [(0, {}), (0.3, pk), (0.4, {**pk, "head": (0.65, 0, 0)}), (0.5, pk), (0.6, {**pk, "head": (0.65, 0, 0)}), (1.0, {})]
    fan = lambda shake=0: {"tail1": (1.25 + shake, 0, 0, None, (2.4, 1, 1)), "tail2": (0.25, 0, 0, None, (1.5, 1.05, 1)), "tail3": (0.1, 0, 0, None, (1.3, 1.05, 1)),
                           "wingL": (0, 0, 0.25), "wingR": (0, 0, -0.25), "neck": (-0.1, 0, 0)}
    display = [(0, {})] + [(0.15 + i*0.07, fan(0.04*((-1)**i))) for i in range(11)] + [(1.0, {})]   # up and spread, a shimmering shiver, then down
    return {"idle": (3.6, idle), "peck": (1.0, peck), "display": (6.0, display)}   # (walk: _peacock_walk, feet planted)
def _peacock_walk(R, P):
    def head(R, t):   # the head holds still, then thrusts forward with each step
        R.turn("neck", (1, 0, 0), 0.16*math.sin(t*4*math.pi)); R.turn("head", (1, 0, 0), -0.12*math.sin(t*4*math.pi))
    def tail(R, t): R.turn("tail1", (1, 0, 0), 0.03*math.sin(t*4*math.pi))
    bird_walk(R, P, "walk", 1.0, foot=(0.23, 0.025), toe=(0.17, 0.01), side=0.25, stride=0.13, lift=0.05, head=head, extra=tail)
SPECS["peacock"] = {"src": "peacock", "budget": 60000, "clips": _peacock_clips, "rig_clips": _peacock_walk, "bones": [
    {"n": "root", "h": (0.31, 0.42, 0), "t": (0.13, 0.58, 0)},
    {"n": "neck", "p": "root", "h": (0.13, 0.58, 0), "t": (0.1, 0.83, 0), "zone": lambda f, u, s: f < 0.22 and u > 0.5},
    {"n": "head", "p": "neck", "h": (0.1, 0.83, 0), "t": (0.005, 0.86, 0), "zone": lambda f, u, s: f < 0.2 and u > 0.76},
    {"n": "tail1", "p": "root", "h": (0.37, 0.5, 0), "t": (0.56, 0.35, 0), "zone": lambda f, u, s: f > 0.36},
    {"n": "tail2", "p": "tail1", "h": (0.56, 0.35, 0), "t": (0.78, 0.19, 0), "zone": lambda f, u, s: f > 0.54},
    {"n": "tail3", "p": "tail2", "h": (0.78, 0.19, 0), "t": (0.99, 0.1, 0), "zone": lambda f, u, s: f > 0.76},
    {"n": "wingL", "p": "root", "h": (0.18, 0.55, 0.85), "t": (0.38, 0.35, 0.85), "zone": lambda f, u, s: s > 0.5 and f < 0.42 and u > 0.3},
    {"n": "wingR", "p": "root", "h": (0.18, 0.55, -0.85), "t": (0.38, 0.35, -0.85), "zone": lambda f, u, s: s < -0.5 and f < 0.42 and u > 0.3},
    *_bird_legs((0.25, 0.29), (0.24, 0.22), (0.23, 0.025), (0.17, 0.01), 0.25, 0.3),
]}
SPECS["mangrove"] = {"src": "mangrove_red", "budget": 22000, "bones": [], "clips": lambda lp: {}}   # (static: prep only, copied to assets/models/real)
SPECS["mudskipper"] = {"src": "mudskipper", "budget": 40000, "drop": ("Material",), "bones": [], "clips": lambda lp: {}}

# ---------------------------------------------------------------- mudskipper (Sketchfab CC0 scan "Shuttles Mudskipper P. modestus" by ffish.asia / floraZia)
def _mudskipper_clips(lp):
    fold = lambda k: {"dorsal1": (-1.0*k, 0, 0), "dorsal2": (-0.7*k, 0, 0)}   # dorsal fins lie flat (k = 1) or stand up (k = 0)
    idle = [(t, {**fold(0.85 - 0.15*max(0, math.sin(t*2*math.pi*2))), "head": (0, 0.05*math.sin(t*2*math.pi), 0), "tail1": (0, 0.06*math.sin(t*2*math.pi + 1), 0),
                 "finL": (0, 0.1*math.sin(t*2*math.pi), 0), "finR": (0, -0.1*math.sin(t*2*math.pi), 0)}) for t in [i/8 for i in range(9)]]
    # crawl ("crutching"): both front fins plant and swing back together, lifting and pulling the body forward; the tail follows
    crawl = [(t, {**fold(0.9), "finL": (0.25*max(0, math.cos(t*2*math.pi)), 0.6*math.sin(t*2*math.pi), 0), "finR": (0.25*max(0, math.cos(t*2*math.pi)), -0.6*math.sin(t*2*math.pi), 0),
                  "root": (0, 0, 0, (0, 0, 0.012*max(0, -math.sin(t*2*math.pi)))), "tail1": (0, 0.12*math.sin(t*2*math.pi), 0), "tail2": (0, 0.18*math.sin(t*2*math.pi - 0.6), 0)}) for t in [i/8 for i in range(9)]]
    # skip: the body curls to one side and the tail flicks it off the mud
    skip = [(0, fold(0.9)), (0.3, {**fold(0.6), "tail1": (0, 0.8, 0), "tail2": (0, 0.9, 0), "head": (0, -0.3, 0)}), (0.5, {**fold(0.5), "tail1": (0, -0.4, 0), "tail2": (0, -0.5, 0), "head": (0, 0.15, 0)}), (1.0, fold(0.9))]
    display = [(0, fold(0.9)), (0.2, fold(0)), (0.8, fold(0)), (1.0, fold(0.9))]   # fins up to show off
    return {"idle": (2.4, idle), "crawl": (0.7, crawl), "skip": (0.6, skip), "display": (2.5, display)}
SPECS["mudskipper"] = {"src": "mudskipper", "budget": 40000, "drop": ("Material",), "clips": _mudskipper_clips, "bones": [
    {"n": "root", "h": (0.5, 0.38, 0), "t": (0.25, 0.4, 0)},
    {"n": "head", "p": "root", "h": (0.25, 0.4, 0), "t": (0.0, 0.35, 0), "zone": lambda f, u, s: f < 0.27 and abs(s) < 0.4},
    {"n": "tail1", "p": "root", "h": (0.5, 0.38, 0), "t": (0.75, 0.38, 0), "zone": lambda f, u, s: f > 0.48 and u < 0.55},
    {"n": "tail2", "p": "tail1", "h": (0.75, 0.38, 0), "t": (1.0, 0.38, 0), "zone": lambda f, u, s: f > 0.72},
    {"n": "finL", "p": "root", "h": (0.25, 0.2, 0.25), "t": (0.28, 0.05, 0.95), "zone": lambda f, u, s: s > 0.32 and 0.15 < f < 0.38},
    {"n": "finR", "p": "root", "h": (0.25, 0.2, -0.25), "t": (0.28, 0.05, -0.95), "zone": lambda f, u, s: s < -0.32 and 0.15 < f < 0.38},
    {"n": "dorsal1", "p": "root", "h": (0.36, 0.58, 0), "t": (0.42, 0.98, 0), "zone": lambda f, u, s: u > 0.56 and 0.27 < f < 0.5},
    {"n": "dorsal2", "p": "tail1", "h": (0.55, 0.55, 0), "t": (0.68, 0.78, 0), "zone": lambda f, u, s: u > 0.52 and 0.5 < f < 0.76},
]}

# ---------------------------------------------------------------- bald eagle sitting (Sketchfab "Bald Eagle" by Alauddin_Rabbi, CC BY 4.0): the perched pose,
# wings folded (the flying eagle.glb has its wings out); game.js swaps between the two as it lands and takes off
def _eagleperch_clips(lp):
    # sitting: breathing, the head turning sharply and holding (eagles look round in quick turns), the tail flicking;
    # look - a long stare one way then the other; call - the head thrown back and up as a bald eagle calls
    idle = [(t, {"root": (0.012*math.sin(t*2*math.pi*2), 0, 0), "tail": (0.04*max(0, math.sin(t*2*math.pi*3)), 0, 0),
                 "wingL": (0, 0, 0.015*math.sin(t*2*math.pi*2)), "wingR": (0, 0, -0.015*math.sin(t*2*math.pi*2)),
                 "head": (0.05*math.sin(t*2*math.pi), [0, 0.5, 0.5, -0.3, -0.3, 0.1, 0.1, 0, 0][int(t*8)], 0)}) for t in [i/16 for i in range(17)]]
    turn = lambda y, p=0.0: {"neck": (p*0.5, 0.35*y, 0), "head": (p, 0.75*y, 0)}
    look = [(0, {}), (0.08, turn(1.2)), (0.45, turn(1.25)), (0.53, turn(-1.2)), (0.9, turn(-1.25)), (1.0, {})]
    call = [(0, {}), (0.25, {"neck": (-0.45, 0, 0), "head": (-0.6, 0, 0), "tail": (0.1, 0, 0)}), (0.4, {"neck": (-0.5, 0, 0), "head": (-0.75, 0, 0)}),
            (0.55, {"neck": (-0.45, 0, 0), "head": (-0.6, 0, 0)}), (0.7, {"neck": (-0.5, 0, 0), "head": (-0.75, 0, 0)}), (1.0, {})]
    tear = lambda k: {"neck": (0.7 + 0.25*k, 0, 0), "head": (0.6 + 0.35*k, 0, 0), "root": (0.25, 0, 0), "wingL": (0, 0, 0.12), "wingR": (0, 0, -0.12)}
    eat = [(t, tear(max(0, math.sin(t*2*math.pi*2)))) for t in [i/16 for i in range(17)]]   # on the ground over its catch, tearing at it
    return {"idle": (6.0, idle), "look": (4.0, look), "call": (1.8, call), "eat": (1.6, eat)}
SPECS["eagleperch"] = {"src": "eagleperch", "budget": 24000, "drop": ("lambert2",), "clips": _eagleperch_clips, "bones": [
    {"n": "root", "h": (0.55, 0.42, 0), "t": (0.3, 0.62, 0)},
    {"n": "neck", "p": "root", "h": (0.26, 0.68, 0), "t": (0.17, 0.84, 0), "zone": lambda f, u, s: u > 0.62 and f < 0.42},
    {"n": "head", "p": "neck", "h": (0.17, 0.84, 0), "t": (0.0, 0.93, 0), "zone": lambda f, u, s: u > 0.78 and f < 0.36},
    {"n": "tail", "p": "root", "h": (0.72, 0.3, 0), "t": (0.98, 0.05, 0), "zone": lambda f, u, s: f > 0.66 and u < 0.42},
    {"n": "wingL", "p": "root", "h": (0.32, 0.6, 0.75), "t": (0.78, 0.25, 0.75), "zone": lambda f, u, s: s > 0.55 and 0.25 < f < 0.9 and u > 0.18},
    {"n": "wingR", "p": "root", "h": (0.32, 0.6, -0.75), "t": (0.78, 0.25, -0.75), "zone": lambda f, u, s: s < -0.55 and 0.25 < f < 0.9 and u > 0.18},
    *[b for k, sg in (("L", 1), ("R", -1)) for b in (
        {"n": f"leg{k}", "p": "root", "h": (0.28, 0.3, 0.25*sg), "t": (0.2, 0.12, 0.25*sg), "zone": lambda f, u, s, sg=sg: u < 0.3 and f < 0.42 and s*sg > -0.05},
        {"n": f"foot{k}", "p": f"leg{k}", "h": (0.2, 0.12, 0.25*sg), "t": (0.1, 0.02, 0.25*sg), "zone": lambda f, u, s, sg=sg: u < 0.14 and f < 0.4 and s*sg > -0.05})],
]}

# ---------------------------------------------------------------- insects: CC0 scans by ffish.asia / floraZia (Sketchfab), each rigged with a head, antennae,
# six legs of two joints (femur, tibia + foot), and wing cases / wings where it flies
SPECS["bug_longhorn"] = {"src": "bug_longhorn", "budget": 6000, "drop": ("Material",), "turn": 15, "bones": [], "clips": lambda lp: {}}   # (its long antennae pull the body axis askew)
for _n in ("cicada", "mantis", "longhorn", "grasshopper", "cricket", "rhino", "stag", "green"):
    SPECS.setdefault("bug_" + _n, {"src": "bug_" + _n, "budget": 6000, "drop": () if _n == "mantis" else ("Material",), "bones": [], "clips": lambda lp: {}})   # ("Material": the colour chart scanned with it; the mantis's own skin has that name)

def _insect(head, legs, antenna=None, wings=None, knee_u=0.5, coxa_u=0.35, extra=(), mand=None):
    """An insect skeleton from its measured points (f along the body, s out to the side; mirrored for the right side).
    legs: [(coxa (f, s), knee (f, s), tip (f, s)) for the front, middle and hind pair] -> femur (coxa-knee) + tibia (knee-tip) each
    head: (f of the neck, f of the face); antenna: (base (f, s), bend (f, s), tip (f, s)); wings: (front f, back f, s) for wing cases"""
    hf, ff = head
    bones = [{"n": "root", "h": (0.6, 0.45, 0), "t": (hf, 0.5, 0)},
             {"n": "head", "p": "root", "h": (hf, 0.5, 0), "t": (ff, 0.5, 0), "zone": lambda f, u, s, hf=hf: f < hf + 0.03 and abs(s) < 0.4}]
    for k, sg in (("L", 1), ("R", -1)):
        sd = (lambda s, sg=sg: s*sg > 0.05)
        for i, (c, kn, tp) in enumerate(legs, 1):
            ku = knee_u[i - 1] if isinstance(knee_u, tuple) else knee_u
            lo, hi = min(c[0], kn[0], tp[0]) - 0.06, max(c[0], kn[0], tp[0]) + 0.06
            z = lambda f, u, s, lo=lo, hi=hi, sd=sd, c=c: lo < f < hi and sd(s) and abs(s) > c[1]*0.8 and u < 0.75
            bones += [{"n": f"femur{k}{i}", "p": "root", "h": (c[0], coxa_u, c[1]*sg), "t": (kn[0], ku, kn[1]*sg), "zone": z},
                      {"n": f"tibia{k}{i}", "p": f"femur{k}{i}", "h": (kn[0], ku, kn[1]*sg), "t": (tp[0], 0.02, tp[1]*sg),
                       "zone": lambda f, u, s, z=z, kn=kn: z(f, u, s) and abs(s) > kn[1]*0.75}]
        if antenna:
            (b, m, t) = antenna
            az = lambda f, u, s, sd=sd, hf=hf, b=b: sd(s) and (f < hf - 0.02 or abs(s) > 0.45) and u > 0.3 and abs(s) > b[1]*0.5
            bones += [{"n": f"ant{k}", "p": "head", "h": (b[0], 0.55, b[1]*sg), "t": (m[0], 0.6, m[1]*sg), "zone": az},
                      {"n": f"ant{k}2", "p": f"ant{k}", "h": (m[0], 0.6, m[1]*sg), "t": (t[0], 0.6, t[1]*sg), "zone": lambda f, u, s, az=az, m=m: az(f, u, s) and abs(s) > m[1]*0.6}]
        if wings:
            wf, wb, ws = wings
            bones += [{"n": f"elytron{k}", "p": "root", "h": (wf, 0.8, 0.06*sg), "t": (wb, 0.7, ws*sg), "zone": lambda f, u, s, wf=wf, wb=wb, sd=sd: wf - 0.02 < f < wb + 0.03 and u > 0.55 and sd(s)}]
        if mand:
            mb, mt = mand
            bones += [{"n": f"mand{k}", "p": "head", "h": (mb[0], 0.4, mb[1]*sg), "t": (mt[0], 0.4, mt[1]*sg), "zone": lambda f, u, s, mb=mb, sd=sd: f < mb[0] + 0.02 and sd(s)}]
    return bones + list(extra)

def _insect_clips(lp, kind):
    LEGS = [("L", 1, 0), ("R", 2, 0), ("L", 3, 0), ("R", 1, 1), ("L", 2, 1), ("R", 3, 1)]   # two tripods
    def legs(t, amp, hind=1.0):
        out = {}
        for k, i, grp in LEGS:
            ph = t*2*math.pi + grp*math.pi; up = amp*max(0, math.sin(ph)); sw = 0.45*amp*math.cos(ph)*(hind if i == 3 else 1); sg = 1 if k == "L" else -1
            out[f"femur{k}{i}"] = (0, sg*sw, sg*up)     # swing fore and aft about the up axis, lift about the body's length
            out[f"tibia{k}{i}"] = (0, 0, -sg*0.55*up)   # the knee bends as the foot comes up
        return out
    ants = lambda t, a=0.25: {"antL": (0.1*math.sin(t*2*math.pi*2), a*math.sin(t*2*math.pi), 0), "antR": (0.1*math.sin(t*2*math.pi*2 + 1), -a*math.sin(t*2*math.pi + 0.8), 0),
                              "antL2": (0, 0.2*math.sin(t*2*math.pi + 0.5), 0), "antR2": (0, -0.2*math.sin(t*2*math.pi + 1.3), 0)}
    walk = [(t, {**legs(t, 0.5), **ants(t, 0.12), "root": (0, 0, 0.03*math.sin(t*4*math.pi))}) for t in [i/12 for i in range(13)]]
    idle = [(t, {**ants(t), "head": (0.03*math.sin(t*2*math.pi), 0.08*math.sin(t*2*math.pi), 0)}) for t in [i/8 for i in range(9)]]
    clips = {"walk": (0.6, walk), "idle": (3.0, idle)}
    if kind in ("rhino", "stag", "green", "longhorn"):   # take-off: the wing cases swing up and out, legs fold up
        op = {"elytronL": (-0.5, 0, -1.0), "elytronR": (-0.5, 0, 1.0), **{f"femur{k}{i}": (0, 0, -0.4*(1 if k == "L" else -1)) for k in "LR" for i in (1, 2, 3)}}
        clips["fly"] = (0.4, [(0, op), (0.5, {**op, "root": (-0.06, 0, 0)}), (1, op)])
    if kind == "stag":   # the mandibles open and close (a threat display)
        th = {"mandL": (0, -0.5, 0), "mandR": (0, 0.5, 0), "head": (-0.25, 0, 0), **{f"femur{k}3": (0, 0, -0.25*(1 if k == "L" else -1)) for k in "LR"}}
        clips["display"] = (1.6, [(0, {}), (0.3, th), (0.7, th), (1.0, {})])
    if kind == "grasshopper":   # hop: crouch, the big hind tibiae snap straight back, legs trail in the air, fold again
        crouch = {"root": (0.08, 0, 0), **{f"femur{k}3": (-0.15, 0, 0) for k in "LR"}}
        kick = {"root": (-0.15, 0, 0), **{f"tibia{k}3": (1.9, 0, 0) for k in "LR"}, **{f"femur{k}3": (0.25, 0, 0) for k in "LR"},
                **{f"femur{k}{i}": (0.5, 0, 0) for k in "LR" for i in (1, 2)}}
        clips["hop"] = (0.5, [(0, {}), (0.2, crouch), (0.35, kick), (0.75, kick), (1.0, {})])
        clips["walk"] = (0.8, [(t, {**legs(t, 0.4, hind=0.4), **ants(t, 0.1)}) for t in [i/12 for i in range(13)]])
    if kind == "cricket":   # chirp: the wings rise a little and buzz against each other
        clips["chirp"] = (1.0, [(t, {"elytronL": (-0.25 - 0.06*math.sin(t*2*math.pi*12), 0, 0), "elytronR": (-0.25 - 0.06*math.sin(t*2*math.pi*12 + 1), 0, 0), **ants(t, 0.15)}) for t in [i/48 for i in range(49)]])
    if kind == "mantis":   # waits with its raptorial legs folded up in front (praying), turns its head, and strikes
        pray = {"femurL1": (-0.9, 0, 0), "femurR1": (-0.9, 0, 0), "tibiaL1": (2.2, 0, 0), "tibiaR1": (2.2, 0, 0)}
        clips["idle"] = (4.0, [(t, {**pray, "head": (0, 0.55*math.sin(t*2*math.pi), 0), **ants(t, 0.15)}) for t in [i/8 for i in range(9)]])
        reach = {"femurL1": (-0.3, 0, 0), "femurR1": (-0.3, 0, 0), "tibiaL1": (0.2, 0, 0), "tibiaR1": (0.2, 0, 0), "root": (-0.05, 0, 0)}
        clips["strike"] = (0.9, [(0, pray), (0.15, reach), (0.3, pray), (1.0, pray)])
        clips["walk"] = (0.9, [(t, {**legs(t, 0.4), **pray}) for t in [i/12 for i in range(13)]])
    return clips

B_ = {}
B_["rhino"] = _insect((0.2, 0.06), [((0.3, 0.27), (0.24, 0.57), (0.03, 0.5)), ((0.42, 0.4), (0.5, 0.72), (0.6, 0.97)), ((0.44, 0.25), (0.62, 0.6), (0.94, 0.79))], wings=(0.38, 0.95, 0.42))
B_["stag"] = _insect((0.3, 0.24), [((0.46, 0.38), (0.37, 0.82), (0.24, 0.98)), ((0.57, 0.38), (0.66, 0.61), (0.77, 0.7)), ((0.7, 0.35), (0.88, 0.41), (0.98, 0.44))],
                     wings=(0.55, 0.97, 0.4), mand=((0.27, 0.2), (0.03, 0.35)), knee_u=0.45)
B_["green"] = _insect((0.2, 0.08), [((0.3, 0.22), (0.24, 0.44), (0.08, 0.63)), ((0.38, 0.32), (0.39, 0.63), (0.39, 0.98)), ((0.56, 0.32), (0.69, 0.48), (0.97, 0.6))], wings=(0.33, 0.97, 0.42))
B_["longhorn"] = _insect((0.2, 0.08), [((0.24, 0.08), (0.17, 0.22), (0.05, 0.3)), ((0.35, 0.11), (0.5, 0.24), (0.61, 0.3)), ((0.42, 0.09), (0.69, 0.22), (0.99, 0.35))],
                         antenna=((0.17, 0.06), (0.35, 0.45), (0.6, 0.99)), wings=(0.3, 0.8, 0.1))
B_["grasshopper"] = _insect((0.36, 0.28), [((0.4, 0.25), (0.31, 0.55), (0.23, 0.7)), ((0.51, 0.25), (0.56, 0.55), (0.64, 0.7)), ((0.63, 0.25), (0.81, 0.55), (0.8, 0.6))],
                            antenna=((0.3, 0.06), (0.15, 0.1), (0.01, 0.12)), knee_u=(0.34, 0.26, 0.96))
B_["cricket"] = _insect((0.3, 0.24), [((0.38, 0.15), (0.37, 0.4), (0.4, 0.56)), ((0.44, 0.15), (0.44, 0.35), (0.49, 0.56)), ((0.5, 0.15), (0.69, 0.45), (0.88, 0.66))],
                        antenna=((0.26, 0.05), (0.12, 0.4), (0.01, 0.9)), wings=(0.36, 0.7, 0.15), knee_u=(0.45, 0.4, 0.7))
B_["mantis"] = _insect((0.29, 0.21), [((0.3, 0.12), (0.1, 0.15), (0.02, 0.15)), ((0.49, 0.3), (0.45, 0.45), (0.41, 0.6)), ((0.62, 0.3), (0.79, 0.45), (0.985, 0.6))],
                       antenna=((0.23, 0.04), (0.16, 0.1), (0.1, 0.15)), knee_u=(0.62, 0.34, 0.36), coxa_u=0.5)
for _n, _fl in (("rhino", False), ("stag", False), ("green", True), ("longhorn", False), ("grasshopper", True), ("cricket", True), ("mantis", False)):
    SPECS["bug_" + _n] = {**SPECS["bug_" + _n], "flip": _fl, "budget": 6000, "bones": B_[_n], "clips": (lambda lp, n=_n: _insect_clips(lp, n))}

# ---------------------------------------------------------------- donkey (Sketchfab "Donkey & foal 3D model free", CC BY 4.0)
SPECS.setdefault("donkey", {"src": "donkey", "budget": 12000, "bones": [], "clips": lambda lp: {}})

def _donkey_bones():
    b = [{"n": "root", "h": (0.84, 0.6, 0), "t": (0.45, 0.63, 0)},
         {"n": "neck", "p": "root", "h": (0.45, 0.63, 0), "t": (0.25, 0.8, 0), "zone": lambda f, u, s: f < 0.47 and u > 0.52},
         {"n": "head", "p": "neck", "h": (0.25, 0.8, 0), "t": (0.01, 0.63, 0), "zone": lambda f, u, s: f < 0.32 and u > 0.55},
         {"n": "tail", "p": "root", "h": (0.97, 0.58, 0), "t": (0.99, 0.32, 0), "zone": lambda f, u, s: f > 0.94 and u > 0.25}]
    for k, sg in (("L", 1), ("R", -1)):
        sd = lambda s, sg=sg: s*sg > 0.0
        b += [{"n": f"ear{k}", "p": "head", "h": (0.22, 0.84, 0.25*sg), "t": (0.21, 0.99, 0.3*sg), "zone": lambda f, u, s, sd=sd: u > 0.84 and f < 0.3 and sd(s)}]
        fz = lambda f, u, s, sd=sd: 0.3 < f < 0.55 and u < 0.5 and sd(s)
        hz = lambda f, u, s, sd=sd: f > 0.68 and u < 0.55 and sd(s)
        b += [{"n": f"upperF{k}", "p": "root", "h": (0.4, 0.56, 0.45*sg), "t": (0.42, 0.38, 0.45*sg), "zone": fz},
              {"n": f"foreF{k}", "p": f"upperF{k}", "h": (0.42, 0.38, 0.45*sg), "t": (0.43, 0.21, 0.45*sg), "zone": lambda f, u, s, fz=fz: fz(f, u, s) and u < 0.4},
              {"n": f"cannonF{k}", "p": f"foreF{k}", "h": (0.43, 0.21, 0.45*sg), "t": (0.42, 0.05, 0.45*sg), "zone": lambda f, u, s, fz=fz: fz(f, u, s) and u < 0.23},
              {"n": f"hoofF{k}", "p": f"cannonF{k}", "h": (0.42, 0.05, 0.45*sg), "t": (0.39, 0.0, 0.45*sg), "zone": lambda f, u, s, fz=fz: fz(f, u, s) and u < 0.07},
              {"n": f"thighH{k}", "p": "root", "h": (0.84, 0.6, 0.45*sg), "t": (0.78, 0.38, 0.45*sg), "zone": hz},
              {"n": f"shinH{k}", "p": f"thighH{k}", "h": (0.78, 0.38, 0.45*sg), "t": (0.88, 0.22, 0.45*sg), "zone": lambda f, u, s, hz=hz: hz(f, u, s) and u < 0.42},
              {"n": f"cannonH{k}", "p": f"shinH{k}", "h": (0.88, 0.22, 0.45*sg), "t": (0.85, 0.05, 0.45*sg), "zone": lambda f, u, s, hz=hz: hz(f, u, s) and u < 0.24},
              {"n": f"hoofH{k}", "p": f"cannonH{k}", "h": (0.85, 0.05, 0.45*sg), "t": (0.82, 0.0, 0.45*sg), "zone": lambda f, u, s, hz=hz: hz(f, u, s) and u < 0.07}]
    return b

def _donkey_clips(lp):
    # ears and tail are always alive: the long ears turn and flick, the tail swishes at flies
    idle = [(t, {"earL": (0.15*math.sin(t*2*math.pi*2), 0.35*math.sin(t*2*math.pi), 0), "earR": (0.15*math.sin(t*2*math.pi*2 + 1), -0.3*math.sin(t*2*math.pi + 1.2), 0),
                 "tail": (0.05, 0.45*math.sin(t*2*math.pi*3)*max(0, math.sin(t*2*math.pi)), 0), "neck": (0.04*math.sin(t*2*math.pi), 0.12*math.sin(t*2*math.pi + 0.5), 0),
                 "head": (0.06*math.sin(t*2*math.pi*2), 0.15*math.sin(t*2*math.pi + 1), 0)}) for t in [i/16 for i in range(17)]]
    graze = [(t, {"neck": (0.95, 0, 0), "head": (0.35 + 0.06*math.sin(t*2*math.pi*4), 0.1*math.sin(t*2*math.pi), 0),
                  "earL": (0.1, 0.4, 0), "earR": (0.1, -0.4, 0), "tail": (0.05, 0.3*math.sin(t*2*math.pi*2), 0)}) for t in [i/16 for i in range(17)]]
    hee = {"neck": (-0.45, 0, 0), "head": (-0.55, 0, 0), "earL": (0.7, 0.2, 0), "earR": (0.7, -0.2, 0), "tail": (-0.3, 0, 0)}   # head stretched up, ears laid back
    bray = [(0, {}), (0.15, hee), (0.3, {**hee, "head": (-0.45, 0, 0)}), (0.45, hee), (0.6, {**hee, "head": (-0.45, 0, 0)}), (0.75, hee), (1.0, {})]
    return {"idle": (6.0, idle), "eat": (3.0, graze), "bray": (2.6, bray)}

def _donkey_walk(R, P):
    # four-beat walk (left hind, left fore, right hind, right fore): every hoof planted on the ground through its stance, the knee
    # and hock folding as it comes forward; the head nods with the stride
    from mathutils import Vector
    G = P(0, 0).z
    def leg(t, off, duty, stride, lift):
        p = (t - off) % 1.0
        if p < duty: return stride/2 - stride*(p/duty), 0.0
        q = (p - duty)/(1 - duty); return -stride/2 + stride*(0.5 - 0.5*math.cos(math.pi*q)), lift*math.sin(math.pi*q)
    def pose(t, offs=(0.0, 0.25, 0.5, 0.75), duty=0.66, stride=0.3, lift=0.09, name="walk"):
        ph = t*2*math.pi
        R.move("root", (0, 0, 0.006*math.cos(2*ph)))
        R.turn("neck", (1, 0, 0), 0.06*math.sin(2*ph)); R.turn("head", (1, 0, 0), -0.04*math.sin(2*ph))
        R.turn("tail", (0, 0, 1), 0.1*math.sin(ph))
        for (k, sg), oh, of in ((("L", 1), offs[0], offs[1]), (("R", -1), offs[2], offs[3])):
            for front, off in ((True, of), (False, oh)):
                a, l = leg(t, off, duty, stride, lift)
                up, lo, can, hoof = (f"upperF{k}", f"foreF{k}", f"cannonF{k}", f"hoofF{k}") if front else (f"thighH{k}", f"shinH{k}", f"cannonH{k}", f"hoofH{k}")
                base = P(0.42 if front else 0.85, 0.0, 0.45*sg); fet = Vector((base.x, base.y - a, G + 0.05*P(0, 1).z + l))
                cl = (R.tail(can) - R.head(can)).length
                fold = l/max(lift, 1e-6)   # 0 planted .. 1 top of the swing
                joint = fet + Vector((0, (0.45 if front else 0.2)*cl*fold, cl*(1 - 0.25*fold)))   # carpus / hock above the fetlock, swung back as it folds
                R.reach(up, lo, joint, (0, 1, 0) if front else (0, -1, 0))   # elbow points back, stifle forward
                R.aim(can, fet); R.aim(hoof, R.head(hoof) + Vector((0, -0.6 + 0.9*fold, -1)))
    R.clip("walk", 1.2, 24, pose)
    R.clip("trot", 0.7, 16, lambda t: pose(t, offs=(0.0, 0.5, 0.5, 0.0), duty=0.45, stride=0.42, lift=0.14))   # diagonal pairs together
SPECS["donkey"] = {"src": "donkey", "budget": 12000, "bones": _donkey_bones(), "clips": _donkey_clips, "rig_clips": _donkey_walk}
