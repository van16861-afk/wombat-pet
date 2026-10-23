// Sea, sky and small life, using the Blender animals (assets/models/animals.glb): seagulls over the beach, a pod of dolphins
// leaping and spinning, a whale that surfaces and spouts now and then, colourful sea fish in the shallows, owls in the trees
// at night, eagles by day (soaring, perching on trees, spreading their wings, diving on rabbits, beetles and worms),
// wild rabbits round their burrows, beetles on tree trunks and rocks, earthworms after the rain and lizards on the rocks.
import * as THREE from 'three';
import { WATER_Y, X0, X1, Z0, Z1, plotKey } from './world.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a)*t;
const rnd = (a, b) => a + Math.random()*(b - a);
const wrapA = a => { while (a > Math.PI) a -= 2*Math.PI; while (a < -Math.PI) a += 2*Math.PI; return a; };
const SIDES = [[1, 'L'], [-1, 'R']];
export const WILD_NAMES = {cicada:'蟬', mantis:'螳螂', longhorn:'天牛', grasshopper:'蚱蜢', cricket:'蟋蟀', fish:'河裡的魚', gull:'海鷗', dolphin:'海豚', whale:'鯨魚', owl:'貓頭鷹', eagle:'老鷹', lizard:'蜥蜴', seafish:'熱帶魚', rabbit:'野兔', beetle:'甲蟲', worm:'蚯蚓'};

export function createWildlife({scene, world, clone, real, hbMat, fx, lod, mat}){
  const L = {list:[], pick:[]}, group = new THREE.Group(); scene.add(group);
  const gy = world.gy, shore = world.shoreX;
  const part = (g, n) => { const c = g.userData.parts || (g.userData.parts = {}); if (!(n in c)) c[n] = g.getObjectByName(n) || null; return c[n]; };
  function add(kind, g, o = {}){
    group.add(g); const hb = new THREE.Mesh(new THREE.SphereGeometry(o.hit || 0.6, 8, 6), hbMat); hb.userData.kind = 'animal'; hb.position.y = o.hitY || 0; g.add(hb);
    const a = {kind, g, hb, t:Math.random()*10, timer:rnd(1, 5), state:'idle', ...o}; hb.userData.ref = a; L.list.push(a); L.pick.push(hb); return a;
  }
  // Wings. Gulls and eagles have two-part wings (shoulder + wrist): `f` folds them the way birds do (the arm tucks in, the wing
  // turns on edge against the body and the hand lies back along it); `flapZ` beats them; `flex` bends the hand during a beat;
  // `sweep` pulls them back (diving) or forward (negative: flaring to land). The owl's small wings just swing back.
  const wingPose = (a, flapZ, f = 0, flex = 0, sweep = 0) => {
    for (const [sd, n] of SIDES){
      const w = part(a.g, a.kind + '_wing' + n); if (!w) continue;
      const h = part(a.g, a.kind + '_hand' + n);
      if (!h){ w.rotation.set(0, sd*1.45*f, sd*(flapZ*(1 - f) - 0.12*f)); continue; }
      const arm = part(a.g, a.kind + '_wing' + n + '_feather');
      if (h.userData.x0 === undefined){ h.userData.x0 = h.position.x; if (arm) arm.userData.sx = arm.scale.x; }
      const k = 1 - 0.6*f; h.position.x = h.userData.x0*k; if (arm) arm.scale.x = arm.userData.sx*k;
      w.rotation.order = 'YXZ'; w.rotation.set(-Math.PI/2*f, sd*(0.25*f + sweep*(1 - f)), sd*flapZ*(1 - f));
      h.rotation.set(0, 0, sd*(1.75*f + flex*(1 - f) + sweep*0.6*(1 - f)));
      const q = part(a.g, a.kind + '_quills' + n); if (q){ if (q.userData.sz === undefined) q.userData.sz = q.scale.z; q.scale.z = q.userData.sz*(1 - 0.7*f); }   // the spread primaries close up as the wing folds
    }
  };
  const ease = (a, key, to, k, dt) => { a[key] = (a[key] ?? to) + (to - (a[key] ?? to))*Math.min(1, k*dt); return a[key]; };
  const faceDir = (a, dx, dz, dt, k = 3) => { a.g.rotation.y += clamp(wrapA(Math.atan2(dx, dz) - a.g.rotation.y), -k*dt, k*dt); };
  const camNear = (p, cam, r = 40) => Math.hypot(p.x - cam.x, p.z - cam.z) < r;
  const landOK = (x, z) => world.inWorld(x, z) && !world.isWater(x, z) && world.slope(x, z) < 0.5 && gy(x, z) > WATER_Y + 0.25;

  // seagulls circling over the beach, sometimes landing on the sand
  for (let i=0;i<4;i++){ const g = clone('gull'); if (!g) break; g.scale.setScalar(1.6); g.rotation.order = 'YXZ'; const z = rnd(Z0 + 6, Z1 - 6);
    g.position.set(shore(z), rnd(4, 7), z); add('gull', g, {hit:0.6, hitY:0.3, cz:z, rad:rnd(4, 8), h:rnd(4, 7), ang:rnd(0, 6.28), dir:Math.random() < 0.5 ? 1 : -1}); }
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
  // owls (night) and eagles (day) use the trees game.js passes in; lizards and some beetles use the rocks
  for (let i=0;i<2;i++){ const g = (real && real('owl')) || clone('owl'); if (!g) break; g.scale.setScalar(g.userData.mixer ? 1 : 1.5); g.visible = false; add('owl', g, {hit:0.5, hitY:0.3, perch:null}); }
  for (let i=0;i<2;i++){ const g = clone('eagle'); if (!g) break; g.scale.setScalar(1.9); g.rotation.order = 'YXZ'; g.position.set(rnd(-20, 10), 12, rnd(-30, 10));
    add('eagle', g, {hit:1.2, state:'soar', cx:rnd(-20, 10), cz:rnd(-30, 10), rad:rnd(7, 12), h:rnd(10, 14), ang:rnd(0, 6.28), timer:rnd(8, 20)}); }
  for (let i=0;i<4;i++){ const g = clone('lizard'); if (!g) break; g.scale.setScalar(2.2); g.visible = false; add('lizard', g, {hit:0.4, rock:null, tail:part(g, 'lizard_tail')}); }

  // wild rabbits: two warrens on open grassland, a few rabbits each
  const warrens = [];
  if (clone('rabbit')) for (let tries = 0; tries < 400 && warrens.length < 2; tries++){
    const x = rnd(X0 + 6, X1 - 6), z = rnd(Z0 + 6, Z1 - 6);
    if (!landOK(x, z) || Math.hypot(x, z) < 12 || ['pond', 'swamp', 'high', 'beaver'].some(k => world.inBio(k, x, z)) || warrens.some(w => Math.hypot(w.x - x, w.z - z) < 20)) continue;
    const y = gy(x, z), m = new THREE.Group();
    const mound = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 8, 0, Math.PI*2, 0, Math.PI/2), mat('#7d6040', 1)); mound.scale.set(1, 0.32, 1); m.add(mound);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.2, 16), mat('#1c140d', 1)); hole.scale.y = 0.75; hole.position.set(0, 0.1, 0.45); hole.rotation.x = -0.35; m.add(hole);
    m.position.set(x, y - 0.02, z); m.rotation.y = rnd(0, 6.28); group.add(m);
    const door = m.localToWorld(V3(0, 0, 0.6)); door.y = gy(door.x, door.z); warrens.push({x, z, door});
  }
  warrens.forEach(w => { for (let i=0;i<3;i++){ const g = clone('rabbit'); g.scale.setScalar(1.3); g.position.set(w.door.x + rnd(-2, 2), 0, w.door.z + rnd(-2, 2));
    if (!landOK(g.position.x, g.position.z)) g.position.copy(w.door); g.position.y = gy(g.position.x, g.position.z);
    add('rabbit', g, {hit:0.4, hitY:0.25, home:w, state:'graze', timer:rnd(1, 4), earL:part(g, 'rabbit_earL'), earR:part(g, 'rabbit_earR')}); } });
  // beetles: rhinoceros and stag beetles on tree trunks, green scarabs on rocks
  const BEETLES = ['rhino', 'stag', 'rhino', 'stag', 'green', 'green', 'green'];
  BEETLES.forEach((k, i) => { const g = clone('beetle_' + k); if (!g) return; g.scale.setScalar(2.4); g.rotation.order = 'YXZ'; g.visible = false;
    add('beetle', g, {hit:0.3, hitY:0.05, sort:k, bug:true, sp:k, hab:i < 4 ? 'tree' : 'rock', onTree:i < 4, spot:null, state:'away', timer:0}); });
  // more insects: cicadas and longhorn beetles on trunks, praying mantises on bushes, grasshoppers and crickets in the grass.
  // A plot never has more than two kinds of insect at once.
  for (const [k, hab, n] of [['cicada', 'tree', 3], ['longhorn', 'tree', 2], ['mantis', 'bush', 4], ['grasshopper', 'ground', 4], ['cricket', 'ground', 3]])
    for (let i=0;i<n;i++){ const g = clone('bug_' + k); if (!g) break; g.scale.setScalar(2.6); g.rotation.order = 'YXZ'; g.visible = false;
      if (k === 'mantis') g.scale.setScalar(3.6);   // bigger, so it can be spotted on a green bush
      add(k, g, {hit:0.3, hitY:0.05, bug:true, sp:k, hab, onTree:hab === 'tree', spot:null, state:'away', timer:rnd(0, 3)}); }
  // earthworms come up after rain (built here: a soft tube that wriggles in the vertex shader)
  const wormGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.4, 8, 24, false); wormGeo.rotateZ(Math.PI/2);
  { const p = wormGeo.attributes.position; for (let i=0;i<p.count;i++){ const x = p.getX(i), k = 1 - Math.pow(Math.abs(x)/0.2, 6)*0.8; p.setY(i, p.getY(i)*k); p.setZ(i, p.getZ(i)*k); } wormGeo.computeVertexNormals(); }
  const wormMat = () => { const m = new THREE.MeshStandardMaterial({color:'#b5705f', roughness:0.35}); m.userData.u = {value:0};
    m.onBeforeCompile = s => { s.uniforms.uT = m.userData.u; s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT;').replace('#include <begin_vertex>',
      `#include <begin_vertex>\nfloat ww = sin(position.x*16.0 - uT*5.0); transformed.z += ww*0.035; transformed.y += max(0.0, cos(position.x*16.0 - uT*5.0))*0.008;
       if (abs(position.x + 0.09) < 0.025) transformed.yz *= 1.18;`);
    }; return m; };
  for (let i=0;i<3;i++){ const m = wormMat(), w = new THREE.Mesh(wormGeo, m), g = new THREE.Group(); g.add(w); w.position.y = 0.02; g.visible = false;
    add('worm', g, {hit:0.3, hitY:0.05, mat:m, state:'off', timer:rnd(2, 10)}); }

  let trees = [], rocks = [], bushes = [];
  let wildTrees = [];   // trees on locked plots: insects can live there, owls and eagles keep to the yard's trees
  L.setPlaces = (treeList, rockList, bushList, wildList) => { trees = treeList; rocks = rockList; bushes = bushList || []; wildTrees = wildList || [];
    L.list.forEach(a => { if (a.kind === 'owl' && (!a.perch || !trees.includes(a.perch))) a.perch = trees[Math.floor(Math.random()*trees.length)] || null;
      if (a.kind === 'lizard' && (!a.rock || !rocks.includes(a.rock))){   // one lizard per rock (they bask near each other in real life, but never inside each other)
        const free = rocks.filter(r => !L.list.some(b => b !== a && b.kind === 'lizard' && b.rock === r)); a.rock = free.length ? free[Math.floor(Math.random()*free.length)] : null; }
      if (a.bug && a.hab !== 'ground' && a.spot && !(a.hab === 'tree' ? [...trees, ...wildTrees] : a.hab === 'rock' ? rocks : bushes).includes(a.spot)) placeBeetle(a); }); };
  // the kinds of insect in a plot right now (beetle sorts count separately)
  const bugKinds = (k, me) => new Set(L.list.filter(b => b.bug && b !== me && b.spot && b.state !== 'away' && b.plot === k).map(b => b.sp));
  function placeBeetle(a){
    let list = a.hab === 'tree' ? [...trees, ...wildTrees].filter(t => !t.swamp) : a.hab === 'rock' ? rocks : a.hab === 'bush' ? bushes : null;
    if (!list){ list = []; for (let i=0;i<30;i++){ const x = rnd(X0 + 2, X1 - 2), z = rnd(Z0 + 2, Z1 - 2); if (landOK(x, z)) list.push({x, z}); } }
    const ok = list.filter(s => { const k = plotKey(s.x, s.z), ks = bugKinds(k, a); return k && (ks.has(a.sp) || ks.size < 2); });
    a.spot = ok.length ? ok[Math.floor(Math.random()*ok.length)] : null; a.plot = a.spot ? plotKey(a.spot.x, a.spot.z) : null;
    a.ang = rnd(0, 6.28); a.hgt = rnd(0.45, 1.1); a.state = a.spot ? 'crawl' : 'away'; a.timer = a.spot ? rnd(1, 4) : rnd(10, 20); a.g.position.y = -50; a.tappedOnce = false; a.hop = null;
    if (a.spot && a.hab === 'ground') a.home = {x:a.spot.x, z:a.spot.z};
  }
  const eagleTop = tr => gy(tr.x, tr.z) + (tr.euc ? 3.4 : 2.9)*tr.s;
  const FOOT = 0.47;   // eagle hip-to-toe at its scale
  const preyList = () => L.list.filter(b => (b.kind === 'rabbit' && b.g.visible && !b.carried && !['hidden', 'gone', 'flee'].includes(b.state)) ||
    (b.kind === 'worm' && b.state === 'out') || (b.bug && !b.onTree && b.hab !== 'bush' && b.spot && b.state === 'crawl' && b.g.visible));

  // ---------- eagle: soar, perch, take off, land, spread its wings, and hunt ----------
  function eagle(a, dt, o){
    const p = a.g.position, pet = o.pet, cam = o.cam, head = part(a.g, 'eagle_head'), legs = part(a.g, 'eagle_legs'), tail = part(a.g, 'eagle_tail');
    const petD = pet ? Math.hypot(p.x - pet.x, p.z - pet.z) : 99;
    let pitch = 0, roll = 0, legX = 1.25, tailS = 1, headX = 0;
    a.st = (a.st || 0) + dt;
    const go = s => { a.state = s; a.st = 0; };
    switch (a.state){
      case 'soar': {
        a.ang += dt*0.22*(a.rdir || 1); const x = a.cx + Math.cos(a.ang)*a.rad, z = a.cz + Math.sin(a.ang)*a.rad, nx = x - p.x, nz = z - p.z;
        p.x += nx*dt*1.5; p.z += nz*dt*1.5; p.y += (a.h - p.y)*dt*0.5; faceDir(a, nx, nz, dt, 2); roll = -0.35*(a.rdir || 1);
        const glide = Math.sin(a.t*0.3) > -0.3 || p.y > a.h + 0.5; wingPose(a, glide ? 0.06 : Math.sin(a.t*3.2)*0.45, 0, glide ? -0.05 : Math.sin(a.t*3.2 - 0.6)*0.35);
        if (a.carry && a.st > 9){ a.carry.drop = true; a.carry = null; }
        if (a.timer <= 0){
          a.timer = rnd(14, 28); const prey = preyList().filter(b => Math.hypot(b.g.position.x - p.x, b.g.position.z - p.z) < 28), roll_ = Math.random();
          if (!a.carry && prey.length && roll_ < 0.45){ a.prey = prey[Math.floor(Math.random()*prey.length)]; go('stoop'); o.onSound && o.onSound('eagle', p);
            if (a.prey.kind === 'rabbit') a.prey.spotted = Math.random() < 0.6 ? a : null; }   // most rabbits notice the shadow in time
          else if (!a.carry && trees.length && roll_ < 0.8){ a.perch = trees[Math.floor(Math.random()*trees.length)]; go('toTree'); }
          else { a.cx = rnd(X0 + 8, X1 - 8); a.cz = rnd(Z0 + 8, Z1 - 8); a.rdir = Math.random() < 0.5 ? 1 : -1; }
        }
        if (Math.random() < dt*0.03) o.onSound && o.onSound('eagle', p);
        break; }
      case 'toTree': case 'stoop': {
        const tgt = a.state === 'toTree' ? (trees.includes(a.perch) ? V3(a.perch.x, eagleTop(a.perch) + FOOT, a.perch.z) : null)
          : (a.prey && (a.prey.g.visible || a.prey.kind !== 'rabbit') ? a.prey.g.position.clone().setY(gy(a.prey.g.position.x, a.prey.g.position.z) + FOOT) : null);
        if (!tgt){ go('soar'); a.timer = rnd(5, 10); break; }
        const d = tgt.clone().sub(p), hd = Math.hypot(d.x, d.z);
        if (d.length() < 3.2){ a.land = tgt; a.landFrom = p.clone(); a.toGround = a.state === 'stoop'; go('land'); break; }
        const sp = a.state === 'stoop' ? 9 : 5, aim = a.state === 'stoop' ? tgt.clone().add(V3(0, Math.min(hd*0.35, 4), 0)).sub(p) : V3(d.x, Math.max(d.y, -hd*0.3), d.z);
        p.addScaledVector(aim.normalize(), sp*dt); faceDir(a, d.x, d.z, dt, 3);
        pitch = clamp(-aim.y*1.2, -0.2, 0.9);
        if (a.state === 'stoop') wingPose(a, 0.05, 0, -0.2, 0.75);   // wings swept back in the dive
        else wingPose(a, Math.sin(a.t*4)*0.4, 0, Math.sin(a.t*4 - 0.6)*0.3);
        if (a.state === 'stoop' && a.prey.kind === 'rabbit' && a.prey.spotted === a && hd < 12) a.prey.alarm = true;
        break; }
      case 'land': {   // flare: body up, wings forward and beating fast, tail fanned, feet out in front
        const u = Math.min(1, a.st/1.0), e = 1 - (1 - u)*(1 - u);
        p.lerpVectors(a.landFrom, a.land, e); p.y += Math.sin(u*Math.PI)*0.4;
        faceDir(a, a.land.x - a.landFrom.x, a.land.z - a.landFrom.z, dt, 4);
        pitch = -0.75*Math.sin(u*Math.PI*0.9); legX = -0.6; tailS = 1.6; headX = 0.6;
        wingPose(a, Math.sin(a.t*13)*0.55, 0, Math.sin(a.t*13 - 0.6)*0.4, -0.35);
        if (u >= 1){ if (a.toGround){ go('ground'); a.timer = rnd(2.2, 3.5); grab(a, o); } else { go('perch'); a.timer = rnd(12, 25); } }
        break; }
      case 'perch': {
        const tr = a.perch; if (!tr || !trees.includes(tr)){ go('takeoff'); break; }
        p.set(tr.x, eagleTop(tr) + FOOT*0.9, tr.z);
        pitch = -0.85; legX = 0.85; headX = 0.8;
        if (a.mantle > 0){ a.mantle -= dt; const k = Math.sin(Math.min(1, a.mantle/1.6)*Math.PI); wingPose(a, 0.25 + Math.sin(a.t*6)*0.1*k, 1 - k, 0.2*k); }
        else wingPose(a, 0, ease(a, 'fold', 1, 3, dt));
        if (Math.random() < dt*0.08 && !(a.mantle > 0)) a.mantle = 1.6;   // spreads its wings to stretch (and show off)
        if (a.timer <= 0 || petD < 4){ go('takeoff'); o.onSound && o.onSound('eagle', p); }
        break; }
      case 'ground': {
        pitch = -0.35; legX = 0.35; headX = 0.4;
        const prey = a.prey, peck = prey && prey.kind !== 'rabbit';
        if (peck){ headX = 0.4 + Math.max(0, Math.sin(a.st*7))*0.9; if (a.st > 1.2 && !prey.eaten){ prey.eaten = true; preyGone(prey); } }
        if (a.carry){ const k = Math.min(1, a.st/0.4); wingPose(a, 0.35 + Math.sin(a.t*5)*0.05, 0, 0.3, -0.2*k); }   // mantling over its catch
        else wingPose(a, 0, ease(a, 'fold', 1, 4, dt));
        p.y = gy(p.x, p.z) + FOOT*0.85;
        if (a.timer <= 0 || petD < 3){ go('takeoff'); o.onSound && o.onSound('eagle', p); }
        break; }
      case 'takeoff': {   // a jump and big strong beats, climbing away
        const u = Math.min(1, a.st/2.2); a.fold = 0;
        p.y += dt*(4 - u*2); p.x += Math.sin(a.g.rotation.y)*dt*(2 + u*4); p.z += Math.cos(a.g.rotation.y)*dt*(2 + u*4);
        pitch = -0.5*(1 - u); legX = lerp(0.4, 1.25, u); tailS = 1.3;
        wingPose(a, Math.sin(a.t*10)*0.85, 0, Math.sin(a.t*10 - 0.7)*0.6, -0.15*(1 - u));
        if (u >= 1){ go('soar'); a.cx = p.x + rnd(-6, 6); a.cz = p.z + rnd(-6, 6); a.h = rnd(10, 14); a.timer = rnd(12, 25); a.prey = null; }
        break; }
    }
    a.g.rotation.x = ease(a, 'px', pitch, 5, dt); a.g.rotation.z = ease(a, 'rz', roll, 2, dt);
    if (legs) legs.rotation.x = ease(a, 'lx', legX, 6, dt);
    if (tail) tail.scale.x = ease(a, 'ts', tailS, 5, dt);
    if (head){ head.rotation.x = ease(a, 'hx', headX, 6, dt); if (a.state === 'perch' || a.state === 'ground'){ if (Math.random() < dt*0.6) a.look = rnd(-1.2, 1.2); } else a.look = 0; head.rotation.y = ease(a, 'hy', a.look || 0, 4, dt); }
  }
  function grab(a, o){
    const b = a.prey; if (!b) return;
    if (b.kind === 'rabbit' && b.g.visible && !['hidden', 'gone'].includes(b.state) && Math.hypot(b.g.position.x - a.g.position.x, b.g.position.z - a.g.position.z) < 1.2){
      b.carried = a; a.carry = b; b.state = 'caught'; o.onEvent && o.onEvent('eagleCatch', a.g.position); }
    else if (b.kind !== 'rabbit') o.onEvent && o.onEvent('eagleCatch', a.g.position);
  }
  function preyGone(b){ if (b.kind === 'worm'){ b.state = 'off'; b.g.visible = false; b.timer = rnd(20, 40); } if (b.bug){ b.g.visible = false; b.state = 'away'; b.timer = rnd(40, 80); } }

  // ---------- rabbits ----------
  function hopTo(a, to, dur, h){ a.hop = {from:a.g.position.clone(), to, t:0, dur, h}; }
  function rabbit(a, dt, o){
    const p = a.g.position, pet = o.pet, w = a.home;
    if (a.state === 'caught'){ const e = a.carried; if (!e || a.drop){ a.carried = null; a.drop = false; a.state = 'gone'; a.timer = rnd(60, 120); a.g.visible = false; return; }
      const lg = part(e.g, 'eagle_legs'); const at = lg ? lg.getWorldPosition(V3(0, 0, 0)) : e.g.position.clone(); p.set(at.x, at.y - 0.5, at.z); a.g.rotation.y = e.g.rotation.y; a.g.rotation.x = 0.3; a.g.visible = true; return; }
    if (a.state === 'gone'){ a.g.visible = false; if (a.timer <= 0){ a.state = 'hidden'; a.timer = rnd(2, 5); } return; }
    const petD = pet ? Math.hypot(p.x - pet.x, p.z - pet.z) : 99;
    if (a.state === 'hidden'){ a.g.visible = false;
      if (a.timer <= 0 && (!pet || Math.hypot(w.door.x - pet.x, w.door.z - pet.z) > 6)){ a.state = 'alert'; a.timer = rnd(2, 4); p.copy(w.door); a.g.rotation.x = 0; a.g.visible = true; a.alarm = false; a.spotted = null; } return; }
    a.g.visible = true;
    if ((petD < 4 || a.alarm) && a.state !== 'flee'){ a.state = 'flee'; a.hop = null; o.onSound && o.onSound('scurry', p); }
    else if (petD < 7 && a.state === 'graze'){ a.state = 'alert'; a.timer = rnd(1.5, 3); }
    if (a.hop){ const h = a.hop; h.t += dt; const u = Math.min(1, h.t/h.dur); p.lerpVectors(h.from, h.to, u); p.y = lerp(h.from.y, h.to.y, u) + 4*h.h*u*(1 - u);
      faceDir(a, h.to.x - h.from.x, h.to.z - h.from.z, 1, 99); a.g.rotation.x = Math.sin(u*Math.PI)*0.35 - 0.1; if (u >= 1){ a.hop = null; a.g.rotation.x = 0; } }
    const ears = (x, sp) => { if (a.earL){ a.earL.rotation.x = x + Math.sin(a.t*sp)*0.06; a.earR.rotation.x = x + Math.sin(a.t*sp + 1.7)*0.06; } };
    switch (a.state){
      case 'flee': ears(0.8, 3);
        if (!a.hop){ const d = V3(w.door.x - p.x, 0, w.door.z - p.z), L_ = d.length();
          if (L_ < 0.5){ a.state = 'hidden'; a.timer = rnd(10, 22); a.g.visible = false; break; }
          const to = p.clone().addScaledVector(d.normalize(), Math.min(L_, 1.1)); to.x += rnd(-0.25, 0.25); to.z += rnd(-0.25, 0.25); to.y = gy(to.x, to.z); hopTo(a, to, 0.24, 0.25); }
        break;
      case 'alert': ears(-0.15, 9); if (!a.hop) a.g.rotation.x = ease(a, 'sit', -0.4, 6, dt); if (a.timer <= 0){ a.state = 'graze'; a.timer = rnd(3, 7); a.sit = 0; } break;
      case 'graze': ears(0.35, 1.2);
        if (!a.hop){ a.g.rotation.x = 0.12 + Math.max(0, Math.sin(a.t*14))*0.02;
          if (a.timer <= 0){ a.timer = rnd(2, 6);
            if (Math.random() < 0.6){ for (let i=0;i<8;i++){ const to = V3(p.x + rnd(-1.2, 1.2), 0, p.z + rnd(-1.2, 1.2));
              if (landOK(to.x, to.z) && Math.hypot(to.x - w.door.x, to.z - w.door.z) < 5){ to.y = gy(to.x, to.z); hopTo(a, to, 0.32, 0.18); break; } } }
            else if (Math.random() < 0.3){ a.state = 'alert'; a.timer = rnd(1, 2.5); } } }
        break;
    }
    if (!a.hop) p.y = gy(p.x, p.z);
  }
  // ---------- beetles ----------
  function beetle(a, dt, o){
    const p = a.g.position, s = a.spot;
    if (a.state === 'away'){ a.g.visible = false; if (a.timer <= 0){ placeBeetle(a); } return; }
    if (!s){ a.g.visible = false; return; }
    if (a.state === 'fly'){ p.y += dt*1.8; p.x += Math.sin(a.g.rotation.y)*dt*2.5; p.z += Math.cos(a.g.rotation.y)*dt*2.5; a.g.rotation.x = -0.5; a.g.rotation.z = Math.sin(a.t*40)*0.1;
      if (a.timer <= 0){ a.state = 'away'; a.timer = rnd(25, 50); a.g.visible = false; } return; }
    a.g.visible = a.sp === 'cicada' ? !o.night || o.night < 0.6 : true;
    if (a.sp === 'cicada' && a.g.visible && Math.random() < dt*0.04) o.onSound && o.onSound('cicada', p);
    if (a.sp === 'cricket' && o.night > 0.6 && Math.random() < dt*0.15) o.onSound && o.onSound('chirp', p);
    if (a.hab === 'ground'){   // grasshoppers spring about, crickets creep
      if (a.hop){ const h = a.hop; h.t += dt; const u = Math.min(1, h.t/h.dur); p.lerpVectors(h.from, h.to, u); p.y = lerp(h.from.y, h.to.y, u) + 4*h.h*u*(1 - u); if (u >= 1) a.hop = null; return; }
      if (a.timer <= 0){ a.timer = a.sp === 'grasshopper' ? rnd(1.5, 4) : rnd(2, 6); const ang = rnd(0, 6.28), d = a.sp === 'grasshopper' ? rnd(0.6, 1.3) : rnd(0.1, 0.3);
        const to = V3(p.x + Math.cos(ang)*d, 0, p.z + Math.sin(ang)*d); if (Math.hypot(to.x - a.home.x, to.z - a.home.z) > 4 || !landOK(to.x, to.z)){ to.x = a.home.x; to.z = a.home.z; }
        to.y = gy(to.x, to.z); a.g.rotation.set(0, Math.atan2(to.x - p.x, to.z - p.z), 0);
        if (a.sp === 'grasshopper') a.hop = {from:p.y < -10 ? to.clone() : p.clone(), to, t:0, dur:0.35, h:0.35}; else a.dest = to; }
      if (p.y < -10){ p.set(a.home.x, gy(a.home.x, a.home.z), a.home.z); }
      if (a.dest){ const d = V3(a.dest.x - p.x, 0, a.dest.z - p.z); if (d.length() > 0.02) p.addScaledVector(d.normalize(), dt*0.06); }
      p.y = gy(p.x, p.z); return; }
    if (a.hab === 'bush'){ p.set(s.x + Math.cos(a.ang)*0.18, s.y + 0.02, s.z + Math.sin(a.ang)*0.18); a.g.rotation.set(0, a.ang + Math.PI/2 + Math.sin(a.t*0.7)*0.4, Math.sin(a.t*1.3)*0.08); return; }   // sways on top of a bush
    if (a.timer <= 0){ a.timer = rnd(1.5, 5); a.dir = Math.random() < 0.35 ? 0 : (Math.random() < 0.5 ? 1 : -1); if (a.sp === 'cicada') a.dir = 0; }
    if (a.onTree){
      a.hgt = clamp(a.hgt + (a.dir || 0)*dt*0.06, 0.4, 1.2); a.ang += Math.sin(a.t*0.7)*dt*0.15;
      const r = 0.2*s.s*(1 - 0.3*a.hgt/1.6) + 0.015, dx = Math.cos(a.ang), dz = Math.sin(a.ang);
      p.set(s.x + dx*r, gy(s.x, s.z) + a.hgt*s.s, s.z + dz*r);
      if ((a.dir || 0) < 0) a.g.rotation.set(Math.PI/2, Math.atan2(dx, dz), 0); else a.g.rotation.set(-Math.PI/2, Math.atan2(-dx, -dz), 0);   // belly on the bark, head up (or down)
    } else {
      a.ang += (a.dir || 0)*dt*0.4; const r = 0.25*(s.r || 1);
      p.set(s.x + Math.cos(a.ang)*r, s.y + 0.02, s.z + Math.sin(a.ang)*r); a.g.rotation.set(0, -a.ang + ((a.dir || 1) > 0 ? 0 : Math.PI), 0);
    }
  }
  // ---------- worms ----------
  function worm(a, dt, o){
    const p = a.g.position;
    a.mat.userData.u.value += dt*(a.fast > 0 ? 3 : 1); a.fast = (a.fast || 0) - dt;
    if (a.state === 'off'){ a.g.visible = false;
      if (a.timer <= 0){ a.timer = rnd(4, 12); const want = a.forceWet ? 1 : o.wet ? 0.9 : 0.12; a.forceWet = false;
        if (Math.random() < want){ for (let i=0;i<10;i++){ const ang = rnd(0, 6.28), r = rnd(2, 11), x = o.cam.x + Math.cos(ang)*r, z = o.cam.z + Math.sin(ang)*r;
          if (landOK(x, z) && (!o.pet || Math.hypot(x - o.pet.x, z - o.pet.z) > 1.5)){ p.set(x, gy(x, z) - 0.08, z); a.g.rotation.y = rnd(0, 6.28); a.state = 'up'; a.st = 0; a.g.visible = true; a.life = rnd(25, 60); break; } } } }
      return; }
    a.st = (a.st || 0) + dt; const base = gy(p.x, p.z);
    if (a.state === 'up'){ p.y = base - 0.08 + Math.min(1, a.st/1.5)*0.08; if (a.st > 1.5){ a.state = 'out'; a.st = 0; } return; }
    if (a.state === 'down'){ p.y = base - Math.min(1, a.st/1.5)*0.1; if (a.st > 1.5){ a.state = 'off'; a.timer = rnd(6, 20); a.g.visible = false; } return; }
    a.life -= dt; a.g.rotation.y += Math.sin(a.t*0.5)*dt*0.4;
    const nx = p.x + Math.cos(a.g.rotation.y)*dt*0.06, nz = p.z - Math.sin(a.g.rotation.y)*dt*0.06;   // creeps head-first (+x)
    if (landOK(nx, nz)){ p.x = nx; p.z = nz; } else a.g.rotation.y += 1;
    p.y = gy(p.x, p.z);
    if (a.life <= 0 || (!o.wet && Math.random() < dt*0.01)){ a.state = 'down'; a.st = 0; }
  }

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
      if (!whaleRun && whaleT <= 0){ const z = rnd(Z0 + 5, Z1 - 5); whaleRun = {t:0, x:shore(z) + rnd(19, 25), z, ry:Math.random() < 0.5 ? 0 : Math.PI}; whaleG.visible = true; o.onSound && o.onSound('whale', V3(whaleRun.x - 6, 0, z)); }
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
      const camD = Math.hypot(p.x - cam.x, p.z - cam.z), far = camD > 70; lod && lod(a.g, camD < 24);
      if (far && a.kind !== 'eagle' && a.kind !== 'rabbit'){ if (!['owl', 'lizard', 'worm'].includes(a.kind) && !a.bug) a.g.visible = false; continue; }
      const petD = pet ? Math.hypot(p.x - pet.x, p.z - pet.z) : 99;
      switch (a.kind){
        case 'gull': {
          a.g.visible = true; const legs = part(a.g, 'gull_legs');
          if (a.state === 'land'){ wingPose(a, 0, ease(a, 'fold', 1, 4, dt)); a.g.rotation.z = 0; a.g.rotation.x = ease(a, 'px', Math.sin(a.t*1.3) > 0.85 ? 0.55 : 0, 8, dt);   // pecks at the sand now and then if (legs) legs.rotation.x = ease(a, 'lx', 0, 6, dt);
            if (a.timer <= 0 || petD < 3){ a.state = 'up'; a.st = 0; a.fold = 0; if (petD < 3) o.onSound && o.onSound('gull', p); }
            else if (Math.random() < dt*0.4){ a.g.rotation.y += rnd(-1, 1); } break; }
          if (a.state === 'up'){ a.st += dt; p.y += dt*2.5; wingPose(a, Math.sin(a.t*11)*0.8, 0, Math.sin(a.t*11 - 0.7)*0.5); a.g.rotation.x = ease(a, 'px', -0.3, 5, dt);
            if (legs) legs.rotation.x = ease(a, 'lx', 1.2, 4, dt); if (a.st > 1.5){ a.state = 'idle'; a.timer = rnd(10, 25); } break; }
          a.ang += a.dir*dt*0.35; const x = shore(a.cz) + Math.cos(a.ang)*a.rad - 1, z = a.cz + Math.sin(a.ang)*a.rad*1.5;
          if (a.state === 'down'){ const tx = a.tx ?? (a.tx = shore(p.z) - rnd(1, 3)); p.x += (tx - p.x)*dt; const gh = gy(p.x, p.z); p.y += (gh - p.y)*dt*1.5;
            const near = p.y - gh < 0.8; wingPose(a, Math.sin(a.t*(near ? 12 : 8))*(near ? 0.5 : 0.4), 0, 0.2, near ? -0.3 : 0); a.g.rotation.x = ease(a, 'px', near ? -0.5 : 0, 4, dt);
            if (legs) legs.rotation.x = ease(a, 'lx', near ? -0.3 : 1.2, 5, dt);
            if (p.y - gh < 0.08){ a.state = 'land'; a.timer = rnd(6, 14); a.tx = null; p.y = gh; } break; }
          const nx = x - p.x, nz = z - p.z; p.x += nx*dt*2; p.z += nz*dt*2; p.y += (a.h + Math.sin(a.t*0.7)*0.6 - p.y)*dt; faceDir(a, nx, nz, dt, 4);
          a.g.rotation.z = -a.dir*0.3; a.g.rotation.x = ease(a, 'px', 0, 3, dt); if (legs) legs.rotation.x = ease(a, 'lx', 1.2, 4, dt);
          const glide = Math.sin(a.t*0.5) > 0.2; wingPose(a, glide ? 0.08 : Math.sin(a.t*7)*0.55, 0, glide ? 0 : Math.sin(a.t*7 - 0.6)*0.4);
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
          const rg = a.g.userData; if (rg.mixer){   // the realistic owl: its own clips — sitting, a long head swivel, hooting
            if (a.timer <= 0){ a.timer = rnd(4, 9); const r_ = Math.random(); a.clipName = r_ < 0.45 ? 'look' : r_ < 0.7 ? 'hoot' : 'idle'; a.clipT = 0; if (a.clipName === 'hoot') o.onSound && o.onSound('hoot', p); }
            a.clipT = (a.clipT || 0) + dt; const want = a.clipName && rg.clips[a.clipName] && a.clipT < rg.clips[a.clipName].duration ? a.clipName : 'idle';
            if (rg.cur !== want){ const ac = rg.mixer.clipAction(rg.clips[want]); ac.reset().fadeIn(0.3).play(); if (rg.act) rg.act.fadeOut(0.3); rg.act = ac; rg.cur = want; }
            rg.mixer.update(dt); break; }
          const head = part(a.g, 'owl_head'); if (head){ if (a.timer <= 0){ a.timer = rnd(2, 6); a.look = rnd(-1.6, 1.6); if (Math.random() < 0.3) o.onSound && o.onSound('hoot', p); } head.rotation.y += ((a.look || 0) - head.rotation.y)*Math.min(1, dt*4); }
          break; }
        case 'eagle': a.g.visible = !night || a.state === 'perch'; if (!night || a.state !== 'soar') eagle(a, dt, o); break;
        case 'rabbit': rabbit(a, dt, o); break;
        case 'beetle': case 'cicada': case 'mantis': case 'longhorn': case 'grasshopper': case 'cricket': beetle(a, dt, o); break;
        case 'worm': worm(a, dt, o); break;
        case 'lizard': {
          const r = a.rock; a.g.visible = !night && !!r && a.state !== 'hidden';
          if (!r) break;
          if (a.state === 'hidden'){ if (a.timer <= 0){ a.state = 'idle'; } break; }
          if (petD < 2.5 && a.state !== 'flee'){ a.state = 'flee'; a.timer = 0.8; o.onSound && o.onSound('scurry', p); }
          const top = V3(r.x + (a.off || 0.2), r.y, r.z); if (!a.off){ a.off = rnd(-0.3, 0.3); }
          const lizLegs = k => { for (const [n, ph] of [['FL', 0], ['BR', 0], ['FR', Math.PI], ['BL', Math.PI]]){ const l = part(a.g, 'lizard_leg' + n); if (l) l.rotation.y = Math.sin(a.t*28 + ph)*0.7*k*(n[1] === 'L' ? 1 : -1); } };
          if (a.state === 'flee'){ p.x += Math.sin(a.g.rotation.y)*dt*4; p.z += Math.cos(a.g.rotation.y)*dt*4; lizLegs(1); if (a.tail) a.tail.rotation.y = Math.sin(a.t*28)*0.4; if (a.timer <= 0){ a.state = 'hidden'; a.timer = rnd(8, 15); } break; }
          lizLegs(0);
          p.copy(top); if (a.timer <= 0){ a.timer = rnd(2, 6); a.g.rotation.y += rnd(-1.2, 1.2); }
          if (a.tail) a.tail.rotation.y = Math.sin(a.t*2)*0.25;
          break; }
      }
    }
  };
  // for testing: 'pod', 'whale', or an eagle hunt ('hunt' → the nearest eagle dives on a rabbit/worm/beetle), 'perch', 'worms'
  L.force = (k, o = {}) => { if (k === 'pod') podT = 0; if (k === 'whale') whaleT = 0;
    const e = L.list.find(a => a.kind === 'eagle');
    if (k === 'hunt' && e){ const pr = preyList(); if (pr.length){ e.prey = o.prey || pr[0]; e.state = 'stoop'; e.st = 0; if (e.prey.kind === 'rabbit') e.prey.spotted = o.escape ? e : null; } return e; }
    if (k === 'perch' && e && trees.length){ e.perch = trees[0]; e.state = 'toTree'; e.st = 0; return e; }
    if (k === 'worms') L.list.filter(a => a.kind === 'worm').forEach(a => { a.timer = 0; a.forceWet = true; });
    return e; };
  L.poke = a => {
    if (a.kind === 'owl') { if (a.g.userData.mixer){ a.clipName = 'look'; a.clipT = 0; a.timer = 6; } else { const h = part(a.g, 'owl_head'); if (h) h.rotation.y = Math.PI*0.9; } }
    if (a.kind === 'lizard'){ a.state = 'flee'; a.timer = 0.8; }
    if (a.kind === 'gull' && a.state === 'land'){ a.state = 'up'; a.st = 0; }
    if (a.kind === 'rabbit' && !['hidden', 'gone', 'caught'].includes(a.state)){ a.state = 'flee'; a.hop = null; }
    if (a.bug && a.state === 'crawl'){ if (a.sp === 'grasshopper'){ const ang = rnd(0, 6.28), to = V3(a.g.position.x + Math.cos(ang)*2.2, 0, a.g.position.z + Math.sin(ang)*2.2); if (landOK(to.x, to.z)){ to.y = gy(to.x, to.z); a.hop = {from:a.g.position.clone(), to, t:0, dur:0.6, h:0.8}; a.home = {x:to.x, z:to.z}; } }
      else { a.state = 'fly'; a.timer = 2.2; a.g.rotation.set(0, rnd(0, 6.28), 0); } }
    if (a.kind === 'worm'){ a.fast = 2; }
    if (a.kind === 'eagle' && a.state === 'perch'){ a.mantle = 1.6; }
    return a.kind;
  };
  L.warrens = warrens;
  return L;
}
