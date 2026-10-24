# Small posing kit for the hand-keyed rigs (monkey_build.py): bones are turned and aimed in world space, limbs are put on their
# targets with a two-bone solve, and every frame is keyed from scratch (rest pose + the changes), so clips never drift.
import bpy, math
from mathutils import Vector, Matrix, Quaternion

class Rig:
    def __init__(self, arm, fps=30):
        self.arm = arm; self.PB = arm.pose.bones; self.fps = fps
        self.ad = arm.animation_data_create()
    def upd(self): bpy.context.view_layer.update()
    def reset(self):
        for pb in self.PB:
            pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0); pb.scale = (1, 1, 1)
        self.upd()
    def head(self, n): return self.PB[n].head.copy()
    def tail(self, n): return self.PB[n].tail.copy()
    def turn(self, n, axis, ang, about=None):
        """Turn a bone (and all below it) about a world axis through its joint (or through `about`)."""
        pb = self.PB[n]; h = (about or pb.head).copy()
        pb.matrix = Matrix.Translation(h) @ Quaternion(Vector(axis).normalized(), ang).to_matrix().to_4x4() @ Matrix.Translation(-h) @ pb.matrix; self.upd()
    def move(self, n, d):
        pb = self.PB[n]; pb.matrix = Matrix.Translation(Vector(d)) @ pb.matrix; self.upd()
    def aim(self, n, target):
        """Swing a bone about its joint so it points at a world point."""
        pb = self.PB[n]; h = pb.head.copy(); q = (pb.tail - h).normalized().rotation_difference((Vector(target) - h).normalized())
        pb.matrix = Matrix.Translation(h) @ q.to_matrix().to_4x4() @ Matrix.Translation(-h) @ pb.matrix; self.upd()
    def reach(self, upper, lower, target, bend):
        """Two-bone solve: upper bone's joint -> middle joint -> `target`; the middle joint bends towards `bend`."""
        S = self.head(upper); a = (self.tail(upper) - S).length; b = (self.tail(lower) - self.head(lower)).length
        d = Vector(target) - S; L = min(d.length, (a + b)*0.999); dn = d.normalized()
        x = (a*a - b*b + L*L)/(2*L); h = math.sqrt(max(0.0, a*a - x*x))
        o = Vector(bend); o = (o - dn*o.dot(dn)).normalized()
        self.aim(upper, S + dn*x + o*h); self.aim(lower, S + dn*L)
    def key(self, f):
        for pb in self.PB:
            pb.keyframe_insert("rotation_quaternion", frame=f); pb.keyframe_insert("location", frame=f); pb.keyframe_insert("scale", frame=f)
    def clip(self, name, secs, n, pose):
        act = bpy.data.actions.new(name); self.ad.action = act
        for i in range(n + 1):
            t = i/n; self.reset(); pose(t); self.key(1 + t*secs*self.fps)
        tr = self.ad.nla_tracks.new(); tr.name = name; st = tr.strips.new(name, 1, act); st.name = name; tr.mute = True
        self.ad.action = None; print("  CLIP", name)
