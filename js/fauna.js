// Wildlife of the special regions: the lily pond (frogs, dragonflies, turtles), the swamp (crocodiles, herons, frogs,
// dragonflies), the beaver stream (a beaver with its dam and lodge) and the Australian outback (kangaroos, quokkas, emus, koalas).
// All models are built from simple shapes here; each animal has a small behaviour loop and reacts to the wombat and to taps.
import * as THREE from 'three';
import { WATER_Y, BIO, PLOT, plotKey } from './world.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a)*t;
const rnd = (a, b) => a + Math.random()*(b - a);
const wrapA = a => { while (a > Math.PI) a -= 2*Math.PI; while (a < -Math.PI) a += 2*Math.PI; return a; };
const plotC = k => k.split(',').map(Number).map(v => v*PLOT);

export const SPECIES = {crane:'丹頂鶴', monkey:'台灣獼猴', horse:'馬', tiger:'老虎', hippo:'河馬', capybara:'水豚', tortoise:'陸龜', snake:'蛇', peacock:'孔雀', deer:'梅花鹿', wolf:'狼', frog:'青蛙', dragonfly:'蜻蜓', turtle:'烏龜', croc:'鱷魚', heron:'蒼鷺', beaver:'河狸', kangaroo:'袋鼠', quokka:'短尾矮袋鼠（微笑袋鼠）', emu:'鴯鶓', koala:'無尾熊'};

export function createFauna({scene, world, mat, hbMat, onSound, clone, lod}){
  const model = (name, fn) => { const m = clone && clone(name); return m ? (fn && fn(m)) || m : null; };   // the Blender model when there is one
  const F = {list:[], pick:[]}, group = new THREE.Group(); scene.add(group);
  const D = world.data, gy = world.gy, H = world.H;
  const sound = (n, at) => onSound && onSound(n, at);
  const ball = (r, m, sx = 1, sy = 1, sz = 1) => { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), m); o.scale.set(sx, sy, sz); return o; };
  const cyl = (r1, r2, h, m, seg = 8) => new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), m);
  const eye = (r = 0.04) => { const g = new THREE.Group(); g.add(ball(r, mat('#fbfbf6', 0.3))); const p = ball(r*0.55, mat('#141414', 0.2)); p.position.z = r*0.6; g.add(p); return g; };
  // closer-to-life sizes next to the wombat (a tiger is far bigger than a wombat, a horse taller still)
  const SIZE = {tiger:1.9, horse:1.55, hippo:1.6, deer:1.35, wolf:1.35, kangaroo:1.4, emu:1.35, crane:1.3, capybara:1.25, monkey:1.25, koala:1.3, croc:1.4, beaver:1.15, heron:1.25, peacock:1.25, tortoise:1.2, quokka:1.1};
  function add(kind, g, o){
    if (SIZE[kind]) g.scale.multiplyScalar(SIZE[kind]);
    group.add(g); const hb = new THREE.Mesh(new THREE.SphereGeometry(o.hit || 0.6, 8, 6), hbMat); hb.position.y = o.hitY ?? 0.3; hb.userData.kind = 'animal'; g.add(hb);
    const a = {kind, g, hb, t:Math.random()*10, state:'idle', timer:rnd(1, 4), tgt:g.position.clone(), ...o}; hb.userData.ref = a; F.list.push(a); F.pick.push(hb); return a;
  }
  const inPlot = (k, m = 2) => { const [cx, cz] = plotC(k); return V3(cx + rnd(-PLOT/2 + m, PLOT/2 - m), 0, cz + rnd(-PLOT/2 + m, PLOT/2 - m)); };
  const landIn = (k, m = 2) => { for (let i=0;i<40;i++){ const p = inPlot(k, m); if (!world.isWater(p.x, p.z) && world.slope(p.x, p.z) < 0.6) return p; } return inPlot(k, m); };
  const face = (a, dx, dz, dt, k = 5) => { a.g.rotation.y += clamp(wrapA(Math.atan2(dx, dz) - a.g.rotation.y), -k*dt, k*dt); };

  // ---------- the lily pond ----------
  const P = D.bio.pond, pads = [], stones = [];
  { const padGeo = new THREE.CircleGeometry(0.42, 18, 0.35, Math.PI*2 - 0.35); padGeo.rotateX(-Math.PI/2);
    const padM = mat('#4f8f3a', 0.6), lotus = mat('#f2a6be', 0.5), lotusC = mat('#f3d250', 0.5);
    for (let i=0;i<16;i++){ const a = rnd(0, 6.28), r = Math.sqrt(Math.random())*(P.r - 0.8), x = P.x + Math.cos(a)*r, z = P.z + Math.sin(a)*r;
      if (pads.some(p => Math.hypot(p.x - x, p.z - z) < 0.9)) continue;
      const g = new THREE.Group(), m = new THREE.Mesh(padGeo, padM); m.scale.setScalar(rnd(0.8, 1.4)); g.add(m);
      if (Math.random() < 0.35){ const f = new THREE.Group(); for (let k=0;k<6;k++){ const p = ball(0.09, lotus, 0.5, 1, 0.3); p.position.set(Math.cos(k)*0.06, 0.08, Math.sin(k)*0.06); p.rotation.set(Math.sin(k)*0.5, 0, Math.cos(k)*0.5); f.add(p); }
        f.add(ball(0.04, lotusC)); f.position.set(0.08, 0.02, 0.05); g.add(f); }
      g.position.set(x, WATER_Y + 0.02, z); g.rotation.y = rnd(0, 6.28); group.add(g); pads.push({x, z, g}); }
    const stoneM = mat('#9c968a', 0.9);
    for (let i=0;i<3;i++){ const a = i*2.1 + rnd(0, 0.6), r = P.r*rnd(0.35, 0.6), x = P.x + Math.cos(a)*r, z = P.z + Math.sin(a)*r;
      const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45, 0), stoneM); s.scale.set(1.3, 0.45, 1); s.position.set(x, WATER_Y + 0.05, z); group.add(s); stones.push({x, z}); }
  }
  // reeds and cattails round the pond and the swamp pools
  { const blade = new THREE.CylinderGeometry(0.012, 0.02, 1.0, 4); blade.translate(0, 0.5, 0);
    const head = new THREE.CylinderGeometry(0.035, 0.035, 0.18, 6); head.translate(0, 1.0, 0);
    const spots = [];
    for (let i=0;i<70;i++){ const a = rnd(0, 6.28), r = P.r + rnd(-0.6, 0.5); spots.push([P.x + Math.cos(a)*r, P.z + Math.sin(a)*r]); }
    for (const [px, pz, r] of D.bio.pools) for (let i=0;i<14;i++){ const a = rnd(0, 6.28), rr = r + rnd(-0.4, 0.6); spots.push([px + Math.cos(a)*rr, pz + Math.sin(a)*rr]); }
    const bm = new THREE.InstancedMesh(blade, mat('#6f8f43', 0.8), spots.length*3), hm = new THREE.InstancedMesh(head, mat('#6b4a2f', 0.8), spots.length);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    spots.forEach(([x, z], i) => { const y = Math.max(H(x, z), WATER_Y - 0.1);
      for (let k=0;k<3;k++){ M.compose(V3(x + rnd(-0.12, 0.12), y, z + rnd(-0.12, 0.12)), q.setFromEuler(e.set(rnd(-0.25, 0.25), 0, rnd(-0.25, 0.25))), V3(1, rnd(0.6, 1.3), 1)); bm.setMatrixAt(i*3 + k, M); }
      M.compose(V3(x, y, z), q.setFromEuler(e.set(0, 0, 0)), V3(1, rnd(0.9, 1.2), 1)); hm.setMatrixAt(i, M); });
    group.add(bm, hm); }

  // ---------- models ----------
  function frog(){
    const fm = model('frog', m => { m.userData.sac = m.getObjectByName('frog_sac'); m.userData.sacMax = 1.7; }); if (fm) return fm;
    const g = new THREE.Group(), body = mat(['#5aa04a', '#6fae3c', '#4f8f52'][Math.floor(Math.random()*3)], 0.4), belly = mat('#e3e6b0', 0.5);
    const b = ball(0.16, body, 1, 0.7, 1.15); b.position.y = 0.11; g.add(b);
    const bl = ball(0.13, belly, 0.95, 0.5, 1); bl.position.set(0, 0.07, 0.04); g.add(bl);
    for (const s of [-1, 1]){ const e = eye(0.045); e.position.set(0.08*s, 0.2, 0.1); g.add(e);
      const leg = ball(0.07, body, 0.8, 0.5, 1.6); leg.position.set(0.14*s, 0.05, -0.08); g.add(leg);
      const fl = cyl(0.02, 0.02, 0.1, body); fl.position.set(0.09*s, 0.04, 0.13); g.add(fl); }
    const sac = ball(0.07, mat('#f0eec0', 0.4)); sac.position.set(0, 0.08, 0.15); g.add(sac); g.userData.sac = sac;
    return g;
  }
  function dragonfly(){
    const g = new THREE.Group(), c = ['#3fa0d8', '#d84a3a', '#55c08a'][Math.floor(Math.random()*3)], m = mat(c, 0.3);
    const body = cyl(0.012, 0.02, 0.36, m); body.rotation.x = Math.PI/2; g.add(body);
    const head = ball(0.035, m); head.position.z = 0.19; g.add(head);
    const wm = new THREE.MeshBasicMaterial({color:'#e8f6ff', transparent:true, opacity:0.45, side:THREE.DoubleSide, depthWrite:false}), wings = [];
    for (const [z, s] of [[0.06, 1], [0.06, -1], [-0.02, 1], [-0.02, -1]]){ const w = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.05), wm); w.rotation.x = -Math.PI/2; w.position.set(0.11*s, 0.01, z); g.add(w); wings.push(w); }
    g.userData.wings = wings; return g;
  }
  function turtle(){
    const tm = model('turtle', m => { m.userData.head = m.getObjectByName('turtle_head'); m.userData.legs = ['FL', 'FR', 'BL', 'BR'].map(n => m.getObjectByName('turtle_leg' + n)).filter(Boolean); }); if (tm) return tm;
    const g = new THREE.Group(), shell = mat('#5b6b3a', 0.5), skin = mat('#7c9a52', 0.6);
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 8, 0, Math.PI*2, 0, Math.PI/2), shell); s.scale.set(1, 0.6, 1.2); g.add(s);
    const rim = cyl(0.31, 0.31, 0.04, mat('#c9b77a', 0.6), 16); rim.scale.z = 1.2; g.add(rim);
    const hd = ball(0.09, skin, 1, 0.9, 1.3); hd.position.set(0, 0.04, 0.42); g.add(hd);
    for (const s2 of [-1, 1]) for (const z of [-0.22, 0.22]){ const f = ball(0.08, skin, 1.4, 0.4, 0.8); f.position.set(0.27*s2, 0, z); g.add(f); }
    return g;
  }
  function croc(){
    const cm = model('croc', m => { m.userData.jaw = m.getObjectByName('croc_jaw'); m.userData.jawSign = 1; m.userData.tail = m.getObjectByName('croc_tail');
      m.userData.legs = ['FL', 'FR', 'BL', 'BR'].map(n => [n, m.getObjectByName('croc_leg' + n)]).filter(l => l[1]); }); if (cm) return cm;
    const g = new THREE.Group(), skin = mat('#4f5f34', 0.6), belly = mat('#a7a46a', 0.6);
    const b = ball(0.4, skin, 0.9, 0.45, 2.2); b.position.y = 0.16; g.add(b);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.6, 8), skin); tail.rotation.x = -Math.PI/2; tail.scale.y = 1; tail.position.set(0, 0.14, -1.6); tail.scale.set(1, 1, 0.5); g.add(tail);
    const head = new THREE.Group(); head.position.set(0, 0.18, 0.9); g.add(head);
    const up = ball(0.2, skin, 1, 0.35, 2.2); up.position.set(0, 0.03, 0.35); head.add(up);
    const jaw = new THREE.Group(); head.add(jaw); const lo = ball(0.18, belly, 1, 0.3, 2.1); lo.position.set(0, -0.05, 0.32); jaw.add(lo);
    for (const s of [-1, 1]){ const e = eye(0.06); e.position.set(0.12*s, 0.14, 0.05); head.add(e); }
    for (let i=0;i<8;i++){ const r = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 4), skin); r.position.set(((i % 2) - 0.5)*0.18, 0.33, 0.6 - i*0.28); g.add(r); }
    for (const s of [-1, 1]) for (const z of [-0.45, 0.45]){ const l = ball(0.09, skin, 1, 0.6, 1.6); l.position.set(0.4*s, 0.06, z); g.add(l); }
    g.userData.jaw = jaw; return g;
  }
  function heron(){
    const hm = model('heron', m => { m.userData.neck = m.getObjectByName('heron_neck'); }); if (hm) return hm;
    const g = new THREE.Group(), grey = mat('#a7adb4', 0.7), white = mat('#eef0f0', 0.7), yel = mat('#e0b23c', 0.5);
    const b = ball(0.22, grey, 0.8, 0.8, 1.5); b.position.y = 1.0; g.add(b);
    const neck = cyl(0.04, 0.05, 0.6, white); neck.position.set(0, 1.35, 0.22); neck.rotation.x = 0.35; g.add(neck);
    const hd = ball(0.07, white, 1, 1, 1.3); hd.position.set(0, 1.64, 0.32); g.add(hd);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.3, 6), yel); beak.rotation.x = Math.PI/2; beak.position.set(0, 1.64, 0.5); g.add(beak);
    const crest = cyl(0.008, 0.008, 0.2, mat('#2b2b2b', 0.5)); crest.position.set(0, 1.68, 0.2); crest.rotation.x = -1.1; g.add(crest);
    for (const s of [-1, 1]){ const e = eye(0.018); e.position.set(0.05*s, 1.67, 0.37); g.add(e); const l = cyl(0.015, 0.015, 0.85, yel); l.position.set(0.07*s, 0.43, 0); g.add(l); }
    g.userData.head = hd; g.userData.beak = beak; return g;
  }
  function beaver(){
    const bm = model('beaver', m => { m.userData.tail = m.getObjectByName('beaver_tail'); }); if (bm) return bm;
    const g = new THREE.Group(), fur = mat('#7a5233', 0.8), dark = mat('#4a3324', 0.7);
    const b = ball(0.3, fur, 1, 0.8, 1.35); b.position.y = 0.26; g.add(b);
    const hd = ball(0.18, fur, 1, 0.9, 1.1); hd.position.set(0, 0.36, 0.38); g.add(hd);
    const teeth = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.02), mat('#f3d26a', 0.4)); teeth.position.set(0, 0.27, 0.56); g.add(teeth);
    const nose = ball(0.04, dark); nose.position.set(0, 0.38, 0.57); g.add(nose);
    for (const s of [-1, 1]){ const e = eye(0.03); e.position.set(0.09*s, 0.45, 0.5); g.add(e); const ear = ball(0.04, dark); ear.position.set(0.12*s, 0.52, 0.32); g.add(ear); }
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.45), dark); tail.position.set(0, 0.1, -0.55); g.add(tail); g.userData.tail = tail;
    return g;
  }
  function kangaroo(joey){
    const km = clone && clone('kangaroo'); if (km){ const w = new THREE.Group(); w.add(km); w.userData.body = km; const j = km.getObjectByName('kangaroo_joey'); if (j) j.visible = !!joey; return w; }
    const g = new THREE.Group(), fur = mat('#b77a4e', 0.8), light = mat('#e6c9a8', 0.8);
    const body = new THREE.Group(); g.add(body); g.userData.body = body;
    const b = ball(0.36, fur, 0.85, 1.2, 1); b.position.set(0, 0.85, 0); b.rotation.x = -0.35; body.add(b);
    const bl = ball(0.27, light, 0.8, 1.0, 0.7); bl.position.set(0, 0.8, 0.14); body.add(bl);
    const hd = ball(0.17, fur, 0.9, 0.9, 1.3); hd.position.set(0, 1.42, 0.16); body.add(hd);
    const sn = ball(0.08, fur, 1, 0.9, 1.3); sn.position.set(0, 1.38, 0.36); body.add(sn);
    for (const s of [-1, 1]){ const e = eye(0.035); e.position.set(0.08*s, 1.48, 0.3); body.add(e);
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.24, 6), fur); ear.position.set(0.08*s, 1.66, 0.08); ear.rotation.z = -0.2*s; body.add(ear);
      const leg = ball(0.13, fur, 0.7, 1.4, 1.5); leg.position.set(0.17*s, 0.42, -0.02); body.add(leg);
      const foot = ball(0.07, fur, 0.7, 0.4, 2.6); foot.position.set(0.17*s, 0.05, 0.12); body.add(foot);
      const arm = cyl(0.03, 0.03, 0.25, fur); arm.position.set(0.12*s, 1.0, 0.25); arm.rotation.x = 0.7; body.add(arm); }
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.11, 1.0, 8), fur); tail.rotation.x = -2.0; tail.position.set(0, 0.35, -0.5); body.add(tail);
    if (joey){ const j = ball(0.08, fur); j.position.set(0, 0.92, 0.33); body.add(j); for (const s of [-1, 1]){ const e = eye(0.018); e.position.set(0.035*s, 0.95, 0.4); body.add(e); } }
    return g;
  }
  function quokka(){
    const qm = model('quokka'); if (qm) return qm;
    const g = new THREE.Group(), fur = mat('#8c6a4c', 0.85), face = mat('#a7876a', 0.8);
    const b = ball(0.2, fur, 0.9, 1.05, 1.1); b.position.y = 0.24; g.add(b);
    const hd = ball(0.14, face, 1, 0.95, 1); hd.position.set(0, 0.44, 0.1); g.add(hd);
    const nose = ball(0.03, mat('#2a1d16', 0.3)); nose.position.set(0, 0.45, 0.24); g.add(nose);
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 4, 10, Math.PI), mat('#2a1d16', 0.3)); smile.position.set(0, 0.41, 0.235); smile.rotation.z = Math.PI; g.add(smile);
    for (const s of [-1, 1]){ const e = eye(0.025); e.position.set(0.06*s, 0.48, 0.2); g.add(e); const ear = ball(0.05, fur, 1, 1.1, 0.5); ear.position.set(0.09*s, 0.57, 0.04); g.add(ear); }
    const tail = cyl(0.025, 0.035, 0.22, fur); tail.position.set(0, 0.1, -0.22); tail.rotation.x = 1.1; g.add(tail);
    return g;
  }
  function emu(){
    const em = model('emu', m => { m.userData.neck = m.getObjectByName('emu_neck'); }); if (em) return em;
    const g = new THREE.Group(), fe = mat('#5b4d40', 0.95), neckM = mat('#5d6b86', 0.7), leg = mat('#6b6158', 0.8);
    const b = ball(0.42, fe, 0.85, 0.75, 1.15); b.position.y = 1.05; g.add(b);
    const neck = new THREE.Group(); neck.position.set(0, 1.25, 0.3); g.add(neck); g.userData.neck = neck;
    const n = cyl(0.05, 0.07, 0.7, neckM); n.position.y = 0.32; n.rotation.x = 0.25; neck.add(n);
    const hd = ball(0.09, neckM, 0.9, 0.9, 1.3); hd.position.set(0, 0.68, 0.12); neck.add(hd);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 6), mat('#3b3530', 0.5)); beak.rotation.x = Math.PI/2; beak.position.set(0, 0.67, 0.24); neck.add(beak);
    for (const s of [-1, 1]){ const e = eye(0.022); e.position.set(0.05*s, 0.71, 0.18); neck.add(e); const l = cyl(0.035, 0.03, 0.8, leg); l.position.set(0.14*s, 0.4, 0); g.add(l); }
    return g;
  }
  function koala(){
    const ko = model('koala', m => { m.userData.head = new THREE.Object3D(); }); if (ko) return ko;
    const g = new THREE.Group(), fur = mat('#9aa0a6', 0.95), light = mat('#e6e3dc', 0.95), dark = mat('#2c2a2a', 0.4);
    const b = ball(0.24, fur, 1, 1.15, 0.95); b.position.y = 0.3; g.add(b);
    const hd = ball(0.2, fur, 1.15, 1, 0.95); hd.position.set(0, 0.62, 0.05); g.add(hd);
    const nose = ball(0.065, dark, 0.8, 1.2, 0.7); nose.position.set(0, 0.6, 0.23); g.add(nose);
    for (const s of [-1, 1]){ const ear = ball(0.12, fur, 1, 1, 0.45); ear.position.set(0.2*s, 0.74, 0); g.add(ear); const inner = ball(0.08, light, 1, 1, 0.3); inner.position.set(0.2*s, 0.74, 0.04); g.add(inner);
      const e = eye(0.03); e.position.set(0.08*s, 0.67, 0.18); g.add(e); const arm = ball(0.07, fur, 0.8, 1.6, 0.8); arm.position.set(0.17*s, 0.42, 0.2); g.add(arm); }
    g.userData.head = hd; return g;
  }

  // ---------- populate ----------
  const seats = [...pads, ...stones.map(st => ({...st, stone:true}))];
  const freeSeat = me => { const f = seats.filter(q => !q.frog || q.frog === me); return f.length ? f[Math.floor(Math.random()*f.length)] : null; };
  const takeSeat = (a, q) => { if (a.on && a.on.frog === a) a.on.frog = null; a.on = q; if (q) q.frog = a; };
  const seatY = q => q.stone ? WATER_Y + 0.18 : WATER_Y + 0.03;
  const unRide = a => { if (a.ride){ a.ride.rider = null; a.ride = null; } };
  const shoreAt = (cx, cz, r) => { const a = rnd(0, 6.28); return V3(cx + Math.cos(a)*(r + 0.6), 0, cz + Math.sin(a)*(r + 0.6)); };
  for (let i=0;i<5;i++){ const g = frog(), a = add('frog', g, {hit:0.35, hitY:0.1, home:'pond', on:null}), q = freeSeat(a); takeSeat(a, q);
    g.position.set(q ? q.x : P.x + P.r + 0.6 + i*0.5, q ? seatY(q) : 0, q ? q.z : P.z); }
  const frogs = () => F.list.filter(a => a.kind === 'frog');
  const swampSpot = (a, px, pz, r) => { let best = null; for (let k=0;k<12;k++){ const s_ = shoreAt(px, pz, r); if (frogs().every(b => b === a || b.g.position.distanceTo(s_.clone().setY(b.g.position.y)) > 0.55)){ best = s_; break; } best = s_; } return best; };
  for (let i=0;i<3;i++){ const [px, pz, r] = D.bio.pools[i % D.bio.pools.length], g = frog(), a = add('frog', g, {hit:0.35, hitY:0.1, home:'swamp', pool:i % D.bio.pools.length}); g.position.copy(swampSpot(a, px, pz, r)); }
  for (let i=0;i<6;i++){ const g = dragonfly(); const [px, pz] = i < 3 ? [P.x, P.z] : D.bio.pools[i % D.bio.pools.length]; g.position.set(px, WATER_Y + 0.8, pz); add('dragonfly', g, {hit:0.3, hitY:0, cx:px, cz:pz, rad: i < 3 ? P.r : 3}); }
  for (let i=0;i<2;i++){ const g = turtle(); g.position.set(P.x + rnd(-1, 1), WATER_Y - 0.1, P.z + rnd(-1, 1)); add('turtle', g, {hit:0.5, hitY:0.1, ang:rnd(0, 6.28)}); }
  const [swx, swz] = plotC(BIO.swamp);
  for (let i=0;i<2;i++){ const [px, pz] = D.bio.pools[i*2 % D.bio.pools.length], g = croc(); g.position.set(px, WATER_Y - 0.2, pz); add('croc', g, {hit:1.0, hitY:0.2, pool:i*2 % D.bio.pools.length}); }
  for (let i=0;i<2;i++){ const [px, pz, r] = D.bio.pools[(i*3 + 1) % D.bio.pools.length], g = heron(); g.position.copy(shoreAt(px, pz, r*0.8)); add('heron', g, {hit:0.6, hitY:1.0}); }
  // beaver stream: lodge by the bank, dam across the river a little downstream
  const BZ = D.bio.beaverZ, bx = world.riverX(BZ), bank = D.river.w/2;
  { const sticks = mat('#6e4f35', 0.95), logM = mat('#8a6844', 0.9);
    const lodge = new THREE.Group(); for (let i=0;i<40;i++){ const s = cyl(0.04, 0.05, rnd(0.8, 1.4), i % 2 ? sticks : logM, 5); const a = rnd(0, 6.28), r = rnd(0, 0.9);
      s.position.set(Math.cos(a)*r, rnd(0, 0.5)*(1 - r), Math.sin(a)*r); s.rotation.set(rnd(-1.3, 1.3), rnd(0, 6), rnd(-1.3, 1.3)); lodge.add(s); }
    const mound = ball(1.0, mat('#5b4532', 1), 1, 0.55, 1); lodge.add(mound); lodge.position.set(bx + bank - 0.4, WATER_Y, BZ - 1.5); group.add(lodge);
    const dz = BZ + 3.5, dx = world.riverX(dz), dam = new THREE.Group();
    for (let i=0;i<26;i++){ const s = cyl(0.07, 0.09, rnd(1.0, 1.8), i % 3 ? logM : sticks, 6); s.rotation.z = Math.PI/2 + rnd(-0.3, 0.3); s.rotation.y = rnd(-0.3, 0.3);
      s.position.set(rnd(-bank - 0.3, bank + 0.3), WATER_Y + rnd(-0.1, 0.25), rnd(-0.25, 0.25)); dam.add(s); }
    dam.position.set(dx, 0, dz); group.add(dam); F.dam = dam; F.lodge = lodge;
    const g = beaver(); g.position.set(bx, WATER_Y - 0.15, BZ); add('beaver', g, {hit:0.55, hitY:0.25, lodge:V3(bx + bank - 0.6, 0, BZ - 1.5)}); }
  // outback
  for (let i=0;i<3;i++){ const g = kangaroo(i === 0); g.position.copy(landIn(BIO.aus)); add('kangaroo', g, {hit:0.8, hitY:0.9}); }
  for (let i=0;i<2;i++){ const g = quokka(); g.position.copy(landIn(BIO.aus)); add('quokka', g, {hit:0.4, hitY:0.3}); }
  for (let i=0;i<2;i++){ const g = emu(); g.position.copy(landIn(BIO.aus)); add('emu', g, {hit:0.7, hitY:1.0}); }
  for (let i=0;i<2;i++){ const g = koala(); g.position.copy(landIn(BIO.aus)); add('koala', g, {hit:0.5, hitY:0.5, perch:null}); }
  F.list.forEach(a => { if (!['dragonfly', 'turtle', 'croc', 'beaver'].includes(a.kind)) a.g.position.y = Math.max(gy(a.g.position.x, a.g.position.z), a.on ? WATER_Y + 0.03 : -9); });

  // deer in the forest (one stag with antlers), wolves on the highland
  for (let i=0;i<3;i++){ const g = clone && clone('deer'); if (!g) break; const ant = g.getObjectByName('deer_antlers'); if (ant) ant.visible = i === 0; g.scale.setScalar(i === 0 ? 1.1 : 0.9);
    g.position.copy(landIn(BIO.forest)); g.position.y = gy(g.position.x, g.position.z); add('deer', g, {hit:1.0, hitY:1.0}); }
  for (let i=0;i<3;i++){ const g = clone && clone('wolf'); if (!g) break; g.scale.setScalar(i === 0 ? 1.1 : 0.95);
    const [hx, hz] = plotC(BIO.high); g.position.set(hx + rnd(-4, 4), 0, hz + rnd(-4, 4)); g.position.y = gy(g.position.x, g.position.z); add('wolf', g, {hit:0.9, hitY:0.7}); }
  const legSwing = (a, amp, speed) => { for (const n of ['FL', 'FR', 'BL', 'BR']){ const l = a.g.getObjectByName(a.kind + '_leg' + n); if (l) l.rotation.x = Math.sin(a.t*speed + (n[0] === 'F' ? 0 : Math.PI) + (n[1] === 'L' ? 0 : Math.PI*0.5))*amp; } };
  const onHigh = (x, z) => world.inBio('high', x, z) && gy(x, z) > D.bio.high.h - 0.6;
  const highSpot = () => { for (let i=0;i<40;i++){ const p = inPlot(BIO.high, 3); if (onHigh(p.x, p.z)) return p; } return inPlot(BIO.high, 4); };
  // ---------- the grassland (大草原): horses, two tigers (never more), peacocks, tortoises; hippos and capybaras along its river; snakes ----------
  // each species lives in its own part of the world, spread out: horses on the grassland, tigers in the deer forest, peacocks
  // and tortoises on their own plots, hippos and capybaras along different stretches of the river, snakes in the swamp and forest
  const areaLand = (k, m = 2) => { for (let i=0;i<60;i++){ const q = inPlot(k, m); if (!world.isWater(q.x, q.z) && world.slope(q.x, q.z) < 0.6 && world.riverDist(q.x, q.z) > D.river.w/2 + 1.2) return q; } return inPlot(k, m); };
  const aOK = a => (x, z) => plotKey(x, z) === a.area && !world.isWater(x, z);
  const inZ = (a, z) => z > a.zr[0] && z < a.zr[1];
  const riverPt = a => { const z = rnd(a.zr[0], a.zr[1]); return V3(world.riverX(z) + rnd(-0.4, 0.4), 0, z); };
  const bankPt = (a, side = Math.random() < 0.5 ? 1 : -1) => { const z = rnd(a.zr[0], a.zr[1]); return V3(world.riverX(z) + side*(D.river.w/2 + rnd(0.8, 2.2)), 0, z); };
  const put = (kind, n, at, o = {}) => { const mine = [];
    for (let i=0;i<n;i++){ const g = clone && clone(kind); if (!g) return; g.scale.setScalar(o.vary ? rnd(0.9, 1.08) : 1);
      const oo = typeof o.per === 'function' ? {...o, ...o.per(i)} : o; let q = at(oo);
      for (let t=0; t<20 && mine.some(m => m.distanceTo(q) < 4); t++) q = at(oo);   // not on top of each other
      mine.push(q); g.position.set(q.x, gy(q.x, q.z), q.z); g.rotation.y = rnd(0, 6.28); add(kind, g, {...oo, per:undefined, home:q.clone()}); } };
  F.list.forEach((a_, i_) => { a_.idx_ = i_*1.7; });
  put('horse', 3, o => areaLand(o.area), {hit:1.1, hitY:1.2, vary:true, area:BIO.savanna});
  put('tiger', 2, o => areaLand(o.area, 3), {hit:0.9, hitY:0.6, area:BIO.forest});   // never more than two
  put('peacock', 2, o => areaLand(o.area), {hit:0.5, hitY:0.8, area:'0,1'});
  put('tortoise', 2, o => areaLand(o.area), {hit:0.45, hitY:0.2, area:'-1,-1'});
  put('capybara', 3, o => bankPt(o), {hit:0.55, hitY:0.35, per:i => ({zr:[[12, 25], [-6, 6], [-25, -12]][i]})});
  put('hippo', 2, o => riverPt(o), {hit:1.6, hitY:0.6, per:i => ({zr:[[11, 25], [-7, 7]][i]})});
  put('snake', 1, o => areaLand(o.area), {hit:0.5, hitY:0.05, area:BIO.forest}); put('snake', 1, o => landIn(o.area), {hit:0.5, hitY:0.05, area:BIO.swamp});
  // red-crowned cranes wading round the lily pond; macaques in the deer forest's trees
  put('crane', 2, () => { const a_ = rnd(0, 6.28); return V3(P.x + Math.cos(a_)*(P.r + 0.3), 0, P.z + Math.sin(a_)*(P.r + 0.3)); }, {hit:0.7, hitY:1.0});
  put('monkey', 3, o => areaLand(o.area, 3), {hit:0.5, hitY:0.4, area:BIO.forest});
  let forestTrees = []; F.setForestTrees = list => { forestTrees = list; };
  F.list.forEach(a => { if (a.kind === 'hippo'){ a.g.position.y = WATER_Y - 0.95*a.g.scale.y; } });
  // snakes slither: a wave runs down the body in the vertex shader (the head stays steady)
  F.list.filter(a => a.kind === 'snake').forEach(a => { const u = {value:0}; a.wave = u; a.g.traverse(o => { if (!o.isMesh || o.name !== 'snake_body') return;
    const m = new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.45});
    m.onBeforeCompile = sh => { sh.uniforms.uT = u; sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.x += sin(position.z*9.0 + uT)*0.085*smoothstep(0.72, 0.3, position.z);');
      sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#ifdef USE_COLOR_ALPHA\n diffuseColor.rgb *= vColor.rgb;\n#endif')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n#ifdef USE_COLOR_ALPHA\n roughnessFactor = mix(roughnessFactor, 0.15, vColor.a);\n#endif'); };
    m.customProgramCacheKey = () => 'snake'; o.material = m; }); a.tongue = a.g.getObjectByName('snake_tongue'); });
  const pt = (g, n) => (g.userData.pt || (g.userData.pt = {}))[n] ?? (g.userData.pt[n] = g.getObjectByName(n));
  const goTo = (a, dest, speed, dt, ok = () => true, turn = 3) => { const d = V3(dest.x - a.g.position.x, 0, dest.z - a.g.position.z), L_ = d.length();
    if (L_ < 0.3) return true; d.normalize(); const nx = a.g.position.x + d.x*0.6, nz = a.g.position.z + d.z*0.6;
    if (!ok(nx, nz)) return true; a.g.position.addScaledVector(d, Math.min(L_, dt*speed)); face(a, d.x, d.z, dt, turn); return false; };

  // koalas climb the outback's eucalyptus trees (game.js tells us where they are)
  F.setPerches = list => { let i = 0; for (const a of F.list) if (a.kind === 'koala'){ const t = list[i++]; a.perch = t || null; } };

  // ---------- behaviour ----------
  const hop = (a, to, dur, height) => { a.state = 'hop'; a.from = a.g.position.clone(); a.to = to.clone(); a.hopT = 0; a.hopDur = dur; a.hopH = height; };
  function stepHop(a, dt){ a.hopT += dt; const u = Math.min(1, a.hopT/a.hopDur); a.g.position.lerpVectors(a.from, a.to, u); a.g.position.y = lerp(a.from.y, a.to.y, u) + 4*a.hopH*u*(1 - u);
    face(a, a.to.x - a.from.x, a.to.z - a.from.z, 1, 99); return u >= 1; }
  const BIRD_LEGS = ['crane', 'heron', 'peacock', 'emu'], AUTO_LEGS4 = ['beaver'];
  function autoLegs(a, dt){
    const p = a.g.position, sc = a.g.scale.x;
    const mv = a.lastP ? Math.min(8, Math.hypot(p.x - a.lastP.x, p.z - a.lastP.z)/Math.max(dt, 1e-4)) : 0; (a.lastP || (a.lastP = V3(0, 0, 0))).copy(p);
    a.spd = (a.spd || 0) + (mv - (a.spd || 0))*Math.min(1, dt*8); const amt = clamp(a.spd/(0.6*sc), 0, 1);
    a.ph = (a.ph || 0) + a.spd*dt/(0.35*sc)*Math.PI;   // one stride per ~0.7 body-lengths
    if (BIRD_LEGS.includes(a.kind)){
      for (const [n, off] of [['L', 0], ['R', Math.PI]]){ const l = pt(a.g, a.kind + '_leg' + n), sh = pt(a.g, a.kind + '_shin' + n); if (!l) continue;
        l.rotation.x = -Math.sin(a.ph + off)*0.45*amt; if (sh) sh.rotation.x = Math.max(0, Math.cos(a.ph + off))*1.0*amt; }   // swing at the hip, fold at the heel while the foot is lifted
      const nk = pt(a.g, a.kind + '_neck'); if (nk && amt > 0.1 && a.kind !== 'emu') nk.position.z += 0;   // (neck motions are set by the behaviour)
      p.y += Math.abs(Math.sin(a.ph))*0.02*amt*sc;
    } else if (AUTO_LEGS4.includes(a.kind)){
      for (const n of ['FL', 'FR', 'BL', 'BR']){ const l = pt(a.g, a.kind + '_leg' + n); if (l) l.rotation.x = Math.sin(a.ph + (n[0] === 'F' ? 0 : Math.PI) + (n[1] === 'L' ? 0 : Math.PI*0.5))*0.6*amt; }
    }
  }
  F.update = (dt, t, o) => {
    const cam = o.cam, pet = o.pet;
    for (const a of F.list){
      const p = a.g.position, camD = Math.hypot(p.x - cam.x, p.z - cam.z), far = camD > 60; a.g.visible = !far; if (far) continue;
      lod && lod(a.g, camD < 24);
      a.t += dt; a.timer -= dt;
      const petD = pet ? Math.hypot(p.x - pet.x, p.z - pet.z) : 99;
      switch (a.kind){
        case 'frog': {
          if (a.tongueT > 0){ a.tongueT -= dt; const tg = a.tongue, k = Math.sin(Math.max(0, a.tongueT)/0.25*Math.PI); tg.visible = a.tongueT > 0; tg.scale.set(1, Math.max(0.01, a.tongueLen*k), 1); }
          if (a.state === 'idle' && !a.ride && !(a.tongueT > 0)){ const df = F.list.find(d0 => d0.kind === 'dragonfly' && Math.hypot(d0.g.position.x - p.x, d0.g.position.z - p.z) < 0.9 && d0.g.position.y - p.y < 1.0);
            if (df){ if (!a.tongue){ const tg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 1, 6), mat('#e88a8a', 0.4)); tg.geometry.translate(0, 0.5, 0); a.tongue = tg; group.add(tg); }
              const from = p.clone().add(V3(Math.sin(a.g.rotation.y)*0.17, 0.1, Math.cos(a.g.rotation.y)*0.17)), to = df.g.position.clone();
              a.tongue.position.copy(from); a.tongue.quaternion.setFromUnitVectors(V3(0, 1, 0), to.clone().sub(from).normalize()); a.tongueLen = from.distanceTo(to); a.tongueT = 0.25; a.tongue.visible = true;
              face(a, to.x - p.x, to.z - p.z, 1, 99); df.g.position.set(df.cx + rnd(-df.rad, df.rad), WATER_Y + 1.2, df.cz + rnd(-df.rad, df.rad)); df.dest = null; sound('croak', p); } }   // caught it (another one flies in)
          const sac = a.g.userData.sac; sac.scale.setScalar(1 + Math.max(0, Math.sin(a.t*9))*(a.croak > 0 ? (a.g.userData.sacMax || 0.8) : 0)); a.croak = (a.croak || 0) - dt;
          if (a.ride){   // sitting on another frog's back (never inside it)
            const b = a.ride, bp = b.g.position;
            if (!b.g.visible || b.state !== 'idle' || b.ride){ unRide(a); a.timer = 0; }
            else { const ry = b.g.rotation.y; p.set(bp.x - Math.sin(ry)*0.03, bp.y + 0.15, bp.z - Math.cos(ry)*0.03); a.g.rotation.y = ry + 0.15; if (a.timer > 0) break; } }
          if (a.state === 'hop'){ if (stepHop(a, dt)){ a.state = a.dived ? 'under' : 'idle'; a.timer = a.dived ? 3 : rnd(3, 9); if (a.dived){ sound('plop', p); a.g.visible = false; }
            else if (a.climb){ const b = a.climb; a.climb = null; if (b.g.visible && b.state === 'idle' && !b.rider && !b.ride){ a.ride = b; b.rider = a; a.timer = rnd(4, 10); } else a.timer = 0; } } break; }
          if (a.state === 'under'){ a.g.visible = false; if (a.timer <= 0){ a.dived = false; a.state = 'idle';
            if (a.home === 'pond'){ const q = freeSeat(a); takeSeat(a, q); if (q) p.set(q.x, seatY(q), q.z); } a.g.visible = true; } break; }
          if (petD < 2.2){ unRide(a); takeSeat(a, null); a.dived = true; const to = p.clone(); to.x += rnd(-1, 1); to.z += rnd(-1, 1); to.y = WATER_Y - 0.3; hop(a, to, 0.5, 0.5); break; }
          if (a.timer <= 0){ if (Math.random() < 0.35 && !a.ride){ a.croak = 1.2; sound('croak', p); a.timer = rnd(2, 5); break; }
            unRide(a); let to;
            if (a.home === 'pond'){
              const others = frogs().filter(b => b !== a && b.home === 'pond' && b.g.visible && b.state === 'idle' && !b.rider && !b.ride && b.on);
              if (others.length && Math.random() < 0.15){ const b = others[Math.floor(Math.random()*others.length)]; takeSeat(a, null); a.climb = b; to = b.g.position.clone().add(V3(0, 0.15, 0)); }
              else { const q = freeSeat(a); takeSeat(a, q); to = q ? V3(q.x, seatY(q), q.z) : V3(P.x + P.r + 0.6, 0, P.z); } }
            else { const [px, pz, r] = D.bio.pools[a.pool]; to = swampSpot(a, px, pz, r); }
            if (to.y === 0) to.y = gy(to.x, to.z); hop(a, to, 0.6, 0.6); }
          break; }
        case 'dragonfly': {
          if (a.timer <= 0 || !a.dest){ a.timer = rnd(0.4, 1.8); const ang = rnd(0, 6.28), r = Math.sqrt(Math.random())*a.rad; a.dest = V3(a.cx + Math.cos(ang)*r, WATER_Y + rnd(0.4, 1.3), a.cz + Math.sin(ang)*r); }
          const d = a.dest.clone().sub(p), L = d.length(); if (L > 0.02){ p.addScaledVector(d.normalize(), Math.min(L, dt*4)); face(a, d.x, d.z, dt, 12); }
          a.g.userData.wings.forEach((w, i) => w.rotation.z = Math.sin(t*60 + i)*0.4);
          break; }
        case 'turtle': {
          const ud = a.g.userData, shy = petD < 2.6 || a.shy > 0; a.shy = (a.shy || 0) - dt;
          if (ud.head){ if (ud.head.userData.z0 === undefined) ud.head.userData.z0 = ud.head.position.z; ud.head.position.z += ((ud.head.userData.z0 - (shy ? 0.13 : 0)) - ud.head.position.z)*Math.min(1, dt*6); ud.head.rotation.y = shy ? 0 : Math.sin(a.t*0.6)*0.3; }
          if (ud.legs) ud.legs.forEach((l, i) => { l.rotation.y = a.state === 'sun' || shy ? 0 : Math.sin(a.t*3 + i*1.6)*0.45*(i % 2 ? -1 : 1); });
          if (a.state === 'sun'){ if (a.timer <= 0){ a.state = 'idle'; a.timer = rnd(8, 15); } break; }
          a.ang += dt*0.15; const r = P.r*0.55, x = P.x + Math.cos(a.ang)*r, z = P.z + Math.sin(a.ang)*r;
          const d = V3(x - p.x, 0, z - p.z); if (d.length() > 0.02){ p.addScaledVector(d.normalize(), Math.min(d.length(), dt*0.4)); face(a, d.x, d.z, dt, 2); }
          p.y = WATER_Y - 0.12 + Math.sin(a.t)*0.02;
          if (a.timer <= 0){ const s = stones[Math.floor(Math.random()*stones.length)]; if (s){ p.set(s.x, WATER_Y + 0.18, s.z); a.state = 'sun'; a.timer = rnd(10, 20); } else a.timer = 10; }
          break; }
        case 'croc': {
          const [px, pz, r] = D.bio.pools[a.pool], jaw = a.g.userData.jaw, cu = a.g.userData, wet = world.isWater(p.x, p.z), walking = a.dest && a.state !== 'bask' && Math.hypot(a.dest.x - p.x, a.dest.z - p.z) > 0.1;
          if (cu.tail) cu.tail.rotation.y = Math.sin(a.t*(walking ? 3 : 1.2))*(walking ? 0.28 : 0.1);
          if (cu.legs) cu.legs.forEach(([n, l]) => { l.rotation.y = walking && !wet ? Math.sin(a.t*5 + (n === 'FL' || n === 'BR' ? 0 : Math.PI))*0.45 : wet ? (n[0] === 'F' ? -0.6 : 0.6)*(n[1] === 'L' ? 1 : -1) : 0; });
          jaw.rotation.x = a.snap > 0 ? Math.abs(Math.sin(a.snap*10))*0.6*(a.g.userData.jawSign || -1) : jaw.rotation.x*0.9; a.snap = (a.snap || 0) - dt;
          if (Math.random() < dt*0.015) sound('bellow', p);
          if (a.state === 'bask'){ p.y = gy(p.x, p.z) + 0.02; if (a.timer <= 0 || petD < 2.5){ a.state = 'idle'; a.timer = rnd(6, 12); if (petD < 2.5){ a.snap = 0.6; sound('snap', p); o.onScare && o.onScare('croc'); } } break; }
          if (pet && petD < 4 && a.snap <= 0 && Math.random() < dt*0.8){ a.snap = 0.6; sound('snap', p); o.onScare && o.onScare('croc'); }
          if (a.timer <= 0 || !a.dest){ a.timer = rnd(4, 9);
            if (Math.random() < 0.25){ const s = shoreAt(px, pz, r); a.dest = s; a.goBask = true; } else { const ang = rnd(0, 6.28), rr = r*rnd(0, 0.5); a.dest = V3(px + Math.cos(ang)*rr, 0, pz + Math.sin(ang)*rr); a.goBask = false; } }
          const d = V3(a.dest.x - p.x, 0, a.dest.z - p.z), L = d.length();
          if (L > 0.1){ p.addScaledVector(d.normalize(), Math.min(L, dt*0.45)); face(a, d.x, d.z, dt, 1.2); }
          else if (a.goBask){ a.state = 'bask'; a.timer = rnd(8, 16); a.goBask = false; }
          if (a.state !== 'bask') p.y = Math.max(WATER_Y - 0.26*a.g.scale.y, Math.min(gy(p.x, p.z) + 0.02, WATER_Y - 0.26*a.g.scale.y + (world.isWater(p.x, p.z) ? 0 : 0.5)));
          break; }
        case 'heron': {
          const hd = a.g.userData.head, bk = a.g.userData.beak;
          const neck = a.g.userData.neck; if (neck && a.stab > 0){ a.stab -= dt; neck.rotation.x = Math.sin((1 - a.stab/0.6)*Math.PI)*1.2; } else if (neck) neck.rotation.x *= 0.9;
          if (!neck && a.stab > 0){ a.stab -= dt; const k = Math.sin((1 - a.stab/0.6)*Math.PI); hd.position.y = 1.64 - k*0.9; bk.position.y = 1.64 - k*0.9; hd.position.z = 0.32 + k*0.2; bk.position.z = 0.5 + k*0.2; }
          if (petD < 3 && a.state !== 'walk'){ a.state = 'walk'; a.dest = p.clone().add(V3(p.x - pet.x, 0, p.z - pet.z).setLength(4)); }
          if (a.state === 'walk'){ const d = V3(a.dest.x - p.x, 0, a.dest.z - p.z), L = d.length(); if (L > 0.1 && world.swampW(p.x + d.x/L, p.z + d.z/L) > 0.3){ p.addScaledVector(d.normalize(), dt*0.9); face(a, d.x, d.z, dt, 3); p.y = Math.max(gy(p.x, p.z), WATER_Y - 0.25); } else { a.state = 'idle'; a.timer = rnd(2, 5); } }
          else if (a.timer <= 0){ a.timer = rnd(3, 8); a.stab = 0.6; if (Math.random() < 0.3) sound('heron', p); }
          break; }
        case 'beaver': {
          const tail = a.g.userData.tail;
          if (petD < 3 && !a.slapped){ a.slapped = true; tail.rotation.x = -1; sound('splash', p); setTimeout(() => { a.slapped = false; }, 8000); }
          tail.rotation.x *= 0.92;
          if (a.state === 'gnaw'){ a.g.rotation.x = 0.15 + Math.sin(a.t*18)*0.05; if (Math.random() < dt*6) o.chips && o.chips(p.clone().add(V3(Math.sin(a.g.rotation.y)*0.6, 0.3, Math.cos(a.g.rotation.y)*0.6)));
            if (a.timer <= 0){ a.state = 'idle'; a.timer = rnd(4, 8); a.g.rotation.x = 0; } break; }
          if (a.timer <= 0 || !a.dest){ a.timer = rnd(6, 12); const roll = Math.random();
            if (roll < 0.35 && o.treeNear){ const tr = o.treeNear(p.x, p.z, 10); if (tr){ a.dest = V3(tr.x, 0, tr.z); a.toTree = true; } }
            if (!a.dest || !a.toTree){ const z = BZ + rnd(-1.5, 3); a.dest = roll < 0.6 ? a.lodge.clone() : V3(world.riverX(z) + rnd(-0.8, 0.8), 0, z); a.toTree = false; } }
          const d = V3(a.dest.x - p.x, 0, a.dest.z - p.z), L = d.length();
          if (L > (a.toTree ? 0.9 : 0.15)){ p.addScaledVector(d.normalize(), Math.min(L, dt*0.7)); face(a, d.x, d.z, dt, 3); }
          else if (a.toTree){ a.state = 'gnaw'; a.timer = rnd(4, 7); a.toTree = false; face(a, d.x, d.z, 1, 99); }
          const wet = world.isWater(p.x, p.z); p.y = wet ? WATER_Y - 0.22 : gy(p.x, p.z);
          break; }
        case 'kangaroo': {
          const body = a.g.userData.body;
          if (a.state === 'hop'){ body.rotation.x = 0.5; if (stepHop(a, dt)){ if (a.left > 0){ a.left--; const dir = a.to.clone().sub(a.from).setY(0).normalize(); const nx = V3(a.to.x + dir.x*1.4, 0, a.to.z + dir.z*1.4);
            if (world.inBio('aus', nx.x, nx.z) && !world.isWater(nx.x, nx.z)){ nx.y = gy(nx.x, nx.z); hop(a, nx, 0.45, 0.6); } else a.left = 0; } else { a.state = 'idle'; a.timer = rnd(2, 6); } } break; }
          body.rotation.x += ((Math.sin(a.t*0.35 + a.idx_) > 0.3 ? 0.55 + Math.sin(a.t*5)*0.03 : 0) - body.rotation.x)*Math.min(1, dt*3); body.position.y = Math.sin(a.t*1.3)*0.01;   // leans down to graze
          if (a.timer <= 0 || petD < 3){ a.timer = rnd(2, 6); const away = petD < 3 ? V3(p.x - pet.x, 0, p.z - pet.z).normalize() : V3(rnd(-1, 1), 0, rnd(-1, 1)).normalize();
            const nx = V3(p.x + away.x*1.4, 0, p.z + away.z*1.4); if (world.inBio('aus', nx.x, nx.z) && !world.isWater(nx.x, nx.z)){ nx.y = gy(nx.x, nx.z); a.left = 2 + Math.floor(Math.random()*3); hop(a, nx, 0.45, 0.6); sound('boing', p); } }
          break; }
        case 'quokka': {
          if (a.state === 'hop'){ if (stepHop(a, dt)){ a.state = 'idle'; a.timer = rnd(2, 6); } break; }
          if (pet && petD < 4){ face(a, pet.x - p.x, pet.z - p.z, dt, 4); if (!a.smiled){ a.smiled = true; o.onSmile && o.onSmile(p.clone()); setTimeout(() => a.smiled = false, 15000); } break; }
          if (a.timer <= 0){ const to = V3(p.x + rnd(-1.2, 1.2), 0, p.z + rnd(-1.2, 1.2)); if (world.inBio('aus', to.x, to.z)){ to.y = gy(to.x, to.z); hop(a, to, 0.35, 0.25); } else a.timer = 1; }
          break; }
        case 'emu': {
          const neck = a.g.userData.neck;
          if (Math.random() < dt*0.015) sound('emu', p);
          if (a.peck > 0){ a.peck -= dt; neck.rotation.x = Math.sin((1 - a.peck/0.8)*Math.PI)*1.2; break; } neck.rotation.x *= 0.9;
          if (a.timer <= 0 || !a.dest){ a.timer = rnd(3, 7); if (Math.random() < 0.4){ a.peck = 0.8; a.dest = p.clone(); } else { const q = landIn(BIO.aus); a.dest = q; } }
          const away = petD < 3 ? V3(p.x - pet.x, 0, p.z - pet.z).normalize() : null; if (away){ a.dest = p.clone().addScaledVector(away, 3); }
          const d = V3(a.dest.x - p.x, 0, a.dest.z - p.z), L = d.length();
          if (L > 0.2 && world.inBio('aus', p.x + d.x/L, p.z + d.z/L)){ p.addScaledVector(d.normalize(), Math.min(L, dt*(away ? 2.2 : 0.9))); face(a, d.x, d.z, dt, 4); p.y = gy(p.x, p.z) + Math.abs(Math.sin(a.t*8))*0.04; }
          break; }
        case 'deer': {   // graze, wander, and bound away when the wombat comes close
          if (a.state === 'caught'){ a.g.visible = false; if (a.timer <= 0){ a.state = 'graze'; a.timer = 3; const q = landIn(BIO.forest); p.set(q.x, gy(q.x, q.z), q.z); a.g.visible = true; } break; }
          const tg = F.list.find(b => b.kind === 'tiger' && b.state !== 'rest' && Math.hypot(b.g.position.x - p.x, b.g.position.z - p.z) < 6), th = tg ? tg.g.position : pet;   // a prowling tiger scares deer
          const scared = petD < 5 || !!tg;
          if (scared && a.state !== 'run'){ a.state = 'run'; a.timer = rnd(2.5, 4); const away = V3(p.x - th.x, 0, p.z - th.z).normalize(); a.dest = p.clone().addScaledVector(away, 9); sound('deer', p); }
          if (a.timer <= 0){ if (a.state === 'graze' || a.state === 'run' || a.state === 'idle'){ if (Math.random() < 0.5){ a.state = 'graze'; a.timer = rnd(4, 9); } else { a.state = 'walk'; a.timer = rnd(4, 8); a.dest = landIn(BIO.forest); } } else { a.state = 'graze'; a.timer = rnd(4, 9); } }
          const moving = (a.state === 'walk' || a.state === 'run') && a.dest;
          if (moving){ const d = V3(a.dest.x - p.x, 0, a.dest.z - p.z), L = d.length(), sp = a.state === 'run' ? 4.2 : 1.0;
            if (L > 0.3 && world.inBio('forest', p.x + d.x/L, p.z + d.z/L) && !world.isWater(p.x + d.x/L, p.z + d.z/L)){ p.addScaledVector(d.normalize(), Math.min(L, dt*sp)); face(a, d.x, d.z, dt, 4); } else { a.state = 'graze'; a.timer = rnd(3, 6); } }
          legSwing(a, a.state === 'run' ? 0.75 : moving ? 0.35 : 0, a.state === 'run' ? 14 : 6);
          a.g.rotation.x = a.state === 'graze' ? 0.12 + Math.sin(a.t*2)*0.02 : 0;
          p.y = gy(p.x, p.z) + (a.state === 'run' ? Math.abs(Math.sin(a.t*7))*0.25 : 0);
          break; }
        case 'wolf': {   // roam the highland, howl at night, shelter in the cave when it rains or storms
          const tail = a.g.getObjectByName('wolf_tail'), door = world.caveDoor;
          if (tail) tail.rotation.y = Math.sin(a.t*(a.state === 'meet' ? 9 : 2))*0.3;
          if (o.bad && door && a.state !== 'den'){ a.state = 'toDen'; a.dest = door.clone(); }
          if (a.state === 'den'){ a.g.visible = false; if (!o.bad){ a.state = 'idle'; a.timer = rnd(1, 4); a.g.visible = true; p.copy(door); } break; }
          if (a.state === 'howl'){ a.g.rotation.x = -0.35; if (a.timer <= 0){ a.state = 'idle'; a.g.rotation.x = 0; a.timer = rnd(4, 9); } break; }
          if (pet && petD < 4.5 && a.state !== 'toDen'){ a.state = 'meet'; face(a, pet.x - p.x, pet.z - p.z, dt, 3); legSwing(a, 0, 1); if (!a.growled){ a.growled = true; sound('growl', p); setTimeout(() => a.growled = false, 12000); } break; }
          if (a.state === 'meet') { a.state = 'idle'; a.timer = 1; }
          if (a.timer <= 0 && a.state !== 'toDen'){ if (o.night > 0.6 && Math.random() < 0.35){ a.state = 'howl'; a.timer = 3; sound('howl', p); break; } a.state = 'walk'; a.timer = rnd(5, 10); a.dest = highSpot(); }
          if ((a.state === 'walk' || a.state === 'toDen') && a.dest){ const d = V3(a.dest.x - p.x, 0, a.dest.z - p.z), L = d.length();
            if (L > 0.35){ p.addScaledVector(d.normalize(), Math.min(L, dt*(a.state === 'toDen' ? 2.6 : 1.3))); face(a, d.x, d.z, dt, 4); legSwing(a, 0.5, a.state === 'toDen' ? 12 : 8); }
            else { legSwing(a, 0, 1); if (a.state === 'toDen'){ a.state = 'den'; } else { a.state = 'idle'; a.timer = rnd(3, 7); } } }
          else legSwing(a, 0, 1);
          p.y = gy(p.x, p.z);
          break; }
        case 'horse': {   // graze in a loose herd, wander, and gallop off when the wombat comes close
          const neck = pt(a.g, 'horse_neck'), tail = pt(a.g, 'horse_tail');
          if (Math.random() < dt*0.012) sound('neigh', p);
          if (petD < 4.5 && a.state !== 'run'){ a.state = 'run'; a.timer = rnd(2.5, 4); sound('neigh', p); a.dest = p.clone().addScaledVector(V3(p.x - pet.x, 0, p.z - pet.z).normalize(), 9); }
          if (a.timer <= 0){ if (a.state === 'graze' && Math.random() < 0.5){ a.state = 'walk'; a.timer = rnd(4, 8); a.dest = areaLand(a.area); } else { a.state = 'graze'; a.timer = rnd(5, 12); } }
          let moving = false;
          if ((a.state === 'walk' || a.state === 'run') && a.dest){ moving = !goTo(a, a.dest, a.state === 'run' ? 5 : 1.1, dt, aOK(a), 3); if (!moving){ a.state = 'graze'; a.timer = rnd(4, 9); } }
          legSwing(a, a.state === 'run' && moving ? 0.8 : moving ? 0.35 : 0, a.state === 'run' ? 13 : 6);
          if (neck) neck.rotation.x += ((a.state === 'graze' ? 1.0 + Math.sin(a.t*1.5)*0.05 : a.state === 'run' ? -0.15 : 0.1) - neck.rotation.x)*Math.min(1, dt*3);
          if (tail) tail.rotation.y = Math.sin(a.t*(a.state === 'run' ? 8 : 2.2))*0.35;
          p.y = gy(p.x, p.z) + (a.state === 'run' && moving ? Math.abs(Math.sin(a.t*6.5))*0.18 : 0);
          break; }
        case 'tiger': {   // prowls the grassland, lies down to rest, stares and growls at the wombat (but never chases it)
          const head = pt(a.g, 'tiger_head'), tail = pt(a.g, 'tiger_tail');
          if (tail) tail.rotation.y = Math.sin(a.t*(a.state === 'warn' ? 6 : 1.4))*0.35;
          if (pet && petD < 4 && a.state !== 'leave'){ if (a.state !== 'warn'){ a.state = 'warn'; a.timer = 2.2; sound('roar', p); o.onScare && o.onScare('tiger'); } }
          if (a.state === 'warn'){ face(a, pet ? pet.x - p.x : 0, pet ? pet.z - p.z : 1, dt, 4); legSwing(a, 0, 1); a.g.rotation.x = 0.08;
            if (a.timer <= 0){ a.state = 'leave'; a.timer = 6; a.dest = pet ? p.clone().addScaledVector(V3(p.x - pet.x, 0, p.z - pet.z).normalize(), 8) : areaLand(a.area); a.g.rotation.x = 0; } break; }
          a.huntCd = (a.huntCd || 0) - dt;
          if (a.state === 'eat'){ a.lie = Math.min(1, (a.lie || 0) + dt*2); if (head) head.rotation.x = 0.55 + Math.max(0, Math.sin(a.t*3))*0.25; p.y = gy(p.x, p.z) - a.lie*0.4*a.g.scale.y;
            for (const n of ['FL', 'FR', 'BL', 'BR']){ const l = pt(a.g, 'tiger_leg' + n); if (l) l.rotation.x = (n[0] === 'F' ? -1.25 : 1.3)*a.lie; } if (a.timer <= 0){ a.state = 'rest'; a.timer = rnd(10, 20); if (head) head.rotation.x = 0; } break; }
          if (a.state === 'stalk' || a.state === 'chase'){
            const d0 = a.prey; if (!d0 || d0.state === 'caught' || !d0.g.visible){ a.state = 'prowl'; a.timer = 2; a.dest = areaLand(a.area, 3); break; }
            const dd = d0.g.position.distanceTo(p), chase = a.state === 'chase';
            if (!chase && dd < 6){ a.state = 'chase'; a.st = 0; sound('roar', p); }
            a.st = (a.st || 0) + dt; goTo(a, d0.g.position, chase ? 6.5 : 0.7, dt, aOK(a), chase ? 6 : 2);
            legSwing(a, chase ? 0.9 : 0.3, chase ? 15 : 4); a.g.rotation.x = chase ? 0 : 0.06; p.y = gy(p.x, p.z) - (chase ? 0 : 0.12*a.g.scale.y);
            if (head) head.rotation.x = chase ? -0.1 : 0.15;
            if (chase && dd < 1.3*a.g.scale.x){ if (Math.random() < 0.3){ d0.state = 'caught'; d0.timer = rnd(90, 150); a.state = 'eat'; a.timer = rnd(8, 12); a.huntCd = rnd(60, 120); o.onEvent && o.onEvent('tigerCatch', p); }
              else { a.state = 'rest'; a.timer = rnd(6, 10); a.huntCd = rnd(40, 80); } break; }   // the deer dodges away
            if ((chase && a.st > 4) || (!chase && a.st > 25)){ a.state = 'rest'; a.timer = rnd(6, 12); a.huntCd = rnd(30, 60); }
            break; }
          if (a.timer <= 0){ const r_ = Math.random(), deer = F.list.filter(d0 => d0.kind === 'deer' && d0.g.visible && d0.state !== 'caught' && d0.g.position.distanceTo(p) < 16);
            if (deer.length && a.huntCd <= 0 && r_ < 0.4){ a.state = 'stalk'; a.st = 0; a.prey = deer[Math.floor(Math.random()*deer.length)]; }
            else if (r_ < 0.6){ a.state = 'rest'; a.timer = rnd(8, 16); } else { a.state = 'prowl'; a.timer = rnd(6, 12); a.dest = areaLand(a.area, 3); } }
          let moving = false;
          if ((a.state === 'prowl' || a.state === 'leave') && a.dest){ moving = !goTo(a, a.dest, a.state === 'leave' ? 2.2 : 0.9, dt, aOK(a), 2.5); if (!moving){ a.state = 'rest'; a.timer = rnd(5, 10); } }
          legSwing(a, moving ? 0.45 : 0, a.state === 'leave' ? 9 : 5);
          const lie = a.state === 'rest' ? 1 : 0; a.lie = (a.lie || 0) + (lie - (a.lie || 0))*Math.min(1, dt*2);
          for (const n of ['FL', 'FR', 'BL', 'BR']){ const l = pt(a.g, 'tiger_leg' + n); if (l && a.lie > 0.02) l.rotation.x = (n[0] === 'F' ? -1.25 : 1.3)*a.lie; }   // legs tucked forward/back when lying
          if (head){ const look = pet && petD < 9 ? wrapA(Math.atan2(pet.x - p.x, pet.z - p.z) - a.g.rotation.y) : Math.sin(a.t*0.3)*0.5; head.rotation.y += (clamp(look, -1, 1) - head.rotation.y)*Math.min(1, dt*3); }
          p.y = gy(p.x, p.z) - a.lie*0.4;
          if (pet && petD < 9 && a.state === 'rest' && Math.random() < dt*0.05) sound('roar', p);
          break; }
        case 'crane': {   // wades round the pond edge, probes for food, and now and then dances: wings open, bowing and leaping
          const neck = pt(a.g, 'crane_neck'), wl = pt(a.g, 'crane_wingL'), wr = pt(a.g, 'crane_wingR');
          if (a.timer <= 0){ const r_ = Math.random(); a.timer = rnd(4, 9);
            if (r_ < 0.25){ a.state = 'dance'; a.timer = rnd(4, 6); } else if (r_ < 0.6){ a.state = 'walk'; const a_ = rnd(0, 6.28); a.dest = V3(P.x + Math.cos(a_)*(P.r + rnd(-0.3, 0.6)), 0, P.z + Math.sin(a_)*(P.r + rnd(-0.3, 0.6))); } else a.state = 'probe'; }
          if (petD < 3 && a.state !== 'walk'){ a.state = 'walk'; a.timer = 4; a.dest = p.clone().addScaledVector(V3(p.x - pet.x, 0, p.z - pet.z).normalize(), 3); }
          const dance = a.state === 'dance' ? 1 : 0; a.dk = (a.dk || 0) + (dance - (a.dk || 0))*Math.min(1, dt*4);
          const flap = a.dk*(0.4 + Math.sin(a.t*5)*0.45);
          if (wl){ wl.rotation.set(0, 1.45*(1 - a.dk), flap); wr.rotation.set(0, -1.45*(1 - a.dk), -flap); }
          if (neck) neck.rotation.x = a.state === 'probe' ? 1.1 + Math.sin(a.t*4)*0.1 : a.state === 'dance' ? Math.max(0, Math.sin(a.t*2.5))*0.6 : 0;
          if (a.state === 'walk' && a.dest && goTo(a, a.dest, 0.7, dt, () => true, 2.5)) a.state = 'probe';
          p.y = Math.max(gy(p.x, p.z), WATER_Y - 0.3) + (a.state === 'dance' ? Math.max(0, Math.sin(a.t*2.5))*0.35 : 0);
          if (a.state === 'dance' && Math.random() < dt*0.3) sound('crane', p);
          break; }
        case 'monkey': {   // sits up in a tree, climbs down to forage and groom, scampers back up when the wombat comes
          const arm = pt(a.g, 'monkey_armL'), arm2 = pt(a.g, 'monkey_armR'), head = pt(a.g, 'monkey_head');
          const tree = a.tree && forestTrees.includes(a.tree) ? a.tree : (a.tree = forestTrees.length ? forestTrees[Math.floor(Math.random()*forestTrees.length)] : null);
          const perch = tree ? V3(tree.x + Math.sin(a.side || 0)*0.3*tree.s, gy(tree.x, tree.z) + 1.55*tree.s, tree.z + Math.cos(a.side || 0)*0.3*tree.s) : null;
          if (a.side === undefined) a.side = rnd(0, 6.28);
          if (pet && petD < 3.5 && a.state !== 'up' && a.state !== 'climb' && perch){ a.state = 'climb'; a.from = p.clone(); a.st = 0; sound('monkey', p); }
          if (a.timer <= 0 && a.state !== 'climb' && a.state !== 'down'){ a.timer = rnd(6, 14); const r_ = Math.random();
            if (a.state === 'up' && r_ < 0.4 && perch){ a.state = 'down'; a.from = p.clone(); a.st = 0; } else if (a.state !== 'up' && r_ < 0.4){ a.state = 'walk'; a.dest = p.clone().add(V3(rnd(-3, 3), 0, rnd(-3, 3))); } else if (a.state !== 'up' && r_ < 0.8 && perch){ a.state = 'climb'; a.from = p.clone(); a.st = 0; } else if (a.state !== 'up') a.state = 'groom'; }
          if (a.state === 'climb' || a.state === 'down'){ a.st += dt; const u = Math.min(1, a.st/2.8), base = tree ? V3(tree.x + Math.sin(a.side)*0.35*tree.s, 0, tree.z + Math.cos(a.side)*0.35*tree.s) : p.clone();
            base.y = gy(base.x, base.z); if (a.state === 'climb'){ if (u < 0.3) p.lerpVectors(a.from, base, u/0.3); else p.lerpVectors(base, perch, (u - 0.3)/0.7); } else { if (u < 0.7) p.lerpVectors(a.from, base, u/0.7); else p.copy(base); }
            const onTrunk = a.state === 'climb' ? u > 0.3 && u < 0.97 : u < 0.7;
            if (onTrunk && tree) a.g.rotation.y = Math.atan2(tree.x - p.x, tree.z - p.z);   // hugging the trunk, hand over hand
            a.g.rotation.x = onTrunk ? -1.25 : 0; if (arm){ arm.rotation.x = -2.2 + Math.sin(a.t*9)*0.6; arm2.rotation.x = -2.2 - Math.sin(a.t*9)*0.6; }
            if (u >= 1){ a.state = a.state === 'climb' ? 'up' : 'groom'; a.g.rotation.x = 0; a.timer = rnd(6, 12); } break; }
          if (a.state === 'up' && perch){ p.copy(perch); a.g.rotation.y = (a.side || 0); if (head) head.rotation.y = Math.sin(a.t*0.6)*0.8; if (arm){ arm.rotation.x = -0.4 + Math.sin(a.t*2)*0.2; arm2.rotation.x = -0.3; } break; }
          if (a.state === 'walk' && a.dest){ if (goTo(a, a.dest, 1.2, dt, (x, z) => !world.isWater(x, z), 4)) a.state = 'groom'; a.g.rotation.x = 0.55; if (arm){ arm.rotation.x = Math.sin(a.t*9)*0.6; arm2.rotation.x = -Math.sin(a.t*9)*0.6; } p.y = gy(p.x, p.z) + Math.abs(Math.sin(a.t*9))*0.05; break; }
          a.g.rotation.x = 0; if (arm){ arm.rotation.x = -1.4 + Math.sin(a.t*6)*0.3; arm2.rotation.x = -0.5; } if (head) head.rotation.x = 0.3 + Math.sin(a.t*3)*0.1;   // grooming / nibbling
          p.y = gy(p.x, p.z);
          break; }
        case 'hippo': {   // floats in the river with just eyes, ears and back showing; yawns hugely; ducks under now and then
          const jaw = pt(a.g, 'hippo_jaw'), head = pt(a.g, 'hippo_head'), el = pt(a.g, 'hippo_earL'), er = pt(a.g, 'hippo_earR');
          if (el){ a.flick = (a.flick || 0) - dt; if (a.flick < -rnd(1.5, 4)) a.flick = 0.5; const f_ = a.flick > 0 ? Math.sin(a.flick*25)*0.6 : 0; el.rotation.set(0, Math.sin(a.t*0.7)*0.4 + f_, f_*0.5); er.rotation.set(0, -Math.sin(a.t*0.7 + 1)*0.4 - f_, -f_*0.5); }   // ears turn and flick
          legSwing(a, a.dest && a.state === 'idle' ? 0.35 : 0, 2.5);
          if (a.state === 'under'){ p.y += ((WATER_Y - 1.6*a.g.scale.y) - p.y)*Math.min(1, dt*2); if (a.timer <= 0){ a.state = 'idle'; a.timer = rnd(6, 12); } break; }
          if (pet && petD < 3.5 && a.state !== 'yawn' && !(a.cool > 0)){ a.state = 'yawn'; a.timer = 2.4; a.cool = 12; o.onScare && o.onScare('hippo'); sound('hippo', p); }
          a.cool = (a.cool || 0) - dt;
          const open = a.state === 'yawn' ? Math.sin(Math.min(1, (2.4 - a.timer)/2.4)*Math.PI) : 0;
          if (jaw) jaw.rotation.x = open*1.0; if (head) head.rotation.x = -open*0.45;
          if (a.state === 'yawn'){ if (a.timer <= 0){ a.state = 'idle'; a.timer = rnd(5, 10); } p.y += ((WATER_Y - 0.7*a.g.scale.y) - p.y)*Math.min(1, dt*3); break; }
          if (a.timer <= 0){ const r_ = Math.random(); if (r_ < 0.3){ a.state = 'yawn'; a.timer = 2.4; sound('hippo', p); } else if (r_ < 0.5){ a.state = 'under'; a.timer = rnd(4, 8); } else { a.dest = riverPt(a); a.timer = rnd(8, 14); } }
          if (a.dest) goTo(a, a.dest, 0.4, dt, (x, z) => world.isWater(x, z) && inZ(a, z), 1);
          p.y += ((WATER_Y - 0.95*a.g.scale.y + Math.sin(a.t*0.8)*0.03) - p.y)*Math.min(1, dt*2);
          break; }
        case 'capybara': {   // calm: grazes on the bank, has a swim, and doesn't mind the wombat at all
          const wet = world.isWater(p.x, p.z);
          if (a.chill > 0){ a.chill -= dt; if (pet) face(a, pet.x - p.x, pet.z - p.z, dt, 2); a.g.rotation.x += (-0.22 - a.g.rotation.x)*Math.min(1, dt*4);
            for (const n of ['BL', 'BR']){ const l = pt(a.g, 'capybara_leg' + n); if (l) l.rotation.x = -0.9; }
            if (!a.zzd && a.chill < 4){ a.zzd = true; o.onZzz && o.onZzz(p.clone().add(V3(0, 0.9, 0))); o.onSmile && o.onSmile(p.clone()); }
            if (a.chill <= 0){ a.zzd = false; for (const n of ['BL', 'BR']){ const l = pt(a.g, 'capybara_leg' + n); if (l) l.rotation.x = 0; } }
            p.y = wet ? WATER_Y - 0.36*a.g.scale.y : gy(p.x, p.z); break; }
          a.g.rotation.x += ((!a.dest && !wet ? 0.12 + Math.max(0, Math.sin(a.t*6))*0.03 : 0) - a.g.rotation.x)*Math.min(1, dt*3);   // nose down nibbling grass
          if (a.timer <= 0){ const r_ = Math.random(); a.timer = rnd(6, 12);
            if (r_ < 0.25){ a.dest = riverPt(a); a.state = 'swim'; } else if (r_ < 0.6){ a.dest = bankPt(a, Math.sign(p.x - world.riverX(p.z)) || 1); a.state = 'walk'; } else { a.state = 'rest'; if (pet && petD < 5) o.onZzz && o.onZzz(p.clone().add(V3(0, 0.6, 0))); } }
          if (a.dest && a.state !== 'rest'){ if (goTo(a, a.dest, 0.6, dt, (x, z) => inZ(a, z), 2)) a.dest = null; }
          legSwing(a, a.dest && a.state !== 'rest' ? (wet ? 0.6 : 0.45) : 0, wet ? 6 : 7);
          p.y = wet ? WATER_Y - 0.36*a.g.scale.y + Math.sin(a.t*1.2)*0.02 : gy(p.x, p.z);
          break; }
        case 'tortoise': {   // plods slowly, munches, pulls its head in when the wombat comes close
          const head = pt(a.g, 'tortoise_head'), shy = petD < 2.2 || a.shy > 0; a.shy = (a.shy || 0) - dt;
          if (head){ if (head.userData.z0 === undefined) head.userData.z0 = head.position.z; head.position.z += ((head.userData.z0 - (shy ? 0.12 : 0)) - head.position.z)*Math.min(1, dt*5); head.rotation.x = !shy && a.state === 'eat' ? 0.4 + Math.sin(a.t*6)*0.1 : 0; }
          if (a.timer <= 0){ a.timer = rnd(6, 14); if (Math.random() < 0.5){ a.state = 'eat'; } else { a.state = 'walk'; a.dest = p.clone().add(V3(rnd(-3, 3), 0, rnd(-3, 3))); } }
          let moving = false; if (!shy && a.state === 'walk' && a.dest){ moving = !goTo(a, a.dest, 0.12, dt, aOK(a), 0.6); }
          for (const n of ['FL', 'FR', 'BL', 'BR']){ const l = pt(a.g, 'tortoise_leg' + n); if (l) l.rotation.x = moving ? Math.sin(a.t*2.4 + (n === 'FL' || n === 'BR' ? 0 : Math.PI))*0.3 : 0; }
          p.y = gy(p.x, p.z);
          break; }
        case 'snake': {   // slithers through the grass flicking its tongue; slips away (hidden) when the wombat comes near
          if (a.state === 'hide'){ a.g.visible = false; if (a.timer <= 0 && petD > 6){ a.state = 'idle'; a.timer = rnd(2, 4); } break; }
          if (petD < 2.5 && a.state !== 'flee'){ a.state = 'flee'; a.timer = 1.4; a.dest = p.clone().addScaledVector(V3(p.x - pet.x, 0, p.z - pet.z).normalize(), 4); sound('hiss', p); }
          if (a.tongue) a.tongue.scale.setScalar(Math.sin(a.t*7) > 0.6 ? 1 : 0.01);
          if (a.state === 'flee'){ goTo(a, a.dest, 2.2, dt, () => true, 6); a.wave.value += dt*14; if (a.timer <= 0){ a.state = 'hide'; a.timer = rnd(10, 20); } p.y = gy(p.x, p.z); break; }
          if (a.timer <= 0){ a.timer = rnd(4, 9); if (Math.random() < 0.6){ a.state = 'move'; a.dest = p.clone().add(V3(rnd(-4, 4), 0, rnd(-4, 4))); } else a.state = 'idle'; }
          if (a.state === 'move' && a.dest){ const ok = (x, z) => !world.isWater(x, z) && world.slope(x, z) < 0.7; if (goTo(a, a.dest, 0.45, dt, ok, 1.5)) a.state = 'idle'; else a.wave.value += dt*4.5; }
          p.y = gy(p.x, p.z);
          break; }
        case 'peacock': {   // pecks about; spreads its tail into a shimmering fan when the wombat comes close (or when you tap it)
          const fan = pt(a.g, 'peacock_fan'), train = pt(a.g, 'peacock_train'), neck = pt(a.g, 'peacock_neck');
          if (petD < 4.5 && !(a.show > 0) && !(a.cool > 0)){ a.show = 6; a.cool = 15; sound('peacock', p); }
          if (Math.random() < dt*0.01) sound('peacock', p);
          a.show = (a.show || 0) - dt; a.cool = (a.cool || 0) - dt;
          const k = a.show > 0 ? Math.min(1, (6 - a.show)*2, a.show*2) : 0; a.fanK = (a.fanK || 0) + (k - (a.fanK || 0))*Math.min(1, dt*5);
          if (fan){ fan.visible = a.fanK > 0.02; fan.scale.setScalar(Math.max(0.02, a.fanK)); fan.rotation.y = Math.sin(a.t*18)*0.02*a.fanK; }
          if (train) train.visible = a.fanK < 0.5;
          if (a.show > 0 && pet){ face(a, pet.x - p.x, pet.z - p.z, dt, 2); break; }
          if (a.timer <= 0){ a.timer = rnd(3, 7); if (Math.random() < 0.5){ a.state = 'walk'; a.dest = areaLand(a.area); } else a.state = 'peck'; }
          if (neck) neck.rotation.x = a.state === 'peck' ? Math.max(0, Math.sin(a.t*5))*1.1 : 0;
          if (a.state === 'walk' && a.dest && goTo(a, a.dest, 0.6, dt, aOK(a), 3)) a.state = 'peck';
          p.y = gy(p.x, p.z) + (a.state === 'walk' ? Math.abs(Math.sin(a.t*7))*0.02 : 0);
          break; }
        case 'koala': {
          const kh = a.g.userData.head; if (kh && Math.sin(a.t*0.5) > 0.6) kh.rotation.x = 0.25 + Math.sin(a.t*8)*0.06; else if (kh) kh.rotation.x *= 0.9;   // munching eucalyptus leaves
          if (a.perch){ p.set(a.perch.x + 0.38*Math.sin(a.perch.ry || 0), gy(a.perch.x, a.perch.z) + 1.25*a.perch.s, a.perch.z + 0.38*Math.cos(a.perch.ry || 0)); a.g.rotation.y = (a.perch.ry || 0) + Math.PI; }
          a.g.userData.head.rotation.y = Math.sin(a.t*0.4)*0.4;
          if (a.timer <= 0){ a.timer = rnd(6, 12); if (Math.random() < 0.5) o.onZzz && o.onZzz(p.clone().add(V3(0, 0.9, 0))); }
          break; }
      }
      if (BIRD_LEGS.includes(a.kind) || AUTO_LEGS4.includes(a.kind)) autoLegs(a, dt);
    }
  };
  F.poke = a => {
    const p = a.g.position;
    switch (a.kind){
      case 'frog': a.croak = 1.2; sound('croak', p); break;
      case 'kangaroo': if (a.state !== 'hop'){ a.timer = 0; } break;
      case 'croc': a.snap = 0.6; sound('snap', p); break;
      case 'heron': a.stab = 0.6; break;
      case 'beaver': a.g.userData.tail.rotation.x = -1; sound('splash', p); break;
      case 'emu': a.peck = 0.8; break;
      case 'deer': a.state = 'run'; a.timer = 2.5; a.dest = p.clone().add(V3(rnd(-6, 6), 0, rnd(-6, 6))); break;
      case 'wolf': a.state = 'howl'; a.timer = 3; sound('howl', p); break;
      case 'horse': a.state = 'run'; a.timer = 2.5; a.dest = p.clone().add(V3(rnd(-6, 6), 0, rnd(-6, 6))); break;
      case 'tiger': a.state = 'warn'; a.timer = 2; sound('roar', p); break;
      case 'hippo': a.state = 'yawn'; a.timer = 2.4; sound('hippo', p); break;
      case 'tortoise': a.shy = 3; break;
      case 'snake': sound('hiss', p); a.state = 'flee'; a.timer = 1.4; a.dest = p.clone().add(V3(rnd(-4, 4), 0, rnd(-4, 4))); break;
      case 'peacock': a.show = 6; a.cool = 10; sound('peacock', p); break;
      case 'crane': a.state = 'dance'; a.timer = 5; sound('crane', p); break;
      case 'monkey': if (a.state !== 'up'){ a.state = 'climb'; a.from = p.clone(); a.st = 0; } sound('monkey', p); break;
      case 'capybara': a.state = 'rest'; a.timer = 7; a.dest = null; a.chill = 6; a.zzd = false; sound('capy', p); break;
      case 'turtle': a.shy = 3; if (a.state === 'sun'){ a.state = 'idle'; a.timer = 10; } break;
    }
    return a.kind;
  };
  return F;
}
