// Sea and sky life, using the Blender animals (assets/models/animals.glb): seagulls over the beach, a pod of dolphins
// leaping and spinning, a whale that surfaces and spouts now and then, colourful sea fish in the shallows,
// owls in the trees at night, eagles circling by day (sometimes landing on a tree) and lizards basking on rocks.
import * as THREE from 'three';
import { WATER_Y, X0, X1, Z0, Z1 } from './world.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a)*t;
const rnd = (a, b) => a + Math.random()*(b - a);
const wrapA = a => { while (a > Math.PI) a -= 2*Math.PI; while (a < -Math.PI) a += 2*Math.PI; return a; };
export const WILD_NAMES = {fish:'河裡的魚', gull:'海鷗', dolphin:'海豚', whale:'鯨魚', owl:'貓頭鷹', eagle:'老鷹', lizard:'蜥蜴', seafish:'熱帶魚'};

export function createWildlife({scene, world, clone, hbMat, fx, lod}){
  const L = {list:[], pick:[]}, group = new THREE.Group(); scene.add(group);
  const gy = world.gy, shore = world.shoreX;
  const part = (g, n) => g.getObjectByName(n);
  function add(kind, g, o = {}){
    group.add(g); const hb = new THREE.Mesh(new THREE.SphereGeometry(o.hit || 0.6, 8, 6), hbMat); hb.userData.kind = 'animal'; hb.position.y = o.hitY || 0; g.add(hb);
    const a = {kind, g, hb, t:Math.random()*10, timer:rnd(1, 5), state:'idle', ...o}; hb.userData.ref = a; L.list.push(a); L.pick.push(hb); return a;
  }
  // wings: flapping rotates them about the body axis; folding swings them back along the body (as birds do when they rest)
  const flap = (a, speed, amp, glide = 0) => { const w = Math.sin(a.t*speed)*amp*(1 - glide) + glide*0.08, l = part(a.g, a.kind + '_wingL'), r = part(a.g, a.kind + '_wingR');
    a.fold = Math.max(0, (a.fold || 0) - 0.08); if (l) l.rotation.set(0, 1.45*a.fold, w*(1 - a.fold)); if (r) r.rotation.set(0, -1.45*a.fold, -w*(1 - a.fold)); };
  const fold = a => { a.fold = Math.min(1, (a.fold || 0) + 0.1); const l = part(a.g, a.kind + '_wingL'), r = part(a.g, a.kind + '_wingR'); if (l) l.rotation.set(0, 1.45*a.fold, -0.12*a.fold); if (r) r.rotation.set(0, -1.45*a.fold, 0.12*a.fold); };
  const faceDir = (a, dx, dz, dt, k = 3) => { a.g.rotation.y += clamp(wrapA(Math.atan2(dx, dz) - a.g.rotation.y), -k*dt, k*dt); };

  // seagulls circling over the beach, sometimes landing on the sand
  for (let i=0;i<4;i++){ const g = clone('gull'); if (!g) break; g.scale.setScalar(1.6); const z = rnd(Z0 + 6, Z1 - 6);
    g.position.set(shore(z), rnd(4, 7), z); add('gull', g, {hit:0.6, cz:z, rad:rnd(4, 8), h:rnd(4, 7), ang:rnd(0, 6.28), dir:Math.random() < 0.5 ? 1 : -1}); }
  // a pod of dolphins (they swim by every minute or two)
  const pod = []; for (let i=0;i<3;i++){ const g = clone('dolphin'); if (!g) break; g.visible = false; pod.push(add('dolphin', g, {hit:1.2, idx:i})); }
  let podT = rnd(15, 40), podRun = null;
  // a whale far out at sea
  const whaleG = clone('whale'), whale = whaleG ? add('whale', whaleG, {hit:4}) : null; if (whale){ whaleG.visible = false; }
  let whaleT = rnd(40, 90), whaleRun = null;
  // tropical fish in the shallows
  const SEA_LOOKS = [['#2f7fd8', '#f3d250', '#f3d250'], ['#f3d250', '#2a2a2a', '#f3d250'], ['#f08a3c', '#ffffff', '#ffffff'], ['#9b6fc4', '#f3d250', '#f2a6be'], ['#3fc0b0', '#ffffff', '#2f7fd8']];
  for (let i=0;i<8;i++){ const [b, s, f] = SEA_LOOKS[i % SEA_LOOKS.length], g = clone('fish', {FishBody:b, FishSpot:s, FishFin:f}); if (!g) break; g.scale.setScalar(1.5);
    const z = rnd(Z0 + 4, Z1 - 4); g.position.set(shore(z) + rnd(3.5, 7), WATER_Y - 0.25, z); add('seafish', g, {hit:0.4, tail:part(g, 'fish_tail'), cz:z, cx:g.position.x, ang:rnd(0, 6.28), sp:rnd(0.3, 0.6)}); }
  // owls (night) and eagles (day) use the trees game.js passes in; lizards use the rocks
  for (let i=0;i<2;i++){ const g = clone('owl'); if (!g) break; g.scale.setScalar(1.5); g.visible = false; add('owl', g, {hit:0.5, hitY:0.3, perch:null}); }
  for (let i=0;i<2;i++){ const g = clone('eagle'); if (!g) break; g.scale.setScalar(2.2); add('eagle', g, {hit:1.2, cx:rnd(-20, 10), cz:rnd(-30, 10), rad:rnd(7, 12), h:rnd(10, 14), ang:rnd(0, 6.28)}); }
  for (let i=0;i<4;i++){ const g = clone('lizard'); if (!g) break; g.scale.setScalar(2.2); g.visible = false; add('lizard', g, {hit:0.4, rock:null, tail:part(g, 'lizard_tail')}); }
  let trees = [], rocks = [];
  L.setPlaces = (treeList, rockList) => { trees = treeList; rocks = rockList;
    L.list.forEach(a => { if (a.kind === 'owl' && (!a.perch || !trees.includes(a.perch))) a.perch = trees[Math.floor(Math.random()*trees.length)] || null;
      if (a.kind === 'lizard' && (!a.rock || !rocks.includes(a.rock))) a.rock = rocks.length ? rocks[Math.floor(Math.random()*rocks.length)] : null; }); };

  L.update = (dt, t, o) => {
    const cam = o.cam, pet = o.pet, night = o.night > 0.6;
    // a pod passes by: all dolphins travel together along the coast, leaping in turn
    if (pod.length){ podT -= dt;
      if (!podRun && podT <= 0){ const dir = Math.random() < 0.5 ? 1 : -1; podRun = {dir, z:dir > 0 ? Z0 - 10 : Z1 + 10, x:0}; pod.forEach((a, i) => { a.g.visible = true; a.ph = i*0.9; a.spin = 0; }); }
      if (podRun){ podRun.z += podRun.dir*dt*3.2;
        pod.forEach((a, i) => { const z = podRun.z - podRun.dir*i*2.2, x = shore(z) + 10 + i*1.6, u = (t*0.55 + a.ph) % 1, jump = u < 0.4 ? Math.sin(u/0.4*Math.PI) : 0;
          if (u < 0.02 && !a.leapt){ a.leapt = true; a.flip = Math.random() < 0.35; if (Math.hypot(x - cam.x, z - cam.z) < 40) fx.splash(V3(x, WATER_Y, z), 0.8); }
          if (u > 0.5) a.leapt = false;
          a.g.position.set(x, WATER_Y - 0.5 + jump*2.2, z); a.g.rotation.set(-Math.cos(u/0.4*Math.PI)*0.6*(u < 0.4 ? 1 : 0), podRun.dir > 0 ? 0 : Math.PI, a.flip && u < 0.4 ? u/0.4*Math.PI*2 : 0, 'YXZ');
          const tail = part(a.g, 'dolphin_tail'); if (tail) tail.rotation.x = Math.sin(t*8 + i)*0.3;
          if (u > 0.38 && u < 0.4 && Math.hypot(x - cam.x, z - cam.z) < 40) fx.splash(V3(x, WATER_Y, z), 0.6); });
        if ((podRun.dir > 0 && podRun.z > Z1 + 14) || (podRun.dir < 0 && podRun.z < Z0 - 14)){ podRun = null; podT = rnd(60, 120); pod.forEach(a => a.g.visible = false); } } }
    // the whale: rises, spouts a few times, then dives showing its tail
    if (whale){ whaleT -= dt;
      if (!whaleRun && whaleT <= 0){ const z = rnd(Z0 + 5, Z1 - 5); whaleRun = {t:0, x:shore(z) + rnd(22, 30), z, ry:Math.random() < 0.5 ? 0 : Math.PI}; whaleG.visible = true; }
      if (whaleRun){ const w = whaleRun; w.t += dt; const T = w.t;
        const rise = T < 3 ? T/3 : T < 12 ? 1 : 0, dive = T >= 12 ? Math.min(1, (T - 12)/4) : 0;
        whaleG.position.set(w.x, WATER_Y - 1.9 + rise*1.35 - dive*2.5, w.z + (w.ry ? -1 : 1)*T*0.5);
        whaleG.rotation.set(dive*0.6, w.ry, 0, 'YXZ');
        const tail = part(whaleG, 'whale_tail'); if (tail) tail.rotation.x = -dive*1.2 + Math.sin(T)*0.1;
        if (T > 3 && T < 12 && Math.floor(T/2.6) !== w.lastSpout){ w.lastSpout = Math.floor(T/2.6); const head = whaleG.position.clone().add(V3(0, 1.0, (w.ry ? 1 : -1)*-2.4)); fx.spout(head); o.onSound && o.onSound('spout', whaleG.position); }
        if (T > 17){ whaleRun = null; whaleT = rnd(120, 240); whaleG.visible = false; } } }
    for (const a of L.list){
      const p = a.g.position; a.t += dt; a.timer -= dt;
      if (a.kind === 'dolphin' || a.kind === 'whale') continue;
      const camD = Math.hypot(p.x - cam.x, p.z - cam.z), far = camD > 70; lod && lod(a.g, camD < 24); if (far && a.kind !== 'eagle'){ if (a.kind !== 'owl' && a.kind !== 'lizard') a.g.visible = false; continue; }
      const petD = pet ? Math.hypot(p.x - pet.x, p.z - pet.z) : 99;
      switch (a.kind){
        case 'gull': {
          a.g.visible = true;
          if (a.state === 'land'){ fold(a); a.g.rotation.z = 0;
            if (a.timer <= 0 || petD < 3){ a.state = 'idle'; a.timer = rnd(10, 25); if (petD < 3) o.onSound && o.onSound('gull', p); }
            else if (Math.random() < dt*0.4){ a.g.rotation.y += rnd(-1, 1); } break; }
          a.ang += a.dir*dt*0.35; const x = shore(a.cz) + Math.cos(a.ang)*a.rad - 1, z = a.cz + Math.sin(a.ang)*a.rad*1.5;
          if (a.state === 'down'){ const tx = shore(p.z) - rnd(1, 3); p.x += (tx - p.x)*dt; p.y += (gy(p.x, p.z) - p.y)*dt*1.5; flap(a, 9, 0.5); if (p.y - gy(p.x, p.z) < 0.08){ a.state = 'land'; a.timer = rnd(6, 14); } break; }
          const nx = x - p.x, nz = z - p.z; p.x += nx*dt*2; p.z += nz*dt*2; p.y += (a.h + Math.sin(a.t*0.7)*0.6 - p.y)*dt; faceDir(a, nx, nz, dt, 4);
          a.g.rotation.z = -a.dir*0.3; flap(a, 7, 0.55, (Math.sin(a.t*0.5) > 0.2) ? 1 : 0);
          if (Math.random() < dt*0.05) o.onSound && o.onSound('gull', p);
          if (a.timer <= 0){ a.timer = rnd(12, 30); if (Math.random() < 0.4 && world.isOpen(shore(p.z) - 2, p.z)) { a.state = 'down'; a.g.rotation.z = 0; } }
          break; }
        case 'seafish': {
          a.ang += dt*a.sp*0.4; const x = a.cx + Math.cos(a.ang)*1.6, z = a.cz + Math.sin(a.ang*0.7)*2.5;
          const d = V3(x - p.x, 0, z - p.z); p.x = x; p.z = z; if (d.lengthSq() > 1e-6) a.g.rotation.y = Math.atan2(d.x, d.z);
          p.y = WATER_Y - 0.25 + Math.sin(a.t)*0.04; a.g.visible = true; if (a.tail) a.tail.rotation.y = Math.sin(a.t*10)*0.5;
          break; }
        case 'owl': {
          a.g.visible = night && !!a.perch;
          if (!a.iris){ a.iris = []; a.g.traverse(m => { if (m.isMesh && /^Iris/.test(m.material.name || '')) a.iris.push(m.material); }); }
          a.iris.forEach(m => { if (m.emissive){ m.emissive.set('#ffb020'); m.emissiveIntensity = night ? 1.5 : 0; } });   // eyes glow in the dark
          if (!a.g.visible) break;
          const tr = a.perch; p.set(tr.x + Math.sin(tr.ry || 0)*0.25*tr.s, gy(tr.x, tr.z) + (tr.euc ? 3.25 : 2.85)*tr.s, tr.z + Math.cos(tr.ry || 0)*0.25*tr.s);   // on the treetop
          a.g.rotation.y = Math.atan2(cam.x - p.x, cam.z - p.z);   // owls keep an eye on you
          const head = part(a.g, 'owl_head'); if (head){ if (a.timer <= 0){ a.timer = rnd(2, 6); a.look = rnd(-1.6, 1.6); if (Math.random() < 0.3) o.onSound && o.onSound('hoot', p); } head.rotation.y += ((a.look || 0) - head.rotation.y)*Math.min(1, dt*4); }
          break; }
        case 'eagle': {
          a.g.visible = !night;
          if (a.state === 'perch'){ const tr = a.perch; if (!tr || !trees.includes(tr)){ a.state = 'idle'; break; }
            p.set(tr.x, gy(tr.x, tr.z) + (tr.euc ? 3.4 : 2.9)*tr.s + 0.45, tr.z); fold(a); a.g.rotation.x = 0; a.g.rotation.z = 0;
            if (a.timer <= 0 || petD < 4){ a.state = 'idle'; a.timer = rnd(20, 40); o.onSound && o.onSound('eagle', p); } break; }
          if (a.state === 'toTree'){ const tr = a.perch, top = V3(tr.x, gy(tr.x, tr.z) + (tr.euc ? 3.4 : 2.9)*tr.s, tr.z), d = top.clone().sub(p);
            if (d.length() < 0.3){ a.state = 'perch'; a.timer = rnd(10, 22); break; } p.addScaledVector(d.normalize(), Math.min(d.length(), dt*4)); faceDir(a, d.x, d.z, dt, 3); flap(a, 5, 0.4); break; }
          a.ang += dt*0.22; const x = a.cx + Math.cos(a.ang)*a.rad, z = a.cz + Math.sin(a.ang)*a.rad, nx = x - p.x, nz = z - p.z;
          p.x += nx*dt*1.5; p.z += nz*dt*1.5; p.y += (a.h - p.y)*dt*0.5; faceDir(a, nx, nz, dt, 2); a.g.rotation.z = -0.35; flap(a, 3, 0.25, Math.sin(a.t*0.3) > -0.3 ? 1 : 0);
          if (a.timer <= 0){ a.timer = rnd(25, 50); if (trees.length && Math.random() < 0.5){ a.perch = trees[Math.floor(Math.random()*trees.length)]; a.state = 'toTree'; a.g.rotation.z = 0; } else { a.cx = rnd(X0 + 8, X1 - 8); a.cz = rnd(Z0 + 8, Z1 - 8); } }
          if (Math.random() < dt*0.03) o.onSound && o.onSound('eagle', p);
          break; }
        case 'lizard': {
          const r = a.rock; a.g.visible = !night && !!r && a.state !== 'hidden';
          if (!r) break;
          if (a.state === 'hidden'){ if (a.timer <= 0){ a.state = 'idle'; } break; }
          if (petD < 2.5 && a.state !== 'flee'){ a.state = 'flee'; a.timer = 0.8; o.onSound && o.onSound('scurry', p); }
          const top = V3(r.x + (a.off || 0.2), r.y, r.z); if (!a.off){ a.off = rnd(-0.3, 0.3); }
          if (a.state === 'flee'){ p.x += Math.sin(a.g.rotation.y)*dt*4; p.z += Math.cos(a.g.rotation.y)*dt*4; if (a.timer <= 0){ a.state = 'hidden'; a.timer = rnd(8, 15); } break; }
          p.copy(top); if (a.timer <= 0){ a.timer = rnd(2, 6); a.g.rotation.y += rnd(-1.2, 1.2); }
          if (a.tail) a.tail.rotation.y = Math.sin(a.t*2)*0.25;
          break; }
      }
    }
  };
  L.force = k => { if (k === 'pod') podT = 0; if (k === 'whale') whaleT = 0; };   // for testing
  L.poke = a => {
    if (a.kind === 'owl') { const h = part(a.g, 'owl_head'); if (h) h.rotation.y = Math.PI*0.9; }
    if (a.kind === 'lizard'){ a.state = 'flee'; a.timer = 0.8; }
    if (a.kind === 'gull' && a.state === 'land'){ a.state = 'idle'; a.timer = 20; }
    return a.kind;
  };
  return L;
}
