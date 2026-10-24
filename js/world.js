// The big world: 3 × 3 plots of 18 × 18 cells (x and z run from -27 to 27; north is -z, east is +x).
// The middle plot is home. The other eight start overgrown and are cleared with coins to expand the territory.
// Terrain: gentle hills, a hollow with mud, a plateau reached by a ramp, a winding river in the western third
// (clear water you can see the pebbles and fish through, crossed by bridges you build) and a beach with the sea in the east.
// Everything is generated from a seed into S.world, so it stays the same on every device.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// 4 × 4 plots: plot columns/rows -2..1 → x and z run from -45 to 27. Home is plot 0,0 (one of the four middle plots).
// Plots are 30 × 30 (18 until 2026-10, then 24; upgradeWorld v4 and v5 spread older saves out to the new size).
export const PLOT = 30, HALF = 45, WATER_Y = -0.32, X0 = -75, X1 = 45, Z0 = -75, Z1 = 45;
const OLD = 18, PS = PLOT/OLD;   // worlds are still generated at the old size, then scaled by PS (v4: × 24/18, v5: × 30/24)
const AREA = (PLOT/24)**2;       // how much more land there is than when the scatter counts were tuned
const oldCenter = k => { const [a, b] = k.split(',').map(Number); return [a*OLD, b*OLD]; };
const MARGIN = 15;   // wild land drawn past the edge of the world
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a)*t;
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
const sstep = (a, b, x) => { const t = clamp((x - a)/(b - a), 0, 1); return t*t*(3 - 2*t); };
const bump = u => u >= 1 ? 0 : (1 - u*u)*(1 - u*u);
const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export function rng(seed){ let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0)/4294967296; }; }
const hashKey = k => [...k].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;
export const PLOT_KEYS = [-2, -1, 0, 1].flatMap(b => [-2, -1, 0, 1].map(a => `${a},${b}`));
export const plotKey = (x, z) => x < X0 || x >= X1 || z < Z0 || z >= Z1 ? null : `${Math.floor((x + HALF)/PLOT) - 1},${Math.floor((z + HALF)/PLOT) - 1}`;
const plotCenter = k => { const [a, b] = k.split(',').map(Number); return [a*PLOT, b*PLOT]; };

// ---------- see-through: anything between the camera and the wombat is drawn with a dotted cut-out ----------
export const SEE = {a:{value:new THREE.Vector3()}, b:{value:new THREE.Vector3()}, r:{value:0}};
export function seeThrough(m){
  if (m.onBeforeCompile.see) return m;
  m.onBeforeCompile = seeCompile; return m;
}
function seeCompile(sh){ {
    sh.uniforms.uSeeA = SEE.a; sh.uniforms.uSeeB = SEE.b; sh.uniforms.uSeeR = SEE.r;
    sh.vertexShader = 'varying vec3 vSeeW;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vec4 seeW = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        seeW = instanceMatrix*seeW;
      #endif
      vSeeW = (modelMatrix*seeW).xyz;`);
    sh.fragmentShader = 'uniform vec3 uSeeA, uSeeB; uniform float uSeeR; varying vec3 vSeeW;\n' + sh.fragmentShader.replace('void main() {', `void main() {
      if (uSeeR > 0.0){
        vec3 ab = uSeeB - uSeeA; float t = clamp(dot(vSeeW - uSeeA, ab)/dot(ab, ab), 0.0, 1.0);
        float d = length(vSeeW - (uSeeA + ab*t));
        if (t > 0.04 && t < 0.97 && d < uSeeR){
          vec2 q = mod(floor(gl_FragCoord.xy), 2.0);
          if (q.x == q.y || d < uSeeR*0.55) discard;
        }
      }`);
} }
seeCompile.see = true;
// The same see-through, plus a gentle sway in the wind for leaves (the higher up the shape, the more it moves).
SEE.time = {value:0};
// Wind: grass rolls in slow waves all the time, and now and then a gust sweeps across the land (a band moving along
// the wind direction): grass bends flat and shines, tree tops lean and shake as it passes. gust = (dirX, dirZ, front, strength)
SEE.gust = {value:new THREE.Vector4(-0.85, 0.5, -999, 0)};
export function swaying(m, height = 2.5, amp = 0.3, wave = 0.2, see = true){   // see: false for grass and low plants (they never hide the wombat)
  m.onBeforeCompile = sh => {
    if (see) seeCompile(sh); sh.uniforms.uWind = SEE.time; sh.uniforms.uGust = SEE.gust;
    sh.fragmentShader = 'varying float vSheen;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= 1.0 + vSheen;');
    sh.vertexShader = 'uniform float uWind; uniform vec4 uGust; varying float vSheen;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec4 swayW = vec4(0.0, 0.0, 0.0, 1.0);
      #ifdef USE_INSTANCING
        swayW = instanceMatrix*swayW;
      #endif
      swayW = modelMatrix*swayW;
      float swayH = clamp(position.y/${height.toFixed(2)}, 0.0, 1.0);
      transformed.x += sin(uWind*1.6 + swayW.x*0.45 + swayW.z*0.3)*0.07*swayH*swayH;
      transformed.z += cos(uWind*1.2 + swayW.x*0.3 - swayW.z*0.4)*0.05*swayH*swayH;
      float along = dot(swayW.xz, uGust.xy);
      float roll = (sin(along*0.3 - uWind*1.8 + sin(swayW.x*0.05 - swayW.z*0.07)*2.0)*0.5 + 0.5)*${wave.toFixed(2)};   // rolling waves
      float gs = along - uGust.z, gust = exp(-gs*gs/90.0)*uGust.w*(0.8 + 0.2*sin(uWind*9.0 + swayW.x));                  // the passing gust
      float bend = (roll + gust)*swayH*swayH;
      transformed.x += uGust.x*bend*${amp.toFixed(2)}; transformed.z += uGust.y*bend*${amp.toFixed(2)}; transformed.y -= bend*${(amp*0.35).toFixed(3)};
      vSheen = bend*0.45;`);
  };
  m.customProgramCacheKey = () => 'sway' + height + '|' + amp + '|' + wave + (see ? '' : '|nosee');
  return m;
}
// Painted leaf clusters (a soft alpha cut-out) used for every tree canopy, so trees look leafy instead of faceted.
const leafTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d');
  for (let i=0;i<26;i++){ const a = Math.random()*Math.PI*2, r = 10 + Math.random()*40, px = 64 + Math.cos(a)*r*0.9, py = 64 + Math.sin(a)*r*0.9, l = 220 + Math.floor(Math.random()*35);
    x.save(); x.translate(px, py); x.rotate(a + Math.PI/2 + (Math.random() - 0.5)*0.8);
    const g = x.createLinearGradient(0, -16, 0, 16); g.addColorStop(0, `rgb(${l},${l},${l})`); g.addColorStop(1, `rgb(${l - 70},${l - 60},${l - 70})`);
    x.fillStyle = g; x.beginPath(); x.ellipse(0, 0, 7 + Math.random()*4, 15 + Math.random()*6, 0, 0, Math.PI*2); x.fill();
    x.strokeStyle = 'rgba(80,90,70,0.35)'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(0, -14); x.lineTo(0, 14); x.stroke(); x.restore(); }
  const t = new THREE.CanvasTexture(cv); t.anisotropy = 4; return t; })();
// Blender canopies get a fringe of painted leaf cards on their surface, so the outline is leafy instead of smooth.
// One texture holds both: the left half is solid (the canopy body samples it), the right half is a painted leaf spray.
export const canopyTex = (() => { const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128; const x = cv.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, 120, 128);
  for (let i=0;i<34;i++){ const a = Math.random()*Math.PI*2, r = 6 + Math.random()*46, px = 192 + Math.cos(a)*r*0.95, py = 64 + Math.sin(a)*r*0.95, l = 215 + Math.floor(Math.random()*40);
    x.save(); x.translate(px, py); x.rotate(a + Math.PI/2 + (Math.random() - 0.5)*0.9);
    const g = x.createLinearGradient(0, -14, 0, 14); g.addColorStop(0, `rgb(${l},${l},${l - 10})`); g.addColorStop(1, `rgb(${l - 60},${l - 50},${l - 60})`);
    x.fillStyle = g; x.beginPath(); x.ellipse(0, 0, 6 + Math.random()*4, 13 + Math.random()*5, 0, 0, Math.PI*2); x.fill(); x.restore(); }
  const t = new THREE.CanvasTexture(cv); t.anisotropy = 4; return t; })();
export function leafyCanopy(geo, seed = 1, perVert = 0.3, size = 1){
  const R = rng(seed), P = geo.attributes.position, N = geo.attributes.normal, C = geo.attributes.color, n = P.count;
  geo.computeBoundingBox(); const diag = geo.boundingBox.getSize(new THREE.Vector3()).length();
  const uvB = new Float32Array(n*2).fill(0.2); geo.setAttribute('uv', new THREE.BufferAttribute(uvB, 2));   // body samples the solid half
  const pos = [], nor = [], col = [], uv = [], idx = [], K = Math.min(320, Math.round(n*perVert));
  const p = new THREE.Vector3(), nn = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3(), r = new THREE.Vector3();
  for (let k=0;k<K;k++){
    const i = Math.floor(R()*n); p.fromBufferAttribute(P, i); nn.fromBufferAttribute(N, i).normalize();
    if (nn.y < -0.6 && R() < 0.7) continue;                              // fewer cards underneath
    const s = diag*0.1*size*(0.75 + R()*0.6), c = p.clone().addScaledVector(nn, s*0.18);
    t1.crossVectors(nn, r.set(R() - 0.5, R() - 0.5, R() - 0.5)).normalize(); t2.crossVectors(nn, t1).normalize();
    t1.addScaledVector(nn, 0.35).normalize();                            // tilt the cards out a little so the edge reads as leaves
    const base = pos.length/3, k2 = 0.95 + R()*0.15;
    for (const [a, b, ua, ub] of [[-1, -1, 0.5, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0.5, 1]]){
      const q = c.clone().addScaledVector(t1, a*s/2).addScaledVector(t2, b*s/2); pos.push(q.x, q.y, q.z); nor.push(nn.x, nn.y, nn.z); uv.push(ua, ub);
      col.push(C.getX(i)*k2, C.getY(i)*k2, C.getZ(i)*k2); }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3); }
  const cards = new THREE.BufferGeometry();
  cards.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); cards.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  cards.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); cards.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); cards.setIndex(idx);
  const body = geo.index ? geo : geo.toNonIndexed(); if (!body.index){ const a = []; for (let i=0;i<body.attributes.position.count;i++) a.push(i); body.setIndex(a); }
  const keep = ['position', 'normal', 'color', 'uv']; for (const k of Object.keys(body.attributes)) if (!keep.includes(k)) body.deleteAttribute(k);
  for (const k of ['position', 'normal', 'color']){ const A = body.attributes[k], f = new Float32Array(A.count*3);   // plain float xyz (Draco may hand back packed or 4-wide data)
    for (let i=0;i<A.count;i++){ f[i*3] = A.getX(i); f[i*3+1] = A.getY(i); f[i*3+2] = A.getZ(i); } body.setAttribute(k, new THREE.BufferAttribute(f, 3)); }
  return mergeGeometries([body, cards]);
}
// Ghibli touches for built things: leafy vines with little flowers along a path, and rounded field stones.
const VINE = {leaf:new THREE.IcosahedronGeometry(1, 0), bud:new THREE.SphereGeometry(1, 6, 4), stone:new THREE.DodecahedronGeometry(1, 1),
  leafM:['#4f7f3a', '#6a9a45', '#3d6a33'].map(c => new THREE.MeshStandardMaterial({color:c, roughness:0.9, flatShading:true})),
  budM:['#fbf8f0', '#f2a6be', '#f3d250'].map(c => new THREE.MeshStandardMaterial({color:c, roughness:0.6})),
  stoneM:['#b3aa98', '#9d9483', '#c4b9a3'].map(c => new THREE.MeshStandardMaterial({color:c, roughness:0.95, flatShading:true}))};
export function vines(g, pts, perUnit = 4, size = 1){
  for (let k=0;k<pts.length - 1;k++){ const a = pts[k], b = pts[k + 1], n = Math.max(1, Math.round(a.distanceTo(b)*perUnit));
    for (let i=0;i<n;i++){ const p = a.clone().lerp(b, (i + Math.random())/n);
      const l = new THREE.Mesh(VINE.leaf, VINE.leafM[(i + k) % 3]); l.position.set(p.x + (Math.random() - 0.5)*0.12*size, p.y + (Math.random() - 0.5)*0.12*size, p.z + (Math.random() - 0.5)*0.12*size);
      l.scale.set(1, 0.7, 1).multiplyScalar((0.07 + Math.random()*0.06)*size); l.rotation.set(Math.random()*3, Math.random()*3, 0); g.add(l);
      if (Math.random() < 0.3){ const f = new THREE.Mesh(VINE.bud, VINE.budM[Math.floor(Math.random()*3)]); f.position.copy(l.position).add(new THREE.Vector3(0, 0.05*size, 0)); f.scale.setScalar(0.035*size); g.add(f); } } }
}
export function fieldStone(g, x, y, z, r, flat = 0.7){ const s = new THREE.Mesh(VINE.stone, VINE.stoneM[Math.floor(Math.random()*3)]); s.position.set(x, y, z); s.scale.set(r*(0.9 + Math.random()*0.3), r*flat, r*(0.9 + Math.random()*0.3)); s.rotation.y = Math.random()*6; g.add(s); return s; }
export function leafMaterial(color){ return swaying(new THREE.MeshLambertMaterial({color: color || '#ffffff', map:leafTex, alphaTest:0.45, side:THREE.DoubleSide}), 3.0, 0.35, 0.12); }
// Leaf cards scattered over spherical blobs [x, y, z, r]; normals point out from each blob's centre for soft, rounded shading.
export function leafCards(blobs, density = 15, seed = 5){
  const R = rng(seed), pos = [], nor = [], uv = [], idx = [];
  for (const [bx, by, bz, r] of blobs){
    const n = Math.round(density*r*r + 6);
    for (let i=0;i<n;i++){
      const u = R()*2 - 1, th = R()*Math.PI*2, s = Math.sqrt(1 - u*u), d = new THREE.Vector3(s*Math.cos(th), u*0.85 + 0.15, s*Math.sin(th)).normalize(), rr = r*(0.5 + R()*0.55);
      const c = new THREE.Vector3(bx, by, bz).addScaledVector(d, rr), size = r*(0.55 + R()*0.35);
      const t1 = new THREE.Vector3().crossVectors(d, new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5)).normalize(), t2 = new THREE.Vector3().crossVectors(d, t1).normalize();
      const base = pos.length/3;
      for (const [a, b, ua, ub] of [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]]){
        const p = c.clone().addScaledVector(t1, a*size/2).addScaledVector(t2, b*size/2); pos.push(p.x, p.y, p.z);
        const nn = p.clone().sub(new THREE.Vector3(bx, by, bz)).normalize(); nor.push(nn.x, nn.y, nn.z); uv.push(ua, ub); }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
}
export const CANOPY_BLOBS = [[0, 2.0, 0, 0.95], [0.55, 1.75, 0.2, 0.7], [-0.5, 1.8, -0.15, 0.72], [0.1, 2.45, -0.1, 0.6], [-0.15, 1.7, 0.5, 0.6]];

// ---------- world description (saved in S.world) ----------
export function newWorld(seed){
  const R = rng(seed), r = (a, b) => a + R()*(b - a), f = (v, d=2) => +v.toFixed(d);
  const amp = r(1.6, 4.4), freq = r(0.06, 0.14), ph = r(0, 6.28), river = {w:f(r(3.0, 3.8)), pts:[]};
  for (let z = -52; z <= 52; z += 4) river.pts.push(f(-18 + Math.sin(z*freq + ph)*amp + Math.sin(z*freq*2.7 + ph*2)*amp*0.35 + r(-0.8, 0.8)));
  const coast = {x:f(r(20, 21.5)), a:f(r(0.6, 1.5)), f:f(r(0.12, 0.25), 3), p:f(r(0, 6.28))};
  const north = R() < 0.5, pz = north ? -1 : 1, side = R() < 0.3;
  const plat = {x:f(r(-3, 3), 1), z:f(pz*18 + r(-1, 1.5)*-pz, 1), hw:f(r(3.6, 4.6), 1), hd:f(r(3.2, 4), 1), h:f(r(1.6, 2.1)), dir: side ? (R() < 0.5 ? 1 : 3) : (north ? 0 : 2)};
  const hills = [], pits = [], muds = [];
  const spot = (cx, cz, sp) => [f(cx + r(-sp, sp), 1), f(cz + r(-sp, sp), 1)];
  // hills: the plot opposite the plateau gets two, the corners and side plots one or two each
  for (const k of ['-1,-1', '0,-1', '1,-1', '-1,0', '1,0', '-1,1', '0,1', '1,1']){ const [cx, cz] = oldCenter(k);   // the original 3 × 3 (upgradeWorld adds the rest)
    if (k === `0,${pz}`) continue;
    const n = k === `0,${-pz}` ? 1 : 1 + (R() < 0.5 ? 1 : 0);
    for (let i=0;i<n;i++){ const [x, z] = spot(cx, cz, 5); hills.push([x, z, f(r(3.2, 5.5), 1), f(r(0.5, 1.4))]); } }
  // a hollow with mud at the bottom in the plot opposite the plateau, and another one somewhere
  { const [x, z] = spot(0, -pz*18, 3); pits.push([x, z, f(r(3.4, 4.4), 1), f(r(0.45, 0.7))]); }
  { const k = ['-1,-1', '-1,1', '1,-1', '1,1'][Math.floor(R()*4)], [cx, cz] = oldCenter(k), [x, z] = spot(cx + (cx > 0 ? -3 : 3), cz, 3); pits.push([x, z, f(r(2.6, 3.4), 1), f(r(0.3, 0.5))]); }
  // mud flats along the river
  for (let i=0;i<3;i++){ const z = r(-24, 24), x = -18 + Math.sin(z*freq + ph)*amp + (R() < 0.5 ? -1 : 1)*r(3.2, 4.5); muds.push([f(x, 1), f(z, 1), f(r(1.4, 2.3), 1)]); }
  const D = {v:1, seed, river, coast, plat, hills, pits, muds, open:['0,0'], bridges:[], feats:[], nid:1};
  return upgradeWorld(D);
}
// Special regions on the 4 × 4 map: a lily pond, a swamp, the Australian outback and a beaver stream on the river.
export const BIO = {pond:'0,-2', swamp:'-2,-1', aus:'-2,1', beaver:'-1,-2', forest:'-2,0', high:'-2,-2', savanna:'-1,1', meadow:'0,1', mangrove:'1,0'};   // meadow: the flower meadow (花海) south of home
// v1 worlds were 3 × 3: grow them to 4 × 4 (new plots to the west and north) without moving anything already there.
export function upgradeWorld(D){
  if (D.v < 2){
  const R = rng(D.seed + 77), r = (a, b) => a + R()*(b - a), f = (v, d=1) => +v.toFixed(d);
  if (D.river.z0 == null){ D.river.z0 = -52; while (D.river.z0 > -45 - 20){ D.river.pts.unshift(f(D.river.pts[0] + r(-1.2, 1.2), 2)); D.river.z0 -= 4; } }
  for (const k of ['-2,-2', '1,-2', '-2,0', BIO.aus]){ const [a, b] = k.split(',').map(Number), n = 1 + (R() < 0.5 ? 1 : 0);
    for (let i=0;i<n;i++) D.hills.push([f(a*OLD + r(-5, 5)), f(b*OLD + r(-5, 5)), f(r(3.2, 5.5)), f(r(0.4, k === BIO.aus ? 0.7 : 1.3), 2)]); }
  const [sx, sz] = BIO.swamp.split(',').map(Number), pools = [];
  for (let i=0, n = 6 + Math.floor(R()*3); i<n; i++) pools.push([f(sx*OLD + r(-6, 6)), f(sz*OLD + r(-6, 6)), f(r(1.8, 3.4))]);
  D.bio = {pond:{x:f(r(-3, 3)), z:f(-36 + r(-2, 2)), r:f(r(4.4, 5.4))}, pools, beaverZ:f(-36 + r(-3, 3))};
  D.v = 2; }
  if (D.v < 3){   // the highland in the north-west: a high flat-topped hill reached by one ramp from the east, with a wolf cave
    const R3 = rng(D.seed + 91), [hx, hz] = oldCenter(BIO.high);
    D.bio.high = {h:+(3.0 + R3()*0.6).toFixed(2), rampZ:+(hz + (R3() - 0.5)*6).toFixed(1), cave:{x:+(hx - 3 + R3()*2).toFixed(1), z:+(hz - 3 + R3()*2).toFixed(1)}};
    D.v = 3; }
  if (D.v < 4){   // bigger plots (18 -> 24): spread every position out (features keep their own size, so there is more room between them)
    const P4 = 24/18, s = v => +(v*P4).toFixed(2), xz = a => { a[0] = s(a[0]); a[1] = s(a[1]); };
    D.river.pts = D.river.pts.map(s); D.river.z0 = s(D.river.z0 ?? -52); D.river.dz = +(4*P4).toFixed(4);
    D.coast.x = s(D.coast.x); D.coast.f = +(D.coast.f/P4).toFixed(4);
    D.plat.x = s(D.plat.x); D.plat.z = s(D.plat.z); D.plat.hw = s(D.plat.hw*0.9); D.plat.hd = s(D.plat.hd*0.9);
    D.hills.forEach(xz); D.pits.forEach(xz); D.muds.forEach(xz);
    const B = D.bio; B.pond.x = s(B.pond.x); B.pond.z = s(B.pond.z); B.pond.r = s(B.pond.r*0.9); B.pools.forEach(a => { xz(a); a[2] = s(a[2]*0.85); }); B.beaverZ = s(B.beaverZ);
    if (B.high){ B.high.rampZ = s(B.high.rampZ); B.high.cave.x = s(B.high.cave.x); B.high.cave.z = s(B.high.cave.z); }
    D.bridges.forEach(b => b.z = s(b.z)); D.feats.forEach(o => { o.x = s(o.x); o.z = s(o.z); });
    D.v = 4; D.scaledFrom = OLD; }
  if (D.v < 5){   // bigger again (24 -> 30): spread out the same way; the river gets wider, the highland an uneven outline
    const P5 = PLOT/24, s = v => +(v*P5).toFixed(2), xz = a => { a[0] = s(a[0]); a[1] = s(a[1]); };
    D.river.pts = D.river.pts.map(s); D.river.z0 = s(D.river.z0); D.river.dz = +(D.river.dz*P5).toFixed(4); D.river.w = +(D.river.w*1.5).toFixed(2);
    D.coast.x = s(D.coast.x); D.coast.f = +(D.coast.f/P5).toFixed(4);
    D.plat.x = s(D.plat.x); D.plat.z = s(D.plat.z); D.plat.hw = s(D.plat.hw); D.plat.hd = s(D.plat.hd);
    D.hills.forEach(xz); D.pits.forEach(xz); D.muds.forEach(xz);
    const B = D.bio; B.pond.x = s(B.pond.x); B.pond.z = s(B.pond.z); B.pond.r = +(B.pond.r*1.1).toFixed(2); B.pools.forEach(a => { xz(a); a[2] = +(a[2]*1.1).toFixed(2); }); B.beaverZ = s(B.beaverZ);
    if (B.high){ B.high.rampZ = s(B.high.rampZ); B.high.cave.x = s(B.high.cave.x); B.high.cave.z = s(B.high.cave.z); }
    const R5 = rng(D.seed + 505); D.edge = [0, 1, 2, 3, 4, 5].map(() => +(R5()*6.28).toFixed(2));   // phases for the uneven highland / plateau outlines
    D.bridges.forEach(b => b.z = s(b.z)); D.feats.forEach(o => { o.x = s(o.x); o.z = s(o.z); });
    D.v = 5; }
  if (D.v < 6){   // a bigger lily pond and swamp (more and larger pools)
    const B = D.bio, R6 = rng(D.seed + 606), [sx, sz] = plotCenter(BIO.swamp);
    B.pond.r = +(B.pond.r*1.35).toFixed(2); B.pools.forEach(a => { a[2] = +(a[2]*1.2).toFixed(2); });
    for (let i=0;i<3;i++) B.pools.push([+(sx + (R6() - 0.5)*PLOT*0.6).toFixed(1), +(sz + (R6() - 0.5)*PLOT*0.6).toFixed(1), +(2.6 + R6()*1.6).toFixed(2)]);
    D.v = 6; }
  return D;
}

// ---------- the world: terrain shape, looks, water, nature ----------
export function createWorld({scene, mobile, renderer, grassTex, mat, hbMat, fishModel, treeModels, plants, onFeatGone}){
  const W = {feats:[], pick:[], bridges:[], plots:{}};
  let D = null;
  const group = new THREE.Group(); scene.add(group);
  const DENS = mobile ? Math.min(AREA, 1.25) : AREA;   // scatter counts grow with the land (less on phones)

  // --- shape ---
  const riverX = z => { const P = D.river.pts, u = clamp((z - (D.river.z0 ?? -52))/(D.river.dz || 4), 1, P.length - 2.001), i = Math.floor(u), t = u - i;
    const p0 = P[i-1], p1 = P[i], p2 = P[i+1], p3 = P[Math.min(i+2, P.length-1)];
    return 0.5*(2*p1 + (-p0 + p2)*t + (2*p0 - 5*p1 + 4*p2 - p3)*t*t + (-p0 + 3*p1 - 3*p2 + p3)*t*t*t); };
  const riverDist = (x, z) => { const s = riverX(z + 0.5) - riverX(z - 0.5); return Math.abs(x - riverX(z))/Math.sqrt(1 + s*s); };
  const shoreX = z => D.coast.x + D.coast.a*Math.sin(z*D.coast.f + D.coast.p) + 0.5*Math.sin(z*D.coast.f*2.3 + D.coast.p*1.7);
  const RAMP_L = 6, RAMP_W = 3.4, DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  function platH(x, z){
    const P = D.plat, rr = Math.min(P.hw, P.hd)*0.5, qx = Math.abs(x - P.x) - P.hw + rr, qz = Math.abs(z - P.z) - P.hd + rr, E = D.edge;
    let d = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - rr;   // rounded corners
    if (E){ const a = Math.atan2(z - P.z, x - P.x); d += 0.9*Math.sin(3*a + E[3]) + 0.5*Math.sin(5*a + E[4]) + 0.3*Math.sin(8*a + E[5]); }   // and a wavy edge
    let h = P.h*(1 - sstep(E ? -0.6 : 0, E ? 3.4 : 0.9, d));   // gentle sides
    const [dx, dz] = DIRS[P.dir], ex = P.x + dx*P.hw, ez = P.z + dz*P.hd;
    const a = (x - ex)*dx + (z - ez)*dz, b = Math.abs((x - ex)*dz - (z - ez)*dx);
    if (a > -1 && a < RAMP_L + 0.5 && b < RAMP_W/2 + 0.8) h = Math.max(h, P.h*clamp(1 - a/RAMP_L, 0, 1)*(1 - sstep(RAMP_W/2 - 0.2, RAMP_W/2 + 0.7, b)));
    return h;
  }
  // distance from the pond's centre, stretched by direction so the pond is not a circle (its shoreline wanders in and out)
  const pondD = (x, z) => { const P = D.bio.pond, dx = x - P.x, dz = z - P.z, a = Math.atan2(dz, dx), E = D.edge || [0, 1, 2, 3, 4, 5];
    return Math.hypot(dx, dz)/(1 + 0.2*Math.sin(2*a + E[1]) + 0.13*Math.sin(3*a + E[4]) + 0.07*Math.sin(5*a + E[2])); };
  W.pondD = pondD;
  W.pondR = a => { const E = D.edge || [0, 1, 2, 3, 4, 5]; return D.bio.pond.r*(1 + 0.2*Math.sin(2*a + E[1]) + 0.13*Math.sin(3*a + E[4]) + 0.07*Math.sin(5*a + E[2])); };   // shoreline radius in a direction
  function H(x, z){
    let h = 0;
    for (const [hx, hz, r, hh] of D.hills) h += hh*bump(Math.hypot(x - hx, z - hz)/r);
    for (const [px, pz, r, d] of D.pits) h -= d*bump(Math.hypot(x - px, z - pz)/r);
    const out = Math.max(Z0 - z, z - Z1, X0 - x);   // wild hills beyond the world edge (the sea side stays open)
    if (out > 0) h += (2.6 + 0.8*Math.sin(x*0.41 + z*0.33))*sstep(0, 10, out);
    h *= sstep(6.5, 10, Math.max(Math.abs(x), Math.abs(z)));   // home stays flat
    h = Math.max(h, platH(x, z));
    if (D.bio){
      const P = D.bio.pond, pd = pondD(x, z);   // the lily pond: an uneven outline with little bays, a gently sloping shore
      if (pd < P.r + 4){ h *= sstep(P.r, P.r + 3.5, pd); h -= 1.0*(1 - sstep(P.r*0.55, P.r + 0.9, pd)); }
      const sw = swampW(x, z);   // the swamp: low, nearly flat and soggy, with dark pools
      if (sw > 0){ h = lerp(h, -0.14 + 0.06*Math.sin(x*0.9)*Math.sin(z*0.8), sw);
        for (const [px, pz, r] of D.bio.pools){ const d = Math.hypot(x - px, z - pz); if (d < r + 1) h = Math.min(h, lerp(-0.75, -0.14, sstep(r*0.35, r + 0.6, d))); } }
      const HI = D.bio.high;
      if (HI){ const [hx, hz] = plotCenter(BIO.high), dx = x - hx, dz = z - hz, a = Math.atan2(dz, dx), E = D.edge || [0, 1, 2, 3, 4, 5];
        const q = Math.cbrt(Math.abs(dx)**3 + Math.abs(dz)**3)*(1 + 0.11*Math.sin(3*a + E[0]) + 0.07*Math.sin(5*a + E[1]) + 0.04*Math.sin(9*a + E[2]))
          + 0.6*Math.sin(x*0.7)*Math.sin(z*0.6);   // a rounded, wavy outline (not a square block)
        if (q < 10.5*PS){ let hh = HI.h*(1 - sstep(5.6*PS, 9.2*PS, q)) + (q < 6.5*PS ? 0.25*Math.sin(x*0.5)*Math.sin(z*0.45) : 0.3*Math.sin(x*0.9 + z*0.4)*sstep(5.6*PS, 7*PS, q)*(1 - sstep(8.4*PS, 9.2*PS, q)));   // flat top, long uneven slopes
          const ex = hx + 8.4*PS; if (Math.abs(z - HI.rampZ) < 2.4 && x > hx + 4*PS){ const u = clamp((x - (ex - 1.5))/8, 0, 1); hh = Math.max(hh, HI.h*(1 - u)*(1 - sstep(1.5, 2.4, Math.abs(z - HI.rampZ)))); }   // the one ramp, on the east side
          const cd = Math.hypot(x - HI.cave.x, z - HI.cave.z); if (cd < 3.4) hh += 1.6*bump(cd/3.4);   // rocky mound over the wolves' cave
          h = Math.max(h, hh); } }
    }
    const rd = riverDist(x, z), bk = D.river.w/2;
    if (rd < bk + 4){ const bed = -1.05 + 1.05*sstep(bk*0.2, bk + 1.1, rd); h = lerp(bed, h, sstep(bk + 0.3, bk + 3.2, rd)); }
    const sx = shoreX(z);
    if (x > sx - 11){ const beach = 0.2*(1 - sstep(sx - 6, sx + 0.5, x)) - 1.9*sstep(sx - 0.5, sx + 8, x); h = lerp(h, beach, sstep(sx - 11, sx - 6, x)); }
    return h;
  }
  const plotW = (k, x, z, inner = 7, outer = 9.4) => { const [cx, cz] = plotCenter(k); return 1 - sstep(inner*PS, outer*PS, Math.max(Math.abs(x - cx), Math.abs(z - cz))); };   // (sizes given for 18-wide plots)
  const swampW = (x, z) => plotW(BIO.swamp, x, z, 8.2, 9.8);   // (almost the whole plot)
  W.plotW = plotW; W.swampW = swampW;
  const slope = (x, z) => Math.hypot(H(x + 0.3, z) - H(x - 0.3, z), H(x, z + 0.3) - H(x, z - 0.3))/0.6;
  const inWorld = (x, z) => x > X0 + 0.25 && x < X1 - 0.25 && z > Z0 + 0.25 && z < Z1 - 0.25;
  W.H = H; W.riverX = riverX; W.riverDist = riverDist; W.shoreX = shoreX; W.slope = slope; W.inWorld = inWorld;
  W.isRiver = (x, z) => riverDist(x, z) < D.river.w/2 + 0.25;
  W.isSea = (x, z) => x > shoreX(z) + 0.8 && H(x, z) < WATER_Y + 0.03;
  W.isPond = (x, z) => !!D.bio && pondD(x, z) < D.bio.pond.r + 1 && H(x, z) < WATER_Y - 0.02;
  W.isSwampWater = (x, z) => !!D.bio && swampW(x, z) > 0.5 && H(x, z) < WATER_Y - 0.02;
  W.isWater = (x, z) => W.isRiver(x, z) || W.isSea(x, z) || W.isPond(x, z) || W.isSwampWater(x, z);
  W.inBio = (k, x, z) => plotKey(x, z) === BIO[k];
  W.isOpenKey = k => !!k && D.open.includes(k);
  W.isOpen = (x, z) => W.isOpenKey(plotKey(x, z));
  W.isBeach = (x, z) => x > shoreX(z) - 5.5;
  W.isMud = (x, z) => D.muds.some(([mx, mz, r]) => Math.hypot(x - mx, z - mz) < r*0.8) || D.pits.some(([px, pz, r]) => Math.hypot(x - px, z - pz) < r*0.45);
  // ground under a point, including bridge decks
  W.gy = (x, z) => { const b = bridgeAt(x, z); return b != null ? Math.max(b, H(x, z)) : H(x, z); };
  W.swimmable = (x, z) => inWorld(x, z) && W.isOpen(x, z) && W.isWater(x, z) && !(W.isSea(x, z) && x > shoreX(z) + 6);
  W.walkable = (x, z) => inWorld(x, z) && W.isOpen(x, z) && (bridgeAt(x, z) != null || (!W.isWater(x, z) && slope(x, z) < 0.85));
  W.buildable = (x, z) => inWorld(x, z) && W.isOpen(x, z) && !W.isWater(x, z) && bridgeAt(x, z) == null && slope(x, z) < 0.5 && riverDist(x, z) > D.river.w/2 + 1;
  W.normal = (x, z) => V3(H(x - 0.3, z) - H(x + 0.3, z), 0.6, H(x, z - 0.3) - H(x, z + 0.3)).normalize();

  // --- looks: vertex colours + how much grass texture shows ---
  function surf(x, z){
    const sx = shoreX(z), rd = riverDist(x, z), bk = D.river.w/2, sl = slope(x, z);
    const nz = 0.5 + 0.5*Math.sin(x*0.31 + Math.sin(z*0.23)*2.1)*Math.sin(z*0.27 + Math.sin(x*0.19)*1.7);
    const tint = 0.9 + nz*0.16; let col = [tint*0.98, tint, tint*0.94], g = 1;
    if (D.plat && platH(x, z) > 0.5 && H(x, z) - platH(x, z) < 0.05) col = mixc(col, [1.02, 1.0, 0.86], 0.35);   // plateau grass a little drier
    const sandW = sstep(sx - 10, sx - 5.5, x + (nz - 0.5)*2.4);
    if (sandW > 0){ const wet = sstep(sx + 0.3, sx + 2.4, x); col = mixc(col, mixc([0.95, 0.87, 0.68], [0.78, 0.69, 0.52], wet), sandW); g *= 1 - sandW; }
    if (sandW > 0){ const mg = plotW(BIO.mangrove, x, z, 6.5, 9.4); if (mg > 0) col = mixc(col, mixc([0.55, 0.5, 0.4], [0.4, 0.37, 0.3], sstep(sx - 4, sx + 1.5, x)), mg*sandW); }   // the mangrove's grey-brown tidal mud
    if (rd < bk + 1.9){ const w = 1 - sstep(bk + 0.3, bk + 1.9, rd + (nz - 0.5)*0.9); col = mixc(col, rd < bk + 0.2 ? [0.66, 0.62, 0.53] : [0.62, 0.52, 0.39], w); g *= 1 - w; }
    let mud = 0;
    for (const [mx, mz, r] of D.muds) mud = Math.max(mud, 1 - sstep(r*0.5, r, Math.hypot(x - mx, z - mz) + (nz - 0.5)*1.2));
    for (const [px, pz, r] of D.pits) mud = Math.max(mud, 1 - sstep(r*0.22, r*0.55, Math.hypot(x - px, z - pz) + (nz - 0.5)*0.9));
    if (mud > 0){ col = mixc(col, [0.47, 0.36, 0.26], mud); g *= 1 - mud; }
    if (D.bio){
      const sw = swampW(x, z); if (sw > 0){ col = mixc(col, mixc([0.5, 0.5, 0.32], [0.4, 0.36, 0.26], nz), sw*0.85); g *= 1 - sw*0.7; }
      const au = plotW(BIO.aus, x, z, 6.5, 9.8); if (au > 0){ col = mixc(col, mixc([0.93, 0.6, 0.38], [0.84, 0.5, 0.32], nz), au*0.9); g *= 1 - au*0.75; }
      const hi = plotW(BIO.high, x, z, 6, 9); if (hi > 0){ col = mixc(col, mixc([0.74, 0.76, 0.62], [0.62, 0.66, 0.54], nz), hi*0.55); g *= 1 - hi*0.35; }
      const fo = plotW(BIO.forest, x, z, 6, 9.5); if (fo > 0){ col = mixc(col, [0.72, 0.82, 0.6], fo*0.4); }   // shady forest floor
      const sv = plotW(BIO.savanna, x, z, 6.5, 9.8); if (sv > 0){ col = mixc(col, mixc([1.0, 0.9, 0.55], [0.9, 0.8, 0.46], nz), sv*0.7); }   // golden grassland
      const pd = Math.hypot(x - D.bio.pond.x, z - D.bio.pond.z) - D.bio.pond.r; if (pd < 1.6){ const w = 1 - sstep(-0.2, 1.6, pd + (nz - 0.5)*0.6); col = mixc(col, pd < 0 ? [0.55, 0.52, 0.42] : [0.5, 0.42, 0.3], w); g *= 1 - w; }
    }
    const rock = sstep(0.8, 1.5, sl); if (rock > 0){ col = mixc(col, [0.66, 0.63, 0.58], rock); g *= 1 - rock; }
    if (!inWorld(x, z)) col = col.map(c => c*0.8);
    else if (!W.isOpen(x, z)){ const l = (col[0] + col[1] + col[2])/3; col = col.map(c => lerp(c, l, 0.25)*0.8); }
    return [col, g];
  }

  // --- terrain mesh ---
  const SIZE = (X1 - X0) + 2*MARGIN, SEG = mobile ? 200 : 290, CX = (X0 + X1)/2, CZ = (Z0 + Z1)/2;
  let terrain = null;
  function buildTerrain(){
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG); geo.rotateX(-Math.PI/2); geo.translate(CX, 0, CZ);
    const p = geo.attributes.position, n = p.count, cols = new Float32Array(n*3), gr = new Float32Array(n);
    for (let i=0;i<n;i++){ const x = p.getX(i), z = p.getZ(i); p.setY(i, H(x, z)); }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3)); geo.setAttribute('aGrass', new THREE.BufferAttribute(gr, 1));
    geo.computeVertexNormals();
    const tex = grassTex.clone(); tex.needsUpdate = true; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(SIZE/2.2, SIZE/2.2); tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const m = new THREE.MeshLambertMaterial({vertexColors:true, map:tex});
    m.onBeforeCompile = sh => {
      sh.vertexShader = 'attribute float aGrass;\nvarying float vGrass;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\nvGrass = aGrass;');
      sh.fragmentShader = 'varying float vGrass;\n' + sh.fragmentShader.replace('#include <map_fragment>',
        'vec4 texelColor = texture2D( map, vMapUv ); float lum = dot(texelColor.rgb, vec3(0.333));\n diffuseColor.rgb *= mix(vec3(0.8 + lum*0.4), texelColor.rgb, vGrass);');
    };
    terrain = new THREE.Mesh(geo, m); terrain.userData.kind = 'ground'; terrain.renderOrder = -2; group.add(terrain);
    recolor(() => true);
    W.terrain = terrain;
  }
  function recolor(test){
    const geo = terrain.geometry, p = geo.attributes.position, c = geo.attributes.color, g = geo.attributes.aGrass;
    for (let i=0;i<p.count;i++){ const x = p.getX(i), z = p.getZ(i); if (!test(x, z)) continue; const [col, gw] = surf(x, z); c.setXYZ(i, col[0], col[1], col[2]); g.setX(i, gw); }
    c.needsUpdate = true; g.needsUpdate = true;
  }

  // --- grass tufts on the grassy parts ---
  const GRASS_COLS = ['#a9d86b', '#9ed062', '#b8e27c', '#c4e88c', '#94c95c', '#b0dc74'];   // fresh light-green meadow grass (weeds are now dark broad-leaf plants, so these can be green)
  let tufts = null;
  function buildTufts(R){
    const blade = (a, tilt, h) => { const g = new THREE.ConeGeometry(0.028, h, 3); g.translate(0, h/2, 0); g.rotateZ(tilt); g.rotateY(a); return g; };
    const geo = mergeGeometries([blade(0, 0.25, 0.32), blade(2.1, 0.3, 0.26), blade(4.2, 0.2, 0.36), blade(1.0, -0.15, 0.24), blade(3.1, 0.35, 0.3), blade(5.2, -0.3, 0.28)]);
    const N = Math.round((mobile ? 7500 : 17000)*DENS), M = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color(), list = [];
    for (let k=0; k<N*3 && list.length < N; k++){
      const x = lerp(X0 - 3, X1 + 3, R()), z = lerp(Z0 - 3, Z1 + 3, R());
      if (W.isWater(x, z) || surf(x, z)[1] < 0.75) continue; list.push([x, z]); }
    { const [cx, cz] = plotCenter(BIO.savanna), n = Math.round((mobile ? 1600 : 3400)*DENS); let c = 0;   // the grassland: tall golden grass everywhere
      for (let k=0; k<n*3 && c < n; k++){ const x = cx + (R() - 0.5)*PLOT, z = cz + (R() - 0.5)*PLOT; if (W.isWater(x, z) || surf(x, z)[1] < 0.6) continue; list.push([x, z, 1]); c++; } }
    { const p = geo.attributes.position, c = new Float32Array(p.count*3); for (let i=0;i<p.count;i++){ const k = 0.62 + 0.5*clamp(p.getY(i)/0.36, 0, 1); c[i*3] = k; c[i*3+1] = k; c[i*3+2] = k*0.85; } geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); }   // darker at the root, light at the tip
    const m = new THREE.InstancedMesh(geo, swaying(new THREE.MeshLambertMaterial({vertexColors:true}), 0.34, 0.2, 0.75, false), list.length);
    list.forEach(([x, z, tall], i) => { const s = 0.7 + R()*0.6, sy = tall ? 1.5 + R()*0.9 : 0.8 + R()*0.4; M.compose(V3(x, H(x, z) - 0.02, z), q.setFromAxisAngle(V3(0, 1, 0), R()*6.28), V3(s*(tall ? 1.3 : 1), s*sy, s*(tall ? 1.3 : 1))); m.setMatrixAt(i, M);
      m.setColorAt(i, col.set(tall ? ['#e2cf86', '#d8c27a', '#e8d898', '#cdb56c'][i % 4] : GRASS_COLS[i % GRASS_COLS.length]).multiplyScalar((0.85 + R()*0.15)*(W.isOpen(x, z) || !inWorld(x, z) ? 1 : 0.8))); });
    group.add(m); tufts = m; W.tufts = m;
  }

  // --- wildflowers in little patches: daisies, buttercups, pink clover, purple lupine spikes; they sway with the grass ---
  function buildFlowers(R){
    const stemGeo = (() => { const g = new THREE.CylinderGeometry(0.008, 0.012, 0.3, 3); g.translate(0, 0.15, 0); return g; })();
    const paint = (g, rgb) => { const n = g.attributes.position.count, c = new Float32Array(n*3); for (let i=0;i<n;i++) c.set(rgb, i*3); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g; };
    const head = (() => { const parts = [];   // five petals around a centre (petals take the instance colour, the centre stays golden)
      for (let i=0;i<5;i++){ const p = new THREE.SphereGeometry(0.035, 5, 3); p.scale(1, 0.25, 0.55); p.translate(0.04, 0, 0); p.rotateY(i*Math.PI*2/5); parts.push(paint(p, [1, 1, 1])); }
      const c = new THREE.SphereGeometry(0.022, 6, 4); c.scale(1, 0.6, 1); c.translate(0, 0.008, 0); parts.push(paint(c, [1.0, 0.75, 0.2]));
      const g = mergeGeometries(parts); g.translate(0, 0.3, 0); return g; })();
    const spike = (() => { const parts = []; for (let i=0;i<9;i++){ const b = new THREE.SphereGeometry(0.028 - i*0.002, 5, 3); b.translate(Math.sin(i*2.4)*0.02, 0.3 + i*0.03, Math.cos(i*2.4)*0.02); parts.push(paint(b, [1, 1, 1])); }
      return mergeGeometries(parts); })();
    const KINDS = [['#ffffff', 0], ['#fff7e6', 0], ['#ffd23a', 0], ['#ffe066', 0], ['#f5a8c4', 0], ['#ee86ad', 0], ['#a98be0', 1], ['#8f7ad8', 1], ['#9ec8f0', 0]];
    const list = [], N = Math.round((mobile ? 1300 : 3400)*DENS);
    for (let k=0; k<600 && list.length < N; k++){
      const cx = lerp(X0, X1, R()), cz = lerp(Z0, Z1, R()); if (W.isWater(cx, cz) || surf(cx, cz)[1] < 0.75 || W.isBeach(cx, cz)) continue;
      const kind = Math.floor(R()*KINDS.length), n = 10 + Math.floor(R()*18), rad = 0.8 + R()*1.8;   // one kind per patch, a stray other one now and then
      for (let i=0;i<n;i++){ const a = R()*6.28, r = Math.sqrt(R())*rad, x = cx + Math.cos(a)*r, z = cz + Math.sin(a)*r;
        if (W.isWater(x, z) || surf(x, z)[1] < 0.6) continue; list.push([x, z, R() < 0.12 ? Math.floor(R()*KINDS.length) : kind]); } }
    { const [mx, mz] = plotCenter(BIO.meadow), n = Math.round((mobile ? 2600 : 6500)*DENS); let c = 0;   // the flower meadow (花海): broad drifts of colour
      for (let k=0; k<n*3 && c < n; k++){ const x = mx + (R() - 0.5)*PLOT, z = mz + (R() - 0.5)*PLOT;
        if (R() > W.plotW(BIO.meadow, x, z, 6.2, 9.4) || W.isWater(x, z) || surf(x, z)[1] < 0.5) continue;
        const band = Math.sin(x*0.16 + Math.sin(z*0.11)*2.2) + 0.6*Math.sin(z*0.21 - x*0.07);   // wavy stripes, a different colour in each
        list.push([x, z, R() < 0.15 ? Math.floor(R()*KINDS.length) : (Math.floor((band + 1.6)*2.2) % KINDS.length + KINDS.length) % KINDS.length]); c++; } }
    const mat = () => swaying(new THREE.MeshLambertMaterial({vertexColors:true}), 0.45, 0.2, 0.75, false);
    const stems = new THREE.InstancedMesh(stemGeo, mat(), list.length), heads = new THREE.InstancedMesh(head, mat(), list.length), spikes = new THREE.InstancedMesh(spike, mat(), list.length);
    paint(stemGeo, [0.42, 0.62, 0.3]);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
    list.forEach(([x, z, k], i) => { const s = 1.3 + R()*0.7, y = H(x, z) - 0.01; q.setFromEuler(new THREE.Euler((R() - 0.5)*0.3, R()*6.28, (R() - 0.5)*0.3));
      M.compose(V3(x, y, z), q, V3(s, s*(KINDS[k][1] ? 1.3 : 1), s)); stems.setMatrixAt(i, M);
      const dim = W.isOpen(x, z) || !inWorld(x, z) ? 1 : 0.85; col.set(KINDS[k][0]).multiplyScalar(dim*(0.92 + R()*0.08));
      if (KINDS[k][1]){ spikes.setMatrixAt(i, M); spikes.setColorAt(i, col); heads.setMatrixAt(i, zero); heads.setColorAt(i, col); }
      else { heads.setMatrixAt(i, M); heads.setColorAt(i, col); spikes.setMatrixAt(i, zero); spikes.setColorAt(i, col); } });
    const g = new THREE.Group(); g.add(stems, heads, spikes); group.add(g); W.flowers = g;
    if (plants) buildKitPlants(R, g);
  }
  function buildKitPlants(R, into){
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color(), Y = new THREE.Vector3(0, 1, 0);
    const place = (models, n, test, sMin, sMax, patch) => { if (!models || !models.length) return;
      const lists = models.map(() => []);
      for (let k=0; k<n*4 && lists.reduce((a, l) => a + l.length, 0) < n; k++){
        const cx = lerp(X0, X1, R()), cz = lerp(Z0, Z1, R()); if (!test(cx, cz)) continue;
        const v = Math.floor(R()*models.length), m = patch ? 3 + Math.floor(R()*5) : 1;
        for (let i=0;i<m;i++){ const a = R()*6.28, r = patch ? Math.sqrt(R())*1.4 : 0, x = cx + Math.cos(a)*r, z = cz + Math.sin(a)*r; if (test(x, z)) lists[v].push([x, z]); } }
      models.forEach((md, v) => { const L = lists[v]; if (!L.length || !md.canopy) return; const im = new THREE.InstancedMesh(md.canopy, md.canopyMat, L.length);
        L.forEach(([x, z], i) => { const s = sMin + R()*(sMax - sMin); M.compose(V3(x, H(x, z) - 0.02, z), q.setFromAxisAngle(Y, R()*6.28), V3(s, s, s)); im.setMatrixAt(i, M);
          im.setColorAt(i, col.setScalar((0.9 + R()*0.15)*(W.isOpen(x, z) || !inWorld(x, z) ? 1 : 0.85))); });
        into.add(im); }); };
    const grassy = (x, z) => !W.isWater(x, z) && !W.isBeach(x, z) && surf(x, z)[1] > 0.7;
    const S_ = (mobile ? 0.45 : 1)*DENS;
    place(plants.grass, Math.round(2400*S_), grassy, 0.8, 1.35, true);                                         // lush grass clumps
    place(plants.flower, Math.round(520*S_), grassy, 0.7, 1.15, true);                                         // flower groups in patches
    place(plants.fern, Math.round(700*S_), grassy, 0.7, 1.3, true);                                            // ferns, clover, leafy plants
    place(plants.mush, Math.round(120*S_), (x, z) => grassy(x, z) && plotKey(x, z) === BIO.forest, 0.8, 1.4, true);   // mushrooms in the deer forest
    place(plants.flower, Math.round(900*S_), (x, z) => grassy(x, z) && plotKey(x, z) === BIO.meadow, 0.9, 1.5, true);   // the flower meadow's big flower clumps
  }

  // --- shared nature models ---
  const bark = seeThrough(mat('#7a5634', 0.95)), leafM = seeThrough(new THREE.MeshLambertMaterial({flatShading:true})), rockM = seeThrough(new THREE.MeshLambertMaterial({flatShading:true})), bushM = seeThrough(new THREE.MeshLambertMaterial({flatShading:true}));
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.27, 1.5, 7); trunkGeo.translate(0, 0.75, 0);
  // canopy = a darker solid core (so you cannot see through it) wrapped in painted leaf cards
  const canopyGeo = mergeGeometries(CANOPY_BLOBS.map(([x, y, z, r]) => { const g = new THREE.IcosahedronGeometry(r*0.72, 1); g.translate(x, y, z); return g; }));
  const cardGeo = leafCards(CANOPY_BLOBS, mobile ? 10 : 15), leafCardM = leafMaterial();
  const TRUNK_M = seeThrough(new THREE.MeshLambertMaterial({vertexColors:true})), CANOPY_M = swaying(new THREE.MeshLambertMaterial({vertexColors:true, color:'#c9d8bc', map:canopyTex, alphaTest:0.45, side:THREE.DoubleSide}), 3.6, 0.4, 0.12);
  const TREE_TINTS = ['#ffffff', '#f0f6e6', '#f6f2e0', '#e8f0e0', '#fbf8ee'];
  W.TRUNK_M = TRUNK_M; W.CANOPY_M = CANOPY_M;
  const pineCards = leafCards([[0, 1.2, 0, 0.95], [0, 1.9, 0, 0.75], [0, 2.55, 0, 0.55], [0, 3.05, 0, 0.32]], mobile ? 9 : 13, 11), bushCards = leafCards([[0, 0.45, 0, 0.62], [0.35, 0.38, 0.2, 0.42], [-0.3, 0.4, -0.15, 0.45]], mobile ? 9 : 13, 13);
  const pineGeo = mergeGeometries([[0, 1.4, 1.0, 1.4], [0, 2.2, 0.8, 1.2], [0, 2.9, 0.55, 1.0]].map(([x, y, r, h]) => { const g = new THREE.ConeGeometry(r, h, 7); g.translate(x, y, 0); return g; }));
  const bushGeos = [0, 1, 2].map(v => { const R = rng(99 + v), parts = [];
    for (let i=0;i<4 + v;i++){ const g = new THREE.IcosahedronGeometry(0.35 + R()*0.25, 0); g.translate((R() - 0.5)*0.9, 0.3 + R()*0.25, (R() - 0.5)*0.9); parts.push(g); }
    return mergeGeometries(parts); });
  const rockGeos = [0, 1, 2, 3].map(v => { const R = rng(7 + v), g = new THREE.DodecahedronGeometry(1, v % 2), p = g.attributes.position;
    const key = (x, y, z) => `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`, off = {};
    for (let i=0;i<p.count;i++){ const k = key(p.getX(i), p.getY(i), p.getZ(i)); off[k] = off[k] || 0.78 + R()*0.4; const s = off[k]; p.setXYZ(i, p.getX(i)*s, Math.max(-0.35, p.getY(i)*s*0.72), p.getZ(i)*s); }
    g.translate(0, 0.3, 0); g.computeVertexNormals(); return g; });
  const ROCK_COLS = ['#a19c92', '#8f8a80', '#b3ab9c', '#968c7c'], LEAF_COLS = ['#5f8f3e', '#6fa148', '#4f7d34', '#5a8a46'], BUSH_COLS = ['#5d9440', '#4d8237', '#6aa24a'];
  W.geos = {trunkGeo, canopyGeo, cardGeo, pineGeo, rockGeos, bushGeos};

  // An instanced patch of trees, bushes and rocks (overgrowth on locked plots, and the wild forest outside the world).
  function wilds(items){
    const g = new THREE.Group(), M = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color(), Y = V3(0, 1, 0);
    const make = (geo, material, list, colors) => { if (!list.length) return null; const m = new THREE.InstancedMesh(geo, material, list.length);
      list.forEach((o, i) => { M.compose(V3(o.x, o.y, o.z), q.setFromAxisAngle(Y, o.ry), V3(o.s, o.s*(o.sy || 1), o.s)); m.setMatrixAt(i, M); if (colors) m.setColorAt(i, col.set(colors[i % colors.length]).multiplyScalar(o.dim || 1)); });
      g.add(m); return m; };
    const trees = items.filter(o => o.k === 'tree'), pines = items.filter(o => o.k === 'pine'), eucs = items.filter(o => o.k === 'euc'), bushes = items.filter(o => o.k === 'bush');
    if (treeModels){   // Blender trees: one instanced trunk + canopy per variant, each tree tinted a little differently
      const byVariant = (list, set) => set.forEach((m, v) => { const sub = list.filter((o, i) => i % set.length === v); if (!sub.length) return;
        if (m.trunk) make(m.trunk, m.trunkMat || TRUNK_M, sub, ['#ffffff', '#f2ece4', '#e8e0d4']); if (m.canopy) make(m.canopy, m.canopyMat || CANOPY_M, sub, TREE_TINTS); });
      byVariant(trees, treeModels.oak); byVariant(pines, treeModels.pine); byVariant(eucs, treeModels.euc); byVariant(bushes, treeModels.bush);
    } else {
      make(trunkGeo, bark, [...trees, ...pines, ...eucs], null);
      make(canopyGeo, leafM, [...trees, ...eucs], LEAF_COLS); make(pineGeo, leafM, pines, ['#3f6f45', '#4a7b4c', '#36633e']);
      make(bushGeos[0], bushM, bushes, BUSH_COLS);
    }
    make(rockGeos[1], rockM, items.filter(o => o.k === 'rock'), ROCK_COLS);
    group.add(g); return g;
  }
  function scatter(R, x0, x1, z0, z1, n, kinds, test){
    const out = [];
    for (let k=0; k<n*4 && out.length < n; k++){
      const x = lerp(x0, x1, R()), z = lerp(z0, z1, R());
      if (W.isWater(x, z) || slope(x, z) > 1.1 || (test && !test(x, z))) continue;
      const kind = kinds[Math.floor(R()*kinds.length)], s = kind === 'rock' ? 0.35 + R()*0.6 : kind === 'bush' ? 0.8 + R()*0.6 : 0.85 + R()*0.45;
      out.push({k:kind, x, z, y:H(x, z) - (kind === 'rock' ? 0.1 : 0.02), s, ry:R()*6.28, sy: kind === 'pine' ? 1 + R()*0.4 : 1});
    }
    return out;
  }
  // overgrowth + a sign for each locked plot
  function buildLocked(k){
    const R = rng(D.seed + hashKey(k)), [cx, cz] = plotCenter(k), h = PLOT/2 - 0.4;
    const items = scatter(R, cx - h, cx + h, cz - h, cz + h, k === BIO.savanna ? 22 : 95, k === BIO.savanna ? ['tree', 'bush', 'bush', 'rock'] : k === BIO.aus ? ['euc', 'euc', 'bush', 'bush', 'rock'] : k === BIO.forest ? ['tree', 'pine', 'pine', 'tree', 'bush'] : ['tree', 'tree', 'pine', 'bush', 'bush', 'bush', 'rock'], (x, z) => !W.isBeach(x, z) || x < shoreX(z) - 2)
      .concat(scatter(R, cx - h, cx + h, cz - h, cz + h, 14, ['bush', 'rock'], (x, z) => W.isBeach(x, z) && x < shoreX(z) + 0.5));
    const g = wilds(items); g.traverse(o => { if (o.isMesh){ o.userData.kind = 'locked'; o.userData.ref = k; W.pick.push(o); } });
    const sign = new THREE.Sprite(new THREE.SpriteMaterial({map:signTex(), transparent:true, depthWrite:false}));
    let sx = cx, sz = cz; for (let t=0; t<20 && (W.isWater(sx, sz) || slope(sx, sz) > 0.6); t++){ sx = cx + (R() - 0.5)*10; sz = cz + (R() - 0.5)*10; }
    sign.position.set(sx, H(sx, sz) + 3.2, sz); sign.scale.set(3.4, 1.7, 1); sign.userData.kind = 'locked'; sign.userData.ref = k; sign.renderOrder = 4; g.add(sign); W.pick.push(sign);
    W.plots[k] = {g, sign, eucs:items.filter(o => o.k === 'euc').map(o => ({x:o.x, z:o.z, s:o.s, ry:o.ry, euc:true, wild:true})), oaks:items.filter(o => o.k === 'tree').map(o => ({x:o.x, z:o.z, s:o.s, ry:o.ry, wild:true})),
      bushes:items.filter(o => o.k === 'bush').map(o => ({x:o.x, z:o.z, y:o.y + 0.75*o.s}))};
  }
  let signTexture = null;
  function signTex(){
    if (signTexture) return signTexture;
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128; const x = cv.getContext('2d');
    x.fillStyle = 'rgba(80,58,38,0.92)'; x.beginPath(); x.roundRect(8, 8, 240, 112, 22); x.fill(); x.strokeStyle = '#e8d2a6'; x.lineWidth = 5; x.stroke();
    x.fillStyle = '#fff6e0'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = 'bold 40px "Huninn","Microsoft JhengHei",sans-serif'; x.fillText('🔒 未開拓', 128, 50);
    x.font = '26px "Huninn","Microsoft JhengHei",sans-serif'; x.fillText('點一下整理土地', 128, 94);
    return signTexture = new THREE.CanvasTexture(cv);
  }
  // dashed rope posts on the edge between your land and land that is still locked
  let border = null;
  function buildBorder(){
    if (border){ group.remove(border); border.geometry.dispose(); }
    const pts = [];
    for (const k of PLOT_KEYS){ if (!W.isOpenKey(k)) continue; const [cx, cz] = plotCenter(k), h = PLOT/2;
      for (const [nx, nz, ax, az] of [[1, 0, 0, 1], [-1, 0, 0, 1], [0, 1, 1, 0], [0, -1, 1, 0]]){
        const nk = plotKey(cx + nx*(h + 1), cz + nz*(h + 1)); if (!nk || W.isOpenKey(nk)) continue;
        const ex = cx + nx*h, ez = cz + nz*h;
        for (let s = -h; s < h; s += 0.8){ const x0 = ex + ax*s, z0 = ez + az*s, x1 = ex + ax*(s + 0.45), z1 = ez + az*(s + 0.45);
          if (W.isWater(x0, z0)) continue; pts.push(x0, H(x0, z0) + 0.06, z0, x1, H(x1, z1) + 0.06, z1); } } }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    border = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({color:'#fff4d6', transparent:true, opacity:0.75})); group.add(border);
  }

  // --- features on open land: rocks and bushes you can pay to clear (trees live in game.js) ---
  function makeFeat(d){
    const g = new THREE.Group(); let m;
    if (d.k === 'rock'){ m = new THREE.Mesh(rockGeos[d.v % 4], rockMat(d.v)); m.scale.set(d.s, d.s*(0.8 + (d.v % 3)*0.12), d.s*0.9); }
    else { m = new THREE.Mesh(bushGeos[d.v % 3], bushMat(d.v)); m.scale.setScalar(d.s); if (treeModels && treeModels.bush.length){ const bm_ = treeModels.bush[d.v % treeModels.bush.length]; m = new THREE.Mesh(bm_.canopy, bm_.canopyMat || CANOPY_M); m.scale.setScalar(d.s); }
      if (d.v % 2){ for (let i=0;i<5;i++){ const b = new THREE.Mesh(berryGeo, berryM[(d.v >> 1) % 2]); const a = i*1.3 + d.v; b.position.set(Math.cos(a)*0.42, 0.5 + (i % 2)*0.18, Math.sin(a)*0.42); m.add(b); } } }
    g.add(m); g.position.set(d.x, H(d.x, d.z) - (d.k === 'rock' ? 0.12*d.s : 0.02), d.z); g.rotation.y = d.ry; group.add(g);
    const r = W.featR(d), hb = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.k === 'rock' ? 1.4*d.s + 0.4 : 1.2*d.s, 8), hbMat); hb.position.y = 0.5*d.s; hb.userData.kind = d.k; g.add(hb);
    const f = {d, g, hb}; hb.userData.ref = f; W.feats.push(f); W.pick.push(hb); return f;
  }
  const rockMats = {}, bushMats = {};
  const rockMat = v => rockMats[v % 4] || (rockMats[v % 4] = seeThrough(mat(ROCK_COLS[v % 4], 0.95)));
  const bushLeafMats = {}, bushLeaf = v => bushLeafMats[v % 3] || (bushLeafMats[v % 3] = leafMaterial(BUSH_COLS[v % 3]));
  const bushMat = v => bushMats[v % 3] || (bushMats[v % 3] = seeThrough(new THREE.MeshLambertMaterial({color:BUSH_COLS[v % 3], flatShading:true})));
  const berryGeo = new THREE.SphereGeometry(0.06, 8, 6), berryM = [mat('#d8423c', 0.4), mat('#f2f0ea', 0.6)];
  W.featR = d => d.k === 'rock' ? 0.85*d.s : 0.6*d.s;
  W.rockSize = d => d.s > 0.95 ? 'big' : d.s > 0.5 ? 'mid' : 'small';
  // bushes slowly grow back on open land (rocks and trees never come back by themselves)
  // extra trees for the deer forest (added once)
  W.moreTrees = (k, n, existing) => { const R = rng(D.seed*3 + hashKey(k)), [cx, cz] = plotCenter(k), out = [];
    for (let t=0; t<n*15 && out.length < n; t++){ const x = cx + (R()*2 - 1)*PLOT*0.42, z = cz + (R()*2 - 1)*PLOT*0.42, s = 0.95 + R()*0.35;
      if (W.isWater(x, z) || slope(x, z) > 0.55 || existing.some(o => Math.hypot(o.x - x, o.z - z) < 2.4) || out.some(o => Math.hypot(o.x - x, o.z - z) < 2.4) || D.feats.some(o => Math.hypot(o.x - x, o.z - z) < W.featR(o) + 1.2)) continue;
      out.push({x:+x.toFixed(2), z:+z.toFixed(2), s:+s.toFixed(2), ry:+(R()*6.28).toFixed(2), hive:false, p:k}); }
    return out; };
  W.addBush = (x, z, k) => { const d = {id:D.nid++, k:'bush', x:+x.toFixed(2), z:+z.toFixed(2), s:+(0.7 + Math.random()*0.4).toFixed(2), ry:+(Math.random()*6.28).toFixed(2), v:Math.floor(Math.random()*12), p:k};
    D.feats.push(d); const f = makeFeat(d); f.g.scale.setScalar(0.01); fading.push({g:f.g, t:0, grow:true}); return f; };
  W.removeFeat = f => {
    D.feats = D.feats.filter(x => x !== f.d); W.feats.splice(W.feats.indexOf(f), 1); W.pick.splice(W.pick.indexOf(f.hb), 1); f.hb.userData.kind = null;
    fading.push({g:f.g, t:0, s:f.g.scale.x});
  };
  const fading = [];
  // Generate rocks, bushes and trees for a plot. Trees are returned for game.js (which owns them); `avoid` keeps spots clear.
  W.genFeats = (k, avoid) => {
    const R = rng(D.seed*7 + hashKey(k)), [cx, cz] = plotCenter(k), h = PLOT/2 - 1, home = k === '0,0', trees = [];
    const ok = (x, z, r) => !W.isWater(x, z) && slope(x, z) < 0.55 && riverDist(x, z) > D.river.w/2 + 1.2 && x > X0 + 1 && x < X1 - 1 && z > Z0 + 1 && z < Z1 - 1
      && !(avoid && avoid(x, z, r)) && !D.feats.some(o => Math.hypot(o.x - x, o.z - z) < W.featR(o) + r + 0.8) && !trees.some(o => Math.hypot(o.x - x, o.z - z) < r + 1.8);
    const put = (n, fn) => { for (let t=0, c=0; t<n*12 && c<n; t++){ const x = cx + (R()*2 - 1)*h, z = cz + (R()*2 - 1)*h; if (home && Math.max(Math.abs(x), Math.abs(z)) < 3.5) continue; if (fn(x, z)) c++; } };
    const rock = (s) => (x, z) => { if (!ok(x, z, 0.85*s)) return false; D.feats.push({id:D.nid++, k:'rock', x:+x.toFixed(2), z:+z.toFixed(2), s:+s.toFixed(2), ry:+(R()*6.28).toFixed(2), v:Math.floor(R()*12), p:k}); return true; };
    const bush = (x, z) => { const s = 0.8 + R()*0.5; if (!ok(x, z, 0.6*s) || W.isBeach(x, z)) return false; D.feats.push({id:D.nid++, k:'bush', x:+x.toFixed(2), z:+z.toFixed(2), s:+s.toFixed(2), ry:+(R()*6.28).toFixed(2), v:Math.floor(R()*12), p:k}); return true; };
    const tree = (x, z) => { const s = 0.85 + R()*0.3; if (!ok(x, z, 0.9*s) || W.isBeach(x, z)) return false; trees.push({x:+x.toFixed(2), z:+z.toFixed(2), s:+s.toFixed(2), ry:+(R()*6.28).toFixed(2), hive: k !== BIO.aus && R() < 0.25, p:k, ...(k === BIO.aus ? {euc:1} : k === BIO.swamp ? {swamp:1} : {})}); return true; };
    if (home){ put(1, rock(0.6 + R()*0.2)); put(1, rock(0.3 + R()*0.15)); put(1, bush); }
    else if (k === BIO.savanna){ put(1, rock(0.55 + R()*0.25)); put(2, bush); put(2, tree); }   // open grassland: just a couple of shade trees
    else { put(R() < 0.5 ? 1 : 0, rock(1.0 + R()*0.25)); put(1, rock(0.55 + R()*0.25)); put(2, rock(0.3 + R()*0.2)); put(2 + Math.floor(R()*2), bush); put(3 + Math.floor(R()*2), tree); }   // fewer and smaller than before
    return trees;
  };
  // top a plot up to `want` rocks + bushes (some plots ended up nearly bare after old saves were thinned out)
  W.topUpFeats = (k, want, avoid) => {
    const R = rng(D.seed*13 + hashKey(k) + D.nid), [cx, cz] = plotCenter(k), h = PLOT/2 - 1; let have = D.feats.filter(o => o.p === k).length;
    for (let t=0; t<200 && have < want; t++){
      const x = cx + (R()*2 - 1)*h, z = cz + (R()*2 - 1)*h, rock = R() < 0.5, s = rock ? 0.35 + R()*0.45 : 0.8 + R()*0.5, r = rock ? 0.85*s : 0.6*s;
      if (k === '0,0' && Math.max(Math.abs(x), Math.abs(z)) < 3.5) continue;
      if (W.isWater(x, z) || slope(x, z) > 0.55 || riverDist(x, z) < D.river.w/2 + 1.2 || W.isBeach(x, z) || (avoid && avoid(x, z, r)) || D.feats.some(o => Math.hypot(o.x - x, o.z - z) < W.featR(o) + r + 0.8)) continue;
      D.feats.push({id:D.nid++, k:rock ? 'rock' : 'bush', x:+x.toFixed(2), z:+z.toFixed(2), s:+s.toFixed(2), ry:+(R()*6.28).toFixed(2), v:Math.floor(R()*12), p:k}); have++;
    }
  };

  // --- river: clear flowing water over a pebbly bed, with fish ---
  let riverMesh = null, riverMat = null;
  const fish = [];
  function buildRiver(R){
    const bk = D.river.w/2 + 0.65, pos = [], uv = [], idx = [];
    let L = 0, prev = null;
    for (let z = Z0 - MARGIN, i = 0; z <= Z1 + MARGIN + 0.01; z += 0.5, i++){
      const x = riverX(z), s = riverX(z + 0.25) - riverX(z - 0.25), n = V3(1, 0, -s*2).normalize();
      if (prev) L += Math.hypot(x - prev[0], z - prev[1]); prev = [x, z];
      pos.push(x - n.x*bk, WATER_Y, z - n.z*bk, x + n.x*bk, WATER_Y, z + n.z*bk); uv.push(0, L, 1, L);
      if (i) idx.push(2*i - 2, 2*i - 1, 2*i, 2*i - 1, 2*i + 1, 2*i);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    riverMat = new THREE.ShaderMaterial({transparent:true, depthWrite:false, side:THREE.DoubleSide, uniforms:{uTime:{value:0}, uNight:{value:0}, uSun:{value:1}},
      vertexShader:`varying vec2 vUv; varying vec3 vWP; void main(){ vUv = uv; vec4 w = modelMatrix*vec4(position,1.0); vWP = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader:`uniform float uTime, uNight, uSun; varying vec2 vUv; varying vec3 vWP;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }
        float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0 - 2.0*f); return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y); }
        void main(){
          float e = abs(vUv.x - 0.5)*2.0, flow = uTime*(1.25 - e*0.6);
          float n = noise(vec2(vUv.x*5.0, vUv.y*0.9 - flow*0.9))*0.6 + noise(vec2(vUv.x*11.0 + 3.0, vUv.y*1.9 - flow*1.6))*0.4;
          float streak = smoothstep(0.6, 0.85, noise(vec2(vUv.x*14.0, vUv.y*0.45 - flow*1.4)));
          float glint = smoothstep(0.86, 0.97, noise(vec2(vUv.x*26.0, vUv.y*3.2 - flow*2.2)));
          vec3 deep = vec3(0.20, 0.50, 0.64), shallow = vec3(0.48, 0.78, 0.82);
          vec3 col = mix(deep, shallow, e*e*0.85 + (n - 0.5)*0.3);
          col += (streak*0.13 + glint*0.4)*uSun;
          col *= mix(1.0, 0.32, uNight);
          float a = mix(0.42, 0.12, smoothstep(0.55, 1.0, e)) + streak*0.12 + glint*0.25;
          a *= 1.0 - smoothstep(0.86, 1.0, e);
          gl_FragColor = vec4(col, a);
        }`});
    riverMesh = new THREE.Mesh(geo, riverMat); riverMesh.renderOrder = 3; riverMesh.userData.kind = 'river'; group.add(riverMesh); W.pick.push(riverMesh);
    // pebbles on the bed
    const pebbles = [], N = Math.round((mobile ? 260 : 420)*DENS);
    for (let k=0; k<N*3 && pebbles.length < N; k++){ const z = lerp(Z0 - 6, Z1 + 6, R()), x = riverX(z) + (R()*2 - 1)*(D.river.w/2 + 0.3); if (riverDist(x, z) > D.river.w/2 + 0.3) continue; pebbles.push([x, z]); }
    const pm = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({flatShading:true}), pebbles.length);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color(), PC = ['#9a958b', '#b7ae9c', '#7f7a72', '#c4b49a', '#8c8f94', '#a8806a', '#d6cfc0'];
    pebbles.forEach(([x, z], i) => { const s = 0.06 + R()*R()*0.2; M.compose(V3(x, H(x, z) + s*0.2, z), q.setFromEuler(new THREE.Euler(R()*3, R()*3, R()*3)), V3(s*1.3, s*0.6, s)); pm.setMatrixAt(i, M); pm.setColorAt(i, c.set(PC[i % PC.length])); });
    group.add(pm);
    // fish in a few colours swimming up and down the river
    const FISH = [['#f08a3c', '#f6b26b'], ['#f2efe8', '#e0483a'], ['#e0483a', '#f2b0a0'], ['#4f86c6', '#9cc4ec'], ['#f3d250', '#fff2a8'], ['#7a8c5a', '#b5c48a'], ['#c3ccd6', '#eef2f6'], ['#2f3a40', '#e8a33c']];
    const bodyGeo = new THREE.SphereGeometry(1, 12, 8), finGeo = new THREE.ConeGeometry(0.09, 0.2, 4); finGeo.rotateX(Math.PI/2); finGeo.translate(0, 0, -0.09);
    for (let i=0;i<(mobile ? 9 : 13);i++){
      const fm = fishModel && fishModel(i); if (fm){ const s = 1.2 + R()*0.8; fm.g.scale.setScalar(s); group.add(fm.g);
        fish.push({g:fm.g, tail:fm.tail, z:lerp(Z0 + 3, Z1 - 3, R()), off:(R()*2 - 1)*0.6, tOff:0, sp:(R() < 0.5 ? -1 : 1)*(0.35 + R()*0.5), depth:0.18 + R()*0.22, ph:R()*9, turnT:3 + R()*6, darting:0}); continue; }
      const [c1, c2] = FISH[i % FISH.length], g = new THREE.Group(), body = new THREE.Mesh(bodyGeo, mat(c1, 0.35)); body.scale.set(0.085, 0.075, 0.24); g.add(body);
      const belly = new THREE.Mesh(bodyGeo, mat(c2, 0.4)); belly.scale.set(0.07, 0.05, 0.19); belly.position.set(0, -0.025, 0.01); g.add(belly);
      if (i % FISH.length === 1){ const spot = new THREE.Mesh(bodyGeo, mat('#e0483a', 0.4)); spot.scale.set(0.06, 0.035, 0.09); spot.position.set(0, 0.05, 0.05); g.add(spot); }
      const tail = new THREE.Group(); tail.position.z = -0.22; const tf = new THREE.Mesh(finGeo, body.material); tf.scale.set(1.1, 1.4, 1); tail.add(tf); g.add(tail);
      const s = 0.8 + R()*0.7; g.scale.setScalar(s); group.add(g);
      fish.push({g, tail, z:lerp(Z0 + 3, Z1 - 3, R()), off:(R()*2 - 1)*0.6, tOff:0, sp:(R() < 0.5 ? -1 : 1)*(0.35 + R()*0.5), depth:0.18 + R()*0.22, ph:R()*9, turnT:3 + R()*6, darting:0});
    }
  }
  // tap a fish and it leaps out of the water
  W.jumpFish = f => { if (f.jump > 0) return false; f.jump = 0.9; return true; };
  // koi in the lily pond: drift about under the pads, scatter from the wombat, leap when tapped
  const koi = [];
  function updateKoi(dt, t, pet){
    if (!D.bio) return;
    const P = D.bio.pond, inPond = (x, z) => W.isPond(x, z) && pondD(x, z) < P.r - 0.6;
    const pick = () => { for (let i=0;i<20;i++){ const a = Math.random()*6.28, r = Math.sqrt(Math.random())*W.pondR(a)*0.8, x = P.x + Math.cos(a)*r, z = P.z + Math.sin(a)*r; if (inPond(x, z)) return V3(x, 0, z); } return V3(P.x, 0, P.z); };
    if (!koi.length && fishModel){ for (let i=0;i<(mobile ? 5 : 7);i++){ const fm = fishModel([0, 1, 2, 4, 6, 0, 1][i], true); if (!fm) break; fm.g.scale.setScalar(1.5 + Math.random()*0.6); group.add(fm.g);
        const k = {g:fm.g, tail:fm.tail, at:pick(), dest:pick(), sp:0.4 + Math.random()*0.3, depth:0.2 + Math.random()*0.2, ph:Math.random()*9, jump:0};
        k.g.position.copy(k.at); k.hb = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), hbMat); k.hb.userData.kind = 'fish'; k.hb.userData.ref = k; group.add(k.hb); W.pick.unshift(k.hb); koi.push(k); } }
    for (const k of koi){
      const p = k.g.position, d = V3(k.dest.x - p.x, 0, k.dest.z - p.z), L = d.length();
      let sp = k.sp; if (pet && Math.hypot(pet.x - p.x, pet.z - p.z) < 2.5){ k.dest = V3(p.x + (p.x - pet.x)*2, 0, p.z + (p.z - pet.z)*2); if (!inPond(k.dest.x, k.dest.z)) k.dest = pick(); sp = 1.6; }
      if (L < 0.3) k.dest = pick();
      else { d.normalize(); const nx = p.x + d.x*sp*dt, nz = p.z + d.z*sp*dt; if (inPond(nx, nz)){ p.x = nx; p.z = nz; } else k.dest = pick();
        k.g.rotation.y += clamp(wrapA(Math.atan2(d.x, d.z) - k.g.rotation.y), -2*dt, 2*dt); }
      const w = Math.sin(t*(5 + sp*5) + k.ph); k.tail.rotation.y = w*0.6;
      p.y = WATER_Y - k.depth + Math.sin(t*1.1 + k.ph)*0.03;
      if (k.jump > 0){ k.jump -= dt; const u = 1 - k.jump/0.9; p.y = WATER_Y - 0.1 + Math.sin(u*Math.PI)*0.9; k.g.rotation.x = -Math.cos(u*Math.PI)*0.9; } else k.g.rotation.x = 0;
      k.hb.position.set(p.x, WATER_Y + 0.05, p.z);
    }
  }
  function updateFish(dt, t, pet){
    if (!fish.hbDone){ fish.hbDone = true; fish.forEach(f => { f.hb = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), hbMat); f.hb.userData.kind = 'fish'; f.hb.userData.ref = f; group.add(f.hb); W.pick.unshift(f.hb); }); }
    const bk = D.river.w/2;
    for (const f of fish){
      f.turnT -= dt;
      if (f.turnT <= 0){ f.turnT = 3 + Math.random()*7; if (Math.random() < 0.35) f.sp = -f.sp; f.tOff = (Math.random()*2 - 1)*0.65; f.depth = 0.15 + Math.random()*0.25; }
      if (pet && riverDist(pet.x, pet.z) < bk + 1.4 && Math.hypot(pet.x - riverX(f.z), pet.z - f.z) < 2.2 && f.darting <= 0){ f.darting = 1.2; f.sp = Math.sign(f.z - pet.z || 1)*1.6; }
      f.darting -= dt; const sp = f.darting > 0 ? f.sp : Math.sign(f.sp)*Math.min(Math.abs(f.sp), 0.85);
      f.z += sp*dt; if (f.z < Z0 + 1.5 || f.z > Z1 - 1.5){ f.z = clamp(f.z, Z0 + 1.5, Z1 - 1.5); f.sp = -f.sp; }
      f.off += (f.tOff - f.off)*Math.min(1, dt*0.6);
      const x0 = riverX(f.z), s = riverX(f.z + 0.3) - riverX(f.z - 0.3), n = V3(1, 0, -s/0.6).normalize();
      const w = Math.sin(t*(6 + Math.abs(sp)*6) + f.ph);
      f.g.position.set(x0 + n.x*f.off*bk, WATER_Y - f.depth + Math.sin(t*1.3 + f.ph)*0.03, f.z + n.z*f.off*bk);
      f.g.rotation.y = Math.atan2(s/0.6*Math.sign(sp), Math.sign(sp)) + w*0.12;
      if (f.tail) f.tail.rotation.y = w*0.6;   // (the realistic trout swims with its own clip)
      if (f.jump > 0){ f.jump -= dt; const u = 1 - f.jump/0.9; f.g.position.y = WATER_Y - 0.1 + Math.sin(u*Math.PI)*1.1; f.g.rotation.x = -Math.cos(u*Math.PI)*0.9; } else f.g.rotation.x = 0;
      if (f.hb) f.hb.position.set(f.g.position.x, WATER_Y + 0.05, f.g.position.z);
    }
  }

  // --- the sea: waves rolling onto the beach, foam at the waterline ---
  let seaMat = null;
  function buildSea(){
    const geo = new THREE.PlaneGeometry(170, 220, 1, 1); geo.rotateX(-Math.PI/2); geo.translate(12 + 85, WATER_Y + 0.01, (Z0 + Z1)/2);   // well past the world on every side
    seaMat = new THREE.ShaderMaterial({transparent:true, depthWrite:false, uniforms:{uTime:{value:0}, uNight:{value:0}, uSun:{value:1}, uC:{value:new THREE.Vector4(D.coast.x, D.coast.a, D.coast.f, D.coast.p)},
      uFog:{value:new THREE.Color('#d9e1d2')}, uFogN:{value:30}, uFogF:{value:90}, uBig:{value:new THREE.Vector3(99, 0, 0)}},
      vertexShader:`varying vec3 vWP; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vWP = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader:`uniform float uTime, uNight, uSun, uFogN, uFogF; uniform vec4 uC; uniform vec3 uFog, uBig; varying vec3 vWP;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }
        float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0 - 2.0*f); return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y); }
        void main(){
          float z = vWP.z, sx = uC.x + uC.y*sin(z*uC.z + uC.w) + 0.5*sin(z*uC.z*2.3 + uC.w*1.7);
          float d = vWP.x - (sx + 2.0);                     // distance out from the waterline
          float reach = 1.2 + uBig.z;                       // a big wave washes further up the sand
          if (d < -reach) discard;
          float n = noise(vWP.xz*0.35 + vec2(uTime*0.15, uTime*0.05))*0.6 + noise(vWP.xz*0.9 - vec2(uTime*0.3, 0.0))*0.4;
          vec3 col = mix(vec3(0.55, 0.86, 0.84), vec3(0.18, 0.47, 0.66), smoothstep(0.0, 14.0, d));
          col = mix(col, vec3(0.13, 0.35, 0.55), smoothstep(14.0, 40.0, d));
          float wave = sin(d*1.4 + uTime*1.7 + noise(vec2(z*0.2, uTime*0.1))*3.0);
          float crest = smoothstep(0.82, 1.0, wave)*(1.0 - smoothstep(2.0, 12.0, d));
          float wash = 0.5 + 0.5*sin(uTime*0.9 + z*0.15);
          float foam = (1.0 - smoothstep(-0.4 + wash*0.6 - uBig.z, 0.5 + wash*0.6, d))*step(-reach, d);
          float bd = d - uBig.x + sin(z*0.25 + uTime*0.3)*0.6, roller = exp(-bd*bd*0.7)*uBig.y;   // the big roller coming in
          crest = max(crest, roller*smoothstep(-0.5, 0.6, bd + 0.3)); foam = max(foam, roller*0.6*smoothstep(3.0, 0.0, d));
          col += (n - 0.5)*0.08 + (crest*0.35 + foam*0.6)*uSun + smoothstep(0.9, 1.0, n)*0.12*uSun;
          col *= mix(1.0, 0.3, uNight);
          float a = mix(0.45, 0.9, smoothstep(0.0, 6.0, d)) + foam*0.4;
          a *= smoothstep(-reach, -reach + 0.6, d);
          float fogF = smoothstep(uFogN, uFogF, length(vWP - cameraPosition));
          gl_FragColor = vec4(mix(col, uFog, fogF), mix(min(a, 1.0), 1.0, fogF*step(4.0, d)));
        }`});
    const sea = new THREE.Mesh(geo, seaMat); sea.renderOrder = 3; sea.userData.kind = 'sea'; group.add(sea); W.sea = sea;
  }

  // --- still water: the lily pond (clear, greenish) and the swamp pools (murky, with duckweed) ---
  const stillMats = [];
  function stillWater(geo, deep, shallow, alpha, weed){
    const m = new THREE.ShaderMaterial({transparent:true, depthWrite:false, side:THREE.DoubleSide, uniforms:{uTime:{value:0}, uNight:{value:0}, uSun:{value:1}},
      vertexShader:`varying vec3 vWP; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vWP = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader:`uniform float uTime, uNight, uSun; varying vec3 vWP;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }
        float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0 - 2.0*f); return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y); }
        void main(){
          vec2 p = vWP.xz;
          float n = noise(p*0.8 + vec2(uTime*0.05, uTime*0.03))*0.6 + noise(p*2.1 - vec2(uTime*0.07, 0.0))*0.4;
          float ripple = smoothstep(0.82, 0.97, noise(p*3.0 + vec2(sin(uTime*0.4), cos(uTime*0.3))*0.6));
          vec3 col = mix(vec3(${deep}), vec3(${shallow}), n);
          float weed = ${weed ? 'smoothstep(0.55, 0.75, noise(p*1.4 + 11.0))*0.85' : '0.0'};
          col = mix(col, vec3(0.42, 0.55, 0.2), weed);
          col += ripple*0.25*uSun;
          col *= mix(1.0, 0.32, uNight);
          gl_FragColor = vec4(col, ${alpha} + weed*0.3 + ripple*0.15);
        }`});
    stillMats.push(m); const mesh = new THREE.Mesh(geo, m); mesh.renderOrder = 3; group.add(mesh); return mesh;
  }
  function buildStill(){
    if (!D.bio) return;
    const P = D.bio.pond, pg = new THREE.CircleGeometry(P.r + 1.4, 48); pg.rotateX(-Math.PI/2); pg.translate(P.x, WATER_Y, P.z);
    stillWater(pg, '0.22, 0.48, 0.45', '0.42, 0.68, 0.58', 0.5, false).userData.kind = 'pond';
    const [cx, cz] = plotCenter(BIO.swamp), sg = new THREE.PlaneGeometry(20*PS, 20*PS); sg.rotateX(-Math.PI/2); sg.translate(cx, WATER_Y - 0.01, cz);
    stillWater(sg, '0.2, 0.26, 0.16', '0.32, 0.38, 0.22', 0.78, true).userData.kind = 'swamp';
  }

  // --- the wolves' cave: boulders piled into an arch over a dark opening, facing the ramp (east) ---
  function buildCave(){
    const HI = D.bio && D.bio.high; if (!HI) return;
    const g = new THREE.Group(), cx = HI.cave.x, cz = HI.cave.z, rm = seeThrough(mat('#8d8a80', 0.95)), dark = new THREE.MeshBasicMaterial({color:'#0e0c0a'});
    const door = V3(cx + 2.3, 0, cz); door.y = H(door.x, door.z);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.95, 20, 0, Math.PI), dark); hole.position.set(door.x - 0.15, door.y - 0.05, cz); hole.rotation.y = Math.PI/2; g.add(hole);
    const inner = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 10, 0, Math.PI*2, 0, Math.PI/2), new THREE.MeshBasicMaterial({color:'#0e0c0a', side:THREE.BackSide})); inner.position.set(door.x - 0.9, door.y - 0.05, cz); inner.scale.set(1.2, 1.05, 1); g.add(inner);
    const R = rng(D.seed + 5);
    for (let i=0;i<9;i++){ const a = -Math.PI/2 + i/8*Math.PI, r = 1.25 + R()*0.15, s = 0.38 + R()*0.22;   // arch stones round the opening
      const st = new THREE.Mesh(rockGeos[i % 4], rm); st.scale.set(s, s*0.9, s); st.position.set(door.x - 0.1, door.y - 0.1 + Math.sin(a + Math.PI/2)*r*0.85, cz + Math.cos(a + Math.PI/2)*r); st.rotation.y = R()*6; g.add(st); }
    for (let i=0;i<10;i++){ const a = R()*Math.PI*2, r = R()*2.4, s = 0.6 + R()*0.7, x = cx + Math.cos(a)*r - 0.5, z = cz + Math.sin(a)*r;   // boulders on the mound
      const st = new THREE.Mesh(rockGeos[i % 4], rm); st.scale.set(s, s*0.8, s); st.position.set(x, H(x, z) - 0.25*s, z); st.rotation.y = R()*6; g.add(st); }
    group.add(g); W.caveDoor = door;
  }

  // --- bridges across the river ---
  // a wide wooden arch bridge: deck 3.8 wide, reaching well up both banks, with railings and lanterns at the ends
  W.BRIDGE_W = 3.8; const ARCH = 0.75;
  function bridgeAt(x, z){
    for (const b of W.bridges){ const dx = x - b.x, dz = z - b.z, a = dx*b.ax + dz*b.az, s = -dx*b.az + dz*b.ax;
      if (Math.abs(a) < b.len/2 && Math.abs(s) < W.BRIDGE_W/2) return 0.05 + ARCH*Math.cos(Math.PI*a/b.len); }
    return null;
  }
  W.bridgeAt = bridgeAt;
  function bridgeMesh(z){
    const x = riverX(z), s = riverX(z + 0.3) - riverX(z - 0.3), ax = 1/Math.sqrt(1 + (s/0.6)**2), az = -(s/0.6)*ax;
    const len = D.river.w + 5, BW = W.BRIDGE_W, b = {x, z, ax, az, len};
    const g = new THREE.Group(), plank = mat('#a87b52', 0.9), plank2 = mat('#b58a5f', 0.9), dark = mat('#7a5634', 0.9), lamp = mat('#f3d27a', 0.4);
    const deckY = a => 0.05 + ARCH*Math.cos(Math.PI*a/len), n = 22;
    for (let i=0;i<n;i++){ const a = -len/2 + (i + 0.5)*len/n, p = new THREE.Mesh(new THREE.BoxGeometry(len/n*0.92, 0.1, BW), i % 2 ? plank : plank2);
      p.position.set(a, deckY(a) - 0.035, 0); p.rotation.z = -ARCH*Math.PI/len*Math.sin(Math.PI*a/len); g.add(p); }
    for (const sd of [-1, 1]){
      const beam = []; for (let i=0;i<=20;i++){ const a = -len/2 + i*len/20; beam.push(V3(a, deckY(a) - 0.12, sd*(BW/2 - 0.08))); }
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(beam), 30, 0.09, 6), dark));   // the stringers under the deck
      const pts = []; for (let i=0;i<=20;i++){ const a = -len/2 + 0.25 + i*(len - 0.5)/20; pts.push(V3(a, deckY(a) + 0.7, sd*BW/2)); }
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, 0.055, 6), dark));
      for (let i=0;i<=8;i++){ const a = -len/2 + 0.25 + i*(len - 0.5)/8, post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.75, 6), dark);
        post.position.set(a, deckY(a) + 0.34, sd*BW/2); g.add(post); }
      for (const e of [-1, 1]){ const a = e*(len/2 - 0.25), top = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.2, 8), dark); top.position.set(a, deckY(a) + 0.8, sd*BW/2); g.add(top);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), plank2); cap.position.set(a, deckY(a) + 0.95, sd*BW/2); g.add(cap); }
      // vines wound along part of each railing, and down the end posts
      const v0 = sd > 0 ? -len/2 + 0.3 : len/2 - 0.3, v1 = v0 + (sd > 0 ? 1 : -1)*len*0.45;
      vines(g, [0, 0.33, 0.66, 1].map(t => { const a = v0 + (v1 - v0)*t; return V3(a, deckY(a) + 0.7, sd*BW/2); }), 5);
      vines(g, [V3(v0, 0.1, sd*BW/2), V3(v0, deckY(v0) + 0.7, sd*BW/2)], 5);
    }
    for (const e of [-1, 1]) for (let i=0;i<7;i++){   // stone footings where the bridge meets each bank
      const zz = (i/6 - 0.5)*(BW + 0.4), r = 0.28 + Math.random()*0.1; fieldStone(g, e*(len/2 - 0.2) + (Math.random() - 0.5)*0.2, 0.08, zz, r, 0.75);
      if (i % 2) fieldStone(g, e*(len/2 - 0.55), 0.25, zz, r*0.8, 0.7); }
    g.position.set(x, 0, z); g.rotation.y = Math.atan2(-az, ax); b.g = g; return b;
  }
  function makeBridge(bd){ const b = bridgeMesh(bd.z); b.d = bd; group.add(b.g); W.bridges.push(b);
    const hb = new THREE.Mesh(new THREE.BoxGeometry(b.len, 1.4, W.BRIDGE_W), hbMat); hb.position.y = 0.6; hb.userData.kind = 'bridge'; hb.userData.ref = b; b.g.add(hb); b.hb = hb; W.pick.push(hb);   // tap a bridge to move or remove it
    return b; }
  W.removeBridge = b => { group.remove(b.g); W.bridges.splice(W.bridges.indexOf(b), 1); D.bridges.splice(D.bridges.indexOf(b.d), 1); if (b.hb) W.pick.splice(W.pick.indexOf(b.hb), 1); };
  W.lockedEucs = k => (W.plots[k] && W.plots[k].eucs) || [];
  W.lockedTrees = k => (W.plots[k] && W.plots[k].oaks) || [];
  W.lockedAll = what => Object.values(W.plots).flatMap(pl => (what === 'trees' ? [...(pl.oaks || []), ...(pl.eucs || [])] : pl.bushes) || []);   // wild trees / bushes on every locked plot   // eucalyptus in the still-wild outback (koalas sit in them)
  W.bridgeGhost = z => bridgeMesh(z).g;   // a preview while choosing where to build
  W.addBridge = z => { const bd = {z:+z.toFixed(2)}; D.bridges.push(bd); return makeBridge(bd); };
  W.bridgeWhy = z => z <= Z0 + 2.5 || z >= Z1 - 2.5 ? '太靠近世界的邊緣了。' : W.bridges.some(b => Math.abs(b.z - z) < 4.5) ? '這附近已經有橋了。'
    : !(W.isOpen(riverX(z) - D.river.w/2 - 2.5, z) && W.isOpen(riverX(z) + D.river.w/2 + 2.5, z)) ? '河的兩岸都要是你的領地，才能蓋橋。' : '';
  W.canBridge = z => !W.bridgeWhy(z);

  // --- opening a plot ---
  W.price = () => 120 + 60*(D.open.length - 1);
  W.neighbours = k => { const [a, b] = k.split(',').map(Number); return [[a + 1, b], [a - 1, b], [a, b + 1], [a, b - 1]].map(([p, q]) => `${p},${q}`).filter(x => PLOT_KEYS.includes(x)); };
  W.canOpen = k => !W.isOpenKey(k) && W.neighbours(k).some(W.isOpenKey);
  W.plotName = k => {
    const [a, b] = k.split(',').map(Number), dir = (b < 0 ? '北' : b > 0 ? '南' : '') + (a < 0 ? '西' : a > 0 ? '東' : '');
    const [cx, cz] = plotCenter(k), P = D.plat;
    const special = {[BIO.pond]:'荷花池塘', [BIO.swamp]:'沼澤', [BIO.aus]:'澳洲草原', [BIO.beaver]:'河狸溪', [BIO.forest]:'鹿的森林', [BIO.high]:'狼的高地', [BIO.savanna]:'大草原', [BIO.meadow]:'花海', [BIO.mangrove]:'紅樹林'}[k]; if (special) return special;
    const what = a === -2 ? '森林' : a === -1 ? '河畔' : a > 0 ? '海岸' : Math.abs(P.z - cz) < 6 ? '高台' : D.pits.some(([x, z]) => Math.abs(x - cx) < 9 && Math.abs(z - cz) < 9) ? '窪地' : '山丘';
    return `${dir}邊的${what}`;
  };
  W.openPlot = (k) => {
    if (W.isOpenKey(k)) return;
    D.open.push(k); const P = W.plots[k];
    if (P){ P.sign.userData.kind = null; P.g.traverse(o => { const i = W.pick.indexOf(o); if (i >= 0) W.pick.splice(i, 1); }); fading.push({g:P.g, t:0, s:1, plot:true}); delete W.plots[k]; }
    const [cx, cz] = plotCenter(k), h = PLOT/2 + 1.5;
    recolor((x, z) => Math.abs(x - cx) < h && Math.abs(z - cz) < h);
    if (tufts){ const M = new THREE.Matrix4(), p = V3(0, 0, 0), q = new THREE.Quaternion(), s = V3(0, 0, 0), c = new THREE.Color();
      for (let i=0;i<tufts.count;i++){ tufts.getMatrixAt(i, M); M.decompose(p, q, s); if (plotKey(p.x, p.z) !== k) continue; tufts.getColorAt(i, c); tufts.setColorAt(i, c.multiplyScalar(1.25)); }
      tufts.instanceColor.needsUpdate = true; }
    D.feats.filter(d => d.p === k).forEach(d => { const f = makeFeat(d); f.g.scale.setScalar(0.01); fading.push({g:f.g, t:0, grow:true}); });
    buildBorder();
  };

  // --- the sky: sun and moon crossing from east to west (positions set from game.js) ---
  const sunTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,252,230,1)'); g.addColorStop(0.28, 'rgba(255,240,180,1)'); g.addColorStop(0.36, 'rgba(255,220,130,0.55)'); g.addColorStop(1, 'rgba(255,210,120,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(cv); })();
  const moonCv = document.createElement('canvas'); moonCv.width = moonCv.height = 128; const moonTex = new THREE.CanvasTexture(moonCv);
  W.sun = new THREE.Sprite(new THREE.SpriteMaterial({map:sunTex, transparent:true, depthWrite:false, fog:false})); W.sun.scale.setScalar(14); W.sun.renderOrder = -5;
  W.moon = new THREE.Sprite(new THREE.SpriteMaterial({map:moonTex, transparent:true, depthWrite:false, fog:false})); W.moon.scale.setScalar(9); W.moon.renderOrder = -5;
  scene.add(W.sun, W.moon);
  let drawnPhase = -1;
  // Moon texture for a phase (0 new, 0.5 full): the lit part is drawn as two half-ellipses, with a soft halo.
  W.drawMoon = (phase) => {
    if (Math.abs(phase - drawnPhase) < 0.004) return; drawnPhase = phase;
    const x = moonCv.getContext('2d'), c = 64, r = 30; x.clearRect(0, 0, 128, 128);
    const halo = x.createRadialGradient(c, c, r*0.8, c, c, 62), lit = 1 - Math.abs(phase*2 - 1);
    halo.addColorStop(0, `rgba(255,248,215,${0.35*lit})`); halo.addColorStop(1, 'rgba(255,248,215,0)'); x.fillStyle = halo; x.fillRect(0, 0, 128, 128);
    x.fillStyle = 'rgba(70,78,100,0.35)'; x.beginPath(); x.arc(c, c, r, 0, Math.PI*2); x.fill();   // the dark side, faint
    const k = Math.cos(phase*Math.PI*2), waxing = phase < 0.5;    // k: 1 new … -1 full
    x.fillStyle = '#fbf3d2'; x.beginPath();
    x.arc(c, c, r, -Math.PI/2, Math.PI/2, !waxing);               // the lit half (right side while waxing, as seen from Taiwan)
    x.ellipse(c, c, Math.abs(k)*r, r, 0, Math.PI/2, -Math.PI/2, waxing ? k > 0 : k < 0);
    x.fill();
    x.fillStyle = 'rgba(200,190,160,0.35)'; [[-8, -6, 6], [9, 7, 5], [-2, 12, 4], [10, -11, 3]].forEach(([dx, dy, rr]) => { x.beginPath(); x.arc(c + dx, c + dy, rr, 0, Math.PI*2); x.fill(); });
    moonTex.needsUpdate = true;
  };

  // a gust every 15-45 s, sweeping across the whole world in about 10 s
  const gust = {next:8, t:-1, dir:new THREE.Vector2(-0.85, 0.5)};
  W.gust = gust;
  function updateGust(dt){
    const g = SEE.gust.value;
    if (gust.t < 0){ gust.next -= dt; if (gust.next <= 0){ gust.t = 0; const a = Math.PI + (Math.random() - 0.5)*1.2; gust.dir.set(Math.cos(a), Math.sin(a)); gust.started = true; } }
    else { gust.t += dt; const k = gust.t/10;
      if (k >= 1){ gust.t = -1; gust.next = 15 + Math.random()*30; }
      else { g.x = gust.dir.x; g.y = gust.dir.y; g.z = -75 + k*150; g.w = Math.sin(Math.PI*k)*1.6; } }
    if (gust.t < 0) g.w *= Math.exp(-dt*3);
  }
  // now and then a bigger wave rolls in from the sea and washes up the beach
  const big = {next:20, t:-1};
  function updateBigWave(dt){
    const u = seaMat && seaMat.uniforms.uBig.value; if (!u) return;
    if (big.t < 0){ big.next -= dt; if (big.next <= 0) big.t = 0; return; }
    big.t += dt; const T = big.t;
    if (T < 5){ u.x = 22 - T*4.4; u.y = Math.min(1, T); u.z = 0; }                                   // rolls toward the shore
    else if (T < 8){ const k = (T - 5)/3; u.x = 0; u.y = 1 - k; u.z = Math.sin(Math.PI*Math.min(1, k*1.6))*2.2; }   // breaks and runs up the sand
    else { u.y = 0; u.z = 0; u.x = 99; big.t = -1; big.next = 20 + Math.random()*35; }
  }
  W.bigWave = big;
  W.update = (dt, t, o) => {
    SEE.time.value = t; updateGust(dt); updateBigWave(dt);
    if (riverMat){ riverMat.uniforms.uTime.value = t; riverMat.uniforms.uNight.value = o.night; riverMat.uniforms.uSun.value = 1 - o.night*0.8; }
    if (seaMat){ const u = seaMat.uniforms; u.uTime.value = t; u.uNight.value = o.night; u.uSun.value = 1 - o.night*0.8; u.uFog.value.copy(o.fog.color); u.uFogN.value = o.fog.near; u.uFogF.value = o.fog.far; }
    updateFish(dt, t, o.pet); updateKoi(dt, t, o.pet);
    for (const m of stillMats){ m.uniforms.uTime.value = t; m.uniforms.uNight.value = o.night; m.uniforms.uSun.value = 1 - o.night*0.8; }
    for (let i=fading.length - 1; i>=0; i--){ const f = fading[i]; f.t += dt;
      if (f.grow){ const k = Math.min(1, f.t/0.5); f.g.scale.setScalar(Math.max(0.01, k < 1 ? k*1.15 : 1)); if (f.t > 0.5){ f.g.scale.setScalar(1); fading.splice(i, 1); } continue; }
      if (f.plot){ f.g.position.y = -f.t*f.t*3;   // the overgrowth sinks away while dust puffs up (game.js)
        if (f.t > 1.4){ group.remove(f.g); f.g.traverse(o => { if (o.isInstancedMesh) o.dispose(); }); fading.splice(i, 1); } continue; }
      const k = Math.max(0.01, 1 - f.t/0.6); f.g.scale.setScalar(f.s*k);
      if (f.t > 0.6){ group.remove(f.g); fading.splice(i, 1); if (onFeatGone) onFeatGone(); } }
  };

  W.load = (data) => {
    D = upgradeWorld(data); W.data = D;
    const R = rng(D.seed);
    buildTerrain(); buildTufts(rng(D.seed + 1)); buildFlowers(rng(D.seed + 11)); buildRiver(rng(D.seed + 2)); buildSea(); buildStill(); buildCave();
    // wild forest beyond the world edge (west, north and south; the east is sea)
    const out = (x, z) => !(x > X0 - 0.8 && x < X1 + 0.8 && z > Z0 - 0.8 && z < Z1 + 0.8) && !W.isBeach(x, z);
    wilds(scatter(rng(D.seed + 3), X0 - MARGIN, X1 + MARGIN, Z0 - MARGIN, Z1 + MARGIN, Math.round((mobile ? 420 : 760)*DENS), ['tree', 'pine', 'pine', 'bush', 'rock'], out));
    for (const k of PLOT_KEYS) if (!W.isOpenKey(k)) buildLocked(k);
    D.bridges.forEach(makeBridge);
    buildBorder();
  };
  W.showFeats = () => D.feats.filter(d => W.isOpenKey(d.p)).forEach(makeFeat);
  return W;
}
