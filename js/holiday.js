// Holiday dressing in real 3D (it used to be flat emoji): jack-o'-lanterns lit from inside by a candle (only the carved face glows),
// bats with jointed wings (shoulder, elbow, wrist, three fingers, the membrane stretched between them), wrapped gifts with ribbons
// and bows, red paper lanterns on posts, bundles of mugwort and calamus, and things that drift by: hearts, balloons, sky lanterns,
// falling leaves. Also the extra holiday-only buildings sold in the shop.
import * as THREE from 'three';

const rnd = (a, b) => a + Math.random()*(b - a), V3 = (x, y, z) => new THREE.Vector3(x, y, z);
function canvasTex(w, h, draw){ const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return new THREE.CanvasTexture(c); }
const glowTex = canvasTex(128, 128, (x) => { const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,220,150,1)'); g.addColorStop(0.35, 'rgba(255,170,70,0.55)'); g.addColorStop(1, 'rgba(255,140,40,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); });
const std = (color, rough = 0.7, extra = {}) => new THREE.MeshStandardMaterial({color, roughness:rough, ...extra});

export function createHoliday({scene, gy, onChirp}){
  const H = {}, glows = [], halos = [], movers = [];   // glows: materials lit at night (with a candle flicker); movers: things with their own motion

  // ---------- jack-o'-lantern ----------
  // A ribbed pumpkin (lathe profile, ten lobes) with a face carved into its skin: the face is drawn into the texture (dark cut-outs by
  // day) and into the glow map, so at night only the eyes, nose and jagged grin shine, flickering like a candle, with a warm halo.
  function faceTex(seed, glow){
    return canvasTex(512, 256, (x, w, h) => {
      if (!glow){ const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#c9601e'); g.addColorStop(0.5, '#ec8a2c'); g.addColorStop(1, '#b4511a'); x.fillStyle = g; x.fillRect(0, 0, w, h);
        for (let i=0;i<10;i++){ x.fillStyle = 'rgba(120,50,10,0.25)'; x.fillRect(i*w/10 - 3, 0, 6, h); } }   // darker grooves between the lobes
      else { x.fillStyle = '#000'; x.fillRect(0, 0, w, h); }
      x.fillStyle = glow ? '#ffd27a' : '#2a1306'; const cx = w/2, ey = h*0.4;
      const tri = (pts) => { x.beginPath(); pts.forEach(([a, b], i) => i ? x.lineTo(a, b) : x.moveTo(a, b)); x.closePath(); x.fill(); };
      const kind = seed % 3;
      for (const s of [-1, 1]){ if (kind === 1){ x.beginPath(); x.ellipse(cx + s*42, ey, 16, 20, 0, 0, 6.3); x.fill(); }
        else tri([[cx + s*22, ey + 14], [cx + s*64, ey + 14], [cx + s*(kind ? 40 : 46), ey - 22]]); }
      tri([[cx - 9, h*0.52], [cx + 9, h*0.52], [cx, h*0.44]]);
      x.beginPath(); const my = h*0.62, mw = 74;   // the grin with teeth
      x.moveTo(cx - mw, my - 8); for (let i=0;i<=8;i++){ const u = i/8, px = cx - mw + u*mw*2, py = my + Math.sin(u*Math.PI)*22; x.lineTo(px, py + (i % 2 ? 0 : -9)); }
      for (let i=8;i>=0;i--){ const u = i/8, px = cx - mw + u*mw*2; x.lineTo(px, my + Math.sin(u*Math.PI)*42 + (i % 2 ? 6 : 0)); } x.closePath(); x.fill();
    });
  }
  const pumpkinGeo = (() => {
    const pts = []; for (let i=0;i<=16;i++){ const a = i/16*Math.PI; pts.push(new THREE.Vector2(Math.max(0.001, Math.sin(a)*(1 - 0.12*Math.cos(a)**8)), -Math.cos(a)*0.82)); }
    const g = new THREE.LatheGeometry(pts, 40, Math.PI), p = g.attributes.position;   // (seam at the back: the face texture's middle faces +z)
    for (let i=0;i<p.count;i++){ const x = p.getX(i), z = p.getZ(i), a = Math.atan2(x, z), k = 1 - 0.07*Math.pow(Math.abs(Math.cos(a*5)), 0.6); p.setX(i, x*k); p.setZ(i, z*k); }
    g.computeVertexNormals(); return g; })();
  const stemGeo = (() => { const c = new THREE.CatmullRomCurve3([V3(0, 0, 0), V3(0.02, 0.12, 0), V3(0.08, 0.22, 0.02), V3(0.16, 0.26, 0.03)]); return new THREE.TubeGeometry(c, 8, 0.045, 6); })();
  const stemM = std('#5b6b2e', 0.9), faces = [0, 1, 2].map(k => ({map:faceTex(k, false), glow:faceTex(k, true)}));
  H.jackLantern = (size = 0.5, seed = Math.floor(Math.random()*3)) => {
    const g = new THREE.Group(), F = faces[seed % 3];
    const m = new THREE.MeshStandardMaterial({map:F.map, emissiveMap:F.glow, emissive:'#ffffff', emissiveIntensity:0, roughness:0.55});
    glows.push({m, base:2.2, flick:Math.random()*10});
    const body = new THREE.Mesh(pumpkinGeo, m); body.scale.set(size, size*0.95, size); body.position.y = size*0.78; g.add(body);
    const stem = new THREE.Mesh(stemGeo, stemM); stem.scale.setScalar(size*1.6); stem.position.y = size*1.5; stem.rotation.y = Math.random()*6.28; g.add(stem);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, opacity:0}));
    halo.scale.setScalar(size*2.6); halo.position.set(0, size*0.75, size*1.35); g.add(halo); halos.push({s:halo, k:0.55, flick:Math.random()*10});   // (just in front of the face: candlelight in the air)
    return g;
  };

  // ---------- bats: jointed wings ----------
  // Each wing has a humerus (shoulder to elbow), a forearm (elbow to wrist) and three long fingers; the skin is stretched between the
  // fingers, the forearm and the body down to the leg. On the downstroke the wing is spread; on the upstroke the elbow and wrist fold
  // it in, and the outer wing lags the inner one, so it beats like a bat's, not a flat paddle.
  const batSkin = std('#3a2c2a', 0.85, {side:THREE.DoubleSide}), batFur = std('#4a3a34', 1), batEye = new THREE.MeshBasicMaterial({color:'#1a0e08'});
  function makeBat(){
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), batFur); torso.scale.set(0.9, 0.8, 1.5); body.add(torso);
    const head = new THREE.Group(); head.position.set(0, 0.02, 0.11); body.add(head);
    head.add(new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), batFur));
    for (const s of [-1, 1]){ const ear = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.06, 6), batSkin); ear.position.set(0.025*s, 0.05, -0.005); ear.rotation.z = -0.3*s; head.add(ear);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.007, 6, 4), batEye); eye.position.set(0.02*s, 0.012, 0.038); head.add(eye); }
    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), batFur); snout.position.set(0, -0.005, 0.045); head.add(snout);
    const legs = []; for (const s of [-1, 1]){ const l = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.004, 0.07, 4), batSkin); l.position.set(0.03*s, -0.02, -0.12); l.rotation.x = 1.3; body.add(l); legs.push(l); }
    const wings = [-1, 1].map(s => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(7*3), 3));
      geo.setIndex([0, 1, 6, 1, 2, 5, 1, 5, 6, 2, 3, 4, 2, 4, 5]); const m = new THREE.Mesh(geo, batSkin); m.frustumCulled = false; body.add(m);
      const bones = [0, 1, 2, 3, 4].map(() => { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1, 4), batFur); body.add(b); return b; });
      return {s, geo, bones}; });
    return {g, body, head, wings, legs, ph:Math.random()*6.28, rate:rnd(9, 11)};
  }
  const up = V3(0, 1, 0), tmp = V3(0, 0, 0);
  function boneBetween(m, a, b){ tmp.subVectors(b, a); const L = tmp.length(); m.position.copy(a).addScaledVector(tmp, 0.5); m.scale.set(1, L, 1); m.quaternion.setFromUnitVectors(up, tmp.normalize()); }
  function poseBat(b){
    const ph = b.ph, flap = Math.sin(ph), lag = Math.sin(ph - 0.7), fold = 0.5 - 0.5*Math.cos(ph - 1.2);   // fold: 0 spread .. 1 tucked (on the upstroke)
    for (const w of b.wings){
      const s = w.s, P = w.geo.attributes.position;
      // wing-plane points (u out from the body, v back along it), then raised by the shoulder (inner part) and with a lag (outer part)
      const pts = [];
      const S = [0.035, 0], e1 = 0.55 + fold*0.5, E = [S[0] + 0.1*Math.cos(e1), S[1] + 0.1*Math.sin(e1)];
      const e2 = 0.35 + fold*0.8, Wr = [E[0] + 0.14*Math.cos(e2), E[1] - 0.14*Math.sin(e2)];
      const fingers = [-0.15, 0.45, 1.05].map((a, i) => { const aa = a + fold*0.5, L = [0.15, 0.16, 0.13][i]*(1 - fold*0.3); return [Wr[0] + L*Math.cos(aa), Wr[1] + L*Math.sin(aa)]; });
      const T = [0.03, 0.12];
      const to3 = ([u, v], ang) => V3(s*u*Math.cos(ang), u*Math.sin(ang), -v);
      const aIn = flap*0.85, aOut = aIn + lag*0.45;
      pts.push(to3(S, aIn), to3(E, aIn), to3(Wr, (aIn + aOut)/2), to3(fingers[0], aOut), to3(fingers[1], aOut), to3(fingers[2], aOut), to3(T, aIn*0.3));
      pts.forEach((p, i) => P.setXYZ(i, p.x, p.y, p.z)); P.needsUpdate = true; w.geo.computeVertexNormals(); w.geo.computeBoundingSphere();
      boneBetween(w.bones[0], pts[0], pts[1]); boneBetween(w.bones[1], pts[1], pts[2]); boneBetween(w.bones[2], pts[2], pts[3]); boneBetween(w.bones[3], pts[2], pts[4]); boneBetween(w.bones[4], pts[2], pts[5]);
    }
    b.body.position.y = -Math.sin(ph)*0.025;   // the body bobs against the wingbeat
    b.head.rotation.x = Math.sin(ph*0.5)*0.15;
  }
  const bats = [];
  H.addBats = (n, around) => { for (let i=0;i<n;i++){ const b = makeBat(); b.c = around.clone(); b.r = rnd(2.5, 6); b.a = Math.random()*6.28; b.w = rnd(0.5, 0.9)*(Math.random() < 0.5 ? -1 : 1);
    b.h = rnd(2.2, 4.2); b.wob = Math.random()*6.28; b.g.scale.setScalar(rnd(1.3, 1.7)); scene.add(b.g); bats.push(b); } };

  // ---------- gifts, lanterns, mugwort ----------
  const giftCols = [['#c8323a', '#f2d16b'], ['#2f6fb5', '#f4f1ea'], ['#2f8a4e', '#d93a3a'], ['#f2efe6', '#c8323a'], ['#7a4fb0', '#f2d16b']];
  const giftTex = giftCols.map(([a, b], k) => canvasTex(128, 128, (x) => { x.fillStyle = a; x.fillRect(0, 0, 128, 128); x.fillStyle = b + '55';
    if (k % 2){ for (let i=0;i<8;i++) for (let j=0;j<8;j++) if ((i + j) % 2 === 0){ x.beginPath(); x.arc(8 + i*16, 8 + j*16, 3.5, 0, 6.3); x.fill(); } }
    else for (let i=-8;i<8;i++){ x.save(); x.translate(i*20, 0); x.rotate(0.6); x.fillRect(0, -20, 6, 220); x.restore(); } }));
  H.gift = (k = Math.floor(Math.random()*giftCols.length), w = rnd(0.35, 0.55)) => {
    const g = new THREE.Group(), [, rib] = giftCols[k % giftCols.length], hgt = w*rnd(0.7, 1.1), ribM = std(rib, 0.35, {metalness:0.2});
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, w), std('#ffffff', 0.6, {map:giftTex[k % giftCols.length]})); box.position.y = hgt/2; g.add(box);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(w*1.06, hgt*0.16, w*1.06), box.material); lid.position.y = hgt*0.96; g.add(lid);
    for (const r of [0, Math.PI/2]){ const band = new THREE.Mesh(new THREE.BoxGeometry(w*1.08, hgt*1.06, w*0.12), ribM); band.position.y = hgt/2 + 0.005; band.rotation.y = r; g.add(band); }
    for (const s of [-1, 1]){ const loop = new THREE.Mesh(new THREE.TorusGeometry(w*0.15, w*0.04, 6, 14), ribM); loop.position.set(s*w*0.14, hgt*1.08 + w*0.1, 0); loop.rotation.set(0, Math.PI/2, s*0.6); loop.scale.set(1, 1, 0.6); g.add(loop); }
    const knot = new THREE.Mesh(new THREE.SphereGeometry(w*0.06, 8, 6), ribM); knot.position.y = hgt*1.08 + w*0.03; g.add(knot);
    return g;
  };
  const lanternGeo = (() => { const pts = []; for (let i=0;i<=12;i++){ const a = i/12*Math.PI; pts.push(new THREE.Vector2(Math.max(0.05, Math.sin(a)*0.3), -Math.cos(a)*0.24)); }
    const g = new THREE.LatheGeometry(pts, 24), p = g.attributes.position; for (let i=0;i<p.count;i++){ const x = p.getX(i), z = p.getZ(i), a = Math.atan2(x, z), k = 1 - 0.05*Math.abs(Math.sin(a*6)); p.setX(i, x*k); p.setZ(i, z*k); }
    g.computeVertexNormals(); return g; })();
  const gold = std('#d9a93a', 0.35, {metalness:0.6}), redGlowTex = canvasTex(64, 64, (x) => { x.fillStyle = '#d42a22'; x.fillRect(0, 0, 64, 64); x.strokeStyle = 'rgba(120,10,10,0.6)'; x.lineWidth = 2; for (let i=0;i<8;i++){ x.beginPath(); x.moveTo(i*8 + 4, 0); x.lineTo(i*8 + 4, 64); x.stroke(); } });
  H.redLantern = () => {   // a paper lantern: ribbed red body, gold caps, a red tassel; glows from within at night
    const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({map:redGlowTex, emissive:'#ff5a2a', emissiveIntensity:0, roughness:0.7}); glows.push({m, base:1.4, flick:Math.random()*10});
    g.add(new THREE.Mesh(lanternGeo, m));
    for (const y of [0.24, -0.24]){ const c = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.05, 14), gold); c.position.y = y; g.add(c); }
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.18, 4), gold); cord.position.y = 0.35; g.add(cord);
    for (let i=0;i<7;i++){ const t = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.004, 0.22, 3), std('#c8201c', 0.9)); const a = i/7*6.28; t.position.set(Math.sin(a)*0.025, -0.39, Math.cos(a)*0.025); g.add(t); }
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex, color:'#ff8a5a', transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, opacity:0})); halo.scale.setScalar(1.2); g.add(halo); halos.push({s:halo, k:0.7, flick:Math.random()*10});
    return g;
  };
  H.lanternPost = () => {   // standing on the ground: a wooden post with an arm, the lantern hanging from it (never floating)
    const g = new THREE.Group(), wood = std('#6e4a2c', 0.9);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.065, 2.3, 7), wood); post.position.y = 1.15; g.add(post);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.7), wood); arm.position.set(0, 2.2, 0.3); g.add(arm);
    const L = H.redLantern(); L.position.set(0, 1.62, 0.58); g.add(L); movers.push({o:L, sway:Math.random()*6.28});
    return g;
  };
  const leafShape = (() => { const s = new THREE.Shape(); s.moveTo(0, 0); s.quadraticCurveTo(0.05, 0.25, 0, 0.6); s.quadraticCurveTo(-0.05, 0.25, 0, 0); return new THREE.ShapeGeometry(s, 6); })();
  const leafM = std('#4f7d34', 0.8, {side:THREE.DoubleSide}), leafM2 = std('#6f9a46', 0.8, {side:THREE.DoubleSide});
  H.mugwort = () => {   // a bundle of mugwort and calamus tied with red string, leaning on a short stake (hung by doors on Dragon Boat day)
    const g = new THREE.Group(), stake = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.0, 6), std('#7a5634', 0.9)); stake.position.y = 0.5; g.add(stake);
    const bundle = new THREE.Group(); bundle.position.set(0, 0.95, 0.05); bundle.rotation.x = Math.PI; g.add(bundle);
    for (let i=0;i<14;i++){ const l = new THREE.Mesh(leafShape, i % 2 ? leafM : leafM2); l.scale.set(rnd(0.7, 1.2), rnd(1.1, 1.6), 1); l.rotation.set(rnd(-0.2, 0.2), i*0.45, rnd(-0.25, 0.25)); bundle.add(l); }
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 12), std('#c8201c', 0.6)); tie.rotation.x = Math.PI/2; tie.position.set(0, 1.0, 0.05); g.add(tie);
    return g;
  };

  // ---------- things drifting by ----------
  const heartGeo = (() => { const s = new THREE.Shape(); s.moveTo(0, -0.12); s.bezierCurveTo(0.02, -0.07, 0.16, -0.02, 0.14, 0.08); s.bezierCurveTo(0.12, 0.16, 0.02, 0.15, 0, 0.07);
    s.bezierCurveTo(-0.02, 0.15, -0.12, 0.16, -0.14, 0.08); s.bezierCurveTo(-0.16, -0.02, -0.02, -0.07, 0, -0.12);
    const g = new THREE.ExtrudeGeometry(s, {depth:0.05, bevelEnabled:true, bevelThickness:0.02, bevelSize:0.02, bevelSegments:3, curveSegments:10}); g.center(); return g; })();
  const heartMs = ['#f06a8f', '#f4a3bb', '#e0446a'].map(c => std(c, 0.35, {emissive:c, emissiveIntensity:0.15}));
  const balloonGeo = (() => { const g = new THREE.SphereGeometry(0.22, 16, 12); const p = g.attributes.position; for (let i=0;i<p.count;i++){ const y = p.getY(i); if (y < 0) p.setY(i, y*1.3); } g.computeVertexNormals(); return g; })();
  const balloonMs = ['#e24a4a', '#f2c33b', '#3f8fd6', '#5bc47a', '#c46bd6'].map(c => std(c, 0.25, {metalness:0.05}));
  const skyLanternM = new THREE.MeshStandardMaterial({color:'#ffd9a0', emissive:'#ffa040', emissiveIntensity:0.8, roughness:0.8, transparent:true, opacity:0.92, side:THREE.DoubleSide});
  const fallLeafMs = ['#5f8f3e', '#7aa548', '#a3b84a'].map(c => std(c, 0.8, {side:THREE.DoubleSide}));
  const floaters = [];
  H.drift = (kind, at) => {
    let o;
    if (kind === 'heart'){ o = new THREE.Mesh(heartGeo, heartMs[Math.floor(Math.random()*3)]); o.scale.setScalar(rnd(1.4, 2.2)); }
    else if (kind === 'balloon'){ o = new THREE.Group(); const b = new THREE.Mesh(balloonGeo, balloonMs[Math.floor(Math.random()*balloonMs.length)]); o.add(b);
      const knot = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.05, 6), b.material); knot.position.y = -0.3; o.add(knot);
      const str = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V3(0, -0.32, 0), V3(0.03, -0.7, 0.01), V3(-0.02, -1.1, 0)]), new THREE.LineBasicMaterial({color:'#eeeeee'})); o.add(str); o.scale.setScalar(rnd(1.4, 1.9)); }
    else if (kind === 'skylantern'){ o = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.4, 8, 1, true), skyLanternM); const h = new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, opacity:0.7})); h.scale.setScalar(1.3); o.add(h); }
    else if (kind === 'leaf'){ o = new THREE.Mesh(leafShape, fallLeafMs[Math.floor(Math.random()*3)]); o.scale.setScalar(rnd(0.5, 0.8)); }
    else return;
    o.position.copy(at); scene.add(o);
    floaters.push({o, kind, t:0, max:kind === 'leaf' ? 7 : kind === 'heart' ? 5 : 9, vx:rnd(-0.25, 0.25), vz:rnd(-0.25, 0.25), ph:Math.random()*6.28, spin:rnd(-1.5, 1.5)});
  };

  // ---------- the holiday-only buildings (shop) ----------
  H.build = (id, g, {glowMat, mat}) => {
    if (id === 'pumpkins'){   // three jack-o'-lanterns on a little straw bale
      const bale = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.35, 0.9), std('#d8b45a', 1)); bale.position.y = 0.17; g.add(bale);
      [[-0.75, 0.36, 0], [0.05, 0.48, 1], [0.82, 0.32, 2]].forEach(([x, s, k]) => { const j = H.jackLantern(s, k); j.position.set(x, 0.35, 0.05); j.rotation.y = rnd(-0.25, 0.25); g.add(j); });
      return true; }
    if (id === 'pumpkincart'){   // a carriage made from a giant pumpkin: windows lit from inside, four curly wheels
      const m = new THREE.MeshStandardMaterial({color:'#e8862e', roughness:0.5, emissive:'#ffc060', emissiveIntensity:0}); glows.push({m, base:0.18, flick:3});
      const body = new THREE.Mesh(pumpkinGeo, m); body.scale.set(0.95, 0.85, 1.15); body.position.y = 1.25; g.add(body);
      const win = glowMat('#fff0c0', '#ffc060'); for (const s of [-1, 1]){ const w = new THREE.Mesh(new THREE.CircleGeometry(0.28, 20), win); w.position.set(0.9*s, 1.3, 0); w.rotation.y = s*Math.PI/2; g.add(w); }
      const gold_ = std('#d9a93a', 0.35, {metalness:0.6});
      for (const sx of [-1, 1]) for (const sz of [-1, 1]){ const wh = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.045, 8, 24), gold_); wh.position.set(0.98*sx, 0.4, 0.75*sz); wh.rotation.y = Math.PI/2; g.add(wh);
        for (let i=0;i<6;i++){ const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.74, 4), gold_); sp.position.copy(wh.position); sp.rotation.set(i*Math.PI/6, 0, 0); sp.rotation.order = 'XYZ'; g.add(sp); } }
      const stem = new THREE.Mesh(stemGeo, stemM); stem.scale.setScalar(2.2); stem.position.y = 2.0; g.add(stem);
      for (let i=0;i<2;i++){ const j = H.jackLantern(0.22, i); j.position.set(i ? 0.7 : -0.7, 0, 1.4); g.add(j); }
      return true; }
    if (id === 'cnygate'){   // a red gate with spring couplets and a 福 sign, a lantern each side
      const red = std('#b8201c', 0.6), cap = std('#2e2a26', 0.7);
      for (const s of [-1, 1]){ const p = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 2.6, 10), red); p.position.set(1.15*s, 1.3, 0); g.add(p);
        const cp = canvasTex(64, 320, (x, w, h) => { x.fillStyle = '#d22a20'; x.fillRect(0, 0, w, h); x.fillStyle = '#f2d16b'; x.font = 'bold 44px "Microsoft JhengHei",sans-serif'; x.textAlign = 'center';
          [...(s < 0 ? '春滿人間' : '福臨門第')].forEach((c, i) => x.fillText(c, w/2, 60 + i*70)); });
        const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 1.3), new THREE.MeshStandardMaterial({map:cp, roughness:0.8})); sc.position.set(1.15*s, 1.35, 0.135); g.add(sc);
        const L = H.redLantern(); L.position.set(1.15*s, 2.15, 0.45); g.add(L); movers.push({o:L, sway:Math.random()*6.28}); }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.24, 0.32), red); beam.position.y = 2.6; g.add(beam);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.12, 0.6), cap); roof.position.y = 2.78; g.add(roof);
      for (const s of [-1, 1]){ const tip = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 6), cap); tip.position.set(1.65*s, 2.86, 0); tip.rotation.z = -s*1.0; g.add(tip); }
      const fu = canvasTex(128, 128, (x, w, h) => { x.fillStyle = '#d22a20'; x.fillRect(0, 0, w, h); x.fillStyle = '#f2d16b'; x.font = 'bold 86px "Microsoft JhengHei",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('福', w/2, h/2 + 4); });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshStandardMaterial({map:fu, roughness:0.8})); sign.position.set(0, 2.2, 0.17); sign.rotation.z = Math.PI/4; g.add(sign);
      return true; }
    if (id === 'rosebed'){   // a raised bed of red and pink roses
      const bed = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.3, 1.2), std('#8a6a4a', 0.9)); bed.position.y = 0.15; g.add(bed);
      const soil = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.05, 1.05), std('#4a3424', 1)); soil.position.y = 0.3; g.add(soil);
      const roseGeo = new THREE.TorusKnotGeometry(0.06, 0.025, 24, 5, 2, 5), leafG = new THREE.SphereGeometry(0.06, 6, 4);
      for (let i=0;i<22;i++){ const x = rnd(-1, 1), z = rnd(-0.42, 0.42), h = rnd(0.25, 0.5);
        const st = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.012, h, 4), leafM); st.position.set(x, 0.3 + h/2, z); g.add(st);
        const r = new THREE.Mesh(roseGeo, std(['#c8102e', '#e0446a', '#f4a3bb', '#a10f2a'][i % 4], 0.5)); r.position.set(x, 0.32 + h, z); r.rotation.x = Math.PI/2; g.add(r);
        for (const s of [-1, 1]){ const l = new THREE.Mesh(leafG, leafM); l.scale.set(1, 0.3, 0.5); l.position.set(x + 0.05*s, 0.3 + h*0.6, z); g.add(l); } }
      return true; }
    if (id === 'seesaw'){   // a seesaw that tips up and down by itself
      const frame = std('#4f86c6', 0.5), plank = std('#e2b53b', 0.6);
      for (const s of [-1, 1]){ const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.65, 0.1), frame); leg.position.set(0, 0.3, 0.2*s); leg.rotation.x = 0.25*s; g.add(leg); }
      const pivot = new THREE.Group(); pivot.position.y = 0.6; g.add(pivot);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.08, 0.3), plank); pivot.add(bar);
      for (const s of [-1, 1]){ const seat = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.36), std('#d84a3a', 0.6)); seat.position.set(1.3*s, 0.07, 0); pivot.add(seat);
        const hd = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 6, 12, Math.PI), frame); hd.position.set(1.05*s, 0.15, 0); hd.rotation.y = Math.PI/2; pivot.add(hd); }
      movers.push({o:pivot, seesaw:Math.random()*6.28}); return true; }
    if (id === 'dragondrum'){   // the dragon-boat drum on its red stand, with two sticks
      const red = std('#b8201c', 0.55), skinT = canvasTex(256, 256, (x, w, h) => { x.fillStyle = '#e8d6a8'; x.beginPath(); x.arc(128, 128, 128, 0, 6.3); x.fill(); x.strokeStyle = '#b8201c'; x.lineWidth = 10;
        x.beginPath(); x.arc(128, 128, 70, 0, 6.3); x.stroke(); x.fillStyle = '#b8201c'; x.font = 'bold 80px "Microsoft JhengHei",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('龍', 128, 132); });
      const skin = new THREE.MeshStandardMaterial({map:skinT, roughness:0.8});
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.6, 24, 1, true), red); drum.rotation.x = Math.PI/2; drum.position.y = 1.0; g.add(drum);
      for (const s of [-1, 1]){ const f = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24), skin); f.position.set(0, 1.0, 0.3*s); if (s < 0) f.rotation.y = Math.PI; g.add(f);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.035, 6, 24), gold); rim.position.set(0, 1.0, 0.3*s); g.add(rim); }
      for (const [x, z] of [[-0.5, -0.35], [0.5, -0.35], [-0.5, 0.35], [0.5, 0.35]]){ const l = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.75, 6), red); l.position.set(x, 0.37, z); g.add(l); }
      for (const s of [-1, 1]){ const st = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.5, 5), std('#7a5634', 0.8)); st.position.set(0.25*s, 1.55, 0.35); st.rotation.z = 0.5*s; g.add(st); }
      return true; }
    if (id === 'rabbitlamp'){   // a white jade-rabbit lantern that glows at night
      const m = new THREE.MeshStandardMaterial({color:'#f8f4ea', emissive:'#ffe0a8', emissiveIntensity:0, roughness:0.75}); glows.push({m, base:1.0, flick:5});
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 14), m); body.scale.set(1, 0.85, 1.25); body.position.y = 0.6; g.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.33, 16, 12), m); head.position.set(0, 1.05, 0.55); g.add(head);
      for (const s of [-1, 1]){ const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.45, 4, 8), m); ear.position.set(0.13*s, 1.55, 0.45); ear.rotation.set(-0.3, 0, -0.18*s); g.add(ear);
        const inner = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.35, 3, 6), std('#f3b6c4', 0.7)); inner.position.set(0.13*s, 1.55, 0.5); inner.rotation.set(-0.3, 0, -0.18*s); g.add(inner);
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), std('#c8203a', 0.3)); eye.position.set(0.15*s, 1.1, 0.83); g.add(eye); }
      const tail = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), m); tail.position.set(0, 0.6, -0.7); g.add(tail);
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.03, 6, 20, Math.PI), std('#7a5634', 0.8)); handle.position.y = 1.25; handle.rotation.y = Math.PI/2; g.add(handle);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex, color:'#ffe8b8', transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, opacity:0})); halo.scale.setScalar(3); halo.position.y = 0.8; g.add(halo); halos.push({s:halo, k:0.6, flick:2});
      return true; }
    if (id === 'clocktower'){   // a little countdown clock tower; its hands sweep toward midnight, its face lights up at night
      const wood = std('#7a5634', 0.85), roofM = std('#3a5a8a', 0.6);
      const tower = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.4, 0.9), std('#e8dcc4', 0.8)); tower.position.y = 1.2; g.add(tower);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.8, 0.9, 4), roofM); roof.position.y = 2.85; roof.rotation.y = Math.PI/4; g.add(roof);
      const faceT = canvasTex(256, 256, (x, w, h) => { x.fillStyle = '#fffaf0'; x.beginPath(); x.arc(128, 128, 124, 0, 6.3); x.fill(); x.strokeStyle = '#3a2a1c'; x.lineWidth = 8; x.stroke();
        x.fillStyle = '#3a2a1c'; x.font = 'bold 34px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; for (let i=1;i<=12;i++){ const a = i/12*6.283; x.fillText(String(i), 128 + Math.sin(a)*95, 128 - Math.cos(a)*95); } });
      const fm = new THREE.MeshStandardMaterial({map:faceT, emissive:'#fff0c8', emissiveMap:faceT, emissiveIntensity:0, roughness:0.6}); glows.push({m:fm, base:0.6, flick:0});
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.36, 32), fm); face.position.set(0, 1.95, 0.46); g.add(face);
      const hands = [0.26, 0.18].map((L, i) => { const p = new THREE.Group(); p.position.set(0, 1.95, 0.48); g.add(p); const h = new THREE.Mesh(new THREE.BoxGeometry(0.025, L, 0.01), std('#2a1a0c', 0.5)); h.position.y = L/2; p.add(h); return p; });
      movers.push({o:hands[0], clock:60}, {o:hands[1], clock:720});
      const door = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.7), wood); door.position.set(0, 0.35, 0.46); g.add(door);
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.15), std('#f2d16b', 0.3, {metalness:0.5, emissive:'#f2d16b', emissiveIntensity:0.3})); star.position.y = 3.4; g.add(star); movers.push({o:star, spin:1});
      return true; }
    if (id === 'sleigh'){   // Santa's red sleigh with curled runners and a pile of presents
      const red = std('#b8201c', 0.45), goldM = std('#d9a93a', 0.35, {metalness:0.6});
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 1.7), red); base.position.y = 0.7; g.add(base);
      const back = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 0.15), red); back.position.set(0, 1.05, -0.8); back.rotation.x = -0.2; g.add(back);
      for (const s of [-1, 1]){ const c = new THREE.CatmullRomCurve3([V3(0.5*s, 0.08, -1.0), V3(0.5*s, 0.05, 0.6), V3(0.5*s, 0.25, 1.15), V3(0.5*s, 0.55, 1.1), V3(0.5*s, 0.5, 0.9)]);
        g.add(new THREE.Mesh(new THREE.TubeGeometry(c, 24, 0.035, 6), goldM));
        for (const z of [-0.6, 0.4]){ const st = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.4, 5), goldM); st.position.set(0.5*s, 0.26, z); g.add(st); } }
      [[0, 1.1, -0.2, 0], [0.22, 1.02, 0.3, 1], [-0.25, 1.05, 0.15, 2], [0.05, 1.45, -0.05, 3]].forEach(([x, y, z, k]) => { const p = H.gift(k, 0.38); p.position.set(x, y - 0.12, z); p.rotation.y = k*0.7; g.add(p); });
      return true; }
    return false;
  };

  // ---------- the yard's holiday ring (game.js gives the spots) ----------
  const deco = [];
  H.setDeco = (kind, spots) => {
    deco.forEach(o => scene.remove(o)); deco.length = 0; bats.forEach(b => scene.remove(b.g)); bats.length = 0;
    const put = (o, p) => { o.position.set(p.x, gy(p.x, p.z), p.z); o.rotation.y = Math.atan2(-p.x, -p.z) + rnd(-0.3, 0.3); scene.add(o); deco.push(o); };
    if (kind === 'pumpkins'){ spots.forEach((p, i) => put(H.jackLantern(rnd(0.28, 0.42), i), p)); H.addBats(5, V3(0, 0, 0)); }
    if (kind === 'gifts') spots.forEach((p, i) => { const pile = new THREE.Group(); const a = H.gift(i), b = H.gift(i + 2, 0.3); b.position.set(0.35, 0, 0.15); pile.add(a, b); put(pile, p); });
    if (kind === 'lanterns') spots.forEach(p => put(H.lanternPost(), p));
    if (kind === 'leaves') spots.forEach(p => put(H.mugwort(), p));
  };

  H.update = (dt, t, {night = 0, cam} = {}) => {
    const fl = k => 0.82 + 0.1*Math.sin(t*11 + k) + 0.08*Math.sin(t*23.7 + k*3);   // candle flicker
    const lit = 0.12 + 0.88*night;
    for (const g_ of glows) g_.m.emissiveIntensity = g_.base*lit*(g_.flick ? fl(g_.flick) : 1);
    for (const h of halos) h.s.material.opacity = h.k*night*fl(h.flick);
    for (const m of movers){
      if (m.sway !== undefined) m.o.rotation.z = Math.sin(t*1.3 + m.sway)*0.06;
      if (m.seesaw !== undefined) m.o.rotation.z = Math.sin(t*0.9 + m.seesaw)*0.22;
      if (m.clock) m.o.rotation.z = -t/m.clock*6.283;
      if (m.spin) m.o.rotation.y += dt*m.spin;
    }
    for (const b of bats){   // looping flight with swoops; now and then a squeak
      b.a += b.w*dt; b.wob += dt; b.ph += b.rate*dt*6.283/6;
      const r = b.r + Math.sin(b.wob*0.7)*1.2, x = b.c.x + Math.sin(b.a)*r, z = b.c.z + Math.cos(b.a)*r, y = gy(x, z) + b.h + Math.sin(b.wob*1.3)*0.6;
      const dx = Math.cos(b.a)*b.w, dz = -Math.sin(b.a)*b.w;
      b.g.position.set(x, y, z); b.g.rotation.set(0, Math.atan2(dx, dz), 0); b.g.rotateZ(-Math.sign(b.w)*0.35);
      poseBat(b);
      if (onChirp && Math.random() < dt*0.15) onChirp(b.g.position);
    }
    for (let i=floaters.length - 1; i>=0; i--){ const f = floaters[i], o = f.o; f.t += dt;
      if (f.kind === 'leaf'){ o.position.y -= dt*0.6; o.position.x += Math.sin(f.t*2 + f.ph)*dt*0.6 + f.vx*dt; o.position.z += f.vz*dt; o.rotation.x += dt*f.spin*1.6; o.rotation.z = Math.sin(f.t*3 + f.ph)*0.8; }
      else { o.position.y += dt*(f.kind === 'heart' ? 0.7 : f.kind === 'balloon' ? 0.9 : 0.5); o.position.x += (f.vx + Math.sin(f.t*0.8 + f.ph)*0.15)*dt; o.position.z += f.vz*dt;
        if (f.kind === 'heart') o.rotation.y += dt*f.spin; else o.rotation.z = Math.sin(f.t*1.2 + f.ph)*0.1; }
      if (f.t > f.max || (f.kind === 'leaf' && o.position.y < gy(o.position.x, o.position.z))){ scene.remove(o); floaters.splice(i, 1); } }
  };
  return H;
}
