import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { cloud } from './cloud.js';
import { createGhibli } from './ghibli.js';
import { createFauna, SPECIES } from './fauna.js';
import { createWildlife, WILD_NAMES } from './wildlife.js';
import { createWorld, newWorld, HALF, PLOT, WATER_Y, X0, X1, Z0, Z1, BIO, plotKey, PLOT_KEYS, SEE, seeThrough, leafMaterial, swaying, CANOPY_BLOBS, leafyCanopy, canopyTex, vines, fieldStone } from './world.js';

// Keep r128-era colour handling so the hand-tuned palette and fur shader look the same.
THREE.ColorManagement.enabled = false;
const LI = Math.PI; // legacy light intensities × π = same brightness under physically based lights

boot();

async function boot(){
const $ = s => document.querySelector(s);
const canvas = $('#c');
let renderer;
try { renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:true}); }
catch(e){ $('#petSub').textContent = '這個瀏覽器無法顯示 3D，請改用 Chrome、Safari 或 Edge 開啟。'; return; }
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

const mobile = matchMedia('(pointer:coarse)').matches;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.75 : 2));
renderer.setClearColor(0x000000, 0);

// ---------- helpers ----------
const V3 = (x,y,z) => new THREE.Vector3(x,y,z);
const UP = V3(0,1,0);
const clamp = (v,a,b) => Math.min(b, Math.max(a, v));
const lerp = (a,b,t) => a + (b-a)*t;
const rnd = (a,b) => a + Math.random()*(b-a);
const ease = p => p < .5 ? 2*p*p : 1 - Math.pow(-2*p+2, 2)/2;
const wrapA = a => { while (a > Math.PI) a -= 2*Math.PI; while (a < -Math.PI) a += 2*Math.PI; return a; };
const hex2rgb = h => { const n = parseInt(h.slice(1),16); return [(n>>16)&255,(n>>8)&255,n&255]; };
const mixHex = (a,b,t) => '#'+hex2rgb(a).map((v,i)=>Math.round(lerp(v,hex2rgb(b)[i],clamp(t,0,1))).toString(16).padStart(2,'0')).join('');
const pad = n => String(n).padStart(2,'0');
function isShown(o){ while (o){ if (!o.visible) return false; o = o.parent; } return true; }

// ---------- scene / camera ----------
const scene = new THREE.Scene(); scene.fog = new THREE.Fog('#d9e1d2', 30, 90);
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 200);
const camTarget = V3(0, 0.9, 0);
let yaw = 0.75, pitch = 0.42, zoom = 1, baseDist = 14, camY = 0.9, zoomFx = 1;
let shake = 0;   // camera shake strength (set by big hits, fades out)
function placeCam(){
  const d = baseDist * zoom * zoomFx;
  camera.position.set(camTarget.x + d*Math.cos(pitch)*Math.sin(yaw), camTarget.y + d*Math.sin(pitch), camTarget.z + d*Math.cos(pitch)*Math.cos(yaw));
  camera.lookAt(camTarget);
  if (shake > 0.002){ camera.position.add(V3((Math.random() - 0.5)*shake, (Math.random() - 0.5)*shake, (Math.random() - 0.5)*shake)); shake *= 0.88; }
}
function resize(){
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix();
  baseDist = camera.aspect < 0.8 ? 19 : 14;
  camY = camera.aspect < 0.8 ? 1.6 : 0.9;
}
addEventListener('resize', resize); resize();

const L = V3(0.45, 1, 0.55).normalize();
const hemi = new THREE.HemisphereLight(0xfff8ec, 0x6d7562, 0.8*LI); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 0.75*LI); sun.position.copy(L).multiplyScalar(10); scene.add(sun);
// art style: 'ghibli' (painted sky + watercolour filter, the default) or 'plain' (the original look)
const art = createGhibli({renderer, scene, camera, mobile});
function setArt(v){ art.set(v !== 'plain');
  if (art.on){ hemi.color.set('#eef4ff'); hemi.groundColor.set('#55776a'); } else { hemi.color.set(0xfff8ec); hemi.groundColor.set(0x6d7562); }   // cool blue-green shade under leaves and bellies
  if (world && world.tufts) world.tufts.material.color.set('#ffffff'); }

// ---------- canvas textures ----------
function canvasTex(w, h, draw){ const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h); return new THREE.CanvasTexture(cv); }
const radCache = {};
const radialTex = (inner, outer) => radCache[inner+outer] || (radCache[inner+outer] = canvasTex(128,128,(x)=>{ const g = x.createRadialGradient(64,64,0,64,64,64); g.addColorStop(0,inner); g.addColorStop(1,outer); x.fillStyle = g; x.fillRect(0,0,128,128); }));
const shadowTex = canvasTex(128,128,(x)=>{ const g = x.createRadialGradient(64,64,0,64,64,64);
  g.addColorStop(0,'rgba(0,0,0,0.5)'); g.addColorStop(0.55,'rgba(0,0,0,0.22)'); g.addColorStop(1,'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0,0,128,128); });
const beamTex = canvasTex(8,128,(x,w,h)=>{ const g = x.createLinearGradient(0,0,0,h); g.addColorStop(0,'rgba(255,255,255,0)'); g.addColorStop(0.6,'rgba(255,255,255,0.35)'); g.addColorStop(1,'rgba(255,255,255,0.9)'); x.fillStyle = g; x.fillRect(0,0,w,h); });
const texCache = {};
function textTex(txt, color, font, outline){
  const key = txt+'|'+color+'|'+font+'|'+outline;
  if (texCache[key]) return texCache[key];
  return texCache[key] = canvasTex(128,128,(x)=>{
    x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle';
    if (outline){ x.lineWidth = 10; x.strokeStyle = outline; x.strokeText(txt,64,68); }
    x.fillStyle = color || '#000'; x.fillText(txt,64,68);
  });
}
const EMOJI_FONT = '92px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const emojiTex = e => textTex(e, '#000', EMOJI_FONT);
const sparkTex = textTex('✦', '#fff6c8', 'bold 100px sans-serif', 'rgba(255,200,80,.6)');
const heartTex = canvasTex(64,64,(x)=>{ x.fillStyle = '#e0607e'; x.beginPath(); x.moveTo(32,54);
  x.bezierCurveTo(6,36,4,14,20,10); x.bezierCurveTo(28,8,32,16,32,20); x.bezierCurveTo(32,16,36,8,44,10); x.bezierCurveTo(60,14,58,36,32,54); x.fill(); });
const stinkTex = canvasTex(64,128,(x)=>{ x.strokeStyle = 'rgba(120,150,60,0.85)'; x.lineWidth = 5; x.lineCap = 'round';
  for (const ox of [18,34,48]){ x.beginPath(); for (let y=120;y>10;y-=4){ const xx = ox + Math.sin(y/12)*5; y===120 ? x.moveTo(xx,y) : x.lineTo(xx,y); } x.stroke(); } });
const knitTex = canvasTex(64,64,(x)=>{ x.fillStyle = '#ffffff'; x.fillRect(0,0,64,64); x.strokeStyle = 'rgba(0,0,0,0.13)'; x.lineWidth = 3;
  for (let i=4;i<64;i+=8){ x.beginPath(); x.moveTo(i,0); x.lineTo(i,64); x.stroke(); } });
knitTex.wrapS = knitTex.wrapT = THREE.RepeatWrapping; knitTex.repeat.set(10,3);

// ---------- floating fx ----------
const fx = [];
function floatSprite(tex, at, o={}){
  const s = new THREE.Sprite(new THREE.SpriteMaterial({map:tex, transparent:true, depthWrite:false, depthTest:o.depthTest !== false, blending:o.add ? THREE.AdditiveBlending : THREE.NormalBlending}));
  s.position.copy(at); s.scale.setScalar(o.size || 0.4); s.renderOrder = 5; s.visible = !o.delay; if (o.rot) s.material.rotation = o.rot;
  scene.add(s);
  fx.push({s, life:0, max:o.max || 1.4, vy:o.vy ?? 1, vx:o.vx || 0, vz:o.vz || 0, g:o.g || 0, delay:o.delay || 0, size:o.size || 0.4, grow:o.grow ?? 0.2, fade:o.fade || 0.5, spin:o.spin || 0});
  return s;
}
function updateFx(dt){
  for (let i=fx.length-1;i>=0;i--){
    const f = fx[i];
    if (f.delay > 0){ f.delay -= dt; continue; }
    f.s.visible = true; f.life += dt;
    f.vy -= f.g*dt;
    f.s.position.x += f.vx*dt; f.s.position.y += f.vy*dt; f.s.position.z += f.vz*dt;
    f.s.material.opacity = clamp((f.max - f.life)/f.fade, 0, 1); if (f.spin) f.s.material.rotation += f.spin*dt;
    f.s.scale.setScalar(f.size*(1 + Math.min(f.life*3,1)*f.grow));
    if (f.life > f.max){ scene.remove(f.s); f.s.material.dispose(); fx.splice(i,1); }
  }
}

// ---------- fur shader (skinned) ----------
// The Blender model carries a colour-zone mask in its vertex colours: R = belly/muzzle cream, G = blush,
// B = paw, A = fur length. Fur is drawn as SHELLS layers of the same skinned mesh pushed out along the normal.
const U = {
  uColor:{value:new THREE.Color('#8b6b50')}, uBelly:{value:new THREE.Color('#b39a82')}, uBlush:{value:new THREE.Color('#ef9e97')},
  uLight:{value:L}, uForce:{value:V3(0,0,0)}, uSky:{value:new THREE.Color('#fff8ec')}, uGround:{value:new THREE.Color('#77806a')}, uSun:{value:1}, uWhite:{value:0}
};
const VS = `uniform float uLayer; uniform float uLen; uniform vec3 uForce;
#include <common>
#include <skinning_pars_vertex>
varying vec3 vN; varying vec3 vWP; varying vec3 vP; varying vec4 vMask;
void main(){
  vMask = color; vP = position;
  #include <skinbase_vertex>
  #include <beginnormal_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  vec3 p = transformed + normalize(objectNormal) * (uLen * uLayer * color.a);
  vec4 wp = modelMatrix * vec4(p, 1.0); wp.xyz += uForce * (uLayer * uLayer);
  vN = normalize(mat3(modelMatrix) * objectNormal); vWP = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp; }`;
const FS = `uniform float uLayer;
uniform vec3 uColor; uniform vec3 uBelly; uniform vec3 uBlush; uniform vec3 uLight; uniform vec3 uSky; uniform vec3 uGround; uniform float uSun; uniform float uWhite;
varying vec3 vN; varying vec3 vWP; varying vec3 vP; varying vec4 vMask;
float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main(){
  float n = h3(floor(vP * 130.0)), c = h3(floor(vP * 16.0) + 7.0);
  if (uLayer > 0.001 && n * 0.82 + c * 0.18 < uLayer) discard;
  vec3 N = normalize(vN);
  vec3 base = mix(uColor, uBelly, vMask.r);
  base = mix(base, uBlush, vMask.g);
  base = mix(base, uColor * 0.5, vMask.b);
  vec3 col = base * (0.9 + 0.2 * c) * mix(0.5, 1.08, uLayer);
  float d = max(0.0, (dot(N, uLight) + 0.35) / 1.35);
  vec3 hemi = mix(uGround, uSky, N.y * 0.5 + 0.5);
  vec3 V = normalize(cameraPosition - vWP);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0) * 0.45 * uLayer;
  col = col * (hemi * 0.5 + d * 0.72 * uSun) + rim * uSky * 0.35;
  col = mix(col, vec3(1.0, 0.97, 0.88) * 1.25, uWhite);
  gl_FragColor = vec4(col, 1.0); }`;
const SHELLS = mobile ? 10 : 16, FUR_LEN = 0.075;
const furShells = [];
const furMat = i => { const m = new THREE.ShaderMaterial({vertexShader:VS, fragmentShader:FS, vertexColors:true,
  uniforms:{uLayer:{value:i/(SHELLS-1)}, uLen:{value:FUR_LEN}, uColor:U.uColor, uBelly:U.uBelly, uBlush:U.uBlush, uLight:U.uLight,
    uForce:U.uForce, uSky:U.uSky, uGround:U.uGround, uSun:U.uSun, uWhite:U.uWhite}}); furShells.push(m); return m; };
const hit = [], petMats = [];
const mat = (c, r=0.7) => new THREE.MeshStandardMaterial({color:c, roughness:r, metalness:0});
function makeShadow(w, d){
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({map:shadowTex, transparent:true, depthWrite:false}));
  m.rotation.x = -Math.PI/2; m.position.y = 0.006; m.renderOrder = -1; g.add(m); scene.add(g); return {g, m};
}
function heartShape(s){ const sh = new THREE.Shape(); sh.moveTo(0,-0.9*s); sh.bezierCurveTo(-1.25*s,-0.05*s,-0.6*s,0.95*s,0,0.35*s); sh.bezierCurveTo(0.6*s,0.95*s,1.25*s,-0.05*s,0,-0.9*s); return sh; }
function starShape(r1, r2, n=5){ const sh = new THREE.Shape(); for (let i=0;i<n*2;i++){ const r = i%2 ? r2 : r1, a = i/(n*2)*Math.PI*2 + Math.PI/2, x = Math.cos(a)*r, y = Math.sin(a)*r; i ? sh.lineTo(x,y) : sh.moveTo(x,y); } return sh; }
const extrude = (sh, d) => { const g = new THREE.ExtrudeGeometry(sh, {depth:d, bevelEnabled:false}); g.center(); return g; };

// ---------- ground ----------
// Lawn: a tiling texture of short grass blades in several greens, so the ground reads as turf instead of one flat colour.
const GRASS_COLS = ['#86ad62','#9cc177','#76a055','#aecd8c','#6c9650','#b9d698'];
const TUFT_COLS = ['#cfd391','#d9d199','#c4cb8a','#e0d7a2','#bcc684'];   // straw-coloured tufts, so they don't look like the dark green weeds
const grassTex = canvasTex(256,256,(x,w,h)=>{
  x.fillStyle = '#93b86f'; x.fillRect(0,0,w,h);
  const wrap = (px, py, f) => { for (const ox of [-w,0,w]) for (const oy of [-h,0,h]) f(px+ox, py+oy); };
  for (let i=0;i<70;i++){ const px = Math.random()*w, py = Math.random()*h, r = rnd(14,40), c = Math.random() < 0.5 ? 'rgba(120,160,85,' : 'rgba(170,205,135,';
    wrap(px, py, (a, b) => { const g = x.createRadialGradient(a,b,0,a,b,r); g.addColorStop(0, c+'0.35)'); g.addColorStop(1, c+'0)'); x.fillStyle = g; x.fillRect(a-r,b-r,r*2,r*2); }); }
  x.lineCap = 'round';
  for (let i=0;i<3200;i++){ const px = Math.random()*w, py = Math.random()*h, len = rnd(3,8), a = -Math.PI/2 + rnd(-0.6,0.6);
    x.strokeStyle = GRASS_COLS[i % GRASS_COLS.length]; x.lineWidth = rnd(0.8,1.6);
    wrap(px, py, (a0, b0) => { if (a0 < -10 || b0 < -10 || a0 > w+10 || b0 > h+10) return; x.beginPath(); x.moveTo(a0,b0); x.lineTo(a0 + Math.cos(a)*len, b0 + Math.sin(a)*len); x.stroke(); }); }
});
grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping; grassTex.repeat.set(9, 9); grassTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
// The world (terrain, river, sea, nature: js/world.js) is built from S.world once the save is loaded; gy() is the ground height anywhere.
let world = null;
const gy = (x, z) => world ? world.gy(x, z) : 0;

// ---------- wombat (Blender model: assets/models/wombat.glb, built by blender/wombat_build.py) ----------
const root = new THREE.Group(); root.rotation.order = 'YXZ'; scene.add(root);
const tiltG = new THREE.Group(); tiltG.position.y = 0.95; root.add(tiltG);
const actG = new THREE.Group(); tiltG.add(actG);
const offG = new THREE.Group(); offG.position.y = -0.95; actG.add(offG);
const squashG = new THREE.Group(); offG.add(squashG);
// all four model files download at the same time; the loading screen shows how far along they are
const ldStep = (msg, k) => { const m = document.getElementById('ldMsg'), f = document.getElementById('ldFill'); if (m && msg) m.textContent = msg; if (f && k != null) f.style.width = Math.round(k*100) + '%'; };
let ldDone = 0; const ldTrack = pr => pr.then(v => { ldDone++; ldStep(`載入模型 ${ldDone} / 5`, 0.1 + ldDone*0.15); return v; }, e => { ldDone++; throw e; });
ldStep('載入模型 0 / 5', 0.08);
const draco = new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/');   // animals and trees are Draco-compressed
const LOADS = Object.fromEntries(['wombat', 'props', 'animals', 'trees', 'nature'].map(n => [n, ldTrack(new GLTFLoader().setDRACOLoader(draco).loadAsync(`assets/models/${n}.glb`))]));
Object.values(LOADS).forEach(pr => pr.catch(() => {}));
// Realistic rigged animals (Sketchfab, converted by blender/real_build.py; authors in assets/models/CREDITS.md). Each has its own
// skeleton and clips (walk, run, graze, lie down...). `yaw` turns the model to face +Z; `like` is the old model whose size it takes.
const REAL_CFG = {tiger:{yaw:Math.PI/2, like:'tiger', k:1.15}, deer:{like:'deer', k:1.45, parts:{antlers:'Chifre'}}, wolf:{like:'wolf', k:1.05},
  moose:{like:'deer', k:1.9, parts:{antlers:'M_Moose_Antler'}}, horse:{like:'horse', k:1.25}, croc:{like:'croc', bright:1.8}, kangaroo:{like:'kangaroo', k:1.45}, heron:{like:'heron', k:1.1}, crab:{len:0.32}, hermit:{len:0.42}, seaturtle:{len:1.3}, penguin:{h:0.85}, flamingo:{len:1.3}, owl:{h:0.7}, peacock:{like:'peacock', k:1.15, stride:{walk:0.57}}, mangrove:{h:4.2}, fiddler:{len:0.3}, mudskipper:{len:0.34}, fishboat:{raw:true}, monkey:{len:1.7, stride:{walk:0.6, run:2.6}}, pondturtle:{len:0.75}, eagle:{len:1.6}, eagleperch:{h:1.35},
  bug_rhino:{len:0.42}, bug_stag:{len:0.48}, bug_green:{len:0.3}, bug_longhorn:{len:0.5}, bug_grasshopper:{len:0.42}, bug_cricket:{len:0.38}, bug_mantis:{len:0.6}, bug_cicada:{len:0.4},   // insects: CC0 scans, jointed legs
  donkey:{len:1.8, stride:{walk:0.55, run:1.6}}, fox:{len:1.9}, gullfly:{len:0.95}, gullstand:{len:0.95}, waspnest:{raw:true},
  hippo2:{len:4.4, k:0.6, stride:{walk:0.245}}, capybara2:{len:1.8, k:0.76, stride:{walk:0.33}}, tortoise2:{len:1.25, stride:{walk:0.051}}, koala2:{h:1.1, meshBox:true, split:{idle:[25.5, 28.5]}},   // (its one clip is a demo reel: clinging while it climbs, a step on the ground, a climb, a still cling at the top - only that is used)
  rabbit2:{len:0.75, k:0.25},   // (k: their bones don't span the whole body, measured in game)
  whale2:{len:16}, trout:{len:0.45}, butterfly2:{len:0.28}, yacht:{raw:true},
  crane:{h:1.7, stride:{walk:0.24}}, emu:{h:1.85, stride:{walk:0.37, run:2.2}}, quokka:{len:1.1}, beaver2:{len:1.3, stride:{walk:0.31}}, frog2:{len:0.32, yaw:-Math.PI/2, split:{idle:[1.9, 6.9], hop:[7.2, 8.2]}},
  snake2:{len:1.8, yaw:Math.PI/2, meshBox:true, split:{slither:[3.5, 7.75]}}, dfly:{len:0.3}, gecko:{len:0.6, yaw:Math.PI/2}, dolphin2:{len:3.6}, tang:{len:0.35}, bfish:{len:0.35}, koi:{len:0.45}};   // (koi: the pond scales them up 1.5-2.1x)
// realistic replacements for the animals first made in Blender (fauna.js / wildlife.js ask for the old names)
const REAL_ALIAS = {hippo:'hippo2', capybara:'capybara2', tortoise:'tortoise2', koala:'koala2', rabbit:'rabbit2', whale:'whale2', beaver:'beaver2', frog:'frog2', snake:'snake2', dragonfly:'dfly', lizard:'gecko', dolphin:'dolphin2'};   // (raw: built at game size, origin at the keel)
const REAL_LOADS = Object.fromEntries(Object.keys(REAL_CFG).map(n => [n, new GLTFLoader().setDRACOLoader(draco).loadAsync(`assets/models/real/${n}.glb`)]));
Object.values(REAL_LOADS).forEach(pr => pr.catch(() => {}));
let gltf;
try { gltf = await LOADS.wombat; }
catch(e){ $('#petSub').textContent = '袋熊模型載入失敗，請重新整理頁面。'; console.error(e); return; }
const model = gltf.scene; squashG.add(model);
const BONE = {}; model.traverse(o => { if (o.isBone) BONE[o.name] = o; });
const body = model.getObjectByName('WombatBody');
body.material = furMat(0); body.frustumCulled = false; body.userData.kind = 'pet'; hit.push(body);
for (let i=1;i<SHELLS;i++){
  const s = new THREE.SkinnedMesh(body.geometry, furMat(i)); s.bind(body.skeleton, body.bindMatrix);
  s.position.copy(body.position); s.quaternion.copy(body.quaternion); s.scale.copy(body.scale); s.frustumCulled = false; body.parent.add(s);
}
model.traverse(o => {
  if (!o.isMesh || o.isSkinnedMesh) return;
  if (!o.material.userData.srgb){ o.material.userData.srgb = true; o.material.color.convertLinearToSRGB(); o.material.metalness = 0; }   // glTF colours are linear; this scene works in display values (materials are shared, convert once)
  o.userData.kind = 'pet'; hit.push(o); petMats.push(o.material);
});
model.updateMatrixWorld(true);
// A group fixed to a bone, placed at a rest-pose position in model space (outfits, clothes and blinking eyes hang off these).
function anchor(boneName, pos, scl){
  const g = new THREE.Group(); g.position.copy(pos); if (scl) g.scale.copy(scl);
  model.add(g); model.updateMatrixWorld(true); BONE[boneName].attach(g); return g;
}
// `head` and `bodyFit` keep the coordinate frames the old procedural model used, so outfits line up.
const head = anchor('head', V3(0, 0.9, 0.52), V3(0.98, 0.92, 1.02));   // the rounder, lower-carried head (2026-10 reshape)
const bodyFit = new THREE.Group(); anchor('spine', V3(0, 0.82, -0.04), V3(1.02, 0.97, 0.72)).add(bodyFit);
const eyes = ['Eye', 'Eye001'].map(n => { const e = model.getObjectByName(n), w = e.getWorldPosition(V3(0,0,0));
  const g = anchor('head', model.worldToLocal(w)); g.attach(e); return g; });
// where the eyes sit in the head's frame (+1 = the model's left eye), for glasses
const eyeSpots = () => { const o = {}; eyes.forEach(g => { const p = head.worldToLocal(g.getWorldPosition(V3(0,0,0))); o[p.x > 0 ? 1 : -1] = p; }); return o; };
const ears = [['earL', 1], ['earR', -1]].map(([n, s]) => ({bone:BONE[n], s, v:0, a:0}));
const legs = [['legFL', 1], ['legFR', 1], ['legBL', -1], ['legBR', -1]].map(([n, fr], i) => ({bone:BONE[n], phase:i*1.7, front:fr}));
// animation clips, blended by weight every frame
const mixer = new THREE.AnimationMixer(model), CLIP = {};
gltf.animations.forEach(c => { const a = mixer.clipAction(c); a.play(); a.setEffectiveWeight(0); CLIP[c.name.replace(/^W_/, '')] = a; });
const BW = {walk:0, eat:0, sleep:0, sit:0, happy:0, ball:0};
const qTmp = new THREE.Quaternion(), eTmp = new THREE.Euler();
let headScale = 1, lookX = 0, lookY = 0, bloatW = 0;
const turnBone = (b, x, y, z) => { if (x || y || z) b.quaternion.multiply(qTmp.setFromEuler(eTmp.set(x, y, z))); };
const shadow = makeShadow(2.6, 3.4);
// Swim ring (bought in the shop): worn automatically in the water. Red and white stripes round the wombat's middle.
const swimRing = (() => { const tex = canvasTex(256, 32, (x, w, h) => { for (let i=0;i<8;i++){ x.fillStyle = i % 2 ? '#ffffff' : '#e8473f'; x.fillRect(i*w/8, 0, w/8, h); } });
  const m = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.26, 14, 40), new THREE.MeshStandardMaterial({map:tex, roughness:0.4}));
  m.rotation.x = Math.PI/2; m.scale.set(1.15, 1.5, 1); m.position.set(0, 0.62, 0.1); m.visible = false; root.add(m); return m; })();
// Yard props modelled in Blender (blender/props_build.py). Optional: if they fail to load, the simple shapes are used.
const PROP = {};
try {
  const pg = await LOADS.props;
  pg.scene.updateMatrixWorld(true);
  pg.scene.children.forEach(o => {   // some props were modelled away from Blender's origin: centre each one on its own footprint
    const c = new THREE.Box3().setFromObject(o).getCenter(V3(0,0,0)); o.position.x -= c.x; o.position.z -= c.z; PROP[o.name] = o; });
  pg.scene.traverse(o => { if (!o.isMesh) return; [].concat(o.material).forEach(m => { if (m.userData.srgb) return; m.userData.srgb = true; m.color.convertLinearToSRGB(); m.metalness = 0;
    if (m.map){ m.map.colorSpace = THREE.NoColorSpace; m.map.needsUpdate = true; if (/Grass|Leaves|Mushroom/.test(m.map.name || m.name)){ m.alphaTest = 0.45; m.transparent = false; m.side = THREE.DoubleSide; } } }); });   // (the burrow's textured soil, rocks and grass)
} catch(e){ console.warn('props.glb not loaded', e); }
const propClone = name => PROP[name] ? PROP[name].clone(true) : null;
// Wild animals modelled in Blender (blender/animals_build.py): gull, dolphin, whale, owl, eagle, lizard, fish.
// Animated parts are children named "<animal>_<part>". Optional: without the file the procedural stand-ins are used.
const ANIM = {};
// Fur / feathers for the animals: the same shell technique as the wombat, but colours come from the model's painted
// vertex colours (alpha = how long the fur is there) and nothing is skinned. Meshes named "*_fur" get shells.
const VS2 = `uniform float uLayer; uniform float uLen;
varying vec3 vN; varying vec3 vWP; varying vec3 vP; varying vec4 vMask;
void main(){ vMask = color; vP = position;
  vec3 p = position + normal*(uLen*uLayer*color.a);
  vec4 wp = modelMatrix*vec4(p, 1.0); vN = normalize(mat3(modelMatrix)*normal); vWP = wp.xyz;
  gl_Position = projectionMatrix*viewMatrix*wp; }`;
const FS2 = `uniform float uLayer; uniform float uDens; uniform vec3 uLight; uniform vec3 uSky; uniform vec3 uGround; uniform float uSun;
varying vec3 vN; varying vec3 vWP; varying vec3 vP; varying vec4 vMask;
float h3(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x + p.y + p.z)); }
void main(){
  float n = h3(floor(vP*uDens)), c = h3(floor(vP*uDens*0.12) + 7.0);
  if (uLayer > 0.001 && n*0.82 + c*0.18 < uLayer) discard;
  vec3 N = normalize(vN), col = vMask.rgb*(0.9 + 0.2*c)*mix(0.62, 1.06, uLayer);
  float d = max(0.0, (dot(N, uLight) + 0.35)/1.35); vec3 hemi = mix(uGround, uSky, N.y*0.5 + 0.5);
  vec3 V = normalize(cameraPosition - vWP); float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0)*0.4*uLayer;
  gl_FragColor = vec4(col*(hemi*0.5 + d*0.72*uSun) + rim*uSky*0.3, 1.0); }`;
const FUR_SHELLS = mobile ? 4 : 7;
const FUR_OF = {horse:[0.009, 280], tiger:[0.016, 170], capybara:[0.016, 110], beaver:[0.026, 170], kangaroo:[0.03, 150], quokka:[0.022, 190], emu:[0.045, 70], koala:[0.038, 150], deer:[0.014, 170], wolf:[0.036, 130]};
function furify(mesh, len, dens){
  const mk = i => new THREE.ShaderMaterial({vertexShader:VS2, fragmentShader:FS2, vertexColors:true,
    uniforms:{uLayer:{value:i/(FUR_SHELLS - 1)}, uLen:{value:len}, uDens:{value:dens}, uLight:U.uLight, uSky:U.uSky, uGround:U.uGround, uSun:U.uSun}});
  mesh.material = mk(0);
  for (let i=1;i<FUR_SHELLS;i++){ const s = new THREE.Mesh(mesh.geometry, mk(i)); s.userData.shell = true; s.raycast = () => {}; mesh.add(s); }
}
// Birds have no fluff: "*_feather" meshes get a pattern of overlapping feathers (rows of scallops, tips pointing back
// and down, a darker overlap shadow, a pale fringe and a shaft line) drawn from the model-space position, strength = vertex alpha.
const FEATHER_GLSL = `
float fh2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }
float fscale(vec2 uv){
  float row = floor(uv.y); vec2 q = vec2(uv.x + mod(row, 2.0)*0.5, uv.y);
  vec2 c = floor(q), f = fract(q); float dx = abs(f.x - 0.5)*2.0, t = f.y - 0.45*dx*dx;
  if (t < 0.0){ q = vec2(uv.x + mod(row - 1.0, 2.0)*0.5, uv.y); c = floor(q) - vec2(0.0, 1.0); f = fract(q); f.y += 1.0; dx = abs(f.x - 0.5)*2.0; t = f.y - 0.45*dx*dx; }
  float b = 1.0 - 0.17*smoothstep(0.6, 1.0, t) + 0.08*(1.0 - smoothstep(0.0, 0.14, t)) - 0.05*(1.0 - smoothstep(0.0, 0.07, abs(f.x - 0.5)))*smoothstep(0.1, 0.5, t);
  return b + (fh2(c) - 0.5)*0.07;
}
float feather(vec3 p, vec3 n, float k){
  vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z);
  vec2 S = vec2(uFD, uFD*uFS);
  float s = w.y*fscale(p.xz*S) + w.x*fscale(p.yz*S) + w.z*fscale(vec2(p.x, p.y)*S);
  return mix(1.0, s, clamp(k, 0.0, 1.0));
}`;
const FEATHER_MATS = {};
function featherMat(dens, stretch){
  const key = dens + ':' + stretch; if (FEATHER_MATS[key]) return FEATHER_MATS[key];
  const m = new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.8});
  m.onBeforeCompile = sh => { sh.uniforms.uFD = {value:dens}; sh.uniforms.uFS = {value:stretch};
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFP; varying vec3 vFN;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvFP = position; vFN = normal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vFP; varying vec3 vFN; uniform float uFD; uniform float uFS;' + FEATHER_GLSL)
      .replace('#include <color_fragment>', '#ifdef USE_COLOR_ALPHA\n diffuseColor.rgb *= vColor.rgb*feather(vFP, normalize(vFN), vColor.a);\n#endif'); };
  m.customProgramCacheKey = () => 'feather';
  return FEATHER_MATS[key] = m;
}
const FEATHER_D = {gull:50, eagle:44, owl:46, heron:44};
// painted hard parts and skins: vertex colour, alpha = how glossy (wet frog skin, beaks, eyes, beetle shells)
const PAINT_M = new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.62});
PAINT_M.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#ifdef USE_COLOR_ALPHA\n diffuseColor.rgb *= vColor.rgb;\n#elif defined(USE_COLOR)\n diffuseColor.rgb *= vColor;\n#endif')
  .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n#ifdef USE_COLOR_ALPHA\n roughnessFactor = mix(roughnessFactor, 0.1, vColor.a);\n#endif'); };
PAINT_M.customProgramCacheKey = () => 'paint';
try {
  const ag = await LOADS.animals;
  ag.scene.children.forEach(o => ANIM[o.name] = o);
  ag.scene.traverse(o => { if (!o.isMesh || o.userData.shell) return;
    const ca = o.geometry.attributes.color;   // painted colours arrive linear: turn them into display values once
    if (ca && !o.geometry.userData.srgb){ o.geometry.userData.srgb = true; for (let i=0;i<ca.count;i++) for (let k=0;k<3;k++){ const v = ca.getComponent(i, k); ca.setComponent(i, k, v <= 0.0031308 ? v*12.92 : 1.055*Math.pow(v, 1/2.4) - 0.055); } }
    const m = o.material; if (m.color && !m.userData.srgb){ m.userData.srgb = true; m.color.convertLinearToSRGB(); m.metalness = 0; }
    const kind = o.name.split('_')[0];
    if (/_fur$/.test(o.name) && ca) furify(o, ...(FUR_OF[kind] || [0.02, 140]));
    else if (/_feather$/.test(o.name) && ca){ const wing = /_(wing|hand|tail)/.test(o.name); o.material = featherMat(Math.round((FEATHER_D[kind] || 40)*(wing ? 0.75 : /head/.test(o.name) ? 1.35 : 1)), wing ? 0.45 : 1); }
    else if (ca) o.material = PAINT_M;   // reptiles, dolphins, whales, beaks, feet, eyes, beetles: painted skin
  });
} catch(e){ console.warn('animals.glb not loaded', e); }
// Trees and bushes modelled in Blender (blender/trees_build.py): soft leaf masses painted light-to-dark with vertex colours.
const TREES = {};
try {
  const tg = await LOADS.trees;
  tg.scene.traverse(o => { if (!o.isMesh) return; const ca = o.geometry.attributes.color; if (ca && !o.geometry.userData.srgb){ o.geometry.userData.srgb = true;
    for (let i=0;i<ca.count;i++) for (let k=0;k<3;k++){ const v = ca.getComponent(i, k); ca.setComponent(i, k, v <= 0.0031308 ? v*12.92 : 1.055*Math.pow(v, 1/2.4) - 0.055); } } });
  tg.scene.children.forEach((o, i) => { const t = o.getObjectByName(o.name + '_trunk'), c = o.getObjectByName(o.name + '_canopy');
    TREES[o.name] = {trunk: t && t.geometry, canopy: c && leafyCanopy(c.geometry, 7 + i, mobile ? 0.2 : 0.3, o.name.includes('pine') ? 0.7 : 1)}; });   // leafy fringe on every canopy
} catch(e){ console.warn('trees.glb not loaded', e); }
const treeSet = k => Object.keys(TREES).filter(n => n.startsWith('tree_' + k)).sort().map(n => TREES[n]);
const TREE_MODELS = Object.keys(TREES).length ? {oak:treeSet('oak'), pine:treeSet('pine'), euc:treeSet('euc'), bush:treeSet('bush')} : null;
// Plants from Quaternius' Stylized Nature MegaKit (CC0; blender/nature_build.py -> assets/models/nature.glb): painted textured trees,
// bushes, grass, flowers, ferns and mushrooms. Bark keeps the see-through; leaves sway in the wind (alpha-cut leaf cards).
const NATURE = {};
try { const ng = await LOADS.nature; ng.scene.children.forEach(o => { NATURE[o.name] = o; }); } catch(e){ console.warn('nature.glb not loaded', e); }
const natMats = {};
function natMat(src, leaf, height){
  const key = src.name + '|' + leaf + '|' + height; if (natMats[key]) return natMats[key];
  if (src.map){ src.map.colorSpace = THREE.NoColorSpace; src.map.needsUpdate = true; }   // this scene works in display values
  const m = new THREE.MeshLambertMaterial({map:src.map || null, color:'#ffffff', alphaTest:leaf ? 0.45 : 0, side:leaf ? THREE.DoubleSide : THREE.FrontSide});
  return natMats[key] = leaf ? swaying(m, height, 0.4, 0.12, height > 1.5) : seeThrough(m);   // (grass, flowers and ferns: no see-through)
}
// one kit model -> {trunk, canopy (all non-bark parts merged, one material group each), trunkMat, canopyMat}
function natModel(name, height, round){
  const root = NATURE[name]; if (!root) return null;
  const bark = root.children.filter(c => /Bark/.test(c.name)), rest = root.children.filter(c => !/Bark/.test(c.name));
  const clean = g => { const h = new THREE.BufferGeometry(); for (const k of ['position', 'normal', 'uv']) if (g.attributes[k]) h.setAttribute(k, g.attributes[k]); h.setIndex(g.index); return h; };
  const out = {height};
  if (bark.length){ out.trunk = clean(bark[0].geometry); out.trunkMat = natMat(bark[0].material, false, height); }
  if (rest.length){ out.canopy = rest.length > 1 ? mergeGeometries(rest.map(c => clean(c.geometry)), true) : clean(rest[0].geometry);
    if (round){   // soft, rounded shading for leaf masses: normals point out from the crown's centre (raw leaf-card normals made the trees nearly black)
      const g = out.canopy; g.computeBoundingBox(); const c = g.boundingBox.getCenter(new THREE.Vector3()); c.y -= (g.boundingBox.max.y - g.boundingBox.min.y)*0.15;
      const P = g.attributes.position, N = new Float32Array(P.count*3), v = new THREE.Vector3();
      for (let i=0;i<P.count;i++){ v.fromBufferAttribute(P, i).sub(c).normalize(); v.y = v.y*0.8 + 0.25; v.normalize(); N[i*3] = v.x; N[i*3+1] = v.y; N[i*3+2] = v.z; }
      g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); }
    out.canopyMat = rest.length > 1 ? rest.map(c => natMat(c.material, true, height)) : natMat(rest[0].material, true, height);
    out.swampMat = [].concat(out.canopyMat).map(m => { const c = m.clone(); c.color.set('#a9b494'); c.onBeforeCompile = m.onBeforeCompile; c.customProgramCacheKey = m.customProgramCacheKey; return c; });
    if (!Array.isArray(out.canopyMat)) out.swampMat = out.swampMat[0]; }
  return out;
}
const natSet = (k, n, h, round) => Array.from({length:n}, (_, i) => natModel(`nat_${k}${i + 1}`, h, round)).filter(Boolean);
if (Object.keys(NATURE).length){
  const oaks = natSet('oak', 5, 4.2, true), pines = natSet('pine', 5, 4.4, true), bushes = natSet('bush', 2, 1.15, true);
  if (TREE_MODELS){ if (oaks.length) TREE_MODELS.oak = oaks; if (pines.length) TREE_MODELS.pine = pines; if (bushes.length) TREE_MODELS.bush = bushes; }
}
const NATURE_SMALL = Object.keys(NATURE).length ? {grass:natSet('grass', 3, 0.5), flower:natSet('flower', 4, 0.55), fern:natSet('fern', 4, 0.45), mush:natSet('mush', 2, 0.3)} : null;
// shells only near the camera, to keep phones fast
const furLOD = (g, near) => { if (g.userData.near === near) return; g.userData.near = near; g.traverse(o => { if (o.userData.shell) o.visible = near; }); };
// a copy of a Blender animal; `recolor` maps material names to new colours (each copy gets its own materials)
function animalClone(name, recolor){
  if (!ANIM[name]) return null; const c = ANIM[name].clone(true);
  if (recolor) c.traverse(o => { if (o.isMesh && recolor[o.material.name]){ o.material = o.material.clone(); o.material.color.set(recolor[o.material.name]); } });
  return c;
}
const REAL = {};
for (const [n, pr] of Object.entries(REAL_LOADS)){
  try { const g = await pr, cfg = REAL_CFG[n];
    g.scene.traverse(o => { if (!o.isMesh) return; const s = o.material;   // textures arrive as colour data: keep them as display values like the rest of the scene
      if (s.map){ s.map.colorSpace = THREE.NoColorSpace; s.map.needsUpdate = true; }
      o.material = new THREE.MeshStandardMaterial({name:s.name, map:s.map, color:(s.map ? new THREE.Color(1, 1, 1) : s.color.clone()).multiplyScalar(cfg.bright || 1), roughness:s.map ? 0.85 : Math.min(0.85, s.roughness), metalness:0, alphaTest:s.alphaTest || (s.transparent ? 0.5 : 0), side:s.side});
      o.frustumCulled = false; });   // skinned: the bind-pose bounds don't follow the animation
    // clips start at time 0 (some files key them from frame 227 on: three.js would hold the first pose for nine seconds each loop)
    for (const c of g.animations){ const t0 = Math.min(...c.tracks.map(t => t.times[0])); if (t0 > 0.01){
      for (const T of new Set(c.tracks.map(t => t.times))) for (let i=0;i<T.length;i++) T[i] -= t0; c.resetDuration(); } }   // (tracks share time arrays: each one once)
    if (cfg.split){ const src = g.animations[0];   // split: {clip: [from, to] seconds} cut out of the file's one long clip, which is then dropped
      g.animations = Object.entries(cfg.split).map(([n, [a, b]]) => THREE.AnimationUtils.subclip(src, n, Math.round(a*30), Math.round(b*30), 30)); }
    // looping clips stay in place (some walk the body a stride forward and jump back each loop): the game moves the animal itself
    for (const c of g.animations) if (!/^(lieDown|getUp|jump|attack)$/.test(c.name)) for (const t of c.tracks){
      if (!t.name.endsWith('.position')) continue; const v = t.values, T = t.times, n = T.length, d = [v[3*n-3] - v[0], v[3*n-2] - v[1], v[3*n-1] - v[2]], span = T[n-1] - T[0] || 1;
      for (let i=0;i<n;i++){ const u = (T[i] - T[0])/span; for (let k=0;k<3;k++) v[3*i+k] -= d[k]*u; } }
    const tmp = new THREE.Group(), box = new THREE.Box3(); g.scene.rotation.y = cfg.yaw || 0; tmp.add(g.scene);
    // measured on the skeleton in its first walking (or standing) frame: these files keep their scale in the bones, so mesh
    // bounds say nothing, and some rest poses lie on their side
    const mx = new THREE.AnimationMixer(g.scene), c0 = g.animations.find(c => c.name === 'walk') || g.animations.find(c => c.name === 'idle') || g.animations[0];
    if (c0){ mx.clipAction(c0).play(); mx.update(0); }
    tmp.updateMatrixWorld(true);
    const v_ = new THREE.Vector3(); tmp.traverse(o => { if (o.isBone) box.expandByPoint(o.getWorldPosition(v_)); });
    if (cfg.meshBox){ box.makeEmpty(); tmp.traverse(o => { if (o.isSkinnedMesh) for (let i=0;i<o.geometry.attributes.position.count;i+=3){ o.getVertexPosition(i, v_); box.expandByPoint(v_.applyMatrix4(o.matrixWorld)); } }); }   // (measured on the posed skin: the koala clings far above its root bone)
    mx.stopAllAction(); mx.uncacheRoot(g.scene);
    if (box.isEmpty()) box.setFromObject(tmp);   // a static model (a tree): no bones to measure, its mesh bounds are right
    box.min.z -= (box.max.z - box.min.z)*0.06; box.max.z += (box.max.z - box.min.z)*0.06;   // the skin reaches a little past the end bones
    const old = ANIM[cfg.like] ? new THREE.Box3().setFromObject(ANIM[cfg.like], true) : null;
    const s = (cfg.h ? cfg.h/(box.max.y - box.min.y) : cfg.len ? cfg.len/(box.max.z - box.min.z) : old ? (old.max.z - old.min.z)/(box.max.z - box.min.z) : 1)*(cfg.k || 1);
    REAL[n] = cfg.raw ? {g, s:1, x:0, y:0, z:0, cfg} : {g, s, y:-box.min.y*s, x:-(box.min.x + box.max.x)/2*s, z:-(box.min.z + box.max.z)/2*s, cfg}; tmp.remove(g.scene);   // centred on the body, feet on the ground
  } catch(e){ console.warn(`real/${n}.glb not loaded`, e); }
}
// a copy of a realistic animal: an outer group (moved and turned by the behaviour code) holding the scaled model,
// with userData.mixer / clips for fauna.js and userData.parts for named meshes (antlers)
function realClone(n){
  const R = REAL[n]; if (!R) return null;
  const inner = cloneSkinned(R.g.scene); inner.scale.setScalar(R.s); inner.position.set(R.x, R.y, R.z);
  const out = new THREE.Group(); out.add(inner);
  out.userData.mixer = new THREE.AnimationMixer(inner); out.userData.clips = Object.fromEntries(R.g.animations.map(c => [c.name, c])); out.userData.real = n; out.userData.stride = R.cfg.stride;
  out.userData.parts = {}; for (const [k, m] of Object.entries(R.cfg.parts || {})) inner.traverse(o => { if (o.isMesh && o.material.name.startsWith(m)) out.userData.parts[k] = o; });
  inner.traverse(o => { if (o.isBone && /head/i.test(o.name) && !/nub|end/i.test(o.name) && !out.userData.head) out.userData.head = o;
    if (o.isBone && /jaw/i.test(o.name) && !/end|lip/i.test(o.name) && !out.userData.jawBone) out.userData.jawBone = o;
    if (o.isBone && /tail/i.test(o.name) && !/end|nub|pony/i.test(o.name) && !out.userData.tail) out.userData.tail = o;
    if (o.isBone && /neck/i.test(o.name) && !/end|nub/i.test(o.name) && !out.userData.neck) out.userData.neck = o; });
  const tails = []; for (let b = out.userData.tail; b && tails.length < 3; b = b.children.find(c => c.isBone && /tail/i.test(c.name) && !/end|nub/i.test(c.name))) tails.push(b);
  out.userData.tails = tails;   // the first few tail bones, for a swish that runs down the tail
  return out;
}
const FISH_LOOKS = [['#f08a3c', '#ffffff', '#f6b26b'], ['#f2efe8', '#e0483a', '#f3c9b0'], ['#e0483a', '#f6d0c0', '#f08a6a'], ['#4f86c6', '#cfe6ff', '#7fb2e0'], ['#f3d250', '#fff6c8', '#f6e08a'], ['#7a8c5a', '#c8d49a', '#a0b07a'], ['#c3ccd6', '#ffffff', '#dfe6ee'], ['#2f3a40', '#e8a33c', '#5a6a70']];
const FISH_MIX = [];   // the realistic river trout's swimming (updated with the butterflies, every frame)
const fishModel = (i, koi) => { const rt = realClone(koi ? 'koi' : 'trout'); if (rt){ const ac = rt.userData.mixer.clipAction(rt.userData.clips.swim); ac.play(); ac.time = Math.random()*2; FISH_MIX.push(rt.userData.mixer); return {g:rt, tail:null}; }
  const [b, s, f] = FISH_LOOKS[i % FISH_LOOKS.length], g = animalClone('fish', {FishBody:b, FishSpot:s, FishFin:f}); return g ? {g, tail:g.getObjectByName('fish_tail')} : null; };
// swap a named material inside a cloned prop (e.g. the lamp bulb becomes a night-glow material)
const swapMat = (obj, name, m) => obj.traverse(o => { if (!o.isMesh) return; if (Array.isArray(o.material)) o.material = o.material.map(x => x.name === name ? m : x); else if (o.material.name === name) o.material = m; });

// ---------- evolution forms ----------
const FORMS = {
  normal: {name:'袋熊',     desc:'照顧得剛剛好。'},
  skinny: {name:'瘦瘦熊',   body:[0.66,0.84,1.04], head:0.92, fur:0.55, tint:['#b59c80',0.18], speed:1.05, desc:'進化時太餓，或這個階段常常餓肚子。'},
  sickly: {name:'病懨懨熊', body:[0.9,0.88,1], tint:['#8f9c76',0.42], acc:['bandage','thermo'], droopy:true, speed:0.7, desc:'進化的時候正在生病。'},
  stinky: {name:'臭臭熊',   tint:['#7b7150',0.2], acc:'poop', desc:'進化的時候，場上有 3 坨以上的便便沒清。'},
  chubby: {name:'胖胖熊',   body:[1.26,1.14,1.05], head:1.06, fur:1.25, speed:0.75, desc:'這個階段常常在牠不餓的時候還一直餵。'},
  sporty: {name:'活力熊',   body:[0.98,1.03,1.05], acc:'headband', speed:1.25, desc:'這個階段陪牠玩了很多次（8 次以上）。'},
  royal:  {name:'皇家袋熊', acc:['crown','cape'], desc:'完全體時照顧得幾乎沒有失誤，心情又很好。'},
  forest: {name:'森靈袋熊', acc:['leafcape','sprout'], desc:'完全體時照顧得很好，而且成熟期拔了很多雜草（12 株以上），或家裡同時有小水池和花圃。'},
  wind:   {name:'疾風袋熊', body:[0.98,1.03,1.05], acc:['windband','windscarf'], speed:1.4, desc:'活力熊在完全體時照顧得很好，成熟期也常常陪牠玩。'},
  golden: {name:'黃金袋熊', tint:['#d9a933',0.55], acc:['crown','cape'], glow:'#ffd76a', speed:1.1, desc:'皇家袋熊在究極體依然被完美照顧。'},
  forestx:{name:'森羅袋熊', tint:['#7d6a3e',0.12], acc:['leafcape','antler'], glow:'#a6f08a', desc:'森靈袋熊在究極體依然被完美照顧。'},
  thunder:{name:'雷光袋熊', body:[0.98,1.03,1.05], acc:['boltband','boltcape'], glow:'#ffe45c', speed:1.5, desc:'疾風袋熊在究極體依然被完美照顧。'}
};
const formAcc = F => [].concat(F.acc || []);
const ACC = {};
(function buildAcc(){
  const brown = mat('#6e4c35',0.9);
  { const g = new THREE.Group();
    const a = new THREE.Mesh(new THREE.TorusGeometry(0.2,0.1,10,24), brown); a.rotation.x = Math.PI/2; a.position.y = 0.05; g.add(a);
    const b = new THREE.Mesh(new THREE.TorusGeometry(0.13,0.08,10,20), brown); b.rotation.x = Math.PI/2; b.position.y = 0.17; g.add(b);
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.1,12,10), brown); c.position.y = 0.26; g.add(c);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06,0.14,10), brown); tip.position.y = 0.38; tip.rotation.z = 0.3; g.add(tip);
    const flies = new THREE.Group(); for (let i=0;i<3;i++){ const f = new THREE.Mesh(new THREE.SphereGeometry(0.025,6,4), mat('#111',0.4)); f.position.set(0.35,0.3+i*0.1,0); f.userData.ph = i*2.1; flies.add(f); }
    g.add(flies); g.userData.flies = flies;
    g.position.set(0,0.58,0.5); head.add(g); ACC.poop = g; }
  { const g = new THREE.Group(), w = mat('#f4f1ea',0.9);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.73,0.055,8,48), w); band.rotation.x = Math.PI/2; band.scale.set(1.1,0.72,1); band.position.set(0,0.3,0.6); g.add(band);
    for (const r of [0.6,-0.6]){ const p = new THREE.Mesh(new THREE.BoxGeometry(0.28,0.08,0.02), mat('#e8c9a6',0.9)); p.position.set(-0.32,0.42,1.0); p.rotation.set(-0.5,0.35,r); g.add(p); }
    head.add(g); ACC.bandage = g; }
  { const g = new THREE.Group();
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.73,0.07,8,48), mat('#d94b45',0.7)); band.rotation.x = Math.PI/2; band.scale.set(1.1,0.72,1); band.position.set(0,0.32,0.6); g.add(band);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06,0.35,0.12), band.material); tail.position.set(0,0.2,-0.2); tail.rotation.x = 0.6; g.add(tail);
    head.add(g); ACC.headband = g; }
  { const g = new THREE.Group(), gold = new THREE.MeshStandardMaterial({color:'#e2b53b', roughness:0.25, metalness:0.6});
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.3,0.3,0.16,24,1,true), gold); ring.material.side = THREE.DoubleSide; ring.position.y = 0.08; g.add(ring);
    for (let i=0;i<5;i++){ const a = i/5*Math.PI*2; const c = new THREE.Mesh(new THREE.ConeGeometry(0.06,0.16,8), gold); c.position.set(Math.sin(a)*0.3,0.23,Math.cos(a)*0.3); g.add(c);
      const gem = new THREE.Mesh(new THREE.SphereGeometry(0.035,8,6), mat(['#e0607e','#4f86c6','#5aa469'][i%3],0.2)); gem.position.set(Math.sin(a)*0.31,0.08,Math.cos(a)*0.31); g.add(gem); }
    g.position.set(0,0.58,0.5); head.add(g); ACC.crown = g; }

  // --- perfect / ultimate branch outfits ---
  // Point + outward normal on the body ellipsoid (bodyFit space, front = +z), and the "downhill" tangent.
  const BA = 1.0, BB = 0.85, BC = 1.5;
  const surf = (th, ph, k) => {
    const a = BA*k, b = BB*k, c = BC*k;
    const p = V3(a*Math.sin(th)*Math.cos(ph), b*Math.cos(th), c*Math.sin(th)*Math.sin(ph));
    return {p, n: V3(p.x/(a*a), p.y/(b*b), p.z/(c*c)).normalize(), t: V3(a*Math.cos(th)*Math.cos(ph), -b*Math.sin(th), c*Math.cos(th)*Math.sin(ph)).normalize()};
  };
  const leafGeo = new THREE.SphereGeometry(1, 10, 6); leafGeo.scale(0.15, 0.03, 0.3); leafGeo.translate(0, 0, 0.22);
  const flower = s => { const g = new THREE.Group(), w = mat('#fbf8f0',0.8);
    for (let i=0;i<5;i++){ const a = i/5*Math.PI*2, p = new THREE.Mesh(new THREE.SphereGeometry(1,8,6), w); p.scale.set(0.07*s,0.025*s,0.05*s); p.position.set(Math.cos(a)*0.07*s, 0, Math.sin(a)*0.07*s); p.rotation.y = -a; g.add(p); }
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.035*s,8,6), mat('#f3c94a',0.6)); c.position.y = 0.015*s; g.add(c); return g; };
  // Overlapping leaves draped over the shoulders and back, like a leafy cloak.
  function leafMantle(k, th0, th1){
    const pts = [];
    for (let th = th0, row = 0; th <= th1; th += 0.19, row++){
      const n = Math.round(28*Math.sin(th));
      for (let i=0;i<n;i++){ const ph = (i + (row%2)*0.5)/n*Math.PI*2; if (Math.sin(ph) > 0.5 && th < 1.25) continue; pts.push([th, ph]); }
    }
    const m = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({roughness:0.65, side:THREE.DoubleSide}), pts.length);
    const M = new THREE.Matrix4(), R = new THREE.Matrix4().makeRotationX(-0.45), col = new THREE.Color(), greens = ['#5f9a3e','#76b24a','#4c8434','#8cc25a'];
    pts.forEach(([th, ph], i) => {
      const {p, n, t} = surf(th, ph, k), x = new THREE.Vector3().crossVectors(n, t), s = rnd(0.85, 1.2);
      M.makeBasis(x, n, t).multiply(R).scale(V3(s,s,s)).setPosition(p.addScaledVector(n, 0.07));
      m.setMatrixAt(i, M); m.setColorAt(i, col.set(greens[i % greens.length]).offsetHSL(0, 0, rnd(-0.04, 0.04)));
    });
    return m;
  }
  { const g = new THREE.Group();
    g.add(leafMantle(1.06, 0.3, 1.8));
    const vine = new THREE.Mesh(new THREE.TorusGeometry(0.9,0.06,8,40), mat('#4f7a33',0.8)); vine.scale.set(1,0.86,1); vine.position.set(0,0.02,0.82); g.add(vine);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.11), new THREE.MeshStandardMaterial({color:'#5fe07a', emissive:'#2fbf55', emissiveIntensity:0.6, roughness:0.2})); gem.scale.y = 1.5; gem.position.set(0,-0.72,0.98); g.add(gem);
    [[0.6,1.1],[1.9,1.25],[3.4,1.0],[4.4,1.35],[5.5,1.15]].forEach(([ph, th]) => { const {p, n} = surf(th, ph, 1.1), f = flower(1.3);
      f.position.copy(p.addScaledVector(n, 0.1)); f.quaternion.setFromUnitVectors(UP, n); g.add(f); });
    g.userData.gem = gem.material; bodyFit.add(g); ACC.leafcape = g; }
  { const g = new THREE.Group(), leaf = mat('#6aa845',0.6);
    for (const s of [-1,1]){ const l = new THREE.Mesh(leafGeo, leaf); l.position.set(0.04*s,0.05,0); l.rotation.set(-1.0, 0, -0.5*s); l.rotation.order = 'ZXY'; l.scale.setScalar(0.9); g.add(l); }
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.025,0.14,6), leaf); stem.position.y = 0.02; g.add(stem);
    const f = flower(1.4); f.position.set(-0.5,-0.12,0.18); f.rotation.set(0.3,0,0.6); g.add(f);
    g.position.set(0,0.56,0.5); head.add(g); ACC.sprout = g; }
  { const g = new THREE.Group(), horn = new THREE.MeshStandardMaterial({color:'#c79a45', roughness:0.35, metalness:0.4});
    const beam = (from, dir, len, r) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r*0.7, r, len, 8), horn);
      m.position.copy(from).addScaledVector(dir, len/2); m.quaternion.setFromUnitVectors(UP, dir); g.add(m); return from.clone().addScaledVector(dir, len); };
    for (const s of [-1,1]){
      const base = V3(0.28*s, 0.5, 0.35), mid = beam(base, V3(0.55*s,1,-0.15).normalize(), 0.42, 0.05), top = beam(mid, V3(0.25*s,1,-0.25).normalize(), 0.3, 0.035);
      beam(mid, V3(0.9*s,0.55,0.15).normalize(), 0.22, 0.03); beam(top, V3(0.6*s,0.8,0.1).normalize(), 0.14, 0.025); beam(top, V3(-0.2*s,1,-0.3).normalize(), 0.14, 0.025);
      for (let i=0;i<3;i++){ const l = new THREE.Mesh(leafGeo, mat('#5f9a3e',0.6)); l.position.copy(mid).lerp(base, i/3); l.rotation.set(rnd(-1,1), rnd(0,6), rnd(-1,1)); l.scale.setScalar(0.55); g.add(l); }
    }
    const vine = new THREE.Mesh(new THREE.TorusGeometry(0.74,0.05,8,48), mat('#4f7a33',0.8)); vine.rotation.x = Math.PI/2; vine.scale.set(1.1,0.72,1); vine.position.set(0,0.34,0.6); g.add(vine);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), new THREE.MeshStandardMaterial({color:'#6af08a', emissive:'#2fd060', emissiveIntensity:0.8, roughness:0.15})); gem.scale.y = 1.5; gem.position.set(0,0.4,1.1); g.add(gem);
    const f = flower(1.3); f.position.set(0.45,0.5,0.75); f.rotation.set(0.4,0,-0.5); g.add(f);
    g.userData.gem = gem.material; head.add(g); ACC.antler = g; }
  // Royal cape: red cloak over the back with white fur collar and hem.
  // Cape surface: a shell just outside the body whose hem flares out like hanging cloth.
  const CS = [1.09, BB*1.1, BC*1.06];
  const flare = (th, len) => 1 + 0.14*Math.pow(clamp((th - 0.6)/(len - 0.6), 0, 1), 2);
  const capeShell = (red, open, len, teeth) => {
    const geo = new THREE.SphereGeometry(1, teeth ? 24 : 40, 12, Math.PI/2 + open, Math.PI*2 - open*2, 0, len);
    const p = geo.attributes.position;
    for (let i=0;i<p.count;i++){
      const f = flare(Math.acos(clamp(p.getY(i), -1, 1)), len);
      let y = p.getY(i)*CS[1];
      if (teeth && Math.floor(i/25) === 12 && i%2) y += 0.28; // lift every other bottom vertex → zig-zag hem
      p.setXYZ(i, p.getX(i)*CS[0]*f, y, p.getZ(i)*CS[2]*f);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, red); m.material.side = THREE.DoubleSide; return m;
  };
  const hemCurve = (open, th, len, off) => { const pts = [], f = flare(th, len)*off;
    for (let i=0;i<=40;i++){ const ph = Math.PI/2 + open + i/40*(Math.PI*2 - open*2);
      pts.push(V3(-Math.cos(ph)*Math.sin(th)*CS[0]*f, Math.cos(th)*CS[1]*off, Math.sin(ph)*Math.sin(th)*CS[2]*f)); }
    return new THREE.CatmullRomCurve3(pts); };
  { const g = new THREE.Group(), white = mat('#f6f1e6',0.95), gold = new THREE.MeshStandardMaterial({color:'#e2b53b', roughness:0.3, metalness:0.5});
    g.add(capeShell(mat('#b8323a',0.55), 0.75, 1.48));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(hemCurve(0.75, 1.48, 1.48, 1.02), 64, 0.06, 8), white));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(hemCurve(0.75, 1.32, 1.48, 1.015), 64, 0.02, 6), gold));
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.9,0.17,10,40), white); collar.scale.set(1,0.86,1); collar.position.set(0,0.02,0.8); g.add(collar);
    const brooch = new THREE.Mesh(new THREE.CylinderGeometry(0.11,0.11,0.04,16), gold); brooch.rotation.x = Math.PI/2; brooch.position.set(0,-0.7,0.98); g.add(brooch);
    const ruby = new THREE.Mesh(new THREE.SphereGeometry(0.07,12,8), new THREE.MeshStandardMaterial({color:'#d22d3c', emissive:'#6a0d16', roughness:0.15})); ruby.position.set(0,-0.7,1.02); g.add(ruby);
    bodyFit.add(g); ACC.cape = g; }
  // Ribbon tails that flutter (animated in updateFormFx).
  const ribbonTail = (m, side) => { const root_ = new THREE.Group(); let p = root_;
    for (let i=0;i<4;i++){ const seg = new THREE.Group(), b = new THREE.Mesh(new THREE.BoxGeometry(0.11 - i*0.015, 0.02, 0.24), m); b.position.z = -0.12; seg.add(b); seg.position.z = i ? -0.24 : 0; p.add(seg); p = seg; }
    root_.rotation.set(-0.35, 0.3*side, 0); return root_; };
  const band = (red, gold, emblem) => { const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.TorusGeometry(0.74,0.075,8,48), red); b.rotation.x = Math.PI/2; b.scale.set(1.1,0.72,1); b.position.set(0,0.32,0.6); g.add(b);
    for (const dy of [-0.07, 0.07]){ const tr = new THREE.Mesh(new THREE.TorusGeometry(0.745,0.018,6,48), gold); tr.rotation.x = Math.PI/2; tr.scale.set(1.1,0.72,1); tr.position.set(0,0.32+dy,0.6); g.add(tr); }
    emblem.position.set(0,0.33,1.1); g.add(emblem);
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.09,10,8), red); knot.position.set(0,0.3,0.08); g.add(knot);
    const tails = [ribbonTail(red, 1), ribbonTail(red, -1)]; tails.forEach(t_ => { t_.position.set(0,0.3,0.05); g.add(t_); });
    g.userData.tails = tails; head.add(g); return g; };
  const boltShape = s => { const sh = new THREE.Shape(); [[0.1,0.5],[-0.25,0],[0,0],[-0.1,-0.5],[0.25,0.05],[0,0.05]].forEach(([x,y],i) => i ? sh.lineTo(x*s,y*s) : sh.moveTo(x*s,y*s)); return sh; };
  { const gold = new THREE.MeshStandardMaterial({color:'#e2b53b', roughness:0.3, metalness:0.5});
    const swirl = new THREE.Mesh(new THREE.TorusGeometry(0.08,0.025,6,20,Math.PI*1.6), gold);
    ACC.windband = band(mat('#c8333a',0.6), gold, swirl);
    const bolt = new THREE.Mesh(extrude(boltShape(0.42), 0.05), new THREE.MeshStandardMaterial({color:'#ffd84a', emissive:'#ffb000', emissiveIntensity:0.6, roughness:0.3}));
    ACC.boltband = band(mat('#c8333a',0.6), gold, bolt); ACC.boltband.userData.bolt = bolt.material; }
  { const g = new THREE.Group(), red = mat('#c8333a',0.7);
    g.add(capeShell(red, 0.9, 1.05));
    const tails = [ribbonTail(red, 1), ribbonTail(red, -1)]; tails.forEach((t_, i) => { t_.position.set(0.22*(i ? -1 : 1), 0.98, 0.6); t_.rotation.x = -0.12; t_.scale.setScalar(1.4); g.add(t_); });
    g.userData.tails = tails; bodyFit.add(g); ACC.windscarf = g; }
  { const g = new THREE.Group(), gold = new THREE.MeshStandardMaterial({color:'#e2b53b', emissive:'#7a5500', emissiveIntensity:0.4, roughness:0.3, metalness:0.5});
    g.add(capeShell(mat('#b8323a',0.55), 0.8, 1.45, true));
    const gemB = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), new THREE.MeshStandardMaterial({color:'#5aa8ff', emissive:'#1a5fd0', emissiveIntensity:0.6, roughness:0.15})); gemB.scale.y = 1.4; gemB.position.set(0,-0.7,1.0); g.add(gemB);
    const trim = new THREE.Mesh(new THREE.TubeGeometry(hemCurve(0.8, 1.15, 1.45, 1.015), 64, 0.025, 6), gold); g.add(trim);
    bodyFit.add(g); ACC.boltcape = g; }
  { const g = new THREE.Group();
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.022,0.022,0.42,8), mat('#f4f6f8',0.3)); tube.position.y = 0.21; g.add(tube);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.035,10,8), mat('#d23b32',0.3)); bulb.position.y = 0.42; g.add(bulb);
    g.position.set(0.1,-0.3,1.0); g.rotation.set(0.3,0,-1.2); head.add(g); ACC.thermo = g; }
  Object.values(ACC).forEach(g => g.visible = false);
})();

// ---------- clothes ----------
const CLOTHES = [
  {id:'party',   name:'派對帽', price:20, def:'#e45b5b', slot:'hat'},
  {id:'straw',   name:'草帽',   price:25, def:'#e45b5b', slot:'hat'},
  {id:'glasses', name:'圓眼鏡', price:25, def:'#3b3b3b', slot:'eyes'},
  {id:'bow',     name:'領結',   price:15, def:'#4f86c6', slot:'neck'},
  {id:'scarf',   name:'圍巾',   price:30, def:'#f2a541', slot:'scarf'},
  {id:'sweater', name:'毛衣',   price:40, def:'#5aa469', slot:'body'},
  {id:'nyband',  name:'新年金頭帶', price:30, def:'#e2b53b', slot:'hat',  holiday:'newyear'},
  {id:'caishen', name:'財神帽',   price:30, def:'#d23b32', slot:'hat',  holiday:'cny'},
  {id:'heartgl', name:'愛心眼鏡', price:25, def:'#e9638c', slot:'eyes', holiday:'valentine'},
  {id:'propeller', name:'竹蜻蜓帽', price:30, def:'#4f86c6', slot:'hat', holiday:'children'},
  {id:'sachet',  name:'端午香包', price:25, def:'#d23b32', slot:'neck', holiday:'dragon'},
  {id:'bunny',   name:'玉兔髮箍', price:30, def:'#f2a6be', slot:'hat',  holiday:'midautumn'},
  {id:'witch',   name:'巫師帽',   price:30, def:'#4b2f6b', slot:'hat',  holiday:'halloween'},
  {id:'santa',   name:'聖誕帽',   price:30, def:'#d23b32', slot:'hat',  holiday:'christmas'}
];
const PALETTE = ['#e45b5b','#f2a541','#f3d250','#5aa469','#4f86c6','#9b6fc4','#f2a6be','#f2f0ea','#3b3b3b'];
const CL = {};
let propeller = null;
(function buildClothes(){
  const white = mat('#f6f3ec',0.95), gold = new THREE.MeshStandardMaterial({color:'#e2b53b', roughness:0.3, metalness:0.5});
  // hats were placed for the old, taller head: sit them a little lower and further forward on the new one
  const onHead = (id, g, mats, y=0.62, z=0.42) => { y -= 0.06; z += 0.08; g.position.set(0,y,z); g.userData.baseY = y; head.add(g); CL[id] = {g, mats}; };
  { const g = new THREE.Group(), m = mat('#e45b5b',0.6);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.27,0.62,28), m); cone.position.y = 0.31; g.add(cone);
    const pom = new THREE.Mesh(new THREE.SphereGeometry(0.08,12,10), white); pom.position.y = 0.64; g.add(pom);
    g.rotation.z = 0.12; onHead('party', g, [m]); }
  { const g = new THREE.Group(), straw = mat('#e2c37c',0.85), band = mat('#e45b5b',0.6);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.78,0.8,0.04,40), straw);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.36,0.42,0.32,32), straw); crown.position.y = 0.17;
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.425,0.43,0.09,32), band); b.position.y = 0.06;
    g.add(brim, crown, b); g.rotation.x = -0.08; onHead('straw', g, [band], 0.66, 0.4); }
  { const g = new THREE.Group(), m = mat('#3b3b3b',0.4), E = eyeSpots();   // lenses sit right in front of the model's eyes
    for (const s of [-1,1]){ const r = new THREE.Mesh(new THREE.TorusGeometry(0.12,0.02,8,28), m); r.position.copy(E[s]).add(V3(0, 0, 0.05)); g.add(r); }
    const br = new THREE.Mesh(new THREE.CylinderGeometry(0.016,0.016,Math.abs(E[1].x - E[-1].x) - 0.2,8), m); br.rotation.z = Math.PI/2; br.position.copy(E[1]).lerp(E[-1], 0.5).add(V3(0, 0.05, 0.08)); g.add(br);
    head.add(g); CL.glasses = {g, mats:[m]}; }
  { const g = new THREE.Group(), m = mat('#4f86c6',0.6);
    for (const s of [-1,1]){ const w = new THREE.Mesh(new THREE.ConeGeometry(0.13,0.24,4), m); w.rotation.z = s*Math.PI/2; w.position.x = 0.12*s; w.scale.z = 0.5; g.add(w); }
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.055,12,10), m));
    g.position.set(0,-0.6,0.98); head.add(g); CL.bow = {g, mats:[m]}; }
  { const g = new THREE.Group(), m = mat('#f2a541',0.95); m.map = knitTex;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.93,0.16,14,48), m); ring.scale.set(1.04,0.9,1); g.add(ring);
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.17,14,10), m); knot.position.set(0.72,-0.4,0.12); g.add(knot);
    g.position.set(0,0.02,0.98); g.rotation.x = 0.4; bodyFit.add(g); CL.scarf = {g, mats:[m]}; }
  { const geo = new THREE.CylinderGeometry(1,1,1,48,12,true), p = geo.attributes.position;
    for (let i=0;i<p.count;i++){
      const a = Math.atan2(p.getZ(i), p.getX(i)), zz = -0.35 + (p.getY(i)+0.5)*1.22;   // covers the chest and front half
      const k = Math.sqrt(Math.max(0.05, 1 - Math.pow((zz+0.25)/1.5, 2)));
      p.setXYZ(i, Math.cos(a)*1.0*k*1.12, Math.sin(a)*0.85*k*1.12, zz + 0.25);
    }
    geo.computeVertexNormals();
    const m = mat('#5aa469',0.95); m.map = knitTex; m.side = THREE.DoubleSide;
    const g = new THREE.Group(); g.add(new THREE.Mesh(geo, m)); bodyFit.add(g); CL.sweater = {g, mats:[m]}; }
  // holiday items
  { const g = new THREE.Group(), m = mat('#e2b53b',0.4);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.73,0.06,8,48), m); band.rotation.x = Math.PI/2; band.scale.set(1.1,0.72,1); band.position.set(0,-0.3,0.1); g.add(band);
    const star = new THREE.Mesh(extrude(starShape(0.18,0.08), 0.04), gold); star.position.set(0,-0.22,0.66); g.add(star);
    onHead('nyband', g, [m]); }
  { const g = new THREE.Group(), m = mat('#d23b32',0.6);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26,0.32,0.42,24), m); body.position.y = 0.21; g.add(body);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.326,0.33,0.08,24), gold); band.position.y = 0.05; g.add(band);
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.07,12,10), gold); top.position.y = 0.46; g.add(top);
    for (const s of [-1,1]){ const w = new THREE.Mesh(new THREE.BoxGeometry(0.32,0.06,0.03), gold); w.position.set(0.4*s,0.3,0); w.rotation.z = -0.25*s; g.add(w); }
    onHead('caishen', g, [m]); }
  { const g = new THREE.Group(), m = mat('#e9638c',0.4), hg = extrude(heartShape(0.13), 0.03), E = eyeSpots();
    for (const s of [-1,1]){ const h = new THREE.Mesh(hg, m); h.position.copy(E[s]).add(V3(0, 0, 0.06)); g.add(h); }
    const br = new THREE.Mesh(new THREE.CylinderGeometry(0.016,0.016,Math.abs(E[1].x - E[-1].x) - 0.16,8), m); br.rotation.z = Math.PI/2; br.position.copy(E[1]).lerp(E[-1], 0.5).add(V3(0, 0.05, 0.09)); g.add(br);
    head.add(g); CL.heartgl = {g, mats:[m]}; }
  { const g = new THREE.Group(), m = mat('#4f86c6',0.6);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.32,24,12,0,Math.PI*2,0,Math.PI/2), m); g.add(cap);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,0.22,8), mat('#c9a86a',0.8)); stick.position.y = 0.42; g.add(stick);
    propeller = new THREE.Group(); propeller.position.y = 0.53;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.75,0.02,0.1), mat('#f3d250',0.6)); propeller.add(blade); g.add(propeller);
    onHead('propeller', g, [m], 0.56, 0.42); }
  { const g = new THREE.Group(), m = mat('#d23b32',0.7);
    const str = new THREE.Mesh(new THREE.TorusGeometry(0.95,0.025,6,48), mat('#e2b53b',0.5)); str.scale.set(1,0.86,1); g.add(str);
    const pouch = new THREE.Mesh(new THREE.SphereGeometry(0.15,14,10), m); pouch.scale.set(1,1.2,0.6); pouch.position.set(0,-0.92,0.12); g.add(pouch);
    const tas = new THREE.Mesh(new THREE.ConeGeometry(0.05,0.18,8), mat('#e2b53b',0.5)); tas.position.set(0,-1.15,0.12); tas.rotation.x = Math.PI; g.add(tas);
    g.position.set(0,0.02,1.0); g.rotation.x = 0.4; bodyFit.add(g); CL.sachet = {g, mats:[m]}; }
  { const g = new THREE.Group(), m = mat('#f2a6be',0.6);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.62,0.035,8,32,Math.PI), m); band.position.set(0,-0.5,0); g.add(band);
    for (const s of [-1,1]){ const e = new THREE.Group(); e.position.set(0.26*s,0.5,0); e.rotation.z = -0.18*s;
      const out = new THREE.Mesh(new THREE.SphereGeometry(1,16,12), white); out.scale.set(0.1,0.36,0.06); e.add(out);
      const inn = new THREE.Mesh(new THREE.SphereGeometry(1,12,10), m); inn.scale.set(0.05,0.26,0.02); inn.position.z = 0.045; e.add(inn); g.add(e); }
    onHead('bunny', g, [m], 0.6, 0.4); }
  { const g = new THREE.Group(), m = mat('#4b2f6b',0.7);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.72,0.72,0.03,36), m); g.add(brim);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.33,0.85,24), m); cone.position.set(0.05,0.42,0); cone.rotation.z = -0.15; g.add(cone);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.31,0.32,0.08,24), mat('#f2a541',0.6)); band.position.y = 0.07; g.add(band);
    onHead('witch', g, [m], 0.66, 0.42); }
  { const g = new THREE.Group(), m = mat('#d23b32',0.6), flop = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.3,0.66,24), m); cone.position.y = 0.33; flop.add(cone);
    const pom = new THREE.Mesh(new THREE.SphereGeometry(0.08,12,10), white); pom.position.y = 0.68; flop.add(pom);
    flop.rotation.z = 0.45; g.add(flop);
    const fur_ = new THREE.Mesh(new THREE.TorusGeometry(0.3,0.07,10,28), white); fur_.rotation.x = Math.PI/2; fur_.position.y = 0.03; g.add(fur_);
    onHead('santa', g, [m]); }
  Object.values(CL).forEach(c => c.g.visible = false);
})();

// ---------- egg ----------
const eggG = new THREE.Group(); scene.add(eggG);
const eggPts = []; for (let i=0;i<=24;i++){ const t = i/24*Math.PI; eggPts.push(new THREE.Vector2(Math.max(0.001, 0.52*Math.sin(t)*(1+0.14*Math.cos(t))), -Math.cos(t)*0.72)); }
const eggTex = canvasTex(256,128,(x,w,h)=>{ x.fillStyle = '#f1e6cf'; x.fillRect(0,0,w,h); x.fillStyle = '#a77d55';
  for (let i=0;i<46;i++){ x.beginPath(); x.ellipse(Math.random()*w, 10+Math.random()*(h-20), 3+Math.random()*7, 2+Math.random()*5, 0, 0, Math.PI*2); x.fill(); } });
const eggMat = new THREE.MeshStandardMaterial({map:eggTex, roughness:0.65});
const eggMesh = new THREE.Mesh(new THREE.LatheGeometry(eggPts, 32), eggMat); eggMesh.position.y = 0.74; eggMesh.userData.kind = 'egg';
const eggWob = new THREE.Group(); eggWob.add(eggMesh); eggG.add(eggWob);
const nest = new THREE.Mesh(new THREE.TorusGeometry(0.62,0.17,8,28), mat('#c9a86a',0.95)); nest.rotation.x = Math.PI/2; nest.position.y = 0.12; eggG.add(nest);
const eggShadow = makeShadow(1.8, 1.8);
let eggHalves = null;

// spotlight beam + evolution pillar
const beamMat = () => new THREE.MeshBasicMaterial({map:beamTex, color:'#fff1c2', transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide});
const spot = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.7, 9, 32, 1, true), beamMat()); spot.position.y = 4.5; spot.visible = false; scene.add(spot);
const spotPool = new THREE.Mesh(new THREE.PlaneGeometry(4,4), new THREE.MeshBasicMaterial({map:radialTex('rgba(255,240,190,0.9)','rgba(255,240,190,0)'), transparent:true, opacity:0, depthWrite:false, blending:THREE.AdditiveBlending}));
spotPool.rotation.x = -Math.PI/2; spotPool.position.y = 0.012; spotPool.visible = false; scene.add(spotPool);
const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.5, 16, 32, 1, true), beamMat()); pillar.position.y = 8; pillar.visible = false; scene.add(pillar);
const rings = [0,1,2].map(i => { const m = new THREE.Mesh(new THREE.TorusGeometry(1.6,0.05,8,64), new THREE.MeshBasicMaterial({color:i===1?'#ffe08a':'#ffffff', transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false}));
  m.rotation.x = Math.PI/2; m.visible = false; scene.add(m); return m; });

// ---------- world layout & buildings ----------
const BOUND = 5.4;   // old yard radius (only used for legacy building spots)
const SPOTS = { house:V3(-4.0,0,-3.5), pond:V3(4.0,0,-3.4), lamp:V3(1.0,0,-5.3), flowers:V3(-4.5,0,3.0) };
const ringSpot = deg => V3(Math.sin(deg*Math.PI/180)*8.3, 0, Math.cos(deg*Math.PI/180)*8.3);
// size = footprint in grid cells [width, depth] (1 cell = 1 unit); the fence has no footprint (it rings the yard).
const BUILDS = [
  {id:'house',   name:'袋熊小窩', price:120, desc:'晚上、下雨或累了會躲進去睡，睡得比較好。', size:[5,5]},
  {id:'pond',    name:'小水池',   price:90,  desc:'不用再擺水碗，按喝水牠就會自己走去喝。', size:[4,3]},
  {id:'lamp',    name:'路燈',     price:60,  desc:'天黑會亮起來。', size:[1,1]},
  {id:'flowers', name:'花圃',     price:40,  desc:'看著花，心情掉得比較慢。', size:[3,3]},
  {id:'fence',   name:'木圍籬',   price:80,  desc:'圍出一個家，雜草長得比較慢。'},
  {id:'bench',   name:'長椅',     price:50,  desc:'木頭長椅，院子更像公園。', size:[2,1]},
  {id:'swing',   name:'鞦韆',     price:90,  desc:'風一吹會輕輕晃。', size:[3,2]},
  {id:'sandbox', name:'沙坑',     price:70,  desc:'有小水桶和鏟子的沙坑。', size:[3,3]},
  {id:'well',    name:'水井',     price:80,  desc:'古早味的石頭水井。', size:[2,2]},
  {id:'windmill',name:'小風車',   price:90,  desc:'扇葉會一直轉。', size:[2,2]},
  {id:'mailbox', name:'郵筒',     price:30,  desc:'紅色的小郵筒。', size:[1,1]},
  {id:'scarecrow',name:'稻草人',  price:40,  desc:'守著院子，雜草長得比較慢。', size:[1,1]},
  {id:'cottage', name:'石頭小屋', price:220, desc:'石牆紅瓦、爬滿藤蔓的小屋，晚上窗戶會亮。', size:[5,5]},
  {id:'mushroom',name:'蘑菇屋',   price:120, desc:'紅色大蘑菇做的小屋，晚上窗戶會亮。', size:[3,3]},
  {id:'fruittree',name:'果樹',    price:110, desc:'每過一陣子會結一顆蘋果，自動放進背包。', size:[2,2]},
  {id:'fountain',name:'噴水池',   price:130, desc:'看著噴水，心情掉得比較慢。', size:[3,3]},
  {id:'fireworks', name:'煙火台',   price:80, desc:'晚上會自己放煙火。', holiday:'newyear',   spot:100, size:[1,1]},
  {id:'lanterns',  name:'紅燈籠串', price:70, desc:'一整串喜氣的紅燈籠，晚上會亮。', holiday:'cny', spot:130, size:[4,1]},
  {id:'heartarch', name:'愛心拱門', price:70, desc:'粉紅色的拱門。', holiday:'valentine', spot:160, size:[3,1]},
  {id:'slide',     name:'溜滑梯',   price:80, desc:'公園裡的那種溜滑梯。', holiday:'children', spot:190, size:[2,4]},
  {id:'dragonboat',name:'小龍舟',   price:80, desc:'放在院子外的迷你龍舟。', holiday:'dragon', spot:220, size:[2,5]},
  {id:'moonlamp',  name:'月亮燈',   price:70, desc:'晚上會發光的大月亮。', holiday:'midautumn', spot:250, size:[2,2]},
  {id:'pumpkins',  name:'南瓜燈',   price:70, desc:'三顆會發光的南瓜。', holiday:'halloween', spot:280, size:[3,2]},
  {id:'xmastree',  name:'聖誕樹',   price:90, desc:'掛滿彩球，頂端有顆星星。', holiday:'christmas', spot:310, size:[2,2]}
];
BUILDS.forEach(b => { if (b.size) b.r = Math.max(0.5, Math.hypot(b.size[0], b.size[1])/2*0.72); });   // radius the wombat steers around
const BG = {}, nightGlow = [], trees = [];
function faceCenter(g, p){ g.position.copy(p); g.rotation.y = Math.atan2(-p.x, -p.z); }
function glowMat(color, emissive){ const m = new THREE.MeshStandardMaterial({color, emissive, emissiveIntensity:0, roughness:0.5}); nightGlow.push(m); return m; }
function signTexture(name){
  return canvasTex(256,128,(x,w,h)=>{ x.fillStyle = '#b98b5a'; x.fillRect(0,0,w,h); x.strokeStyle = '#8a6239'; x.lineWidth = 10; x.strokeRect(5,5,w-10,h-10);
    x.fillStyle = '#3b2a1c'; x.font = 'bold 56px "Huninn","Microsoft JhengHei",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(name || '小窩', w/2, h/2+4); });
}
function build(id){
  if (BG[id]) return;
  const g = new THREE.Group(), wood = mat('#9a7350',0.9);
  if (id === 'house'){
    let dome;
    const pr = propClone('house');
    if (pr){ g.add(pr); swapMat(pr, 'Glass', glowMat('#ffe6a3', '#ffcf5a')); dome = pr.getObjectByProperty('isMesh', true); dome.userData.kind = 'house'; }
    else {
      const domeTex = canvasTex(256,128,(x,w,h)=>{ x.fillStyle = '#7f8f5b'; x.fillRect(0,0,w,h);
        for (let i=0;i<900;i++){ x.fillStyle = Math.random()<.5 ? 'rgba(60,80,40,.35)' : 'rgba(170,180,110,.35)'; x.fillRect(Math.random()*w, Math.random()*h, 2, 4); } });
      dome = new THREE.Mesh(new THREE.SphereGeometry(2.2, 48, 24, 0, Math.PI*2, 0, Math.PI/2), new THREE.MeshStandardMaterial({map:domeTex, roughness:0.95}));
      dome.scale.y = 0.95; dome.userData.kind = 'house'; g.add(dome);
      const dark = new THREE.MeshBasicMaterial({color:'#1a1410'});
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.78, 32, 0, Math.PI), dark); hole.position.set(0, 0.02, 2.17); g.add(hole);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.1, 8, 24, Math.PI), mat('#8c7a66',0.9)); rim.position.set(0, 0.02, 2.15); g.add(rim);
      const chim = new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.26,0.8,16), mat('#a35e46',0.9)); chim.position.set(0.8, 2.0, -0.6); g.add(chim);
    }
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,1.1,8), mat('#7a5634',0.9)); post.position.set(1.55,0.55,2.0); g.add(post);
    const sideM = mat('#b98b5a');
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9,0.45,0.06), [sideM,sideM,sideM,sideM,new THREE.MeshStandardMaterial({map:signTexture(S.name), roughness:0.9}),sideM]);
    sign.position.set(1.55,1.15,2.04); g.add(sign);
    g.userData.dome = dome; g.userData.sign = sign;
    faceCenter(g, SPOTS.house);
  } else if (id === 'pond'){
    const water = new THREE.Mesh(new THREE.CircleGeometry(1.35, 40), new THREE.MeshStandardMaterial({color:'#6fa8c9', roughness:0.15, metalness:0.1}));
    water.rotation.x = -Math.PI/2; water.position.y = 0.03; water.scale.set(1.15,1,1); g.add(water);
    for (let i=0;i<16;i++){ const a = i/16*Math.PI*2; const s = new THREE.Mesh(new THREE.SphereGeometry(rnd(0.16,0.24),10,8), mat(['#9c9a92','#b3b0a6','#85837c'][i%3],0.9));
      s.position.set(Math.cos(a)*1.55, 0.06, Math.sin(a)*1.35); s.scale.y = 0.55; g.add(s); }
    g.position.copy(SPOTS.pond);
  } else if (id === 'lamp'){
    const pr = propClone('lamp');
    if (pr){ g.add(pr); swapMat(pr, 'Bulb', glowMat('#fff3c4','#ffd36b')); }
    else {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.09,2.6,10), mat('#3a3f3a',0.6)); pole.position.y = 1.3; g.add(pole);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.22,16,12), glowMat('#fff3c4','#ffd36b')); cap.position.y = 2.7; g.add(cap);
      const hat = new THREE.Mesh(new THREE.ConeGeometry(0.32,0.25,16), mat('#3a3f3a',0.6)); hat.position.y = 2.95; g.add(hat);
    }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({map:radialTex('rgba(255,220,130,0.9)','rgba(255,220,130,0)'), transparent:true, depthWrite:false, blending:THREE.AdditiveBlending}));
    glow.position.y = pr ? 2.88 : 2.7; glow.scale.setScalar(1.8); g.add(glow);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(4,4), new THREE.MeshBasicMaterial({map:radialTex('rgba(255,210,120,0.55)','rgba(255,210,120,0)'), transparent:true, depthWrite:false, blending:THREE.AdditiveBlending}));
    pool.rotation.x = -Math.PI/2; pool.position.y = 0.01; g.add(pool);
    g.userData.glows = [glow.material, pool.material];
    g.position.copy(SPOTS.lamp);
  } else if (id === 'flowers'){
    const pr = propClone('flowers');
    if (pr) g.add(pr);
    else {
      const soil = new THREE.Mesh(new THREE.CircleGeometry(1.15, 32), mat('#6b4f37',1)); soil.rotation.x = -Math.PI/2; soil.position.y = 0.012; g.add(soil);
      const stemG = new THREE.CylinderGeometry(0.02,0.02,0.4,5), headG = new THREE.SphereGeometry(0.1,10,8), cols = ['#f2a541','#e0607e','#f3d250','#9b6fc4','#f2f0ea'];
      for (let i=0;i<16;i++){ const a = Math.random()*Math.PI*2, r = Math.sqrt(Math.random())*0.95, h = rnd(0.3,0.5);
        const st = new THREE.Mesh(stemG, mat('#5a8a42')); st.scale.y = h/0.4; st.position.set(Math.cos(a)*r, h/2, Math.sin(a)*r); g.add(st);
        const hd = new THREE.Mesh(headG, mat(cols[i%5],0.6)); hd.position.set(Math.cos(a)*r, h, Math.sin(a)*r); g.add(hd); }
    }
    g.position.copy(SPOTS.flowers);
  } else if (id === 'fence'){
    // a square fence round the home plot, with a gate gap in the middle of each side
    const R = FENCE_R, postG = new THREE.BoxGeometry(0.14,0.9,0.14), railG = new THREE.BoxGeometry(1.0,0.08,0.06);
    for (let side=0; side<4; side++){ const posts = new Set(); for (let s = -R; s < R - 0.01; s += 1.0){
      if (Math.abs(s + 0.5) < 1.6) continue;
      const along = [[1,0],[0,1],[-1,0],[0,-1]][side], out = [[0,-1],[1,0],[0,1],[-1,0]][side];
      for (const u of [s, s + 1]){ const key = u.toFixed(1); if (posts.has(key) || (side && Math.abs(Math.abs(u) - R) < 0.01 && u < 0)) continue; posts.add(key);
        const x = out[0]*R + along[0]*u, z = out[1]*R + along[1]*u, p = new THREE.Mesh(postG, wood); p.position.set(x, 0.45 + gy(x, z), z); g.add(p); }
      const mx = out[0]*R + along[0]*(s + 0.5), mz = out[1]*R + along[1]*(s + 0.5);
      for (const y of [0.35, 0.68]){ const rail = new THREE.Mesh(railG, wood); rail.position.set(mx, y + gy(mx, mz), mz); rail.rotation.y = Math.atan2(-along[1], along[0]); g.add(rail); }
    } }
    NAV.dirty = true;
  } else if (id === 'fireworks'){
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.9,0.5,0.9), mat('#8c2f2a',0.8)); box.position.y = 0.25; g.add(box);
    for (let i=0;i<4;i++){ const t = new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,0.5,10), mat(['#e2b53b','#4f86c6','#5aa469','#e0607e'][i],0.6)); t.position.set((i%2-0.5)*0.4, 0.7, (Math.floor(i/2)-0.5)*0.4); g.add(t); }
    faceCenter(g, ringSpot(100));
  } else if (id === 'lanterns'){
    for (const s of [-1,1]){ const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.08,2.6,8), wood); p.position.set(1.6*s,1.3,0); g.add(p); }
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.015,0.015,3.2,6), mat('#3b2a1c')); rope.rotation.z = Math.PI/2; rope.position.y = 2.45; g.add(rope);
    const red = glowMat('#d23b32','#ff7a3c'), goldC = mat('#e2b53b',0.4);
    for (let i=0;i<5;i++){ const x = -1.2 + i*0.6, l = new THREE.Mesh(new THREE.SphereGeometry(0.22,16,12), red); l.scale.y = 1.15; l.position.set(x,2.05,0); g.add(l);
      for (const y of [2.32,1.78]){ const c = new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,0.06,12), goldC); c.position.set(x,y,0); g.add(c); } }
    faceCenter(g, ringSpot(130));
  } else if (id === 'heartarch'){
    const pink = mat('#f2a6be',0.6);
    const arc = new THREE.Mesh(new THREE.TorusGeometry(1.3,0.14,12,40,Math.PI), pink); g.add(arc);
    const hg = extrude(heartShape(0.25), 0.1);
    for (let i=0;i<5;i++){ const a = i/4*Math.PI; const h = new THREE.Mesh(hg, mat('#e0607e',0.5)); h.position.set(Math.cos(a)*1.3, Math.sin(a)*1.3, 0.1); g.add(h); }
    faceCenter(g, ringSpot(160));
  } else if (id === 'slide'){
    const blue = mat('#4f86c6',0.6), yel = mat('#f3d250',0.6);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1,0.1,1), yel); top.position.y = 1.5; g.add(top);
    for (const [x,z] of [[-0.45,-0.45],[0.45,-0.45],[-0.45,0.45],[0.45,0.45]]){ const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,1.5,8), blue); p.position.set(x,0.75,z); g.add(p); }
    const sl = new THREE.Mesh(new THREE.BoxGeometry(0.85,0.06,2.4), mat('#e45b5b',0.5)); sl.position.set(0,0.78,1.45); sl.rotation.x = 0.66; g.add(sl);
    for (let i=0;i<5;i++){ const r = new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,0.9,6), blue); r.rotation.z = Math.PI/2; r.position.set(0,0.25+i*0.28,-0.55); g.add(r); }
    faceCenter(g, ringSpot(190));
  } else if (id === 'dragonboat'){
    const hull = new THREE.Mesh(new THREE.SphereGeometry(1,24,12,0,Math.PI*2,Math.PI/2,Math.PI/2), mat('#d23b32',0.6)); hull.scale.set(0.6,0.4,2.2); hull.position.y = 0.4; hull.material.side = THREE.DoubleSide; g.add(hull);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1,0.05,6,40), mat('#e2b53b',0.4)); rim.scale.set(0.6,2.2,1); rim.rotation.x = Math.PI/2; rim.position.y = 0.4; g.add(rim);
    const hd = new THREE.Mesh(new THREE.SphereGeometry(0.28,14,10), mat('#5aa469',0.6)); hd.position.set(0,0.95,2.15); hd.scale.z = 1.4; g.add(hd);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.16,0.6,10), hd.material); neck.position.set(0,0.65,2.05); neck.rotation.x = 0.4; g.add(neck);
    for (const s of [-1,1]){ const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05,0.25,8), mat('#e2b53b',0.4)); horn.position.set(0.12*s,1.2,2.05); horn.rotation.x = -0.4; g.add(horn); }
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.15,0.6,8), hd.material); tail.position.set(0,0.8,-2.2); tail.rotation.x = -0.5; g.add(tail);
    g.position.copy(ringSpot(220)); g.rotation.y = Math.atan2(-g.position.x, -g.position.z) + Math.PI/2;
  } else if (id === 'moonlamp'){
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.25,1.1,10), wood); st.position.y = 0.55; g.add(st);
    const moon = new THREE.Mesh(new THREE.SphereGeometry(0.8,32,20), glowMat('#fff1b8','#ffe08a')); moon.position.y = 1.85; g.add(moon);
    const rab = new THREE.Mesh(new THREE.CircleGeometry(0.22,16), new THREE.MeshBasicMaterial({color:'#e6d48e', transparent:true, opacity:0.6})); rab.position.set(0.15,2.0,0.79); g.add(rab);
    faceCenter(g, ringSpot(250));
  } else if (id === 'pumpkins'){
    const face = new THREE.MeshBasicMaterial({color:'#2a1a0c'});
    [[-0.9,0.45],[0,0.6],[0.9,0.4]].forEach(([x,s]) => {
      const p = new THREE.Mesh(new THREE.SphereGeometry(s,20,14), glowMat('#e8833a','#ff9a2e')); p.scale.y = 0.78; p.position.set(x, s*0.78, 0); g.add(p);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.06,0.2,6), mat('#4c6b35')); stem.position.set(x, s*1.56+0.06, 0); g.add(stem);
      for (const ex of [-0.35,0.35]){ const e = new THREE.Mesh(new THREE.CircleGeometry(s*0.17,3), face); e.position.set(x+ex*s, s*0.95, s*0.97); e.rotation.z = Math.PI/2*(ex<0?1:1)+Math.PI/6; g.add(e); }
      const mouth = new THREE.Mesh(new THREE.PlaneGeometry(s*0.7,s*0.12), face); mouth.position.set(x, s*0.55, s*0.99); g.add(mouth);
    });
    faceCenter(g, ringSpot(280));
  } else if (id === 'xmastree'){
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.2,0.5,10), wood); trunk.position.y = 0.25; g.add(trunk);
    const green = mat('#2f6b45',0.8);
    [[1.1,1.3,0.95],[0.85,1.1,1.65],[0.6,0.9,2.25]].forEach(([r,h,y]) => { const c = new THREE.Mesh(new THREE.ConeGeometry(r,h,20), green); c.position.y = y; g.add(c); });
    for (let i=0;i<18;i++){ const y = rnd(0.6,2.4), r = (2.7-y)*0.42, a = Math.random()*Math.PI*2;
      const o = new THREE.Mesh(new THREE.SphereGeometry(0.07,10,8), glowMat(['#e45b5b','#e2b53b','#4f86c6','#f2f0ea'][i%4], ['#ff6b6b','#ffd36b','#7fb2ff','#ffffff'][i%4])); o.position.set(Math.sin(a)*r, y, Math.cos(a)*r); g.add(o); }
    const star = new THREE.Mesh(extrude(starShape(0.26,0.11),0.06), glowMat('#e2b53b','#ffd36b')); star.position.y = 2.85; g.add(star);
    faceCenter(g, ringSpot(310));
  } else if (id === 'bench'){
    const W_ = ['#a8774c', '#b5865a', '#9a6b43'].map(c => mat(c, 0.9)), leg = mat('#7d5636', 0.9);   // chunky country bench, all wood
    for (let i=0;i<3;i++){ const p = new THREE.Mesh(new THREE.BoxGeometry(1.75,0.09,0.17), W_[i]); p.position.set(0,0.5,-0.2+i*0.19); p.rotation.z = (Math.random() - 0.5)*0.02; g.add(p); }
    for (let i=0;i<3;i++){ const p = new THREE.Mesh(new THREE.BoxGeometry(0.2,0.55,0.07), W_[(i + 1) % 3]); p.position.set(-0.5 + i*0.5,0.85,-0.36); p.rotation.x = -0.12; g.add(p); }
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.85,0.14,0.09), W_[0]); top.position.set(0,1.13,-0.39); top.rotation.x = -0.12; g.add(top);
    for (const s of [-1,1]){ for (const z of [-0.3, 0.17]){ const l = new THREE.Mesh(new THREE.BoxGeometry(0.13,0.5,0.13), leg); l.position.set(0.75*s,0.24,z); g.add(l); }
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.13,0.75,0.11), leg); back.position.set(0.75*s,0.85,-0.37); back.rotation.x = -0.12; g.add(back);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12,0.08,0.6), W_[2]); arm.position.set(0.8*s,0.74,-0.05); g.add(arm); }
  } else if (id === 'swing'){
    const post = mat('#7d5636',0.9), seatM = mat('#a8774c',0.9);   // log A-frames, plank seat with a back, flowering vines, stones at the feet
    for (const s of [-1,1]) for (const z of [-0.45,0.45]){ const p = new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.13,2.35,8), post); p.position.set(1.2*s,1.1,z*0.95); p.rotation.x = z > 0 ? -0.22 : 0.22; g.add(p);
      fieldStone(g, 1.2*s, 0.06, z*2.2, 0.2, 0.6); }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.11,0.11,2.75,8), post); bar.rotation.z = Math.PI/2; bar.position.y = 2.2; g.add(bar);
    for (const s of [-1,1]){ const c = new THREE.Mesh(new THREE.SphereGeometry(0.12,8,6), post); c.position.set(1.37*s,2.2,0); g.add(c); }
    vines(g, [V3(-1.2,0.1,0.45), V3(-1.2,1.2,0.2), V3(-1.2,2.2,0), V3(-0.3,2.25,0)], 5);
    vines(g, [V3(1.2,0.1,-0.45), V3(1.2,1.0,-0.25), V3(1.2,2.2,0), V3(0.7,2.25,0)], 4);
    const seatG = new THREE.Group(); seatG.position.y = 2.2; g.add(seatG);
    for (const s of [-1,1]){ const r = new THREE.Mesh(new THREE.CylinderGeometry(0.018,0.018,1.6,5), mat('#d9c9a0',0.9)); r.position.set(0.42*s,-0.8,0); seatG.add(r); }
    for (let i=0;i<3;i++){ const pl = new THREE.Mesh(new THREE.BoxGeometry(1.0,0.07,0.13), seatM); pl.position.set(0,-1.6,-0.14 + i*0.14); seatG.add(pl); }
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.0,0.32,0.06), seatM); back.position.set(0,-1.38,-0.2); back.rotation.x = -0.15; seatG.add(back);
    g.userData.sway = seatG;
  } else if (id === 'sandbox'){
    const frame = mat('#c39a64',0.85);
    for (const [x,z,w,d] of [[0,1.25,2.6,0.2],[0,-1.25,2.6,0.2],[1.25,0,0.2,2.3],[-1.25,0,0.2,2.3]]){ const b = new THREE.Mesh(new THREE.BoxGeometry(w,0.25,d), frame); b.position.set(x,0.12,z); g.add(b); }
    const sand = new THREE.Mesh(new THREE.BoxGeometry(2.3,0.12,2.3), mat('#ecd9a7',1)); sand.position.y = 0.08; g.add(sand);
    const hill = new THREE.Mesh(new THREE.SphereGeometry(0.4,14,8,0,Math.PI*2,0,Math.PI/2), mat('#e5cf97',1)); hill.position.set(-0.4,0.14,0.3); hill.scale.y = 0.6; g.add(hill);
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.12,0.25,12), mat('#4f86c6',0.5)); bucket.position.set(0.55,0.27,-0.4); g.add(bucket);
    const spade = new THREE.Mesh(new THREE.BoxGeometry(0.12,0.02,0.3), mat('#f3d250',0.5)); spade.position.set(0.3,0.16,0.55); spade.rotation.y = 0.6; g.add(spade);
  } else if (id === 'well'){
    const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.75,0.8,0.7,18,1,true), mat('#9c9a92',0.95)); stone.material.side = THREE.DoubleSide; stone.position.y = 0.35; g.add(stone);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.76,0.08,8,24), mat('#85837c',0.9)); rim.rotation.x = Math.PI/2; rim.position.y = 0.7; g.add(rim);
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.72,20), new THREE.MeshStandardMaterial({color:'#4e7fa0', roughness:0.15})); water.rotation.x = -Math.PI/2; water.position.y = 0.45; g.add(water);
    for (const s of [-1,1]){ const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,1.4,6), wood); p.position.set(0.7*s,1.2,0); g.add(p); }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.05,0.6,4), mat('#a35e46',0.85)); roof.position.y = 2.1; roof.rotation.y = Math.PI/4; g.add(roof);
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.13,0.1,0.2,10), wood); bucket.position.set(0,1.1,0); g.add(bucket);
  } else if (id === 'windmill'){
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.35,0.6,2.4,8), mat('#f2ead8',0.85)); tower.position.y = 1.2; g.add(tower);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.5,0.5,8), mat('#a35e46',0.85)); cap.position.y = 2.65; g.add(cap);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(0.3,0.5), mat('#7a5634',0.9)); door.position.set(0,0.3,0.57); door.rotation.x = -0.12; g.add(door);
    const blades = new THREE.Group(); blades.position.set(0,2.2,0.42); g.add(blades);
    for (let i=0;i<4;i++){ const b = new THREE.Mesh(new THREE.BoxGeometry(0.22,1.0,0.03), mat('#e8d2a6',0.8)); b.position.y = 0.55; const arm = new THREE.Group(); arm.rotation.z = i*Math.PI/2; arm.add(b); blades.add(arm); }
    g.userData.spin = blades;
  } else if (id === 'mailbox'){
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12,1.0,0.12), wood); post.position.y = 0.5; g.add(post);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.4,0.32,0.55), mat('#d23b32',0.5)); box.position.y = 1.1; g.add(box);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.2,0.2,0.55,14,1,false,0,Math.PI), box.material); top.rotation.set(0,0,Math.PI/2); top.rotation.order = 'ZYX'; top.rotation.x = Math.PI/2; top.position.y = 1.26; g.add(top);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.03,0.2,0.08), mat('#f3d250',0.5)); flag.position.set(0.22,1.25,-0.1); g.add(flag);
  } else if (id === 'scarecrow'){
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.06,1.9,6), wood); pole.position.y = 0.95; g.add(pole);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,1.4,6), wood); arm.rotation.z = Math.PI/2; arm.position.y = 1.35; g.add(arm);
    const shirt = new THREE.Mesh(new THREE.CylinderGeometry(0.28,0.34,0.7,10), mat('#5a8fc4',0.9)); shirt.position.y = 1.2; g.add(shirt);
    const head_ = new THREE.Mesh(new THREE.SphereGeometry(0.24,14,10), mat('#e8d6a8',0.95)); head_.position.y = 1.78; g.add(head_);
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.38,0.32,14), mat('#c9a24d',0.9)); hat.position.y = 2.02; g.add(hat);
    for (const s of [-1,1]){ const straw = new THREE.Mesh(new THREE.ConeGeometry(0.08,0.25,6), mat('#e2c37c',0.9)); straw.position.set(0.75*s,1.35,0); straw.rotation.z = -s*Math.PI/2; g.add(straw); }
  } else if (id === 'cottage'){   // Blender cottage (blender/props_build.py)
    const pr = propClone('cottage'); if (pr){ g.add(pr); swapMat(pr, 'Glass', glowMat('#ffe6a3', '#ffcf5a')); }
  } else if (id === 'mushroom'){
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.75,0.9,1.4,18), mat('#f2ead8',0.85)); stalk.position.y = 0.7; g.add(stalk);
    const capM = mat('#d8423c',0.55), cap = new THREE.Mesh(new THREE.SphereGeometry(1.45,26,14,0,Math.PI*2,0,Math.PI/2), capM); cap.scale.y = 0.75; cap.position.y = 1.3; g.add(cap);
    for (let i=0;i<9;i++){ const a = i/9*Math.PI*2, el = 0.35 + (i%3)*0.25, d = new THREE.Mesh(new THREE.SphereGeometry(0.16,10,8), mat('#fbf8f0',0.7));
      d.position.set(Math.cos(a)*Math.cos(el)*1.42, 1.3 + Math.sin(el)*1.06, Math.sin(a)*Math.cos(el)*1.42); d.scale.set(1,0.4,1); d.lookAt(0,1.3,0); g.add(d); }
    const door = new THREE.Mesh(new THREE.CircleGeometry(0.32,16,0,Math.PI), mat('#7a5634',0.9)); door.position.set(0,0.02,0.88); g.add(door);
    const doorR = new THREE.Mesh(new THREE.PlaneGeometry(0.64,0.35), door.material); doorR.position.set(0,-0.15,0.88); door.add(doorR); door.position.y = 0.36;
    const win = new THREE.Mesh(new THREE.CircleGeometry(0.16,14), glowMat('#ffe9a8','#ffcf5a')); win.position.set(0.45,0.95,0.72); win.rotation.y = 0.5; g.add(win);
  } else if (id === 'fruittree'){
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14,0.22,1.3,8), mat('#7a5634',0.95)); trunk.position.y = 0.65; g.add(trunk);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.95,18,14), mat('#5f9a3e',0.85)); crown.position.y = 1.85; crown.scale.y = 0.85; g.add(crown);
    for (let i=0;i<9;i++){ const a = i*2.4, el = rnd(-0.2,0.6), ap = new THREE.Mesh(new THREE.SphereGeometry(0.1,10,8), mat('#d8423c',0.35));
      ap.position.set(Math.cos(a)*Math.cos(el)*0.95, 1.85 + Math.sin(el)*0.8, Math.sin(a)*Math.cos(el)*0.95); g.add(ap); }
  } else if (id === 'fountain'){
    const stoneM = mat('#c8c4ba',0.8);
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(1.3,1.4,0.45,28,1,true), stoneM); basin.material.side = THREE.DoubleSide; basin.position.y = 0.22; g.add(basin);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(1.32,0.08,8,32), stoneM); lip.rotation.x = Math.PI/2; lip.position.y = 0.45; g.add(lip);
    const water = new THREE.Mesh(new THREE.CircleGeometry(1.28,28), new THREE.MeshStandardMaterial({color:'#7fb6d6', roughness:0.1, metalness:0.1})); water.rotation.x = -Math.PI/2; water.position.y = 0.36; g.add(water);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.22,1.0,12), stoneM); col.position.y = 0.8; g.add(col);
    const bowl2 = new THREE.Mesh(new THREE.SphereGeometry(0.5,18,10,0,Math.PI*2,Math.PI/2,Math.PI/2), stoneM); bowl2.material.side = THREE.DoubleSide; bowl2.position.y = 1.3; g.add(bowl2);
    g.userData.spout = V3(0,1.45,0);
  }
  scene.add(g); BG[id] = g; applyPlace(id);
}
function unbuildAll(){ Object.keys(BG).forEach(id => { scene.remove(BG[id]); delete BG[id]; }); nightGlow.length = 0; }
function obstacles(){ return BUILDS.filter(b => b.r && BG[b.id]).map(b => ({c:SPOTS[b.id], r:b.r})).concat(trees.map(tr => ({c:tr.g.position, r:0.55*tr.d.s})), world ? world.feats.map(f => ({c:f.g.position, r:world.featR(f.d)})) : []); }
// the spot in front of the door; always outside the ring the house keeps the wombat out of (else it walks on the spot there)
function houseDoor(){ const h = SPOTS.house, ry = BG.house ? BG.house.rotation.y : Math.atan2(-h.x, -h.z), d = V3(Math.sin(ry), 0, Math.cos(ry)), hb = bdef('house');
  return h.clone().addScaledVector(d, Math.max(2.2 + 1.6*petS + 0.3, ((hb && hb.r) || 0) + 0.9*petS + 0.3)); }
// ---------- building placement on a 1×1 grid ----------
// S.place[id] = {i, j, rot}: the footprint covers cells [i, i+w) × [j, j+d) (w/d swap when rot is odd); rot × 90° turns
// the building, whose front faces +z before turning.
const bdef = id => BUILDS.find(b => b.id === id);
const rotSize = (b, rot) => rot % 2 ? [b.size[1], b.size[0]] : b.size;
const placeCenter = (b, p) => { const [w, d] = rotSize(b, p.rot); return V3(p.i + w/2, 0, p.j + d/2); };
const facingIn = (x, z) => ((Math.round(Math.atan2(-x, -z)/(Math.PI/2)) % 4) + 4) % 4;
function cellsOf(b, p){ const [w, d] = rotSize(b, p.rot), out = []; for (let a=0;a<w;a++) for (let c=0;c<d;c++) out.push([p.i + a + 0.5, p.j + c + 0.5]); return out; }
// is (x, z) on (or within pad of) a building's footprint? poop and litter keep off buildings
const inBuild = (x, z, pad = 0.3) => Object.keys(BG).some(id => { const b = bdef(id), p = S.place && S.place[id]; return b && p && BG[id] && cellsOf(b, p).some(([cx, cz]) => Math.abs(x - cx) < 0.5 + pad && Math.abs(z - cz) < 0.5 + pad); });
function freeNear(p, pad = 0.3){   // nearest open ground (no building, no water) to p
  for (let r=0; r<6; r+=0.5) for (let i=0; i<(r ? 16 : 1); i++){ const a = i*Math.PI/8, x = p.x + Math.sin(a)*r, z = p.z + Math.cos(a)*r;
    if (world.inWorld(x, z) && world.isOpen(x, z) && !world.isWater(x, z) && !inBuild(x, z, pad) && groundOK(x, z)) return V3(x, 0, z); }
  return p; }
const footY = (b, p) => { const hs = cellsOf(b, p).map(([x, z]) => gy(x, z)); return hs.reduce((s, h) => s + h, 0)/hs.length; };
function canPlace(id, p){
  const b = bdef(id), cells = cellsOf(b, p), c = placeCenter(b, p);
  if (cells.some(([x, z]) => !world.isOpen(x, z))) return {ok:false, why:'這裡還沒開拓，先把這塊地整理好。'};
  if (cells.some(([x, z]) => !world.buildable(x, z))) return {ok:false, why:'這裡太斜、或太靠近水邊，不能蓋。'};
  const hs = cells.map(([x, z]) => gy(x, z)); if (Math.max(...hs) - Math.min(...hs) > 0.45) return {ok:false, why:'地面高低不平，找平一點的地方。'};
  if (BG.fence && cells.some(([x, z]) => Math.abs(Math.max(Math.abs(x), Math.abs(z)) - FENCE_R) < 0.7)) return {ok:false, why:'跟圍籬重疊了。'};
  for (const [oid, op] of Object.entries(S.place || {})){
    const ob = bdef(oid); if (oid === id || !ob || !ob.size || !S.builds[oid]) continue;
    const taken = new Set(cellsOf(ob, op).map(k => k.join()));
    if (cells.some(k => taken.has(k.join()))) return {ok:false, why:`跟${ob.name}重疊了。`};
  }
  if (trees.some(tr => cells.some(([x, z]) => Math.hypot(x - tr.d.x, z - tr.d.z) < 0.9*tr.d.s))) return {ok:false, why:'有樹擋在這裡（點樹可以砍掉）。'};
  if (world.feats.some(f => cells.some(([x, z]) => Math.hypot(x - f.d.x, z - f.d.z) < world.featR(f.d) + 0.3))) return {ok:false, why:'有石頭或樹叢擋在這裡（點一下可以清掉）。'};
  if (S.stage === 'egg' && cells.some(([x, z]) => Math.hypot(x, z) < 1.2)) return {ok:false, why:'蛋在這裡。'};
  if (id === 'house'){ const dir = V3(Math.sin(p.rot*Math.PI/2), 0, Math.cos(p.rot*Math.PI/2)), door = c.clone().addScaledVector(dir, 2.2 + 1.6*Math.max(petS, 1) + 0.3);
    if (!groundOK(door.x, door.z)) return {ok:false, why:'門口前面要有空地，袋熊才進得去（按「旋轉」）。'}; }
  return {ok:true};
}
function freeSpot(id, near){   // the nearest valid spot, searching outward from `near` (the middle of the view)
  const b = bdef(id), cx = near ? near.x : 0, cz = near ? near.z : 0;
  for (let r = 0; r <= 26; r += 0.75) for (let k=0, n = Math.max(1, Math.round(r*3)); k<n; k++){
    const a = k/n*Math.PI*2 + r, x = cx + Math.sin(a)*r, z = cz + Math.cos(a)*r, rot = facingIn(x, z), [w, d] = rotSize(b, rot), p = {i:Math.round(x - w/2), j:Math.round(z - d/2), rot};
    if (canPlace(id, p).ok) return p; }
  return null;
}
function legacyPlace(id){   // buildings from before the grid keep (roughly) their old spot
  const b = bdef(id), old = SPOTS[id] || (b.spot ? ringSpot(b.spot) : null);
  if (!old) return freeSpot(id) || {i:0, j:0, rot:0};
  const rot = id === 'house' || b.holiday ? facingIn(old.x, old.z) : 0, [w, d] = rotSize(b, rot);
  return {i:Math.round(old.x - w/2), j:Math.round(old.z - d/2), rot};
}
function applyPlace(id){
  const b = bdef(id), g = BG[id]; if (!b || !b.size || !g) return;
  S.place = S.place || {}; if (!S.place[id]) S.place[id] = legacyPlace(id);
  const c = placeCenter(b, S.place[id]); g.position.copy(c); g.position.y = footY(b, S.place[id]); g.rotation.y = S.place[id].rot*Math.PI/2; SPOTS[id] = c.clone(); NAV.dirty = true;
  if (!g.userData.hb){ const hb = new THREE.Mesh(new THREE.BoxGeometry(b.size[0], 1.6, b.size[1]), hbMat); hb.position.y = 0.8; hb.userData.kind = id === 'house' ? 'house' : 'build'; hb.userData.ref = id; g.add(hb); g.userData.hb = hb; }
}
// ---------- playing with buildings (and mud) ----------
// The wombat walks over, then: rides the swing, slides down the slide, digs in the sandbox, sits on the bench,
// splashes at the fountain or pond, or rolls in the mud. Each one lifts its mood.
const PLAY_AT = {swing:{label:'讓牠盪鞦韆', dur:9}, slide:{label:'讓牠溜滑梯', dur:4.5}, sandbox:{label:'讓牠玩沙', dur:5}, bench:{label:'讓牠坐一下', dur:8},
  fountain:{label:'讓牠玩水', dur:6}, pond:{label:'讓牠玩水', dur:6}, mud:{label:'在泥巴裡打滾', dur:5}};
const PLAY_DONE = {swing:'盪鞦韆好開心！', slide:'咻——溜下來了！', sandbox:'沙坑挖得好開心。', bench:'在長椅上休息了一下。', fountain:'玩水玩得好開心！', pond:'在水池邊玩水好開心！', mud:'滾得全身都是泥巴，好開心！（游泳或下雨就會洗乾淨）'};
function startUse(id, at){
  const why = whyCantPlay(); if (why){ toast(why); return; }
  const g = BG[id];
  if (id !== 'mud' && !g) return;
  let target = at ? at.clone() : g.position.clone();
  if (id === 'fountain' || id === 'pond'){ const d = V3(pos.x - target.x, 0, pos.z - target.z); if (d.lengthSq() < 0.01) d.set(1, 0, 0); target.addScaledVector(d.normalize(), id === 'pond' ? 2.2 : 1.9); }
  if (id === 'slide'){ target = g.localToWorld(V3(0, 0, -1.0)); }
  const bd = id !== 'mud' && bdef(id); B.mode = 'useWalk'; B.use = {id, at:target.setY(0), t:0, center: g ? g.position.clone() : null, reach: bd ? (bd.r || 1) + 0.9*petS + 0.6 : 0}; B.timer = 40; B.path = null; B.treeVisit = null; closeSheet(); showEmote('❗', 0.9);
}
function useStep(dt){   // called from think() while B.mode is 'use'
  const U_ = B.use, P = PLAY_AT[U_.id], g = BG[U_.id]; U_.t += dt; const t_ = U_.t;
  if (U_.id !== 'mud' && !g){ B.mode = 'idle'; B.use = null; return; }
  switch (U_.id){
    case 'swing': { U_.hold = true; g.userData.ride = true; const seat = g.userData.sway.localToWorld(V3(0, -1.55, 0));
      pos.x = seat.x; pos.z = seat.z; pos.y = seat.y - gy(pos.x, pos.z) - 0.05; vel.set(0, 0, 0); root.rotation.y = g.rotation.y; break; }
    case 'bench': { U_.hold = true; const s = g.localToWorld(V3(0, 0.5, 0)); pos.x = s.x; pos.z = s.z; pos.y = s.y - gy(s.x, s.z); vel.set(0, 0, 0); root.rotation.y = g.rotation.y; break; }
    case 'slide': { U_.hold = true; const top = g.localToWorld(V3(0, 1.55, -0.3)), end = g.localToWorld(V3(0, 0.05, 2.7));
      const p = t_ < 1.6 ? g.localToWorld(V3(0, 0, -0.9)).lerp(top, t_/1.6) : top.clone().lerp(end, Math.min(1, (t_ - 1.6)/1.2));
      pos.x = p.x; pos.z = p.z; pos.y = Math.max(0, p.y - gy(p.x, p.z)); vel.set(0, 0, 0); root.rotation.y = g.rotation.y + (t_ < 1.6 ? Math.PI : 0);
      if (t_ > 1.6 && !U_.whee){ U_.whee = true; sfx('whoosh'); cry('happy'); } break; }
    case 'sandbox': { if (!U_.dug){ pos.x = g.position.x; pos.z = g.position.z; U_.dug = true; U_.leave = true; act = {key:'dig', t:0, dir:1, moved:0, jumped:false, rolls:0, noteT:0, step:0}; } break; }
    case 'mud': { if (!U_.rolled){ U_.rolled = true; act = {key:'belly', t:0, dir:1, moved:0, jumped:false, rolls:0, noteT:0, step:0}; }
      if (Math.random() < dt*6) floatSprite(radialTex('rgba(110,80,52,1)','rgba(110,80,52,0)'), V3(pos.x + rnd(-0.6,0.6), gy(pos.x, pos.z) + 0.2, pos.z + rnd(-0.6,0.6)), {size:0.25, vy:rnd(1.5,2.5), vx:rnd(-1,1), vz:rnd(-1,1), g:8, max:0.7, grow:0});
      S.muddy = 200; applyFur(); break; }
    case 'fountain': case 'pond': { root.rotation.y += clamp(wrapA(Math.atan2(g.position.x - pos.x, g.position.z - pos.z) - root.rotation.y), -3*dt, 3*dt);
      if (Math.floor(t_*1.5) !== U_.hop){ U_.hop = Math.floor(t_*1.5); vel.y = 2.2*petS + 0.6; sfx('splash');
        for (let k=0;k<8;k++){ const a = Math.random()*Math.PI*2; floatSprite(radialTex('rgba(210,232,245,1)','rgba(210,232,245,0)'), V3(pos.x, gy(pos.x, pos.z) + 0.2, pos.z), {size:0.22, vx:Math.cos(a)*1.5, vz:Math.sin(a)*1.5, vy:rnd(2,3.5), g:9, max:0.8, grow:0}); } }
      if (S.muddy) S.muddy = Math.max(0, S.muddy - dt*60); break; }
  }
  if (t_ >= P.dur){
    if (g) g.userData.ride = false;
    if (U_.hold || U_.leave){ const out = g.localToWorld(V3(0, 0, (BUILDS.find(b => b.id === U_.id).size[1])/2 + 1.2)); pos.set(out.x, 0, out.z); snapToLand(pos); }
    B.mode = 'idle'; B.timer = 2; B.use = null;
    S.st.happy = clamp(S.st.happy + (U_.id === 'bench' ? 6 : 14), 0, 100); if (U_.id === 'bench') S.st.energy = clamp(S.st.energy + 8, 0, 100);
    S.aff = clamp(S.aff + 2, 0, 100); spawnHearts(2); cry('happy'); track('use'); track('use:' + U_.id);
    if (stat('use:' + U_.id) === 1) toast(PLAY_DONE[U_.id]); hudDirty = true;
  }
}
function buildMenu(id){
  const b = bdef(id);
  showModal(b.name, `<div class="bigicon">${BUILD_ICON[id] || '🏗️'}</div><p>${b.desc}</p>`,
    [{label:'關閉', ghost:true, onClick:()=>{}}, ...(b.size ? [{label:'移動', ghost:true, onClick:() => startPlace(id, false)}] : []), ...(PLAY_AT[id] ? [{label:PLAY_AT[id].label, onClick:() => startUse(id)}] : []),
     {label:`拆掉（退回 ${b.price || 0}）`, ghost:true, onClick:() => setTimeout(() => demolish(id), 50)}]);
}
// take a building down again: it disappears in a puff of dust and the full price comes back
function demolish(id){
  const b = bdef(id), g = BG[id]; if (!b || !g) return;
  showModal(`拆掉${b.name}？`, `<div class="bigicon">${BUILD_ICON[id] || '🏗️'}</div><p>拆掉以後會退回 ${b.price || 0} 代幣，之後想要可以再到商店買來蓋。</p>`,
    [{label:'不要', ghost:true, onClick:()=>{}}, {label:'拆掉', onClick:() => {
      if (id === 'house' && ['inHouse', 'enter', 'exit', 'goHouse'].includes(B.mode)){ if (B.mode === 'inHouse') exitHouse(); B.mode = 'idle'; B.timer = 1; root.visible = true; shadow.g.visible = true; }
      if (B.use && B.use.id === id){ B.use = null; B.mode = 'idle'; }
      const at = g.position.clone(); dust(at.x, at.z, 20, 3); sfx('whoosh');
      tools.push({t:0, dur:0.6, update(t){ g.scale.setScalar(Math.max(0.01, 1 - t/0.6)); }, done(){ scene.remove(g); }});
      delete BG[id]; S.builds[id] = false; if (S.place) delete S.place[id]; delete SPOTS[id]; NAV.dirty = true;
      if (b.price){ S.coins += b.price; sfx('coin'); floatSprite(textTex('+' + b.price, '#e2b53b', 'bold 76px sans-serif', '#5a4310'), at.clone().setY(gy(at.x, at.z) + 1.5), {size:0.6, vy:1.2, max:1.1, depthTest:false}); }   // a refund, not earnings
      toast(`${b.name}拆掉了，退回 ${b.price || 0} 代幣。`); save(); hudDirty = true; }}]);
}
// Placement mode: a grid laid over the ground around the footprint, a green/red footprint, the camera locked to top-down or 45°.
let placing = null;
const gridMesh = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({color:'#ffffff', transparent:true, opacity:0.45, depthWrite:false}));
gridMesh.visible = false; gridMesh.renderOrder = 4; scene.add(gridMesh);
function layGrid(cx, cz){
  const v = [], R = 8, i0 = Math.round(cx), j0 = Math.round(cz);
  for (let k=-R; k<=R; k++) for (let s=-R; s<R; s++){
    const a = [i0 + s, j0 + k], b = [i0 + s + 1, j0 + k], c = [i0 + k, j0 + s], d = [i0 + k, j0 + s + 1];
    for (const [p, q] of [[a, b], [c, d]]){ if (!world.isOpen((p[0] + q[0])/2, (p[1] + q[1])/2)) continue; v.push(p[0], gy(p[0], p[1]) + 0.05, p[1], q[0], gy(q[0], q[1]) + 0.05, q[1]); } }
  gridMesh.geometry.dispose(); gridMesh.geometry = new THREE.BufferGeometry(); gridMesh.geometry.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
}
const foot = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({color:'#5ad16a', transparent:true, opacity:0.4, depthWrite:false}));
foot.rotation.x = -Math.PI/2; foot.renderOrder = 2; foot.visible = false; scene.add(foot);
const doorArrow = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.7, 3), new THREE.MeshBasicMaterial({color:'#ffffff', transparent:true, opacity:0.85, depthWrite:false}));
doorArrow.rotation.x = Math.PI/2; doorArrow.visible = false; scene.add(doorArrow);
function startPlace(id, isNew){
  const b = bdef(id); if (!b || !b.size || placing) return;
  if (isNew && S.coins < b.price){ toast('代幣不夠。'); return; }
  closeSheet(); $('#modal').hidden = true;
  if (!isNew && id === 'house' && B.mode === 'inHouse') exitHouse();
  const prev = S.place && S.place[id] ? {...S.place[id]} : null;
  let mesh = BG[id];
  if (isNew){ build(id); mesh = BG[id]; delete BG[id]; }   // a preview that only becomes real when you confirm
  const p = (isNew ? freeSpot(id, camTarget) || freeSpot(id) : prev) || {i:-1, j:-1, rot:0};
  placing = {id, b, mesh, isNew, prev, p:{...p}, cam:{yaw, pitch, zoom}};
  gridMesh.visible = foot.visible = true; document.body.classList.add('placing'); $('#placeBar').hidden = false;
  $('#placeName').textContent = (isNew ? '蓋' : '移動') + b.name + (isNew ? `（${b.price} 代幣）` : '');
  $('#placeView').textContent = S.buildView === 'iso' ? '視角：45 度' : '視角：俯視';
  updatePlace();
}
function updatePlace(){
  const P = placing, [w, d] = rotSize(P.b, P.p.rot), c = placeCenter(P.b, P.p), y = footY(P.b, P.p);
  P.mesh.position.copy(c).setY(y); P.mesh.rotation.y = P.p.rot*Math.PI/2;
  foot.position.set(c.x, y + 0.06, c.z); foot.scale.set(w, d, 1); layGrid(c.x, c.z);
  const v = canPlace(P.id, P.p); P.ok = v.ok; foot.material.color.set(v.ok ? '#5ad16a' : '#e05a4f');
  doorArrow.visible = P.id === 'house';
  if (doorArrow.visible){ const dir = V3(Math.sin(P.p.rot*Math.PI/2), 0, Math.cos(P.p.rot*Math.PI/2)); doorArrow.position.copy(c).addScaledVector(dir, d/2 + 0.6); doorArrow.position.y = gy(doorArrow.position.x, doorArrow.position.z) + 0.15; doorArrow.rotation.set(Math.PI/2, 0, -P.p.rot*Math.PI/2); }
  $('#placeHint').textContent = v.ok ? '拖曳移動位置，按「旋轉」換方向，好了按「確定」。' : v.why;
  $('#placeOk').disabled = !v.ok;
}
function placePointer(e){
  const hitP = groundHit(e); if (!hitP) return;
  if (placing.bridge){ if (Math.abs(hitP.z - placing.z) > 0.15){ placing.z = clamp(hitP.z, Z0 + 1, Z1 - 1); updateBridgeGhost(); } return; }
  const P = placing, [w, d] = rotSize(P.b, P.p.rot), i = Math.round(hitP.x - w/2), j = Math.round(hitP.z - d/2);
  if (i !== P.p.i || j !== P.p.j){ P.p.i = i; P.p.j = j; updatePlace(); }
}
function endPlace(){
  const P = placing; placing = null; $('#placeRot').hidden = false;
  gridMesh.visible = foot.visible = doorArrow.visible = false; document.body.classList.remove('placing'); $('#placeBar').hidden = true;
  yaw = P.cam.yaw; pitch = P.cam.pitch; zoom = P.cam.zoom; panTarget.set(P.mesh.position.x, 0, P.mesh.position.z); save(); hudDirty = true;
}
function commitPlace(){
  const P = placing; if (!P || !P.ok) return;
  if (P.bridge) return commitBridge();
  if (P.isNew){ if (S.coins < P.b.price){ toast('代幣不夠。'); cancelPlace(); return; }
    S.coins -= P.b.price; S.builds[P.id] = true; BG[P.id] = P.mesh; sfx('grow'); toast(`${P.b.name}蓋好了！之後點一下建築就能再移動。`); }
  else { sfx('pop'); toast(`${P.b.name}搬好了。`); }
  S.place[P.id] = {...P.p}; applyPlace(P.id); refreshSign();
  cubes.forEach(c => { const p = c.m.position; if (!c.cleaning && inBuild(p.x, p.z)){ const q = freeNear(p); p.set(q.x, gy(q.x, q.z) + 0.1*c.sc, q.z); } });
  weeds.filter(w => inBuild(w.g.position.x, w.g.position.z, 0.4)).forEach(w => { const q = freeNear(w.g.position, 0.4); w.g.position.set(q.x, gy(q.x, q.z), q.z); w.x = +q.x.toFixed(2); w.z = +q.z.toFixed(2); });
  if (B.mode === 'inHouse' && BG.house) pos.copy(SPOTS.house);
  else if (cellsOf(P.b, P.p).some(([x, z]) => Math.abs(x - pos.x) < 0.9 && Math.abs(z - pos.z) < 0.9)){   // don't leave the wombat stuck inside
    const c = SPOTS[P.id], d = V3(pos.x - c.x, 0, pos.z - c.z); if (d.lengthSq() < 0.01) d.set(1, 0, 0);
    d.setLength(Math.max(...P.b.size)/2 + 1); pos.set(c.x + d.x, 0, c.z + d.z); snapToLand(pos); }
  endPlace();
}
function cancelPlace(){
  const P = placing; if (!P) return;
  if (P.bridge){ scene.remove(P.mesh); if (P.movingFrom !== undefined){ world.addBridge(P.movingFrom); NAV.dirty = true; } endPlace(); return; }   // a cancelled move puts the bridge back
  if (P.isNew){ scene.remove(P.mesh); if (S.place) delete S.place[P.id]; }
  else { S.place[P.id] = P.prev; applyPlace(P.id); }
  endPlace();
}
$('#placeRot').onclick = () => { const P = placing; if (!P) return; const c = placeCenter(P.b, P.p); P.p.rot = (P.p.rot + 1) % 4;
  const [w, d] = rotSize(P.b, P.p.rot); P.p.i = Math.round(c.x - w/2); P.p.j = Math.round(c.z - d/2); sfx('pop'); updatePlace(); };
$('#placeView').onclick = () => { S.buildView = S.buildView === 'iso' ? 'top' : 'iso'; $('#placeView').textContent = S.buildView === 'iso' ? '視角：45 度' : '視角：俯視'; };
$('#placeOk').onclick = commitPlace;
$('#placeCancel').onclick = cancelPlace;

// ---------- holidays ----------
const HOLIDAYS = [
  {id:'newyear',   name:'元旦',   date:'01-01', song:'newyear',   tint:['#d8d0f0',0.18], deco:'fireworks'},
  {id:'cny',       name:'春節',   lunar:{2026:'02-17',2027:'02-06',2028:'01-26',2029:'02-13',2030:'02-03'}, song:'cny', tint:['#efb6a0',0.22], deco:'lanterns'},
  {id:'valentine', name:'情人節', date:'02-14', song:'valentine', tint:['#f3c4d4',0.25], deco:'hearts'},
  {id:'children',  name:'兒童節', date:'04-04', song:'children',  tint:['#cfe3f2',0.2],  deco:'balloons'},
  {id:'dragon',    name:'端午節', lunar:{2026:'06-19',2027:'06-09',2028:'05-28',2029:'06-16',2030:'06-05'}, song:'dragon', tint:['#cfe0c4',0.15], deco:'leaves'},
  {id:'midautumn', name:'中秋節', lunar:{2026:'09-25',2027:'09-15',2028:'10-03',2029:'09-22',2030:'09-12'}, song:'midautumn', tint:['#d8c895',0.18], deco:'moon'},
  {id:'halloween', name:'萬聖節', date:'10-31', song:'halloween', tint:['#9b7fb3',0.3],  deco:'pumpkins'},
  {id:'christmas', name:'聖誕節', date:'12-25', song:'christmas', tint:['#d6e6e0',0.15], deco:'gifts'}
];
const mdKey = d => pad(d.getMonth()+1) + '-' + pad(d.getDate());
const holidayOn = (h, d) => h.date ? h.date === mdKey(d) : !!(h.lunar && h.lunar[d.getFullYear()] === mdKey(d));
let previewHoliday = null;
function realHoliday(){ const d = new Date(); return HOLIDAYS.find(h => holidayOn(h, d)) || null; }
function activeHoliday(){ return previewHoliday ? HOLIDAYS.find(h => h.id === previewHoliday) : realHoliday(); }
function nextHoliday(){ for (let i=1;i<=400;i++){ const d = new Date(Date.now() + i*86400000), h = HOLIDAYS.find(x => holidayOn(x, d)); if (h) return {h, d}; } return null; }
let decoId = null, decoT = 0; const decoObjs = [];
function setupDeco(h){
  decoObjs.forEach(o => scene.remove(o)); decoObjs.length = 0; decoId = h ? h.id : null;
  if (!h) return;
  const ring = (emoji, n, y, size) => { for (let i=0;i<n;i++){ const a = i/n*Math.PI*2 + 0.2, s = new THREE.Sprite(new THREE.SpriteMaterial({map:emojiTex(emoji), transparent:true, depthWrite:false}));
    const yy = y + gy(Math.sin(a)*6.6, Math.cos(a)*6.6); s.position.set(Math.sin(a)*6.6, yy, Math.cos(a)*6.6); s.scale.setScalar(size); s.userData.y = yy; s.userData.ph = i; scene.add(s); decoObjs.push(s); } };
  if (h.deco === 'pumpkins') ring('🎃', 10, 0.42, 0.9);
  if (h.deco === 'gifts') ring('🎁', 10, 0.4, 0.8);
  if (h.deco === 'lanterns') ring('🏮', 8, 2.6, 0.9);
  if (h.deco === 'leaves') ring('🌿', 10, 0.35, 0.7);
  if (h.deco === 'moon'){ const s = new THREE.Sprite(new THREE.SpriteMaterial({map:radialTex('rgba(255,244,200,1)','rgba(255,236,170,0)'), transparent:true, depthWrite:false}));
    s.position.set(-9, 10, -16); s.scale.setScalar(9); s.userData.y = 10; scene.add(s); decoObjs.push(s);
    const core = new THREE.Sprite(new THREE.SpriteMaterial({map:radialTex('rgba(255,248,215,1)','rgba(255,248,215,0.9)'), transparent:true, depthWrite:false}));
    core.position.set(-9,10,-15.9); core.scale.setScalar(3.4); core.userData.y = 10; scene.add(core); decoObjs.push(core); }
}
function fireworkBurst(at){
  const cols = ['#ff6b6b','#ffd36b','#7fb2ff','#9bf0a0','#f2a6be','#ffffff'], col = cols[Math.floor(Math.random()*cols.length)];
  const tex = radialTex(col, 'rgba(0,0,0,0)');
  for (let i=0;i<28;i++){ const a = Math.random()*Math.PI*2, b = Math.acos(rnd(-1,1)), sp = rnd(2.5,3.5);
    floatSprite(tex, at, {size:0.35, vx:Math.sin(b)*Math.cos(a)*sp, vy:Math.cos(b)*sp, vz:Math.sin(b)*Math.sin(a)*sp, g:2.5, max:1.4, add:true, grow:0}); }
  sfx('firework');
}
function updateDeco(dt, t){
  const h = activeHoliday();
  if ((h ? h.id : null) !== decoId) setupDeco(h);
  decoObjs.forEach(s => { if (s.userData.ph !== undefined) s.position.y = s.userData.y + Math.sin(t*1.5 + s.userData.ph)*0.08; });
  if (h){
    decoT -= dt;
    const at = () => V3(camTarget.x + rnd(-6,6), 0.3, camTarget.z + rnd(-6,6));
    if (decoT <= 0) switch (h.deco){
      case 'hearts':   decoT = 0.6; floatSprite(emojiTex('💗'), at(), {size:0.5, vy:0.8, max:5, grow:0}); break;
      case 'balloons': decoT = 0.9; floatSprite(emojiTex(['🎈','🎈','🎈','🪁'][Math.floor(Math.random()*4)]), at(), {size:0.8, vy:1.0, vx:rnd(-0.2,0.2), max:7, grow:0}); break;
      case 'lanterns': decoT = 1.4; floatSprite(emojiTex('🏮'), at(), {size:0.6, vy:0.6, max:8, grow:0}); break;
      case 'leaves':   decoT = 0.8; { const p = at(); p.y = 5; floatSprite(emojiTex('🍃'), p, {size:0.45, vy:-0.7, vx:rnd(-0.5,0.5), max:7, grow:0}); } break;
      case 'pumpkins': decoT = 2.5; { const p = at(); p.y = rnd(2,4); floatSprite(emojiTex('🦇'), p, {size:0.6, vy:rnd(-0.2,0.4), vx:rnd(-2,2), vz:rnd(-2,2), max:4, grow:0}); } break;
      case 'fireworks': decoT = rnd(1.2,2.4); fireworkBurst(V3(camTarget.x + rnd(-7,7), rnd(6,9), camTarget.z + rnd(-9,-3))); break;
      case 'gifts': case 'moon': decoT = 99; break;
    }
  }
  if (BG.fireworks && nightF > 0.6){ BG.fireworks.userData.t = (BG.fireworks.userData.t || 3) - dt;
    if (BG.fireworks.userData.t <= 0){ BG.fireworks.userData.t = rnd(3,6); fireworkBurst(BG.fireworks.position.clone().add(V3(rnd(-1,1), rnd(5,7), rnd(-1,1)))); } }
}

// ---------- weather & sky particles ----------
const RN = 800, rainPos = new Float32Array(RN*6), rainSpd = new Float32Array(RN);
for (let i=0;i<RN;i++){ const x = rnd(-11,11), y = rnd(0,11), z = rnd(-11,11); rainPos.set([x,y,z,x+0.08,y+0.4,z], i*6); rainSpd[i] = rnd(11,15); }
const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos,3));
const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({color:'#a9bccf', transparent:true, opacity:0.55}));
rain.frustumCulled = false; rain.visible = false; scene.add(rain);
const SN = 600, snowPos = new Float32Array(SN*3);
for (let i=0;i<SN;i++) snowPos.set([rnd(-11,11), rnd(0,11), rnd(-11,11)], i*3);
const snowGeo = new THREE.BufferGeometry(); snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos,3));
const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({map:radialTex('rgba(255,255,255,1)','rgba(255,255,255,0)'), size:0.16, transparent:true, depthWrite:false}));
snow.frustumCulled = false; snow.visible = false; scene.add(snow);
const FN = 26, ffPos = new Float32Array(FN*3), ffSeed = [];
for (let i=0;i<FN;i++) ffSeed.push({x:rnd(-6,6), z:rnd(-6,6), y:rnd(0.4,2), p:rnd(0,9), cx:0, cy:0, cz:0});
const ffGeo = new THREE.BufferGeometry(); ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos,3));
const fireflies = new THREE.Points(ffGeo, new THREE.PointsMaterial({map:radialTex('rgba(235,250,150,1)','rgba(235,250,150,0)'), size:0.28, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending}));
fireflies.frustumCulled = false; fireflies.visible = false; scene.add(fireflies);
const WX = {
  sunny: {name:'晴天', dim:1,    grey:0},
  cloudy:{name:'多雲', dim:0.88, grey:0.18},
  rain:  {name:'下雨', dim:0.72, grey:0.35},
  storm: {name:'雷雨', dim:0.58, grey:0.5},
  snow:  {name:'下雪', dim:0.95, grey:0, white:0.28}
};

// ---------- sound & music ----------
const SND = {ctx:null, on:false, songId:null, song:null, step:0, next:0};
function audio(){
  if (SND.ctx) return SND.ctx;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
  const c = new AC(); SND.ctx = c;
  const master = c.createGain(); master.gain.value = 0.5;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7000; master.connect(lp); lp.connect(c.destination);
  const music = c.createGain(); music.gain.value = 0; music.connect(master);
  // a soft room reverb (generated impulse) gives the sampled instruments some air
  const rev = c.createConvolver(), ir = c.createBuffer(2, Math.floor(c.sampleRate*2.6), c.sampleRate);
  for (let ch=0; ch<2; ch++){ const d = ir.getChannelData(ch); for (let i=0;i<d.length;i++) d[i] = (Math.random()*2 - 1)*Math.pow(1 - i/d.length, 3.2); }
  rev.buffer = ir; const wet = c.createGain(); wet.gain.value = 0.32; music.connect(rev); rev.connect(wet); wet.connect(master);
  const sfxBus = c.createGain(); sfxBus.gain.value = 0.6; sfxBus.connect(master);
  const mk = sec => { const b = c.createBuffer(1, Math.floor(c.sampleRate*sec), c.sampleRate), d = b.getChannelData(0); for (let i=0;i<d.length;i++) d[i] = Math.random()*2-1; return b; };
  Object.assign(SND, {master, music, sfx:sfxBus, noise:mk(0.1), noiseLong:mk(2.5)});
  return c;
}
const mtof = m => 440*Math.pow(2,(m-69)/12);
// ---------- sampled instruments (FluidR3 soundfont notes in assets/music, see tools/make_samples.py) ----------
// Each instrument has a recording every minor third; other notes are the nearest recording played a little faster/slower.
const INST_NOTES = {acoustic_grand_piano:[2,6], ocarina:[4,6], flute:[4,6], orchestral_harp:[3,6], marimba:[3,6], acoustic_guitar_nylon:[2,5],
  string_ensemble_1:[3,5], acoustic_bass:[1,3], music_box:[4,7], pizzicato_strings:[3,5], seashore:null, bird_tweet:null,
  acoustic_guitar_steel:[2,5], electric_guitar_jazz:[2,5], overdriven_guitar:[2,5], tenor_sax:[2,5], alto_sax:[3,5], trumpet:[3,5]};
const INST_NAME = {acoustic_grand_piano:'鋼琴', ocarina:'陶笛', flute:'長笛', orchestral_harp:'豎琴', marimba:'木琴', acoustic_guitar_nylon:'古典吉他', string_ensemble_1:'弦樂',
  music_box:'音樂盒', pizzicato_strings:'撥奏弦樂', acoustic_guitar_steel:'民謠吉他', electric_guitar_jazz:'爵士吉他', overdriven_guitar:'電吉他', tenor_sax:'次中音薩克斯風', alto_sax:'中音薩克斯風', trumpet:'小號'};
const INST = {}, NOTE_PC = {C:0, Eb:3, Gb:6, A:9};
function loadInst(name){
  if (INST[name]) return INST[name].ready;
  const I = INST[name] = {buf:{}, ready:null}, c = SND.ctx, range = INST_NOTES[name], names = [];
  if (range) for (let o=range[0]; o<=range[1]; o++) for (const n of ['C','Eb','Gb','A']) names.push([n + o, 12*(o + 1) + NOTE_PC[n]]);
  else if (name === 'seashore') names.push(['C4', 60]); else names.push(['C5', 72], ['A5', 81]);
  I.ready = Promise.all(names.map(([file, midi]) => fetch(`assets/music/${name}/${file}.mp3`).then(r => r.ok ? r.arrayBuffer() : null)
    .then(ab => ab && new Promise(res => c.decodeAudioData(ab, res, () => res(null)))).then(b => { if (b) I.buf[midi] = b; }).catch(() => {})));
  return I.ready;
}
// play one note; returns false if the instrument isn't loaded yet (the caller then falls back to the synth)
function playI(name, midi, t, vel, dur, dest){
  const I = INST[name]; if (!I) { loadInst(name); return false; }
  const keys = Object.keys(I.buf); if (!keys.length) return false;
  let best = +keys[0]; for (const k of keys) if (Math.abs(k - midi) < Math.abs(best - midi)) best = +k;
  const c = SND.ctx, s = c.createBufferSource(), g = c.createGain();
  s.buffer = I.buf[best]; s.playbackRate.value = Math.pow(2, (midi - best)/12);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, t + 0.012);
  g.gain.setValueAtTime(vel, t + Math.max(0.02, dur*0.7)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.5);
  s.connect(g); g.connect(dest || SND.music); s.start(t); s.stop(t + dur + 0.6); return true;
}
// which instruments play each tune: lead melody, plus harp/guitar-style arpeggios or a sustained string pad
const SONG_INST = {morning:{lead:'flute', arp:'orchestral_harp'}, day:{lead:'marimba', arp:'acoustic_guitar_nylon'}, evening:{lead:'ocarina', pad:'string_ensemble_1'},
  night:{lead:'music_box', arp:'orchestral_harp'}, rain:{lead:'acoustic_grand_piano', arp:'acoustic_grand_piano'}, storm:{lead:'pizzicato_strings', pad:'string_ensemble_1'},
  snow:{lead:'music_box', arp:'pizzicato_strings'}, newyear:{lead:'marimba', arp:'acoustic_guitar_nylon'}, cny:{lead:'orchestral_harp', arp:'marimba'},
  valentine:{lead:'acoustic_grand_piano', pad:'string_ensemble_1'}, children:{lead:'marimba', arp:'pizzicato_strings'}, dragon:{lead:'flute', arp:'orchestral_harp'},
  midautumn:{lead:'ocarina', arp:'orchestral_harp'}, halloween:{lead:'pizzicato_strings', arp:'music_box'}, christmas:{lead:'music_box', pad:'string_ensemble_1'},
  jazz:{lead:'tenor_sax', comp:'electric_guitar_jazz', walk:true}, bossa:{lead:'alto_sax', arp:'acoustic_guitar_nylon'}, folk:{lead:'acoustic_guitar_steel', strum:'acoustic_guitar_steel'},
  rock:{lead:'overdriven_guitar', strum:'acoustic_guitar_steel'}, fanfare:{lead:'trumpet', strum:'acoustic_guitar_steel'}};
// the music settings ("作曲"): pick a tune and which instrument plays the melody, the accompaniment and the drums
const COMP_STYLE = {arp:'分解和弦', strum:'刷和弦', comp:'爵士和弦', pad:'長音'};
function songInst(id){
  const base = SONG_INST[id] || SONG_INST.day, P = S.music || {};
  const o = {...base}; if (P.lead && P.lead !== 'auto') o.lead = P.lead;
  if (P.comp && P.comp !== 'auto'){ const [style, inst] = P.comp.split(':'); delete o.arp; delete o.pad; delete o.strum; delete o.comp; if (style !== 'none') o[style] = inst; }
  return o;
}
function loadSong(id){ const s = songInst(id); return Promise.all([s.lead, s.arp, s.pad, s.strum, s.comp, 'acoustic_bass'].filter(Boolean).map(loadInst)); }
function tone(type, f, t, peak, dec, dest, att=0.006){
  const c = SND.ctx, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f,t);
  g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(Math.max(peak,0.0002),t+att); g.gain.exponentialRampToValueAtTime(0.0001,t+att+dec);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t+att+dec+0.05); return o;
}
function noiseHit(t, dur, peak, type, freq, dest, buf, q){
  const c = SND.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = buf || SND.noise; f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
  g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(peak,t+0.01); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  s.connect(f); f.connect(g); g.connect(dest); s.start(t); s.stop(t+dur+0.05); return {s, f};
}
const SONGS = {
  morning:  {bpm:104, lead:'bell', perc:'shaker', mel:[76,0,79,76,72,0,74,76, 72,0,69,0,67,69,72,0, 69,0,72,74,76,0,74,72, 74,0,71,74,79,0,0,0, 79,76,79,81,79,76,74,76, 72,0,76,0,74,72,69,0, 69,72,74,0,72,69,67,0, 67,71,74,79,0,76,72,0], bass:[[48,55],[45,52],[41,48],[43,50]], ch:[[64,67],[64,69],[65,69],[62,67]]},
  day:      {bpm:116, lead:'pluck', perc:'shaker', mel:[67,71,74,71,76,74,71,0, 72,76,79,76,74,0,71,0, 69,72,76,72,74,71,67,0, 71,74,78,74,79,0,0,0], bass:[[43,50],[48,55],[45,52],[50,57]], ch:[[71,74],[72,76],[72,76],[74,78]]},
  evening:  {bpm:88,  lead:'soft', perc:'none', mel:[69,0,72,0,77,76,74,72, 74,0,0,69,72,74,77,0, 74,0,70,0,72,74,77,79, 76,0,72,0,0,0,0,0], bass:[[41,48],[38,45],[46,53],[48,55]], ch:[[65,69],[65,69],[65,70],[64,67]]},
  night:    {bpm:70,  lead:'celesta', perc:'none', sparse:true, mel:[79,0,76,0,72,0,0,0, 76,0,72,0,69,0,0,0, 72,0,74,0,76,0,77,0, 74,0,0,0,71,0,0,0], bass:[[48,55],[45,52],[41,48],[43,50]], ch:[[64,67],[64,69],[65,69],[62,67]]},
  rain:     {bpm:80,  lead:'piano', perc:'none', mel:[76,0,74,72,0,72,74,76, 72,0,0,0,69,0,0,0, 67,0,69,72,0,74,72,69, 71,0,0,0,0,0,0,0], bass:[[45,52],[41,48],[48,55],[43,50]], ch:[[64,69],[65,69],[64,67],[62,67]]},
  storm:    {bpm:96,  lead:'square', perc:'drum', mel:[62,0,65,0,69,68,0,0, 62,0,65,0,70,69,0,0, 62,65,69,72,70,69,65,62, 61,0,0,0,0,0,0,0], bass:[[38,45],[38,45],[34,41],[33,40]], ch:[[62,65],[62,65],[62,65],[61,64]]},
  snow:     {bpm:120, lead:'bell', perc:'sleigh', mel:[78,76,74,76,78,0,81,0, 79,78,76,0,74,0,0,0, 76,78,79,81,83,81,79,78, 76,0,74,0,0,0,0,0], bass:[[38,45],[43,50],[45,52],[38,45]], ch:[[66,69],[67,71],[69,73],[66,69]]},
  newyear:  {bpm:126, lead:'square', perc:'drum', mel:[72,0,72,76,79,0,76,79, 84,0,0,0,79,0,0,0, 81,79,77,76,74,76,77,79, 72,0,0,0,0,0,0,0], bass:[[48,55],[48,55],[41,48],[43,50]], ch:[[64,67],[64,67],[65,69],[62,67]]},
  cny:      {bpm:120, lead:'pluck', perc:'gong', mel:[72,74,76,79,76,74,72,0, 69,72,74,0,72,69,67,0, 67,69,72,74,76,79,76,74, 72,0,0,0,72,0,0,0], bass:[[48,55],[45,52],[43,50],[48,55]], ch:[[64,67],[64,69],[62,67],[64,67]]},
  valentine:{bpm:92,  lead:'soft', perc:'shaker', mel:[76,77,79,0,84,0,79,0, 77,76,74,0,77,0,0,0, 74,76,77,0,81,0,77,0, 76,0,74,0,72,0,0,0], bass:[[48,55],[45,52],[41,48],[43,50]], ch:[[64,67],[64,69],[65,69],[62,67]]},
  children: {bpm:126, lead:'pluck', perc:'drum', mel:[72,72,76,76,79,79,76,0, 77,77,74,74,71,71,67,0, 72,74,76,77,79,81,79,76, 74,0,79,0,72,0,0,0], bass:[[48,55],[41,48],[43,50],[48,55]], ch:[[64,67],[65,69],[62,67],[64,67]]},
  dragon:   {bpm:132, lead:'pluck', perc:'drum', mel:[69,0,72,74,76,0,74,72, 69,0,67,0,69,0,0,0, 72,74,76,79,81,79,76,74, 76,0,0,0,0,0,0,0], bass:[[45,52],[43,50],[48,55],[45,52]], ch:[[64,69],[62,67],[64,67],[64,69]]},
  midautumn:{bpm:76,  lead:'soft', perc:'none', mel:[76,0,79,0,81,0,79,76, 74,0,76,0,72,0,0,0, 69,0,72,0,74,76,74,72, 69,0,0,0,0,0,0,0], bass:[[45,52],[48,55],[43,50],[45,52]], ch:[[64,69],[64,67],[62,67],[64,69]]},
  halloween:{bpm:100, lead:'square', perc:'drum', mel:[69,72,76,75,76,0,72,0, 69,72,76,77,76,75,72,0, 71,74,77,76,77,0,74,0, 68,71,74,72,71,68,64,0], bass:[[45,52],[45,52],[38,45],[40,47]], ch:[[60,64],[60,64],[62,65],[62,68]]},
  christmas:{bpm:112, lead:'bell', perc:'sleigh', mel:[79,79,76,79,81,79,76,0, 74,76,79,76,74,72,71,0, 72,74,76,77,79,81,83,84, 79,0,0,0,0,0,0,0], bass:[[43,50],[48,55],[50,57],[43,50]], ch:[[71,74],[72,76],[74,78],[71,74]]}
};
Object.assign(SONGS, {
  jazz:   {bpm:132, swing:true, lead:'soft', perc:'swing', mel:[74,0,77,0,79,77,74,0, 76,0,72,0,70,0,72,74, 77,0,76,0,72,0,69,0, 74,72,69,0,65,0,0,0], bass:[[43,50],[48,55],[41,48],[38,45]], ch:[[65,70],[64,70],[64,69],[65,72]]},
  bossa:  {bpm:128, lead:'soft', perc:'bossa', mel:[79,0,76,0,0,74,76,0, 77,0,74,0,72,0,69,0, 71,0,74,0,77,76,74,0, 72,0,0,0,76,0,0,0], bass:[[48,55],[50,57],[43,50],[48,55]], ch:[[64,71],[65,72],[65,71],[64,71]]},
  folk:   {bpm:100, lead:'pluck', perc:'folk', mel:[67,0,71,0,74,0,71,74, 76,0,74,72,71,0,69,0, 69,71,72,74,78,0,76,74, 71,0,0,0,67,0,0,0], bass:[[43,50],[48,55],[50,57],[43,50]], ch:[[71,74],[72,76],[74,78],[71,74]]},
  rock:   {bpm:128, lead:'square', perc:'rock', mel:[76,0,76,79,0,76,74,0, 72,0,72,74,76,0,0,0, 74,74,71,0,74,0,79,0, 78,0,76,0,74,0,0,0], bass:[[40,47],[36,43],[43,50],[38,45]], ch:[[67,71],[67,72],[67,71],[66,69]]},
  fanfare:{bpm:120, lead:'square', perc:'rock', mel:[72,0,72,76,79,0,79,0, 81,79,77,76,74,0,0,0, 77,0,77,81,84,0,81,0, 79,0,76,0,72,0,0,0], bass:[[48,55],[41,48],[43,50],[48,55]], ch:[[64,67],[65,69],[62,67],[64,67]]},
});
const SONG_NAME = {morning:'早晨', day:'午後', evening:'黃昏', night:'夜晚', rain:'雨天', storm:'雷雨', snow:'雪天', jazz:'爵士', bossa:'巴薩諾瓦', folk:'民謠', rock:'搖滾', fanfare:'號角'};
const MUSIC_SONGS = ['morning', 'day', 'evening', 'night', 'rain', 'snow', 'jazz', 'bossa', 'folk', 'rock', 'fanfare'];
function voice(kind, m, t, v){
  const f = mtof(m), out = SND.music;
  switch (kind){
    case 'bell':    tone('sine',f,t,v,1.2,out); tone('sine',f*2,t,v*0.28,0.6,out); tone('sine',f*3.01,t,v*0.07,0.3,out); break;
    case 'pluck':   tone('triangle',f,t,v*1.1,0.35,out); tone('square',f,t,v*0.12,0.12,out); break;
    case 'soft':    tone('sine',f,t,v,1.0,out,0.05); tone('triangle',f/2,t,v*0.25,0.8,out,0.05); break;
    case 'celesta': tone('sine',f*2,t,v*0.8,0.9,out); tone('sine',f*4,t,v*0.12,0.3,out); break;
    case 'piano':   tone('triangle',f,t,v*1.1,0.9,out); tone('sine',f*2,t,v*0.3,0.4,out); break;
    case 'square':  tone('square',f,t,v*0.35,0.22,out); break;
  }
}
function kit(style, i, bar, t, sp){
  const out = SND.music, kick = (v = 0.4) => { const o = tone('sine', 120, t, v, 0.28, out); o.frequency.exponentialRampToValueAtTime(42, t + 0.22); };
  const snare = (v = 0.12) => { noiseHit(t, 0.14, v, 'bandpass', 1900, out); tone('triangle', 190, t, v*0.6, 0.08, out); };
  const hat = (v = 0.035, open) => noiseHit(t, open ? 0.18 : 0.035, v, 'highpass', 8000, out);
  const ride = (v = 0.03) => { noiseHit(t, 0.25, v, 'highpass', 6000, out); tone('sine', 3400, t, v*0.25, 0.3, out); };
  const rim = (v = 0.06) => noiseHit(t, 0.03, v, 'bandpass', 3200, out, null, 4);
  if (style === 'rock'){ if (i === 0 || i === 4 || (i === 5 && bar % 2)) kick(); if (i === 2 || i === 6) snare(0.14); hat(i % 2 ? 0.025 : 0.04, i === 7 && bar === 3); }
  if (style === 'swing'){ if (i === 0 || i === 2 || i === 3 || i === 4 || i === 6 || i === 7) ride(i % 2 ? 0.022 : 0.032); if (i === 2 || i === 6) hat(0.03); if (i === 0) kick(0.18); if (Math.random() < 0.12) snare(0.03); }
  if (style === 'bossa'){ if (i === 0 || i === 3 || i === 4 || i === 7) kick(0.22); if ((bar % 2 ? [2, 5] : [0, 3, 6]).includes(i)) rim(); noiseHit(t, 0.04, 0.018, 'highpass', 7000, out); }
  if (style === 'folk'){ if (i === 0 || i === 4) kick(0.25); if (i === 2 || i === 6) noiseHit(t, 0.12, 0.05, 'bandpass', 2500, out); if (i % 2) noiseHit(t, 0.05, 0.022, 'highpass', 7000, out); }
}
function perc(kind, i, bar, t){
  const out = SND.music;
  const P = S.music || {}; if (P.drums && P.drums !== 'auto'){ if (P.drums !== 'none') kit(P.drums, i, bar, t); return; }
  if (['rock', 'swing', 'bossa', 'folk'].includes(kind)){ kit(kind, i, bar, t); return; }
  if (kind === 'shaker' && i%2 === 1) noiseHit(t, 0.05, 0.028, 'highpass', 7000, out);
  if (kind === 'sleigh'){ noiseHit(t, 0.06, i%4===0 ? 0.05 : 0.022, 'highpass', 8500, out); }
  if (kind === 'drum' || kind === 'gong'){
    if (i === 0 || i === 4){ const o = tone('sine',130,t,0.35,0.25,out); o.frequency.exponentialRampToValueAtTime(48,t+0.2); }
    if (i === 2 || i === 6) noiseHit(t, 0.1, 0.09, 'bandpass', 1800, out);
  }
  if (kind === 'gong' && bar === 0 && i === 0){ tone('sine',98,t,0.2,2.6,out); tone('sine',147.5,t,0.08,1.8,out); noiseHit(t, 1.2, 0.05, 'bandpass', 900, out, SND.noiseLong, 3); }
}
function schedule(step, t){
  const g = SND.song, i = step%8, bar = Math.floor(step/8)%4, m = g.mel[step % g.mel.length], ins = songInst(SND.songId), sp = 60/g.bpm/2;
  if (g.swing && i % 2) t += sp*0.33;   // swung eighth notes
  // real instruments when their samples are loaded; the old synth voices fill in until then
  // tiny timing and loudness differences make it sound played rather than programmed
  const hum = () => t + Math.random()*0.012, vel = v => v*(0.85 + Math.random()*0.3);
  if (m && !playI(ins.lead, m, hum(), vel(0.5), sp*(g.sparse ? 3 : 1.7))) voice(g.lead, m, t, 0.15);
  const bs = g.bass[bar], b0 = bs[0] - 12, b1 = bs[1] - 12;
  if (ins.walk){ if (i % 2 === 0){ const nx = g.bass[(bar + 1) % 4][0] - 12, wl = [b0, b0 + 4, b1, nx + (nx > b1 ? -1 : 1)][i/2];   // walking bass: root, third, fifth, a step into the next chord
      if (!playI('acoustic_bass', wl, t, 0.45, sp*1.8)) tone('sine', mtof(wl + 12), t, 0.16, 0.3, SND.music); } }
  else {
  if (i === 0 && !playI('acoustic_bass', b0, t, 0.5, sp*(g.sparse ? 7 : 3.5))) tone('sine', mtof(bs[0]), t, 0.2, g.sparse ? 1.8 : 0.5, SND.music);
  if (i === 4 && !g.sparse && !playI('acoustic_bass', b1, t, 0.38, sp*3)) tone('sine', mtof(bs[1]), t, 0.14, 0.5, SND.music); }
  const ch = g.ch[bar];
  if (ins.pad && i === 0) ch.forEach(n => playI(ins.pad, n - 12, hum(), 0.16, sp*7.5));
  if (ins.strum && (i === 0 || i === 3 || i === 4 || i === 6)){ const notes = [bs[0], ch[0] - 12, ch[1] - 12, ch[0], ch[1]], down = i !== 3;   // strummed chords (down, down-up, down)
    (down ? notes : notes.slice().reverse()).forEach((n, k) => playI(ins.strum, n, t + k*0.014, vel(down ? 0.14 : 0.09), sp*(i === 0 ? 2.8 : 1.4))); }
  if (ins.comp && (i === 3 || i === 7 || (i === 2 && bar % 2))) [ch[0] - 12, ch[1] - 12, ch[0]].forEach(n => playI(ins.comp, n, hum(), vel(0.12), sp*0.9));   // short jazz chord stabs
  if (ins.arp){ const seq = [ch[0] - 12, ch[1] - 12, ch[0], ch[1], ch[0] + 12, ch[1], ch[0], ch[1] - 12];
    if ((!g.sparse || i % 2 === 0) && !playI(ins.arp, seq[i], hum(), vel(g.sparse ? 0.2 : 0.16), sp*2.5) && !g.sparse && (i === 2 || i === 6)) ch.forEach(n => tone('triangle', mtof(n), t, 0.04, 0.25, SND.music)); }
  else if (!ins.pad && !g.sparse && (i === 2 || i === 6)) ch.forEach(n => tone('triangle', mtof(n), t, 0.04, 0.25, SND.music));
  perc(g.perc, i, bar, t);
}
function wantedSong(){
  const P = S.music || {}; if (P.song && P.song !== 'auto' && SONGS[P.song]) return P.song;
  const h = activeHoliday(); if (h) return h.song;
  const w0 = weatherNow(), ph = dayInfo().phase, slot = Math.floor(Date.now()/240000);   // a new tune every 4 minutes
  if (!['rain', 'storm', 'snow'].includes(w0)){ if (ph === 'day') return ['day', 'folk', 'bossa', 'rock', 'fanfare'][slot % 5]; if (ph === 'evening') return ['evening', 'jazz'][slot % 2]; }
  const w = weatherNow(); if (w === 'rain' || w === 'storm' || w === 'snow') return w;
  return dayInfo().phase;
}
function tick(){
  const c = SND.ctx;
  while (SND.next < c.currentTime + 0.15){
    if (SND.step % 8 === 0){ const w = wantedSong(); if (w !== SND.songId){ SND.songId = w; SND.song = SONGS[w]; SND.step = 0; loadSong(w); } }
    schedule(SND.step, SND.next); SND.next += 60/SND.song.bpm/2; SND.step++;
  }
}
function duck(on){ if (SND.ctx && SND.on) SND.music.gain.setTargetAtTime(on ? 0.12 : 0.9, SND.ctx.currentTime, 0.2); }
function setSound(on){
  const c = audio(); if (!c){ toast('這個瀏覽器不支援播放聲音。'); return; }
  c.resume(); SND.on = on;
  if (on){ SND.songId = wantedSong(); SND.song = SONGS[SND.songId]; SND.next = c.currentTime + 0.08; SND.step = 0; loadSong(SND.songId);
    SND.music.gain.cancelScheduledValues(c.currentTime); SND.music.gain.setTargetAtTime(0.9, c.currentTime, 0.05); clearInterval(SND.timer); SND.timer = setInterval(tick, 30); }
  else { clearInterval(SND.timer); SND.music.gain.setTargetAtTime(0, c.currentTime, 0.08); rainSound(false); }
  $('#btnMusic').setAttribute('aria-pressed', on ? 'true' : 'false');
  hudDirty = true;
}
function rainSound(on){
  if (!SND.ctx) return;
  if (on && !SND.rainSrc){
    const c = SND.ctx, s = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
    s.buffer = SND.noiseLong; s.loop = true; bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 0.6; g.gain.value = 0.0001;
    s.connect(bp); bp.connect(g); g.connect(SND.master); s.start(); g.gain.setTargetAtTime(0.06, c.currentTime, 0.5);
    SND.rainSrc = s; SND.rainGain = g;
  } else if (!on && SND.rainSrc){
    const s = SND.rainSrc; SND.rainGain.gain.setTargetAtTime(0.0001, SND.ctx.currentTime, 0.4); setTimeout(()=>{ try{ s.stop(); }catch(e){} }, 2000); SND.rainSrc = null;
  }
}
// ---------- ambience: the sounds of whatever place the camera is looking at ----------
// Waves rolling in at the coast, running water by the river, wind, birdsong in the day, frogs and crickets at night.
// Uses the 音效 switch. Volumes follow the camera, so panning to the beach brings up the surf.
const AMB = {};
function ambienceInit(){
  const c = SND.ctx; if (AMB.ready) return; AMB.ready = true;
  const loop = (type, freq, q) => { const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = SND.noiseLong; s.loop = true; s.playbackRate.value = 0.7 + Math.random()*0.3;
    f.type = type; f.frequency.value = freq; f.Q.value = q; g.gain.value = 0; s.connect(f); f.connect(g); g.connect(SND.sfx); s.start(); return {g, f}; };
  AMB.surf = loop('lowpass', 700, 0.5); AMB.foam = loop('bandpass', 2600, 0.6); AMB.river = loop('bandpass', 1200, 0.8); AMB.ripple = loop('highpass', 3800, 0.4); AMB.wind = loop('lowpass', 380, 0.6);
  AMB.t = {bird:2, frog:3, cricket:0.5, wave:3}; loadInst('seashore'); loadInst('bird_tweet');
}
function updateAmbience(dt, t, night){
  if (!SND.ctx) return;
  const c = SND.ctx, now = c.currentTime;
  if (!SND.fx){ if (AMB.ready) [AMB.surf, AMB.foam, AMB.river, AMB.ripple, AMB.wind].forEach(a => a.g.gain.setTargetAtTime(0, now, 0.3)); return; }
  ambienceInit();
  const x = camTarget.x, z = camTarget.z, k = clamp(1.5 - zoom*0.3, 0.35, 1.2), near = (d, r) => clamp(1 - d/r, 0, 1), w = weatherNow();
  const sea = near(Math.abs(world.shoreX(z) + 1.5 - x), 15)*k, swell = Math.pow(0.5 + 0.5*Math.sin(t*1.05), 2);
  AMB.surf.g.gain.setTargetAtTime(sea*0.16*(0.35 + 0.65*swell), now, 0.15); AMB.foam.g.gain.setTargetAtTime(sea*0.05*swell, now, 0.2);
  const riv = near(world.riverDist(x, z), 11)*k;
  AMB.river.g.gain.setTargetAtTime(riv*0.07, now, 0.3); AMB.ripple.g.gain.setTargetAtTime(riv*0.025*(0.7 + 0.3*Math.sin(t*3.1)), now, 0.2);
  AMB.wind.g.gain.setTargetAtTime((0.012 + (w === 'storm' ? 0.05 : w === 'rain' ? 0.02 : 0))*k*(0.7 + 0.3*Math.sin(t*0.37)), now, 0.5);
  for (const key in AMB.t) AMB.t[key] -= dt;
  if (sea > 0.25 && AMB.t.wave <= 0 && swell > 0.9){ AMB.t.wave = 5; const out = c.createGain(); out.gain.value = sea*0.55; out.connect(SND.sfx); playI('seashore', 60 + rnd(-2, 1), now, 0.9, 2.5, out); }
  // birds sing by day near trees; frogs near the pond and swamp (and anywhere at night); crickets on warm nights
  if (!night && w !== 'rain' && w !== 'storm' && AMB.t.bird <= 0){ AMB.t.bird = rnd(2, 6);
    const treesNear = trees.filter(tr => Math.hypot(tr.d.x - x, tr.d.z - z) < 14).length + (world.isOpen(x, z) ? 0 : 6);
    if (treesNear){ const out = c.createGain(); out.gain.value = clamp(treesNear*0.04, 0.05, 0.3)*k; out.connect(SND.sfx); const n = 1 + Math.floor(Math.random()*3);
      for (let i=0;i<n;i++) playI('bird_tweet', 70 + Math.floor(rnd(-4, 7)), now + i*rnd(0.15, 0.35), 0.8, 0.5, out); } }
  const wet = Math.max(near(Math.hypot(x - world.data.bio.pond.x, z - world.data.bio.pond.z), 16), world.swampW(x, z));
  if (AMB.t.frog <= 0){ AMB.t.frog = rnd(1.2, 4); if (wet > 0.1 || (night && Math.random() < 0.3)) sfx('croak', V3(x + rnd(-4, 4), 0, z + rnd(-4, 4))); }
  if (night && w !== 'rain' && w !== 'storm' && AMB.t.cricket <= 0){ AMB.t.cricket = rnd(0.35, 1.2);
    for (let i=0;i<3;i++) tone('sine', 4200 + Math.random()*400, now + i*0.06, 0.012*k, 0.04, SND.sfx, 0.004); }
}
// Real animal recordings (assets/sounds, credits in assets/sounds/CREDITS.md): each sound name has one or two short clips.
// Until they have loaded (or if they fail) the synthesised versions below are used.
const ANIMAL_CLIPS = {foxcall:['fox1', 'fox2'], bray:['donkey1', 'donkey2'], howl:['wolf1', 'wolf2'], croak:['frog1', 'frog2'], bellow:['croc1', 'croc2'], neigh:['horse1'], roar:['tiger1', 'tiger2'], peacock:['peacock1', 'peacock2'],
  hoot:['owl1', 'owl2'], eagle:['eagle1'], gull:['gull1', 'gull2'], heron:['heron1'], deer:['deer1', 'deer2'], whale:['whale1'], emu:['emu1'], moose:['moose1', 'moose2'], penguin:['penguin1', 'penguin2'], flamingo:['flamingo1', 'flamingo2']};
const ACLIP = {}, clipBusy = {}; let aclipLoading = false;
function loadAnimalClips(){
  if (aclipLoading || !SND.ctx) return; aclipLoading = true;
  for (const n of Object.values(ANIMAL_CLIPS).flat()) fetch(`assets/sounds/${n}.mp3`).then(r => r.ok ? r.arrayBuffer() : null)
    .then(ab => ab && new Promise(res => SND.ctx.decodeAudioData(ab, res, () => res(null)))).then(b => { if (b) ACLIP[n] = b; }).catch(() => {});
}
const SFX_RANGE = {horn:3.5, whale:3, bray:1.4, howl:1.6};   // loud calls carry further (a ship's horn, a whale out at sea)
function sfx(name, at){   // `at`: where the sound comes from — quieter the further it is from where the camera looks
  if (!SND.fx || !SND.ctx) return;
  const c = SND.ctx, t = c.currentTime; let out = SND.sfx, o;
  if (at){ const v = clamp(1 - Math.hypot(at.x - camTarget.x, at.z - camTarget.z)/(26*Math.max(0.8, zoom)*(SFX_RANGE[name] || 1)), 0, 1); if (v < 0.03) return; out = c.createGain(); out.gain.value = v*v; out.connect(SND.sfx); }
  if (ANIMAL_CLIPS[name]){ loadAnimalClips(); const have = ANIMAL_CLIPS[name].filter(n => ACLIP[n]);
    if (have.length){ if ((clipBusy[name] || 0) > t || (clipBusy.any || 0) > t) return;   // one animal call at a time, with a pause between calls
      const b = ACLIP[have[Math.floor(Math.random()*have.length)]], s = c.createBufferSource(), g = c.createGain();
      s.buffer = b; s.playbackRate.value = rnd(0.94, 1.06); g.gain.value = 0.85; s.connect(g); g.connect(out); s.start(t); clipBusy[name] = t + b.duration + rnd(2, 5); clipBusy.any = t + b.duration*0.8 + rnd(1.5, 4); return; } }


  switch(name){
    case 'boing': o = tone('sine',260,t,0.35,0.3,out); o.frequency.exponentialRampToValueAtTime(720,t+0.18); break;
    case 'thud':  o = tone('sine',150,t,0.45,0.22,out); o.frequency.exponentialRampToValueAtTime(55,t+0.15); break;
    case 'charge': o = tone('sine',280,t,0.18,0.7,out,0.25); o.frequency.exponentialRampToValueAtTime(980,t+0.75); o = tone('triangle',560,t,0.06,0.7,out,0.25); o.frequency.exponentialRampToValueAtTime(1960,t+0.75); break;
    case 'boom':  o = tone('sine',120,t,0.75,0.6,out); o.frequency.exponentialRampToValueAtTime(32,t+0.5); noiseHit(t, 0.55, 0.45, 'lowpass', 700, out); break;
    case 'crack': noiseHit(t, 0.12, 0.6, 'highpass', 2600, out); noiseHit(t + 0.02, 0.3, 0.35, 'bandpass', 1100, out, null, 1.5); break;
    case 'slash': { const n = noiseHit(t, 0.2, 0.4, 'bandpass', 4200, out, null, 2.5); n.f.frequency.setValueAtTime(4200, t); n.f.frequency.exponentialRampToValueAtTime(900, t + 0.18); break; }
    case 'shing': tone('triangle',2640,t,0.14,0.7,out); tone('triangle',3960,t,0.07,0.55,out); tone('sine',1320,t,0.08,0.4,out); break;
    case 'chip':  noiseHit(t, 0.05, 0.28, 'bandpass', 1900, out, null, 3); break;
    case 'plop':  o = tone('sine',600,t,0.35,0.18,out); o.frequency.exponentialRampToValueAtTime(140,t+0.12); break;
    case 'nom':   o = tone('triangle',520,t,0.2,0.09,out); o.frequency.exponentialRampToValueAtTime(360,t+0.07); break;
    case 'drink': o = tone('sine',380,t,0.22,0.12,out); o.frequency.exponentialRampToValueAtTime(760,t+0.08); break;
    case 'pop':   o = tone('sine',900,t,0.15,0.08,out); o.frequency.exponentialRampToValueAtTime(1300,t+0.05); break;
    case 'coin':  tone('square',1318,t,0.06,0.08,out); tone('square',1760,t+0.07,0.06,0.18,out); break;
    case 'happy': [72,76,79,84].forEach((m,i)=>tone('sine',mtof(m),t+i*0.07,0.16,0.4,out)); break;
    case 'sad':   [67,64,60].forEach((m,i)=>tone('sine',mtof(m),t+i*0.25,0.14,0.6,out)); break;
    case 'penguin': for (const d of [0, 0.32, 0.6]){ o = tone('sawtooth', 520, t + d, 0.06, 0.24, out, 0.02); o.frequency.exponentialRampToValueAtTime(380, t + d + 0.22); } break;   // (until the recording has loaded) a braying squawk
    case 'horn': for (const [d, f] of [[0, 1], [1.35, 0.84]]){ const s = t + d; o = tone('sawtooth', 98*f, s, 0.22, 1.1, out, 0.12); o.frequency.linearRampToValueAtTime(94*f, s + 1.0); o = tone('square', 196*f, s, 0.05, 1.0, out, 0.15); } break;   // a ship's horn: two long, low blasts
    case 'whoosh': noiseHit(t, 0.3, 0.25, 'bandpass', 1500, out); break;
    case 'splash': noiseHit(t, 0.35, 0.35, 'bandpass', 1100, out, null, 0.8); [0.08,0.16,0.22].forEach(d => { const q = tone('sine', rnd(900,1400), t+d, 0.08, 0.08, out); q.frequency.exponentialRampToValueAtTime(rnd(400,600), t+d+0.07); }); break;
    case 'thunder': noiseHit(t, 2.2, 0.9, 'lowpass', 180, out, SND.noiseLong); break;
    case 'firework': { const o2 = tone('sine', 1200, t, 0.04, 0.5, out); o2.frequency.exponentialRampToValueAtTime(300, t+0.45); noiseHit(t+0.5, 0.6, 0.18, 'lowpass', 900, out, SND.noiseLong); break; }
    case 'roll':  for (let i=0;i<14;i++) noiseHit(t+i*0.1, 0.06, 0.06 + i*0.012, 'bandpass', 220, out); break;
    case 'hatch': [60,64,67,72,76,79,84].forEach((m,i)=>tone('square',mtof(m),t+i*0.06,0.05,0.5,out)); tone('sine',mtof(84),t+0.5,0.15,1.4,out); noiseHit(t+0.4, 1.0, 0.12, 'highpass', 6000, out, SND.noiseLong); break;
    case 'grow':  [60,64,67,72,76,79,84].forEach((m,i)=>tone('sine',mtof(m),t+i*0.08,0.15,0.5,out)); break;
    case 'zap':   for (let i=0;i<4;i++) noiseHit(t+i*0.03, 0.05, 0.18, 'highpass', 2500+i*800, out);
                  o = tone('square', rnd(1100,1600), t, 0.035, 0.1, out); o.frequency.exponentialRampToValueAtTime(260, t+0.1); break;
    case 'buzz':  o = tone('sawtooth', 200, t, 0.018, 1.1, out, 0.15);
                  for (let i=1;i<=10;i++) o.frequency.linearRampToValueAtTime(i%2 ? 235 : 180, t+i*0.1); break;
    case 'croak': o = tone('sawtooth', 160, t, 0.05, 0.12, out); o.frequency.linearRampToValueAtTime(120, t+0.1); o = tone('sawtooth', 170, t+0.18, 0.05, 0.14, out); o.frequency.linearRampToValueAtTime(110, t+0.3); break;
    case 'gull': for (const d of [0, 0.22, 0.4]){ o = tone('sine', 1400, t+d, 0.05, 0.16, out, 0.02); o.frequency.exponentialRampToValueAtTime(900, t+d+0.15); } break;
    case 'hoot': for (const d of [0, 0.5]){ o = tone('sine', 380, t+d, 0.12, 0.35, out, 0.05); o.frequency.linearRampToValueAtTime(330, t+d+0.3); } break;
    case 'eagle': o = tone('sine', 2200, t, 0.05, 0.6, out, 0.02); o.frequency.exponentialRampToValueAtTime(1300, t+0.55); break;
    case 'spout': noiseHit(t, 1.0, 0.25, 'highpass', 1500, out, SND.noiseLong); break;
    case 'scurry': for (let i=0;i<5;i++) noiseHit(t+i*0.04, 0.03, 0.08, 'highpass', 5000, out); break;
    case 'howl': { const g_ = c.createGain(); g_.gain.value = 1; g_.connect(out); o = tone('sine', 420, t, 0.09, 2.4, g_, 0.5); o.frequency.linearRampToValueAtTime(620, t + 0.8); o.frequency.linearRampToValueAtTime(560, t + 1.8); o.frequency.linearRampToValueAtTime(380, t + 2.6); break; }
    case 'moose': for (let i=0;i<2;i++){ const s = t + i*0.75; o = tone('sawtooth', 150, s, 0.09, 0.62, out, 0.12); o.frequency.exponentialRampToValueAtTime(92, s + 0.55); o = tone('triangle', 300, s, 0.05, 0.5, out, 0.1); o.frequency.exponentialRampToValueAtTime(180, s + 0.45); } break;   // (until the recording has loaded) two low nasal grunts
    case 'growl': noiseHit(t, 0.7, 0.18, 'lowpass', 260, out, SND.noiseLong); o = tone('sawtooth', 70, t, 0.05, 0.6, out, 0.1); break;
    case 'capy': for (const d of [0, 0.22]){ o = tone('sine', 620, t + d, 0.06, 0.18, out, 0.03); o.frequency.linearRampToValueAtTime(520, t + d + 0.16); } noiseHit(t, 0.5, 0.03, 'lowpass', 300, out, SND.noiseLong); break;
    case 'hippo': o = tone('sawtooth', 85, t, 0.09, 0.6, out, 0.05); o.frequency.linearRampToValueAtTime(60, t + 0.5); noiseHit(t, 0.5, 0.06, 'lowpass', 250, out, SND.noiseLong); for (const d of [0.7, 0.95, 1.2]) tone('sawtooth', 95, t + d, 0.06, 0.15, out, 0.02); break;
    case 'hiss': noiseHit(t, 0.9, 0.08, 'highpass', 3500, out, SND.noiseLong); break;
    case 'cicada': for (let i=0;i<14;i++) noiseHit(t + i*0.11, 0.1, 0.07*(1 - Math.abs(i - 7)/8), 'bandpass', 4600, out, null, 6); break;
    case 'chirp': for (const d of [0, 0.07, 0.14]){ o = tone('sine', 4300, t + d, 0.04, 0.045, out, 0.004); } break;
    case 'crane': for (const d of [0, 0.32]){ o = tone('sawtooth', 780, t + d, 0.05, 0.28, out, 0.02); o.frequency.linearRampToValueAtTime(1050, t + d + 0.12); } break;
    case 'monkey': for (const d of [0, 0.16, 0.3]){ o = tone('sine', 900, t + d, 0.07, 0.12, out, 0.01); o.frequency.exponentialRampToValueAtTime(1600, t + d + 0.08); } break;
    case 'snap': noiseHit(t, 0.08, 0.5, 'bandpass', 900, out, null, 1.2); o = tone('square', 120, t, 0.08, 0.1, out); break;
    case 'scratch': for (let i=0;i<3;i++) noiseHit(t+i*0.09, 0.07, 0.12, 'bandpass', 2400 + i*300, out, null, 2); break;
    case 'sneeze': o = tone('sine', 420, t, 0.09, 0.35, out, 0.12); o.frequency.exponentialRampToValueAtTime(820, t+0.3);
                  noiseHit(t+0.42, 0.22, 0.4, 'bandpass', 2600, out, null, 0.7); break;
    case 'evolve': {
      let time = 0, i = 0; const arp = [60,64,67,72,64,67,72,76,67,72,76,79];
      while (time < 3.6){ tone('square', mtof(arp[i % arp.length] + 12*Math.floor(time/1.4)), t+time, 0.045, 0.1, out); time += Math.max(0.045, 0.2 - time*0.05); i++; }
      const n = noiseHit(t, 3.7, 0.2, 'bandpass', 300, out, SND.noiseLong, 2); n.f.frequency.exponentialRampToValueAtTime(5000, t+3.6);
      [48,60,64,67,72,76,79].forEach(m => tone('sawtooth', mtof(m), t+3.8, 0.035, 1.8, out, 0.02));
      noiseHit(t+3.8, 1.6, 0.25, 'highpass', 5000, out, SND.noiseLong);
      [84,88,91,96].forEach((m,k) => tone('sine', mtof(m), t+4.0+k*0.1, 0.1, 0.8, out));
      break; }
  }
}
// wombat calls
function cry(kind){
  if (!SND.fx || !SND.ctx || !petActive()) return;
  const c = SND.ctx, t = c.currentTime, out = SND.sfx;
  const p = {baby:1.9, child:1.45, adult:1.1, perfect:1.0, ultimate:0.88}[S.stage] || 1; let o;
  switch (kind){
    case 'happy': for (const d of [0, 0.14]){ o = tone('sine', 680*p, t+d, 0.16, 0.12, out); o.frequency.exponentialRampToValueAtTime(1080*p, t+d+0.09); } break;
    case 'grunt': noiseHit(t, 0.2, 0.3, 'bandpass', 450*p, out, null, 1.5); o = tone('sawtooth', 105*p, t, 0.07, 0.18, out); o.frequency.exponentialRampToValueAtTime(80*p, t+0.16); break;
    case 'angry': noiseHit(t, 0.45, 0.22, 'highpass', 3200, out); o = tone('sawtooth', 92*p, t, 0.11, 0.4, out); o.frequency.setValueAtTime(92*p, t); o.frequency.linearRampToValueAtTime(70*p, t+0.4); break;
    case 'sad': for (const d of [0, 0.42]){ o = tone('sine', 620*p, t+d, 0.12, 0.35, out, 0.03); o.frequency.exponentialRampToValueAtTime(400*p, t+d+0.33); } break;
    case 'sleepy': o = tone('sine', 300*p, t, 0.1, 0.8, out, 0.1); o.frequency.linearRampToValueAtTime(430*p, t+0.35); o.frequency.linearRampToValueAtTime(240*p, t+0.85); break;
    case 'snore': noiseHit(t, 0.9, 0.08, 'lowpass', 300, out, SND.noiseLong); break;
    case 'chirp': for (let i=0;i<3;i++){ o = tone('triangle', (900+i*120)*p, t+i*0.09, 0.09, 0.07, out); o.frequency.exponentialRampToValueAtTime((1250+i*90)*p, t+i*0.09+0.06); } break;
    case 'purr': { const g = SND.ctx.createGain(); g.gain.value = 1; g.connect(out); o = tone('sawtooth', 70*p, t, 0.05, 1.0, g, 0.1); for (let i=1;i<=12;i++) g.gain.setValueAtTime(i%2 ? 0.35 : 1, t + i*0.07); break; }
    case 'huff': noiseHit(t, 0.18, 0.35, 'bandpass', 1100*p, out, null, 0.9); noiseHit(t+0.22, 0.14, 0.25, 'bandpass', 900*p, out, null, 0.9); break;
    case 'whine': for (const d of [0, 0.55]){ o = tone('sine', 760*p, t+d, 0.1, 0.45, out, 0.05); o.frequency.linearRampToValueAtTime(980*p, t+d+0.15); o.frequency.exponentialRampToValueAtTime(520*p, t+d+0.45); } break;
    case 'evolve': o = tone('sawtooth', 190*p, t, 0.12, 0.7, out, 0.02); o.frequency.exponentialRampToValueAtTime(420*p, t+0.45); noiseHit(t, 0.5, 0.15, 'bandpass', 900, out); break;
  }
}

// ---------- save ----------
const KEY = 'wombat-pet-save-v1';
const freshCare = () => ({hungry:0, thirsty:0, dirty:0, sick:0, meals:0, overfed:0, plays:0, nature:0});
function freshSave(){
  return {v:2, stage:'egg', form:'normal', warm:0, name:'', ageMs:0, growth:0, st:{hunger:80, thirst:80, happy:75, energy:85, health:100}, care:freshCare(),
    coins:30, owned:{}, worn:{}, colors:{}, fur:0, builds:{}, poops:[], weeds:[], snowmen:[], poopQ:[], weedTimer:4, speed:1,
    hud:true, uiHidden:false, dayMode:'hourly', weather:{type:'sunny', until:Date.now()+5*60000, forced:null}, dead:null, gen:1, lastSeen:Date.now(), petPos:null, seenGuide:false, aff:50};
}
function fromObj(o){
  if (!o || !(o.v === 1 || o.v === 2)) return null;
  const s = Object.assign(freshSave(), o);
  if (o.v === 1){ if (s.stage === 'elder') s.stage = 'perfect'; s.form = 'normal'; s.care = freshCare(); s.dayMode = 'hourly'; s.v = 2; s.seenGuide = false; }
  s.care = Object.assign(freshCare(), s.care || {});
  return s;
}
const lsGet = k => { try { return localStorage.getItem(k); } catch(e){ return null; } };
const lsSet = (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch(e){} };
const readLocal = () => { try { return fromObj(JSON.parse(lsGet(KEY))); } catch(e){ return null; } };
// FORCE_LOCAL: set by "import save code" so the imported pet wins over the cloud once.
// PREFER_REMOTE: set when another device took over, so this device reloads the cloud copy.
// SYNC_UID: the account this device's local save was last synced with.
const FORCE_LOCAL = 'wombat-force-local', PREFER_REMOTE = 'wombat-prefer-remote', SYNC_UID = 'wombat-sync-uid';
const STAGE_NAME = {egg:'蛋', baby:'幼兒期', child:'成長期', adult:'成熟期', perfect:'完全體', ultimate:'究極體'};
const when = ms => { const d = new Date(ms || 0), m = Math.round((Date.now() - d)/60000);
  return m < 1 ? '剛剛' : m < 60 ? `${m} 分鐘前` : m < 1440 ? `${Math.floor(m/60)} 小時前` : `${d.getMonth()+1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const describe = s => `${s.name || (s.stage === 'egg' ? '一顆蛋' : '還沒取名')}・${STAGE_NAME[s.stage] || ''}・代幣 ${s.coins}・上次玩：${when(s.lastSeen)}`;
// Decide whether this device's save or the cloud save should be used.
async function pickSave(local, remote, uid){
  const r = fromObj(remote.save); if (!r) return 'local';
  if (!local) return 'remote';
  if (lsGet(FORCE_LOCAL)) return 'local';
  if (lsGet(PREFER_REMOTE)) return 'remote';
  if (lsGet(SYNC_UID) === uid) return (r.lastSeen || 0) >= (local.lastSeen || 0) ? 'remote' : 'local';
  if (local.stage === 'egg' && local.gen === 1 && !Object.keys(local.builds).length && !Object.keys(local.owned).length) return 'remote';
  return new Promise(res => showModal('要用哪一份進度？', `<p>這個帳號在雲端已經有存檔，這台裝置也有另一份。選一份繼續玩，另一份會被取代。</p>`
    + `<p><b>雲端：</b>${esc(describe(r))}</p><p><b>這台裝置：</b>${esc(describe(local))}</p>`,
    [{label:'用這台的', ghost:true, onClick:()=>res('local')}, {label:'用雲端的', onClick:()=>res('remote')}]));
}
const esc = t => String(t).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

let S = readLocal();
$('#petSub').textContent = '讀取存檔中……';
ldStep('讀取存檔', 0.85);
const boot0 = await cloud.init(4000);
if (boot0.user && boot0.remote && await pickSave(S, boot0.remote, boot0.user.uid) === 'remote') S = fromObj(boot0.remote.save);
if (boot0.user && boot0.checked){ lsSet(SYNC_UID, boot0.user.uid); lsSet(PREFER_REMOTE, null); }
$('#petSub').textContent = '';
if (!S) S = freshSave();
if (S.aff == null) S.aff = 60;   // saves from before affection existed
if (S.camV !== 2){ S.camMode = 'iso'; S.camV = 2; }   // the fixed 45° view is the new default
// ?preview=<form> shows that evolution form straight away; nothing is saved locally or to the cloud.
const PREVIEW = FORMS[new URLSearchParams(location.search).get('preview')] ? new URLSearchParams(location.search).get('preview') : null;
if (PREVIEW) S = Object.assign(freshSave(), {name:'預覽', form:PREVIEW, seenGuide:true, dayMode:'preview', coins:0, ageMs:3*86400000, growth:400,
  stage: ['golden','forestx','thunder'].includes(PREVIEW) ? 'ultimate' : ['royal','forest','wind'].includes(PREVIEW) ? 'perfect' : 'adult',
  st:{hunger:90, thirst:90, happy:95, energy:90, health: PREVIEW === 'sickly' ? 60 : 100}});
// ?preview=…&wear=straw,glasses tries clothes on; ?debug exposes internals for tuning in the console.
if (PREVIEW){ const q = new URLSearchParams(location.search), w = (q.get('wear') || '').split(',').filter(Boolean); w.forEach(id => { S.owned[id] = true; S.worn[id] = true; }); if (q.get('stage')) S.stage = q.get('stage'); }

// ---------- runtime state ----------
const pos = V3(0,0,0), vel = V3(0,0,0), walkVel = V3(0,0,0), forceSm = V3(0,0,0);
let tx=0, tz=0, tvx=0, tvz=0, sq=0, sqv=0, liftW=0, gaitW=0, walkClock=0, wiggleW=0, danceW=0, sleepW=0, sitW=0;
let petS = 0.45, reveal = 1, dragging = false, act = null, actY = 0, lastMouse = -1e9, hasHover = false, hatLift = 0, clothesHidden = false;
let blinkTimer = 2.5, blinkT = 0, snowCover = 0, flashV = 0, thunderT = 6, hatching = null, evo = null, nightF = 0, fxoV = 0, hudDirty = true;
const grabLocal = V3(0,0,0), pointerWorld = V3(0,0,0), plane = new THREE.Plane(), ROPE = 0.35, lastLand = V3(0,0,0);
let petGY = 0, justLanded = 0, swimming = false;   // ground height under the wombat (smoothed); a moment after being dropped; floating in water
const B = {mode:'idle', timer:2, target:V3(0,0,0), lookT:0, lookYaw:0, lookPitch:0, food:null, water:null, nomT:0,
  sleeping:false, sleepAfter:false, anim:0, from:V3(0,0,0), emoteT:4, stompT:3, petCd:0, petTimes:[], zzzT:0, cryT:12};
const petActive = () => S.stage !== 'egg' && !S.dead && B.mode !== 'dying' && B.mode !== 'dead';
const asleep = () => B.mode === 'sleep' || (B.mode === 'inHouse' && B.sleeping);
const form = () => FORMS[S.form] || FORMS.normal;

// ---------- poop, weeds, food, water, snowmen ----------
const cubeGeo = new THREE.BoxGeometry(0.2,0.2,0.2), cubeMat = mat('#6e4c35',0.95);
const hbMat = new THREE.MeshBasicMaterial({transparent:true, opacity:0, depthWrite:false});
const cubes = [];
function makePoop(p, v, sc){
  const m = new THREE.Mesh(cubeGeo, cubeMat); m.rotation.order = 'YXZ'; m.position.copy(p); m.scale.setScalar(sc); scene.add(m);
  const hb = new THREE.Mesh(new THREE.SphereGeometry(0.32/sc,8,6), hbMat); hb.userData.kind = 'poop'; m.add(hb);
  const stink = new THREE.Sprite(new THREE.SpriteMaterial({map:stinkTex, transparent:true, depthWrite:false})); stink.scale.set(0.35,0.7,1); stink.visible = false; scene.add(stink);
  const c = {m, v, a:v ? V3(rnd(-6,6), rnd(-3,3), rnd(-6,6)) : V3(0,0,0), sh:makeShadow(0.42*sc, 0.42*sc), hb, stink, sc, ph:Math.random()*6};
  hb.userData.ref = c; cubes.push(c); return c;
}
function poopNow(){
  if (!petActive() || ['inHouse','enter','exit','goHouse','evolve'].includes(B.mode) || inBuild(pos.x, pos.z, 1.0)) return false;
  const p = offG.localToWorld(V3(0, 0.55, -1.3));
  const back = V3(0,0,-1).applyAxisAngle(UP, root.rotation.y), side = V3(1,0,0).applyAxisAngle(UP, root.rotation.y);
  const v = back.multiplyScalar(rnd(1.0,2.0)*petS).add(side.multiplyScalar(rnd(-0.8,0.8))); v.y = 0.6;
  makePoop(p, v, 0.5 + 0.5*Math.min(petS,1)); sfx('plop');
  if (!S.toldPoop){ S.toldPoop = true; toast('袋熊的便便是方塊形的，這是真的。點一下便便可以清掉，還能賺代幣。'); }
  return true;
}
function removePoop(c){ scene.remove(c.m, c.sh.g, c.stink); cubes.splice(cubes.indexOf(c),1); }
// ---------- cleaning tools: a broom + dustpan sweeps poop away, a little hand pulls weeds ----------
const tools = [];
const skinMat = mat('#f3d2b8', 0.7), woodMat = mat('#b98b5a', 0.8);
function makeHand(){
  const g = new THREE.Group(), palm = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), skinMat); palm.scale.set(0.16, 0.1, 0.14); g.add(palm);
  const fingers = new THREE.Group(); g.add(fingers);
  for (let i=0;i<4;i++){ const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.12, 4, 8), skinMat); f.position.set(-0.09 + i*0.06, -0.06, 0.12); f.rotation.x = 1.2; fingers.add(f); }
  const th = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.09, 4, 8), skinMat); th.position.set(0.17, -0.04, 0.02); th.rotation.z = 1.1; g.add(th);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.12, 14), mat('#f6f3ec', 0.9)); cuff.position.set(0, 0.04, -0.17); cuff.rotation.x = Math.PI/2; g.add(cuff);
  g.userData.fingers = fingers; return g;
}
function makeBroom(){
  const g = new THREE.Group(), stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 8), woodMat); stick.position.y = 0.6; g.add(stick);
  const brush = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.28, 12), mat('#e2c37c', 0.9)); brush.position.y = 0.1; brush.rotation.x = Math.PI; brush.scale.z = 0.5; g.add(brush);
  const tie = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.05, 10), mat('#d23b32', 0.6)); tie.position.y = 0.24; g.add(tie);
  g.rotation.z = 0.5; return g;
}
function makePan(){
  const g = new THREE.Group(), red = mat('#e45b5b', 0.5);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.02, 0.36), red); base.position.y = 0.01; g.add(base);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.02), red); back.position.set(0, 0.08, -0.18); g.add(back);
  for (const s of [-1,1]){ const side = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.12, 0.36), red); side.position.set(0.21*s, 0.06, 0); g.add(side); }
  const h = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8), red); h.position.set(0, 0.2, -0.3); h.rotation.x = 0.9; g.add(h);
  return g;
}
const camRight = () => { const r = V3(1,0,0).applyQuaternion(camera.quaternion); r.y = 0; return r.normalize(); };
function cleanPoop(c){
  if (!cubes.includes(c) || c.cleaning) return;
  c.cleaning = true; c.hb.userData.kind = null; c.v = null;
  const at = c.m.position.clone(); at.y = gy(at.x, at.z); const right = camRight();
  const pan = makePan(), broom = makeBroom(); pan.position.copy(at).addScaledVector(right, 0.42); pan.rotation.y = Math.atan2(-right.x, -right.z);
  broom.position.copy(at).addScaledVector(right, -0.5); broom.rotation.y = Math.atan2(right.x, right.z) - Math.PI/2;
  scene.add(pan, broom); pan.scale.setScalar(0.01); broom.scale.setScalar(0.01);
  tools.push({t:0, dur:1.3, update(t){
    const k = Math.min(1, t/0.2), out = t > 1.0 ? Math.max(0.01, 1 - (t-1.0)/0.3) : 1;
    pan.scale.setScalar(k*out); broom.scale.setScalar(k*out);
    const s = clamp((t-0.25)/0.55, 0, 1);                       // sweep toward the pan
    broom.position.copy(at).addScaledVector(right, lerp(-0.5, 0.18, s)); broom.rotation.x = Math.sin(t*28)*0.12*(s > 0 && s < 1 ? 1 : 0);
    if (s > 0.35){ c.m.position.copy(at).addScaledVector(right, lerp(0, 0.4, (s-0.35)/0.65)); c.m.position.y = 0.1*c.sc; c.sh.g.visible = false; c.stink.visible = false; }
    if (t > 1.0){ pan.position.y = at.y + (t-1.0)*1.2; c.m.position.y = pan.position.y + 0.1*c.sc; }
    if (t > 0.6 && !this.swish){ this.swish = true; sfx('whoosh'); }
  }, done(){ scene.remove(pan, broom); removePoop(c); addCoins(3, at.add(V3(0,0.5,0))); sfx('pop'); track('poop'); }});
}

const weeds = [], fxPull = [];
const bladeGeo = new THREE.ConeGeometry(0.04, 0.42, 4); bladeGeo.translate(0,0.21,0);
const weedMats = [mat('#2f5a24'), mat('#3d6b2b'), mat('#28501f')];   // darker than the meadow so weeds stand out
const weedLeafGeo = (() => { const g = new THREE.SphereGeometry(0.11, 8, 5); g.scale(0.55, 0.12, 1.9); g.translate(0, 0.02, 0.2); return g; })();   // long jagged-ish leaf lying out from the centre
const weedStalkGeo = (() => { const g = new THREE.CylinderGeometry(0.012, 0.018, 0.62, 5); g.translate(0, 0.31, 0); return g; })();
const weedFlowerGeo = (() => { const g = new THREE.SphereGeometry(0.075, 10, 6); g.scale(1, 0.55, 1); return g; })();
const weedPuffGeo = new THREE.IcosahedronGeometry(0.085, 1), weedThistleGeo = new THREE.SphereGeometry(0.06, 8, 6);
const weedYellow = mat('#f2c531', 0.6), weedPuff = new THREE.MeshStandardMaterial({color:'#f4f2ea', roughness:0.9, transparent:true, opacity:0.9}), weedPurple = mat('#9a5fb4', 0.7);
// Litter that belongs to a special area: it grows or washes up there and can be cleared like weeds (a little more money).
const LITTER = {
  tumble:{name:'風滾草', where:'aus'}, branch:{name:'枯樹枝', where:'forest'}, scree:{name:'碎石堆', where:'high'}, thorn:{name:'帶刺灌木', where:'savanna'},
  hyacinth:{name:'布袋蓮', where:'swamp', still:'swamp'}, algae:{name:'浮萍', where:'pond', still:'pond'}, drift:{name:'漂流木', where:'beaver'}, seaweed:{name:'海草', where:'beach'},
};
function litterMesh(kind){
  const g = new THREE.Group(), M = c => mat(c, 0.9), stick = (len, r, m) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r*0.8, len, 5), m); c.rotation.set(rnd(-1.4, 1.4), rnd(0, 6), rnd(-1.4, 1.4)); return c; };
  if (kind === 'tumble'){ const m = M('#b49a6a'); for (let i=0;i<22;i++){ const c = stick(rnd(0.35, 0.6), 0.012, m); c.position.set(rnd(-0.12, 0.12), 0.25 + rnd(-0.12, 0.12), rnd(-0.12, 0.12)); g.add(c); } g.userData.roll = true; }
  if (kind === 'branch'){ const m = M('#6e5038'); for (let i=0;i<5;i++){ const c = stick(rnd(0.6, 1.0), rnd(0.025, 0.045), m); c.rotation.x = Math.PI/2 + rnd(-0.3, 0.3); c.position.set(rnd(-0.15, 0.15), 0.05 + i*0.03, rnd(-0.15, 0.15)); g.add(c); }
    const lf = M('#8a7a3a'); for (let i=0;i<6;i++){ const l = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), lf); l.scale.set(1, 0.2, 1.6); l.position.set(rnd(-0.3, 0.3), 0.03, rnd(-0.3, 0.3)); g.add(l); } }
  if (kind === 'scree'){ for (let i=0;i<6;i++){ const r = new THREE.Mesh(new THREE.DodecahedronGeometry(rnd(0.08, 0.16), 0), M(['#8f8d86', '#a3a097', '#7c7a74'][i % 3])); r.position.set(rnd(-0.22, 0.22), 0.06, rnd(-0.22, 0.22)); r.rotation.set(rnd(0, 6), rnd(0, 6), 0); g.add(r); } }
  if (kind === 'thorn'){ const m = M('#7a6a42'), th = M('#a08a5a'); for (let i=0;i<9;i++){ const c = stick(rnd(0.3, 0.55), 0.015, m); c.position.set(rnd(-0.1, 0.1), 0.2, rnd(-0.1, 0.1)); g.add(c);
      for (let k=0;k<3;k++){ const t_ = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.06, 4), th); t_.position.set(rnd(-0.2, 0.2), rnd(0.1, 0.4), rnd(-0.2, 0.2)); t_.rotation.set(rnd(0, 6), 0, rnd(0, 6)); g.add(t_); } } }
  if (kind === 'hyacinth'){ for (let i=0;i<5;i++){ const l = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), M('#4f8a3a')); l.scale.set(1, 0.45, 1.2); l.position.set(rnd(-0.18, 0.18), 0.04, rnd(-0.18, 0.18)); g.add(l); }
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), M('#a99ad8')); f.position.y = 0.16; g.add(f); }
  if (kind === 'algae'){ for (let i=0;i<9;i++){ const l = new THREE.Mesh(new THREE.CircleGeometry(rnd(0.04, 0.08), 8), M('#7fa83a')); l.rotation.x = -Math.PI/2; l.position.set(rnd(-0.3, 0.3), 0.01, rnd(-0.3, 0.3)); g.add(l); } }
  if (kind === 'drift' || kind === 'seaweed'){ if (kind === 'drift'){ const c = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.1, 7), M('#a89a86')); c.rotation.z = Math.PI/2; c.rotation.y = rnd(0, 6); c.position.y = 0.07; g.add(c); }
    else for (let i=0;i<7;i++){ const l = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), M(['#3a5a2a', '#5a6a2a', '#4a4a22'][i % 3])); l.scale.set(1.6, 0.3, 0.7); l.rotation.y = rnd(0, 6); l.position.set(rnd(-0.25, 0.25), 0.03, rnd(-0.25, 0.25)); g.add(l); } }
  return g;
}
function makeWeed(x, z, s, kind){
  const g = new THREE.Group();
  if (kind && LITTER[kind]){ g.add(litterMesh(kind)); const y = LITTER[kind].still ? WATER_Y + 0.01 : gy(x, z); g.position.set(x, y, z); g.scale.setScalar(s); g.rotation.y = rnd(0, 6.28); scene.add(g);
    const hb = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), hbMat); hb.position.y = 0.2; hb.userData.kind = 'weed'; g.add(hb);
    const w = {g, x, z, s, hb, kind}; hb.userData.ref = w; weeds.push(w); return w; }
  const n = 7 + Math.floor(Math.random()*3), a0 = rnd(0, 6.28);
  for (let i=0;i<n;i++){ const l = new THREE.Mesh(weedLeafGeo, weedMats[i%3]), a = a0 + i/n*Math.PI*2; l.rotation.set(0, a, 0); l.rotateX(-rnd(0.25, 0.6)); l.scale.setScalar(rnd(0.8, 1.2)); g.add(l); }   // the leaf rosette
  const sp = Math.random(), stalk = new THREE.Mesh(weedStalkGeo, weedMats[1]); stalk.rotation.z = rnd(-0.15, 0.15); g.add(stalk);
  const top = new THREE.Mesh(sp < 0.45 ? weedFlowerGeo : sp < 0.8 ? weedPuffGeo : weedThistleGeo, sp < 0.45 ? weedYellow : sp < 0.8 ? weedPuff : weedPurple);
  top.position.set(-Math.sin(stalk.rotation.z)*0.62, Math.cos(stalk.rotation.z)*0.62, 0); g.add(top);
  g.position.set(x, gy(x, z), z); g.scale.setScalar(s*1.45); scene.add(g);   // weeds are drawn bigger than their saved size
  const hb = new THREE.Mesh(new THREE.SphereGeometry(0.4,8,6), hbMat); hb.position.y = 0.2; hb.userData.kind = 'weed'; g.add(hb);
  const w = {g, x, z, s, vs:s*1.45, hb}; hb.userData.ref = w; weeds.push(w); return w;
}
// tumbleweeds roll slowly across the outback in the wind
function rollTumbleweeds(dt){
  for (const w of weeds){ if (w.kind !== 'tumble' || !w.hb.userData.kind) continue;
    const nx = w.g.position.x + dt*0.35, nz = w.g.position.z + Math.sin(performance.now()/2000 + w.x)*dt*0.15;
    if (!world.inBio('aus', nx, nz) || !weedSpotOK(nx, nz)) continue;
    w.g.position.set(nx, gy(nx, nz), nz); w.g.rotation.z -= dt*0.35/0.3; w.x = +nx.toFixed(2); w.z = +nz.toFixed(2); }
}
const plotBio = k => Object.keys(BIO).find(b => BIO[b] === k);
// litter and weeds never grow in water or on a bridge deck; pond/swamp plants wash up on the bank instead
const overBridge = (x, z, pad = 0.6) => world.bridges.some(b => { const dx = x - b.x, dz = z - b.z; return Math.abs(dx*b.ax + dz*b.az) < b.len/2 + pad && Math.abs(-dx*b.az + dz*b.ax) < world.BRIDGE_W/2 + pad; });
const weedSpotOK = (x, z) => groundOK(x, z) && !world.isWater(x, z) && !overBridge(x, z) && !inBuild(x, z, 0.4);
const stillSpotOK = (x, z, where) => (where === 'pond' ? world.isPond(x, z) : world.isSwampWater(x, z)) && !world.isRiver(x, z) && !overBridge(x, z);
const litterSpotOK = (x, z, k) => k && LITTER[k] && LITTER[k].still ? stillSpotOK(x, z, LITTER[k].still) : weedSpotOK(x, z);
function spawnWeed(){
  const open = world.data.open; if (weeds.length >= weedCap()) return;
  const k_ = open[Math.floor(Math.random()*open.length)], [px, pz] = k_.split(',').map(Number).map(v => v*PLOT), bio = plotBio(k_), hp = PLOT/2 - 0.5;
  // special areas grow their own litter half the time
  const lit = Object.keys(LITTER).find(l => LITTER[l].where === bio) || (k_.startsWith('1,') && Math.random() < 0.5 ? 'seaweed' : null);
  if (lit && (bio ? Math.random() < 0.55 : true)){
    for (let k=0;k<60;k++){ const x = px + rnd(-hp, hp), z = pz + rnd(-hp, hp);
      if (!litterSpotOK(x, z, lit)) continue;
      if (lit === 'seaweed' && !world.isBeach(x, z)) continue;
      if (obstacles().some(o => Math.hypot(o.c.x-x, o.c.z-z) < o.r + 0.4)) continue;
      makeWeed(+x.toFixed(2), +z.toFixed(2), +rnd(0.85, 1.2).toFixed(2), lit); return; } }
  for (let k=0;k<16;k++){
    const x = px + rnd(-hp, hp), z = pz + rnd(-hp, hp);
    if (!weedSpotOK(x, z) || world.isBeach(x, z) || world.isMud(x, z)) continue;
    if (obstacles().some(o => Math.hypot(o.c.x-x, o.c.z-z) < o.r + 0.4)) continue;
    if (Math.hypot(pos.x-x, pos.z-z) < 1.6) continue;
    makeWeed(+x.toFixed(2), +z.toFixed(2), +rnd(0.8,1.25).toFixed(2)); return;
  }
}
function pullWeed(w){
  if (!weeds.includes(w)) return;
  weeds.splice(weeds.indexOf(w),1); S.care.nature = (S.care.nature || 0) + 1; w.hb.userData.kind = null; track('weed');
  const hand = makeHand(), at = w.g.position.clone(), top = 0.5*(w.vs || w.s);
  hand.rotation.y = Math.atan2(camera.position.x - at.x, camera.position.z - at.z) + Math.PI; const base = at.y; hand.position.set(at.x, base + 1.8, at.z); scene.add(hand);
  tools.push({t:0, dur:1.25, update(t){
    if (t < 0.35) hand.position.y = base + lerp(1.8, top + 0.12, ease(t/0.35));                         // reach down
    else if (t < 0.5) hand.userData.fingers.rotation.x = lerp(0, 0.7, (t-0.35)/0.15);              // grab
    else { const u = ease(clamp((t-0.5)/0.6, 0, 1)); hand.position.y = base + lerp(top + 0.12, 1.9, u);   // yank it out
      w.g.position.y = hand.position.y - top - 0.12; w.g.rotation.z = Math.sin(t*30)*0.15*(1-u);
      if (!this.popped){ this.popped = true; sfx('pop'); addCoins(w.kind ? 3 : 2, at.clone().add(V3(0,0.6,0))); if (w.kind) track('litter'); } }
    if (t > 1.0){ const f = Math.max(0.01, 1 - (t-1.0)/0.25); hand.scale.setScalar(f); w.g.scale.setScalar((w.vs || w.s)*f); }
  }, done(){ scene.remove(hand, w.g); }});
}
// The clean button (without the one-tap upgrade) points out every poop and weed with a big bobbing marker for a while,
// so they can be found even far away on other plots.
function markMess(){
  const P = cubes.filter(c => !c.cleaning), Wd = weeds.filter(w => !w.kind), L = weeds.filter(w => w.kind);
  toast(`還有 ${[P.length && `便便 ${P.length} 坨`, Wd.length && `雜草 ${Wd.length} 株`, L.length && `垃圾 ${L.length} 個`].filter(Boolean).join('、')}，已經用標記標出來了，點它們就能清掉。想按一下全部清光，可以到商店買「一鍵清理」。`);
  const add = (alive, at, e) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({map:emojiTex(e), transparent:true, depthTest:false, depthWrite:false})); s.renderOrder = 999; scene.add(s);
    tools.push({t:0, dur:15, update(t){ if (!alive()){ s.visible = false; return; } const p = at(), d = camera.position.distanceTo(p), k = Math.max(0.55, d*0.045)*Math.min(1, (15 - t)*2);
      s.scale.setScalar(k); s.position.set(p.x, p.y + 0.9 + k*0.6 + Math.abs(Math.sin(t*4))*k*0.4, p.z); }, done(){ scene.remove(s); s.material.dispose(); }}); };
  P.forEach(c => add(() => cubes.includes(c) && !c.cleaning, () => c.m.position, '💩'));
  weeds.forEach(w => add(() => weeds.includes(w), () => w.g.position, w.kind ? '🗑️' : '🌿'));
}
// ---------- pests: flies buzz around poop when the yard gets dirty, cockroaches show up when it's filthy ----------
const flyTex = canvasTex(64,64,(x)=>{ x.fillStyle = 'rgba(220,235,245,0.75)'; x.beginPath(); x.ellipse(22,24,12,7,-0.5,0,Math.PI*2); x.ellipse(42,24,12,7,0.5,0,Math.PI*2); x.fill();
  x.fillStyle = '#1b1b1b'; x.beginPath(); x.ellipse(32,36,8,11,0,0,Math.PI*2); x.fill(); x.beginPath(); x.arc(32,24,6,0,Math.PI*2); x.fill(); });
const flies = [], roaches = [];
let buzzT = 4;
function makeRoach(){
  const g = new THREE.Group(), shell = new THREE.MeshStandardMaterial({color:'#5a3520', roughness:0.25}), dark = mat('#2a1a10', 0.5);
  const b = new THREE.Mesh(new THREE.SphereGeometry(1,14,10), shell); b.scale.set(0.085,0.035,0.14); b.position.y = 0.05; g.add(b);
  const h = new THREE.Mesh(new THREE.SphereGeometry(0.04,10,8), dark); h.position.set(0,0.045,0.15); g.add(h);
  const legs_ = [];
  for (let i=0;i<6;i++){ const s = i%2 ? 1 : -1, z = (Math.floor(i/2)-1)*0.07, l = new THREE.Mesh(new THREE.CylinderGeometry(0.006,0.006,0.14,4), dark);
    l.position.set(0.08*s, 0.03, z); l.rotation.z = s*1.2; g.add(l); legs_.push(l); }
  for (const s of [-1,1]){ const a = new THREE.Mesh(new THREE.CylinderGeometry(0.004,0.004,0.2,4), dark); a.position.set(0.04*s,0.07,0.25); a.rotation.set(1.2,0,-0.5*s); g.add(a); }
  const a = Math.random()*Math.PI*2; g.position.set(pos.x + Math.sin(a)*7, 0, pos.z + Math.cos(a)*7); scene.add(g);
  return {g, legs:legs_, tgt:V3(0,0,0), retarget:0, leaving:false};
}
function updatePests(dt){
  const dirt = clamp((62 - cleanVal())/42, 0, 1), spots = [...cubes.filter(c => !c.cleaning).map(c => c.m.position), ...weeds.map(w => w.g.position)];
  const wantFlies = spots.length ? Math.round(dirt*8) : 0, wantRoaches = cleanVal() < 35 ? Math.min(4, 1 + Math.floor((35 - cleanVal())/10)) : 0;
  while (flies.length < wantFlies){ const s = new THREE.Sprite(new THREE.SpriteMaterial({map:flyTex, transparent:true, depthWrite:false})); s.scale.setScalar(0.16); scene.add(s); flies.push({s, i:Math.floor(Math.random()*99), ph:Math.random()*9, r:rnd(0.25,0.6), sp:rnd(5,7)}); }
  while (flies.length > wantFlies){ scene.remove(flies.pop().s); }
  flies.forEach(f => { const c = spots[f.i % spots.length]; if (!c) return; const a = t*f.sp + f.ph;
    f.s.position.set(c.x + Math.cos(a)*f.r + Math.sin(t*13+f.ph)*0.05, c.y + 0.3 + Math.sin(a*1.7+f.ph)*0.18, c.z + Math.sin(a)*f.r); });
  if (flies.length >= 3){ buzzT -= dt; if (buzzT <= 0){ buzzT = rnd(6,10); sfx('buzz'); } }
  while (roaches.filter(r => !r.leaving).length < wantRoaches) roaches.push(makeRoach());
  roaches.filter(r => !r.leaving).slice(wantRoaches).forEach(r => { r.leaving = true; const a = Math.atan2(r.g.position.x - pos.x, r.g.position.z - pos.z); r.tgt.set(pos.x + Math.sin(a)*8, 0, pos.z + Math.cos(a)*8); });
  for (let i=roaches.length-1;i>=0;i--){ const r = roaches[i], p = r.g.position;
    const near = petActive() && root.visible && Math.hypot(p.x-pos.x, p.z-pos.z) < 1.4*Math.max(petS,0.6);
    r.retarget -= dt;
    if (!r.leaving && (r.retarget <= 0 || near)){ r.retarget = rnd(1.5,4); if (near){ const d = V3(p.x-pos.x,0,p.z-pos.z).normalize(); r.tgt.copy(p).addScaledVector(d, 2.5); } else { const a = Math.random()*Math.PI*2, rr = rnd(1,5); r.tgt.set(pos.x + Math.sin(a)*rr, 0, pos.z + Math.cos(a)*rr); } }
    const d = V3(r.tgt.x-p.x, 0, r.tgt.z-p.z), dist = d.length();
    if (dist > 0.1){ const sp = (near || r.leaving ? 2.6 : 1.1)*dt; p.addScaledVector(d.normalize(), Math.min(sp, dist));
      r.g.rotation.y += clamp(wrapA(Math.atan2(d.x, d.z) - r.g.rotation.y), -8*dt, 8*dt); r.legs.forEach((l,k) => l.rotation.x = Math.sin(t*30 + k*1.3)*0.5); }
    p.y = gy(p.x, p.z);
    if (r.leaving && dist < 0.2){ scene.remove(r.g); roaches.splice(i,1); }
  }
}
// ---------- trees: planted at random when a game starts; some carry a beehive ----------
const SWAMP_CANOPY = swaying(new THREE.MeshLambertMaterial({vertexColors:true, color:'#97a284', map:canopyTex, alphaTest:0.45, side:THREE.DoubleSide}), 3.6, 0.4, 0.12);
function makeTree(d){
  // the Blender tree (outback trees are eucalyptus, swamp trees get a darker, mossier tint); simple shapes if the model is missing
  const euc = !!d.euc, g = new THREE.Group(), set = TREE_MODELS && (euc ? TREE_MODELS.euc : TREE_MODELS.oak);
  if (set && set.length){
    const m = set[Math.abs(Math.round(d.x*7 + d.z*13)) % set.length];
    const trunk = new THREE.Mesh(m.trunk, m.trunkMat || world.TRUNK_M), crown = new THREE.Mesh(m.canopy, d.swamp ? (m.swampMat || SWAMP_CANOPY) : (m.canopyMat || world.CANOPY_M));
    trunk.userData.noFade = crown.userData.noFade = true; g.add(trunk, crown);
  } else {
    const bark = mat(euc ? '#e6ddcc' : '#7a5634', 0.95), trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.27, 1.5, 9), bark); trunk.position.y = 0.75; g.add(trunk);
    CANOPY_BLOBS.forEach(([x,y,z,r],i) => { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), new THREE.MeshStandardMaterial({color:['#5f8f3e','#6fa148','#4f7d34'][i%3], roughness:0.9, flatShading:true, transparent:true})); m.position.set(x, y, z); g.add(m); });
  }
  if (d.hive){   // a paper wasp nest hanging from a branch under the crown (scanned; the old honey-pot shape if the model is missing)
    const h = new THREE.Group(), nest = realClone('waspnest');
    if (nest){ nest.scale.setScalar(0.6); h.add(nest); h.position.set(0.56, 1.95, 0.46); }
    else { const body = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), mat('#d9a23a', 0.6)); body.scale.set(0.22, 0.3, 0.22); h.add(body);
      for (let i=0;i<3;i++){ const ring = new THREE.Mesh(new THREE.TorusGeometry(0.21 - Math.abs(i-1)*0.05, 0.025, 6, 20), mat('#b07a22', 0.6)); ring.rotation.x = Math.PI/2; ring.position.y = (i-1)*0.12; h.add(ring); }
      h.position.set(0.5, 1.3, 0.4); }
    h.userData.y0 = h.position.y; g.add(h); g.userData.hive = h;
  }
  g.position.set(d.x, gy(d.x, d.z) - 0.05, d.z); g.rotation.y = d.ry || 0; g.scale.setScalar(d.s); scene.add(g);
  const hb = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 2.6, 8), hbMat); hb.position.y = 1.3; hb.userData.kind = 'tree'; g.add(hb);
  const fade = []; g.traverse(o => { if (o.isMesh && o !== hb && !o.userData.noFade) { o.material = seeThrough(o.material.clone()); o.material.transparent = true; fade.push(o.material); } });
  const tr = {d, g, hb, fade, alpha:1, shake:0, sh:makeShadow(2.6*d.s, 2.6*d.s)}; tr.sh.g.position.set(d.x, gy(d.x, d.z), d.z); hb.userData.ref = tr; trees.push(tr); NAV.dirty = true; return tr;
}
// The bark's outline up each tree, for animals that climb (they keep to the outside of the trunk, never inside it): per 0.1 of
// height the trunk's centre and its widest reach, and where it forks into branches.
const TRUNK_PROF = new Map();
function trunkShape(d){
  const set = TREE_MODELS && (d.euc ? TREE_MODELS.euc : TREE_MODELS.oak), m = set && set.length ? set[Math.abs(Math.round(d.x*7 + d.z*13)) % set.length] : null;   // (the model makeTree picks)
  let P = m && TRUNK_PROF.get(m);
  if (m && m.trunk && !P){ const p = m.trunk.attributes.position, B = [];
    for (let i=0;i<p.count;i++){ const k = Math.floor(Math.max(0, p.getY(i))/0.1); (B[k] || (B[k] = [])).push(p.getX(i), p.getZ(i)); }
    const b = []; for (let k=0;k<B.length;k++){ const v = B[k]; if (!v){ b.push(b[k - 1] || {cx:0, cz:0, r:0.3}); continue; } let cx = 0, cz = 0; for (let j=0;j<v.length;j+=2){ cx += v[j]; cz += v[j+1]; } cx /= v.length/2; cz /= v.length/2;
      let r = 0; for (let j=0;j<v.length;j+=2) r = Math.max(r, Math.hypot(v[j] - cx, v[j+1] - cz)); b.push({cx, cz, r}); }
    const rr = b.map((x, k) => Math.max(x.r, (b[k - 1] || x).r, (b[k + 1] || x).r));   // a little wider than any one slice: no bumps poking through
    b.forEach((x, k) => { x.r = rr[k]; });
    const base = Math.min(...b.slice(6, 15).map(x => x.r)); let fork = b.findIndex((x, k) => k >= 9 && x.r > 1.4*base);
    P = {b, fork:fork > 0 ? fork*0.1 : 1.6}; TRUNK_PROF.set(m, P); }
  const s = d.s, c = Math.cos(d.ry || 0), sn = Math.sin(d.ry || 0);
  if (!P) return {r: () => 0.3*s, axis: () => ({x:d.x, z:d.z}), fork:1.6*s};
  const at = h => P.b[clamp(Math.floor(h/s/0.1), 0, P.b.length - 1)];
  return {r: h => at(h).r*s, axis: h => { const b = at(h); return {x:d.x + (b.cx*c + b.cz*sn)*s, z:d.z + (-b.cx*sn + b.cz*c)*s}; }, fork:P.fork*s};
}
function plantTrees(){
  S.trees = []; const n = 3 + Math.floor(Math.random()*3);
  for (let k=0; k<80 && S.trees.length < n; k++){
    const a = Math.random()*Math.PI*2, r = rnd(4.4, 6.0), x = +(Math.sin(a)*r).toFixed(2), z = +(Math.cos(a)*r).toFixed(2);
    if (obstacles().some(o => Math.hypot(o.c.x-x, o.c.z-z) < o.r + 1.4)) continue;
    if (S.trees.some(o => Math.hypot(o.x-x, o.z-z) < 2.6)) continue;
    S.trees.push({x, z, s:+rnd(0.85, 1.15).toFixed(2), ry:+rnd(0, 6.28).toFixed(2), hive: Math.random() < 0.5});
  }
  if (S.trees.length && !S.trees.some(t => t.hive)) S.trees[0].hive = true;
}
// Bumping into a hive tree (thrown, rolling, or poking around) gets the wombat stung: a head full of bumps until treated.
let stingCd = 0;
const bees = [];
const bumps = new THREE.Group();
[[0.26,0.56,0.74],[-0.3,0.54,0.76],[0.02,0.64,0.52],[0.5,0.44,0.86],[-0.48,0.46,0.84]].forEach(([x,y,z]) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 10), new THREE.MeshStandardMaterial({color:'#f2726c', emissive:'#5a0e0b', emissiveIntensity:0.35, roughness:0.4})); m.position.set(x, y, z); bumps.add(m); });
head.add(bumps); bumps.visible = false;
const applyBumps = () => { bumps.visible = !!S.swollen; };
function sting(){
  if (stingCd > 0 || !petActive()) return; stingCd = 20;
  S.swollen = true; applyBumps(); track('sting');
  S.st.happy = clamp(S.st.happy - 12, 0, 100); S.st.health = clamp(S.st.health - 8, 0, 100); S.aff = clamp(S.aff - 2, 0, 100);
  showEmote('😭', 2.5); cry('angry'); sfx('buzz'); sqv += 2;
  for (let i=0;i<7;i++){ const s = new THREE.Sprite(new THREE.SpriteMaterial({map:emojiTex('🐝'), transparent:true, depthWrite:false})); s.scale.setScalar(0.34); scene.add(s); bees.push({s, ph:i/7*Math.PI*2, life:4.5}); }
  toast(`${S.name || '牠'}撞到蜂窩，被胡蜂叮得滿頭包！到商店的「藥品」買消腫藥膏。`); hudDirty = true;
}
function updateTrees(dt){
  if (BG.windmill) BG.windmill.userData.spin.rotation.z -= dt*1.4;
  if (BG.swing) BG.swing.userData.sway.rotation.x = Math.sin(t*1.3)*(BG.swing.userData.ride ? 0.6 : 0.16);
  if (BG.fountain && Math.random() < dt*14){ const s = BG.fountain.position.clone().add(BG.fountain.userData.spout); floatSprite(dropTex, s, {size:0.12, vy:rnd(1.2,1.8), vx:rnd(-0.6,0.6), vz:rnd(-0.6,0.6), g:5, max:0.75, fade:0.3, grow:0}); }
  stingCd -= dt;
  for (let i=bees.length-1;i>=0;i--){ const b = bees[i]; b.life -= dt; const c = headTop(), a = t*5 + b.ph;
    b.s.position.set(c.x + Math.cos(a)*0.8*Math.max(petS,0.6), c.y + Math.sin(a*1.6)*0.25, c.z + Math.sin(a)*0.8*Math.max(petS,0.6)); b.s.material.opacity = Math.min(1, b.life);
    if (b.life <= 0){ scene.remove(b.s); bees.splice(i,1); } }
  for (const tr of trees){
    if (tr.shake > 0){ tr.shake = Math.max(0, tr.shake - dt*1.2); tr.g.rotation.z = Math.sin(tr.shake*28)*0.07*tr.shake; }
    // see-through when it stands between the camera and what we're looking at
    const cp = camera.position, seg = V3(camTarget.x - cp.x, 0, camTarget.z - cp.z), L2 = seg.lengthSq() || 1, u = clamp(((tr.d.x - cp.x)*seg.x + (tr.d.z - cp.z)*seg.z)/L2, 0, 1);
    const gap = Math.hypot(cp.x + seg.x*u - tr.d.x, cp.z + seg.z*u - tr.d.z), block = u < 0.97 && gap < 1.5*tr.d.s;
    tr.alpha += ((block ? 0.22 : 1) - tr.alpha)*Math.min(1, dt*6); tr.fade.forEach(m => { m.opacity = tr.alpha; m.depthWrite = tr.alpha > 0.95; });
    if (!petActive() || !root.visible || B.mode === 'inHouse') continue;
    if (tr.cut) continue;
    // Thrown or rolling into a tree is a crash (and a hive tree stings). Walking wombats steer around trees instead.
    const fast = Math.hypot(vel.x, vel.z) > 2.2 || (act && ['roll','ballroll'].includes(act.key));
    const d = Math.hypot(pos.x - tr.d.x, pos.z - tr.d.z), reach = treeReach(tr);
    if (d < reach && fast){
      if (tr.shake <= 0.2){ tr.shake = 1; sfx('thud'); leafFall(tr, 6); if (tr.d.hive) sting(); }
      const nx = (pos.x - tr.d.x)/(d || 1), nz = (pos.z - tr.d.z)/(d || 1); pos.x = tr.d.x + nx*reach; pos.z = tr.d.z + nz*reach;
      vel.x = nx*2; vel.z = nz*2;
    }
  }
}
const treeReach = tr => 0.45*tr.d.s + 0.9*Math.max(petS, 0.5);
const leafFall = (tr, n) => { for (let k=0;k<n;k++) floatSprite(leafTexs[k%3], tr.g.position.clone().add(V3(rnd(-1,1), rnd(1.6,2.4)*tr.d.s, rnd(-1,1))), {size:0.26, vy:-0.6, vx:rnd(-0.4,0.4), max:2.4, fade:0.6, grow:0, rot:rnd(0,6), spin:rnd(-3,3)}); };
// Tapping a tree: give it a shake, pay to take the beehive down, or pay to cut the tree.
const HIVE_PRICE = 30, TREE_PRICE = 40;
function treeMenu(tr){
  if (tr.cut) return;
  const nm = S.name || '袋熊', acts = [{label:'關閉', ghost:true, onClick:()=>{}}, {label:'搖一搖', ghost:true, onClick:() => { tr.shake = 1; sfx('whoosh'); leafFall(tr, 4); }}];
  if (tr.d.hive) acts.push({label:`清除蜂窩（${HIVE_PRICE}）`, onClick:() => removeHive(tr)});
  acts.push({label:hasSkill('gnaw') ? `讓${nm}啃倒（免費，+6 代幣）` : `砍掉（${TREE_PRICE}）`, onClick:() => cutTree(tr)});
  showModal(tr.d.hive ? '掛著蜂窩的樹' : '一棵樹', `<div class="bigicon">${tr.d.hive ? '🐝' : '🌳'}</div>`
    + `<p>${tr.d.hive ? `${nm}跑去抓樹的時候可能會被胡蜂叮。花 ${HIVE_PRICE} 代幣請人把蜂窩拿掉，樹會留著。` : `${nm}有時候會跑來抓抓樹、磨磨爪子。`}</p><p>想空出位置蓋東西，可以花 ${TREE_PRICE} 代幣把樹砍掉。</p>`, acts);
}
function pay(n){ if (S.coins < n){ toast('代幣不夠。清大便、拔雜草可以賺代幣。'); return false; } S.coins -= n; sfx('coin'); hudDirty = true; return true; }
function removeHive(tr){
  if (!tr.d.hive || !pay(HIVE_PRICE)) return;
  tr.d.hive = false; const h = tr.g.userData.hive, at = h.getWorldPosition(V3(0,0,0));
  for (let i=0;i<6;i++) floatSprite(emojiTex('🐝'), at.clone().add(V3(rnd(-0.3,0.3), rnd(0,0.3), rnd(-0.3,0.3))), {size:0.3, vy:rnd(1,2), vx:rnd(-1.5,1.5), vz:rnd(-1.5,1.5), max:1.6, grow:0});
  tools.push({t:0, dur:1.0, update(t){ h.position.y = h.userData.y0 - t*t*h.userData.y0; h.rotation.z = t*3; h.scale.setScalar(Math.max(0.01, 1 - t)); }, done(){ h.parent && h.parent.remove(h); }});
  sfx('buzz'); toast('蜂窩清掉了，胡蜂都飛走了。'); track('hive'); save();
}
// ---------- using a learned skill on the spot ----------
const slashTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d');
  x.strokeStyle = 'rgba(255,255,255,0.95)'; x.lineCap = 'round'; for (let k=0;k<3;k++){ x.lineWidth = 7 - k*1.5; x.beginPath(); x.arc(64, 140 + k*10, 90 - k*14, Math.PI*1.18, Math.PI*1.82); x.stroke(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; })();
function startSkill(type, at, reach, done, targetG){
  if (!petActive() || asleep() || act || ['inHouse','enter','exit','evolve','bloated','dead','skillGo','skillDo'].includes(B.mode)){ toast(`${S.name || '牠'}現在沒辦法過去。`); return; }
  closeSheet(); B.mode = 'skillGo'; B.skill = {type, at:at.clone(), reach, done, t:0, hit:0, g:targetG || null}; B.timer = 30; B.path = null; B.treeVisit = null; showEmote({bite:'💪', claw:'🐾', gnaw:'🦷'}[type], 1.2);
}
// Each skill has its own move. bite (learned from the hippo): crouch and charge, leap, CHOMP: the rock bursts into tumbling
// chunks with a shockwave and the screen shakes. claw (the mantis): three quick slashes and a big X, the bush bursts into
// leaves. gnaw (the beaver): a fast gnaw with wood chips spraying while the tree shakes harder and harder, a crack, and it falls.
const SKILL_COL = {bite:'#ff8a3d', claw:'#7be05a', gnaw:'#e8b45a'};
const chunkGeo = new THREE.DodecahedronGeometry(1, 0), chunkMats = ['#a19c92', '#8f8a80', '#b3ab9c', '#7d776d'].map(c => mat(c, 0.95));
const tintSlash = c => new THREE.SpriteMaterial({map:slashTex, color:c, transparent:true, depthWrite:false, depthTest:false, blending:THREE.AdditiveBlending});
function shockwave(at, color, size){ const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.0, 48), new THREE.MeshBasicMaterial({color, transparent:true, opacity:0.95, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide}));
  ring.rotation.x = -Math.PI/2; ring.position.copy(at).setY(gy(at.x, at.z) + 0.08); scene.add(ring);
  tools.push({t:0, dur:0.6, update(t){ const k = t/0.6; ring.scale.setScalar(size*(0.3 + k*1.4)); ring.material.opacity = 0.95*(1 - k); }, done(){ scene.remove(ring); }}); }
function slashAt(at, rot, color, size = 1.4, dur = 0.32){ const sl = new THREE.Sprite(tintSlash(color)); sl.material.rotation = rot; sl.position.copy(at); sl.scale.setScalar(size); scene.add(sl);
  tools.push({t:0, dur, update(t){ sl.material.opacity = 1 - t/dur; sl.scale.setScalar(size*(1 + t*2.2)); }, done(){ scene.remove(sl); }}); }
function rockBurst(at, r){   // tumbling stone chunks with simple physics, plus dust
  for (let i=0;i<14;i++){ const m = new THREE.Mesh(chunkGeo, chunkMats[i % 4]), sz = r*rnd(0.12, 0.28); m.scale.set(sz, sz*rnd(0.6, 1), sz); m.position.copy(at).add(V3(rnd(-0.2, 0.2)*r, rnd(0.1, 0.5)*r, rnd(-0.2, 0.2)*r)); scene.add(m);
    const v = V3(rnd(-1, 1), rnd(1.2, 2.4), rnd(-1, 1)).multiplyScalar(rnd(2.5, 4.5)), spin = V3(rnd(-9, 9), rnd(-9, 9), rnd(-9, 9));
    tools.push({t:0, dur:rnd(1.6, 2.2), update(t){ const dt = 1/60; v.y -= 18*dt; m.position.addScaledVector(v, dt); const g0 = gy(m.position.x, m.position.z) + sz*0.5;
      if (m.position.y < g0){ m.position.y = g0; v.y = Math.abs(v.y)*0.3; v.x *= 0.6; v.z *= 0.6; spin.multiplyScalar(0.6); }
      m.rotation.x += spin.x*dt; m.rotation.y += spin.y*dt; m.rotation.z += spin.z*dt; if (t > this.dur - 0.4) m.scale.multiplyScalar(0.92); }, done(){ scene.remove(m); }}); }
  dust(at.x, at.z, 14, r*0.8); }
function ninjaPuff(at){   // smoke balls and a whirl of leaves (the wombat's vanishing trick)
  const p = V3(at.x, gy(at.x, at.z) + 0.5, at.z);
  for (let i=0;i<10;i++) floatSprite(radialTex('rgba(235,235,230,0.95)', 'rgba(235,235,230,0)'), p.clone().add(V3(rnd(-0.4, 0.4), rnd(-0.2, 0.5), rnd(-0.4, 0.4))),
    {size:rnd(0.7, 1.2), vx:rnd(-1.2, 1.2), vz:rnd(-1.2, 1.2), vy:rnd(0.3, 1.2), max:0.7, grow:1.6});
  leafBurst(p, 10);
}
function ninjaStreak(a, b){   // a fast streak along the dash
  const from = V3(a.x, gy(a.x, a.z) + 0.5, a.z), to = V3(b.x, gy(b.x, b.z) + 0.5, b.z), n = Math.max(3, Math.round(from.distanceTo(to)*1.5));
  for (let i=0;i<n;i++) floatSprite(radialTex('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)'), from.clone().lerp(to, (i + 0.5)/n), {size:0.55, vy:0, max:0.3, grow:0.5, delay:i*0.012});
}
function leafBurst(at, n){ for (let i=0;i<n;i++){ floatSprite(i % 3 ? radialTex('rgba(110,170,70,1)', 'rgba(110,170,70,0)') : emojiTex('🍃'), at.clone().add(V3(rnd(-0.3, 0.3), rnd(0, 0.5), rnd(-0.3, 0.3))),
  {size:i % 3 ? rnd(0.12, 0.22) : rnd(0.25, 0.4), vx:rnd(-3, 3), vz:rnd(-3, 3), vy:rnd(1.5, 4), g:6, max:1.4, grow:0}); } }
function skillStep(dt){
  const k = B.skill; if (!k){ B.mode = 'idle'; return; }
  const face = Math.atan2(k.at.x - pos.x, k.at.z - pos.z);
  root.rotation.y += clamp(wrapA(face - root.rotation.y), -5*dt, 5*dt);
  const prev = k.t; k.t += dt; const T = k.t, at = k.at.clone().setY(gy(k.at.x, k.at.z) + 0.5), col = SKILL_COL[k.type];
  const passed = x => prev < x && T >= x;
  if (prev === 0){   // the cast: a ring in the skill's colour spreads under the wombat, light gathers round it
    shockwave(pos, col, 2.2*petS); sparkles(pos.clone().setY(gy(pos.x, pos.z) + 0.6*petS), 18, 0.9*petS); sfx('charge'); }
  if (T < 0.8 && Math.random() < dt*30) floatSprite(radialTex('rgba(255,230,160,1)', 'rgba(255,230,160,0)'), pos.clone().add(V3(rnd(-1, 1)*petS, rnd(0, 0.4), rnd(-1, 1)*petS)).setY(gy(pos.x, pos.z) + rnd(0.1, 0.4)), {size:0.14, vy:rnd(1, 2.2), max:0.7, grow:0, add:true});
  if (k.type === 'bite'){
    if (T < 0.8) sqv -= dt*0.6;                                                                       // crouch, gathering power
    if (passed(0.8)){ vel.y = 2.4*petS; sfx('whoosh'); const d = V3(k.at.x - pos.x, 0, k.at.z - pos.z); if (d.length() > 0.5) pos.addScaledVector(d.normalize(), 0.4); }   // leap
    if (passed(1.15)){   // CHOMP
      sqv += 1.2; sfx('boom'); setTimeout(() => sfx('crack'), 40); shake = 0.45; shockwave(k.at, '#ffd08a', 3.4); shockwave(k.at, '#ffffff', 2.0);
      for (let i=0;i<10;i++) floatSprite(radialTex('rgba(255,200,120,1)', 'rgba(255,120,40,0)'), at.clone(), {size:rnd(0.3, 0.6), vx:rnd(-4, 4), vz:rnd(-4, 4), vy:rnd(1, 4), max:0.4, grow:1.5, add:true});
      const r = k.g ? Math.max(0.6, k.g.scale.x) : 1; if (k.g) k.g.visible = false; rockBurst(at, r); if (k.done){ k.done(); k.done = null; } }
  } else if (k.type === 'claw'){
    for (const [x, i] of [[0.5, 0], [0.72, 1], [0.94, 2]]) if (passed(x)){ sqv += 0.35; root.rotation.y += i % 2 ? 0.3 : -0.3; sfx('slash');
      slashAt(at.clone().add(V3(0, 0.2, 0)), i % 2 ? 0.7 : -0.7, col, 1.5); leafBurst(at, 6); if (k.g) k.g.rotation.z = (i % 2 ? 0.15 : -0.15); }
    if (passed(1.35)){ sfx('shing'); setTimeout(() => sfx('slash'), 60); shake = 0.2; slashAt(at.clone().add(V3(0, 0.3, 0)), 0.78, '#e9ffd0', 2.4, 0.45); slashAt(at.clone().add(V3(0, 0.3, 0)), -0.78, '#e9ffd0', 2.4, 0.45);   // the big X
      shockwave(k.at, col, 2.6); leafBurst(at, 22); if (k.g) k.g.visible = false; if (k.done){ k.done(); k.done = null; } }
  } else if (k.type === 'gnaw'){
    const tr = trees.find(t_ => Math.abs(t_.g.position.x - k.at.x) < 0.01 && Math.abs(t_.g.position.z - k.at.z) < 0.01);
    if (T > 0.4 && T < 2.0){ if (Math.random() < dt*22) floatSprite(radialTex('rgba(196,150,96,1)', 'rgba(196,150,96,0)'), at.clone().add(V3(0, -0.15, 0)), {size:rnd(0.08, 0.16), vx:rnd(-2.5, 2.5), vz:rnd(-2.5, 2.5), vy:rnd(1.5, 3.5), g:9, max:0.8, grow:0});
      if (Math.floor(T*6) !== Math.floor(prev*6)){ sfx('chip'); sqv += 0.12; if (tr) tr.shake = Math.min(1, 0.3 + (T - 0.4)*0.45); }   // each bite jolts the tree, harder and harder
    }
    if (passed(2.0)){ sfx('crack'); shake = 0.15; shockwave(k.at, col, 2.0); if (k.done){ k.done(); k.done = null; } }
  }
  if (T > (k.type === 'gnaw' ? 2.8 : 2.4)){ B.skill = null; B.mode = 'idle'; B.timer = 2; k.done && k.done(); spawnHearts(1); }
}
function cutTree(tr){
  if (hasSkill('gnaw')){ startSkill('gnaw', tr.g.position, treeReach(tr) + 0.2, () => { if (!tr.cut){ fellTree(tr); addCoins(6, headTop()); } }); return; }   // learned from the beaver: free, and the wood sells
  if (!pay(TREE_PRICE)) return;
  fellTree(tr);
}
function fellTree(tr){
  tr.cut = true; tr.hb.userData.kind = null; S.trees = S.trees.filter(d => d !== tr.d); trees.splice(trees.indexOf(tr), 1); NAV.dirty = true;
  if (B.treeVisit === tr){ B.treeVisit = null; if (B.mode === 'scratch'){ B.mode = 'idle'; B.timer = 1; } }
  const dir = Math.random() < 0.5 ? 1 : -1; sfx('whoosh');
  tools.push({t:0, dur:2.0, update(t){
    tr.g.rotation.z = dir*ease(Math.min(1, t/1.1))*1.45;
    if (t > 1.1 && !this.thud){ this.thud = true; sfx('thud'); sfx('boom'); shake = 0.3; leafFall(tr, 14); dust(tr.g.position.x + dir*1.6, tr.g.position.z, 10, 1.4); sqv += 0.6; }
    if (t > 1.4){ const k = Math.max(0.01, 1 - (t - 1.4)/0.6); tr.g.scale.setScalar(tr.d.s*k); tr.sh.g.scale.setScalar(k); }
  }, done(){ scene.remove(tr.g, tr.sh.g); }});
  toast('樹砍掉了。'); track('tree'); track('clear'); koalaPerches(); wildPlaces(); save();
}

// ---------- expanding the territory: clearing plots, rocks and bushes, building bridges ----------
const FEAT_PRICE = {bush:10, small:15, mid:30, big:50}, BRIDGE_PRICE = 80;
function dust(x, z, n, spread){ for (let i=0;i<n;i++){ const px = x + rnd(-spread, spread), pz = z + rnd(-spread, spread);
  floatSprite(radialTex('rgba(214,196,160,0.85)','rgba(214,196,160,0)'), V3(px, gy(px, pz) + 0.3, pz), {size:rnd(0.8,1.6), vy:rnd(0.3,0.9), vx:rnd(-0.4,0.4), max:1.6, grow:1.2, delay:Math.random()*0.6}); } }
function plotMenu(k){
  if (world.isOpenKey(k)) return;
  const name = world.plotName(k), price = world.price();
  if (!world.canOpen(k)){ showModal(name, `<div class="bigicon">🌲</div><p>這塊地被樹叢和石頭擋住，離你的領地太遠了。先把旁邊相連的土地整理好，才能一路打通過來。</p>`, [{label:'好', onClick:()=>{}}]); return; }
  showModal(`整理${name}？`, `<div class="bigicon">🪓</div><p>這塊 18 × 18 格的土地長滿了樹叢、灌木和石頭。花 <b>${price} 代幣</b>請人整理乾淨，打通以後${S.name || '袋熊'}就能過去玩，也能在上面蓋東西。</p><p class="note">整理後還會留下一些樹和石頭，之後可以再一個一個清掉。每多開拓一塊，下一塊會貴一點。</p>`,
    [{label:'再想想', ghost:true, onClick:()=>{}}, {label:`整理（${price}）`, onClick:() => openPlot(k)}]);
}
function openPlot(k){
  const price = world.price(); if (!pay(price)) return;
  const [a, b] = k.split(',').map(Number), cx = a*PLOT, cz = b*PLOT;
  world.openPlot(k);
  S.trees.filter(d => d.p === k).forEach(d => { const tr = makeTree(d); tr.g.scale.setScalar(0.01); tools.push({t:0, dur:0.8, update(t){ tr.g.scale.setScalar(Math.max(0.01, d.s*Math.min(1, t/0.6))); }, done(){ tr.g.scale.setScalar(d.s); }}); });
  dust(cx, cz, 26, 8); sfx('whoosh'); setTimeout(() => sfx('grow'), 600); koalaPerches(); wildPlaces();
  NAV.dirty = true; panTarget.set(cx*0.6, 0, cz*0.6); clampPan(); setupBeach();
  toast(`${world.plotName(k)}整理好了！領地變大了。`); save(); hudDirty = true;
}
function featMenu(f){
  const d = f.d, rock = d.k === 'rock', size = rock ? world.rockSize(d) : 'bush', free = hasSkill(rock ? 'rock' : 'bush'), price = free ? 0 : FEAT_PRICE[size];
  const name = rock ? {big:'大石頭', mid:'石頭', small:'小石頭'}[size] : '樹叢';
  showModal(name, `<div class="bigicon">${rock ? '🪨' : '🌳'}</div><p>${rock ? (size === 'big' ? `比${S.name || '袋熊'}還大的石頭，擋住了路。` : '路邊的石頭。') : '一叢矮矮的灌木。'}花 ${price} 代幣可以${rock ? '請人搬走' : '清掉'}，空出位置蓋東西。</p>`,
    [{label:'關閉', ghost:true, onClick:()=>{}}, {label:free ? `讓${S.name || '袋熊'}${rock ? '咬碎' : '清掉'}（免費）` : `${rock ? '搬走' : '清掉'}（${price}）`, onClick:() => {
      if (!world.feats.includes(f) || (price && !pay(price))) return;
      const clear = () => { if (!world.feats.includes(f)) return; dust(d.x, d.z, rock ? 10 : 6, d.s*0.6); sfx(rock ? 'thud' : 'whoosh'); world.removeFeat(f); track(rock ? 'rock' : 'bush'); track('clear'); wildPlaces();
        if (!rock) leafFall({g:f.g, d:{s:1}}, 6); toast(`${name}清掉了。`); save(); };
      if (free) startSkill(rock ? 'bite' : 'claw', f.g.position, world.featR(d) + 0.9*Math.max(petS, 0.5) + 0.2, clear, f.g); else clear(); }}]);
}
function bridgeObjMenu(b){
  showModal('木頭拱橋', `<div class="bigicon">🌉</div><p>可以把橋移到河的其他地方（免費），或拆掉退回 ${BRIDGE_PRICE} 代幣。</p>`,
    [{label:'關閉', ghost:true, onClick:()=>{}}, {label:'移動', ghost:true, onClick:() => setTimeout(() => moveBridge(b), 50)},
     {label:`拆掉（退回 ${BRIDGE_PRICE}）`, ghost:true, onClick:() => {
       if (onBridge(b)){ toast(`${S.name || '牠'}正站在橋上，等牠下來再拆。`); return; }
       dust(b.x, b.z, 16, 2.5); sfx('whoosh'); world.removeBridge(b); NAV.dirty = true; S.coins += BRIDGE_PRICE; sfx('coin'); hudDirty = true;
       toast(`橋拆掉了，退回 ${BRIDGE_PRICE} 代幣。`); save(); }}]);
}
const onBridge = b => { const dx = pos.x - b.x, dz = pos.z - b.z; return Math.abs(dx*b.ax + dz*b.az) < b.len/2 + 0.3 && Math.abs(-dx*b.az + dz*b.ax) < world.BRIDGE_W/2 + 0.3; };
function moveBridge(b){
  if (placing) return;
  if (onBridge(b)){ toast(`${S.name || '牠'}正站在橋上，等牠下來再移動。`); return; }
  const oldZ = b.z; world.removeBridge(b); NAV.dirty = true;
  bridgeMenu(V3(world.riverX(oldZ), 0, oldZ), {moving:oldZ});
}
// Tapping the river starts placing a bridge: a see-through preview follows your finger along the river; 確定 builds it there.
function bridgeMenu(p, opt = {}){
  if (!p || placing) return;
  if (!world.isOpen(p.x, p.z)){ plotMenu(plotKey(p.x, p.z)); return; }
  if (opt.moving === undefined && S.coins < BRIDGE_PRICE){ toast(`蓋橋要 ${BRIDGE_PRICE} 代幣。`); return; }
  closeSheet(); $('#modal').hidden = true;
  placing = {bridge:true, z:p.z, mesh:null, cam:{yaw, pitch, zoom}, b:{name:'木頭拱橋', price:BRIDGE_PRICE}, isNew:true, movingFrom:opt.moving};
  document.body.classList.add('placing'); $('#placeBar').hidden = false; $('#placeRot').hidden = true;
  $('#placeName').textContent = opt.moving !== undefined ? '移動木頭拱橋（免費）' : `蓋木頭拱橋（${BRIDGE_PRICE} 代幣）`; $('#placeView').textContent = S.buildView === 'iso' ? '視角：45 度' : '視角：俯視';
  updateBridgeGhost();
}
function updateBridgeGhost(){
  const P = placing; if (P.mesh) scene.remove(P.mesh);
  P.mesh = world.bridgeGhost(P.z); const why = world.bridgeWhy(P.z); P.ok = !why;
  P.mesh.traverse(o => { if (o.isMesh){ o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.6; o.material.color.lerp(new THREE.Color(P.ok ? '#7be38a' : '#ef6a5e'), 0.45); } });
  scene.add(P.mesh); panTarget.set(P.mesh.position.x, 0, P.z);
  $('#placeHint').textContent = P.ok ? '沿著河拖曳，選好位置按「確定」。' : why; $('#placeOk').disabled = !P.ok;
}
function commitBridge(){
  const P = placing; if (!P.ok) return;
  if (P.movingFrom === undefined && !pay(BRIDGE_PRICE)){ cancelPlace(); return; }
  scene.remove(P.mesh); const b = world.addBridge(P.z); P.mesh = b.g;
  weeds.filter(w => overBridge(w.g.position.x, w.g.position.z)).forEach(w => { weeds.splice(weeds.indexOf(w), 1); scene.remove(w.g); });   // the deck covers whatever was there
  b.g.scale.set(0.01, 0.01, 0.01); tools.push({t:0, dur:0.9, update(t){ const k = ease(Math.min(1, t/0.8)); b.g.scale.set(1, Math.max(0.01, k), 1); }, done(){ b.g.scale.set(1, 1, 1); }});
  dust(b.x, b.z, 14, 2.5); sfx('grow'); NAV.dirty = true; if (P.movingFrom !== undefined) toast('橋搬好了。'); else { toast('橋蓋好了！袋熊可以過河了。'); track('bridge'); }
  $('#placeRot').hidden = false; endPlace();
}

// ---------- the beach: crabs, hermit crabs, shells to pick up and the odd message in a bottle ----------
const crabs = [], shells = [], beachHit = [];
let bottle = null, bottleT = rnd(60, 150), shellT = 20;
const beachSpot = (open, wet) => { for (let i=0;i<30;i++){ const z = rnd(Z0 + 1, Z1 - 1), sx = world.shoreX(z), x = wet ? sx + rnd(1.4, 2.0) : rnd(sx - 4.5, sx + 1.3);
  if (world.isWater(x, z) && !wet) continue; if (open && !world.isOpen(x, z)) continue; return V3(x, 0, z); } return null; };
function makeCrab(hermit){
  const g = new THREE.Group(), legs = [];
  if (hermit){
    const shell = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 10), mat(['#e9c9a8','#d8a87e','#f0dcc8'][Math.floor(Math.random()*3)], 0.6)); shell.rotation.x = -1.2; shell.position.set(0, 0.14, -0.05); g.add(shell);
    const swirl = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, 6, 14), mat('#c49270', 0.6)); swirl.position.set(0, 0.16, 0.08); g.add(swirl);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), mat('#e07a4f', 0.5)); body.position.set(0, 0.07, 0.13); g.add(body); g.userData.body = body;
  } else {
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), mat('#d9573f', 0.45)); body.scale.set(0.17, 0.08, 0.13); body.position.y = 0.09; g.add(body);
    for (const s of [-1, 1]){ const claw = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), body.material); claw.scale.set(1, 0.7, 1.3); claw.position.set(0.12*s, 0.09, 0.16); g.add(claw);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), mat('#1b1b1b', 0.3)); eye.position.set(0.04*s, 0.2, 0.09); g.add(eye); }
  }
  const rc = realClone(hermit ? 'hermit' : 'crab');   // the realistic rigged crab / hermit crab replace the round ones
  if (rc){ g.clear(); g.add(rc); g.userData.rig = rc.userData; }
  for (let i=0;i<(rc ? 0 : 6);i++){ const s = i < 3 ? 1 : -1, l = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 4), mat(hermit ? '#e07a4f' : '#c44a36', 0.5));
    l.position.set(0.13*s, 0.05, ((i % 3) - 1)*0.06 + (hermit ? 0.1 : 0)); l.rotation.z = s*1.1; g.add(l); legs.push(l); }
  const p = beachSpot(false) || V3(world.shoreX(0) - 2, 0, 0); g.position.copy(p); g.scale.setScalar(hermit ? 1.2 : 1.3); scene.add(g);
  const hb = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), hbMat); hb.position.y = 0.1; hb.userData.kind = 'crab'; g.add(hb);
  const c = {g, legs, hermit, tgt:p.clone(), wait:rnd(0, 3), hide:0, hb}; hb.userData.ref = c; crabs.push(c); beachHit.push(hb); return c;
}
const SHELL_KINDS = [['#f6d7c8', 'fan'], ['#fbeee0', 'conch'], ['#e8b4b8', 'fan'], ['#f3e3b5', 'spiral'], ['#d9e4f0', 'fan']];
function makeShell(p){
  const [c, kind] = SHELL_KINDS[Math.floor(Math.random()*SHELL_KINDS.length)], g = new THREE.Group(), m = mat(c, 0.5);
  if (kind === 'fan'){ const s = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 6, 0, Math.PI*2, 0, Math.PI/2), m); s.scale.set(1, 0.35, 0.9); g.add(s);
    for (let i=0;i<5;i++){ const r = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.03, 0.13), mat('#ffffff', 0.5)); r.rotation.y = (i - 2)*0.32; r.position.set(Math.sin((i - 2)*0.32)*0.06, 0.03, Math.cos((i - 2)*0.32)*0.06); g.add(r); } }
  else if (kind === 'conch'){ const s = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.24, 9), m); s.rotation.z = Math.PI/2; s.position.y = 0.05; g.add(s); }
  else { const s = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.035, 8, 16), m); s.rotation.x = Math.PI/2; s.position.y = 0.03; g.add(s); }
  g.position.set(p.x, gy(p.x, p.z) + 0.01, p.z); g.rotation.y = Math.random()*6.28; g.scale.setScalar(1.9); scene.add(g);
  const hb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), hbMat); hb.userData.kind = 'shell'; g.add(hb);
  const s = {g, hb}; hb.userData.ref = s; shells.push(s); beachHit.push(hb); return s;
}
function makeBottle(p){
  const g = new THREE.Group(), glass = new THREE.MeshStandardMaterial({color:'#8fd0b8', roughness:0.1, transparent:true, opacity:0.7});
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.32, 12), glass); body.rotation.z = Math.PI/2; g.add(body);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.06, 0.12, 10), glass); neck.rotation.z = Math.PI/2; neck.position.x = 0.22; g.add(neck);
  const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.06, 8), mat('#b98b5a', 0.9)); cork.rotation.z = Math.PI/2; cork.position.x = 0.3; g.add(cork);
  const paper = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.2, 8), mat('#f4ead2', 0.8)); paper.rotation.z = Math.PI/2; g.add(paper);
  g.position.set(p.x, WATER_Y, p.z); g.rotation.y = Math.random()*6.28; g.scale.setScalar(1.4); scene.add(g);
  const hb = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), hbMat); hb.userData.kind = 'bottle'; g.add(hb);
  const b = {g, hb, t:0, from:p.clone().setX(p.x + 6), to:p.clone()}; hb.userData.ref = b; beachHit.push(hb); return b;
}
const beachPick = () => beachHit;
function setupBeach(){
  while (crabs.length < 6) makeCrab(crabs.length >= 4);
  const openBeach = !!beachSpot(true);
  while (openBeach && shells.length < 7){ const p = beachSpot(true); if (!p) break; makeShell(p); }
}
const LETTERS = ['「給撿到這封信的人：今天的海很藍，希望你也有好心情。」', '「我是住在海的另一邊的海獺，我很好，你呢？」', '「把願望寫在紙上放進瓶子裡，就會實現喔。」',
  '「祝你和你的袋熊每天都吃得飽、睡得好。」', '「這是一張藏寶圖……好像被水泡糊了。」', '「謝謝你撿起這個瓶子，海灘又乾淨一點了！」', '「月亮圓的晚上，記得抬頭看看。」'];
function openBottle(b){
  if (!b || b !== bottle) return;
  const coins = Math.random() < 0.65 ? 3 + Math.floor(Math.random()*13) : 0, at = b.g.position.clone().add(V3(0, 0.6, 0));
  scene.remove(b.g); beachHit.splice(beachHit.indexOf(b.hb), 1); bottle = null; bottleT = rnd(240, 540); sfx('pop'); track('bottle');
  showModal('瓶中信', `<div class="bigicon">🍾</div><p>${LETTERS[Math.floor(Math.random()*LETTERS.length)]}</p><p>${coins ? `瓶子裡還有 <b>${coins} 代幣</b>！` : '瓶子裡只有這封信。'}</p>`, [{label:'收下', onClick:() => { if (coins) addCoins(coins, at); save(); }}]);
}
function pickShell(s){
  if (!shells.includes(s)) return;
  shells.splice(shells.indexOf(s), 1); beachHit.splice(beachHit.indexOf(s.hb), 1); const at = s.g.position.clone();
  tools.push({t:0, dur:0.5, update(t){ s.g.position.y = at.y + t*1.5; s.g.scale.setScalar(Math.max(0.01, 1 - t*1.6)); }, done(){ scene.remove(s.g); }});
  addCoins(1, at.add(V3(0, 0.5, 0))); S.shells = (S.shells || 0) + 1; track('shell');
  if (S.shells === 1 || S.shells % 10 === 0) toast(`撿到貝殼了！目前一共撿了 ${S.shells} 個。`);
}
let wetUntil = 0;
const ANIMAL_ICON = {fox:'🦊', donkey:'🫏', crane:'🦩', monkey:'🐒', cicada:'🪰', mantis:'🦗', longhorn:'🪲', grasshopper:'🦗', cricket:'🦗', horse:'🐎', tiger:'🐅', hippo:'🦛', capybara:'🐹', tortoise:'🐢', snake:'🐍', peacock:'🦚', rabbit:'🐇', beetle:'🪲', worm:'🪱', fish:'🐟', deer:'🦌', moose:'🫎', wolf:'🐺', gull:'🐦', dolphin:'🐬', whale:'🐋', owl:'🦉', eagle:'🦅', lizard:'🦎', seafish:'🐠', frog:'🐸', dragonfly:'🪰', turtle:'🐢', croc:'🐊', heron:'🪿', beaver:'🦫', kangaroo:'🦘', quokka:'😊', emu:'🦤', koala:'🐨', crab:'🦀'};
function pokeAnimal(a){
  const k = (a.kind in WILD_NAMES ? wild : fauna).poke(a), first = !stat('meet:' + k);
  track('meet:' + k); if (!a.tappedOnce){ a.tappedOnce = true; track('meetU:' + k); learnSkills(k); }   // different animals of a kind (for skills) floatSprite(emojiTex(ANIMAL_ICON[k] || '❗'), a.g.position.clone().add(V3(0, 1.4, 0)), {size:0.55, vy:0.6, max:1.4});
  if (first) toast(`遇見了${SPECIES[k] || WILD_NAMES[k]}！`);
}
let scareCd = 0;
function animalScare(kind){   // a crocodile snapping near the wombat makes it jump back
  if (!petActive() || scareCd > performance.now()) return; scareCd = performance.now() + 6000;
  showEmote('😱', 1.6); cry('sad'); vel.y = 2.6*petS + 1; sqv += 2;
  const who = {croc:'鱷魚張大嘴巴', tiger:'老虎低吼了一聲', hippo:'河馬張開大嘴'}[kind] || '';
  if (who && !(S.toldScare || {})[kind]){ S.toldScare = {...(S.toldScare || {}), [kind]:1}; toast(`${who}！${S.name || '牠'}嚇了一大跳。`); }
}
function pokeCrab(c){ c.hide = c.hermit ? 3 : 0; if (!c.hermit){ const a = Math.random()*6.28; c.tgt.set(c.g.position.x + Math.sin(a)*2.5, 0, c.g.position.z + Math.cos(a)*2.5); c.wait = 0; } sfx('pop'); }
// ---------- out at sea: a fisherman in a canoe now and then, and a yacht passing far off that sounds its horn ----------
const boats = {canoe:null, canoeT:rnd(60, 180), yacht:null, yachtT:rnd(90, 240)};
// the fisherman's rowing boat (blender/boat_build.py): a real wooden rowboat, the old fisherman jointed from hips to fingers, two oars
// on their oarlocks. He rows out bow first with his back to the way he goes, ships the oars and fishes, then rows home.
function makeCanoe(){
  const g = realClone('fishboat'); if (!g) return null;
  let tip = null; g.traverse(o => { if (o.isBone && o.name === 'rodtip') tip = o;
    if (o.isMesh && o.material.name === 'Cap'){ o.material = new THREE.MeshBasicMaterial({colorWrite:false, transparent:true}); o.renderOrder = -1; } });   // depth only: hides the sea inside the hull
  const lineGeo = new THREE.BufferGeometry().setFromPoints([V3(), V3()]), line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({color:'#f4f4f0'})); scene.add(line);
  const bob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), mat('#e0483a', 0.4)); scene.add(bob);
  scene.add(g); return {g, tip, line, bob, t:0, catchT:rnd(8, 20), lookT:rnd(6, 14)};
}
function makeYacht(){
  const r = realClone('yacht');   // the realistic motor yacht (blender/yacht_build.py: built at game size, origin on the waterline)
  if (r){ scene.add(r); return {g:r, t:0, honked:0, real:true}; }
  const g = new THREE.Group(), white = mat('#f4f4f0', 0.5), glass = mat('#3d5a73', 0.2), stripe = mat('#2f5f9e', 0.5);
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.7, 1.2, 4, 1), white); hull.rotation.y = Math.PI/4; hull.scale.set(1.3, 1, 4.2); hull.position.y = 0.3; g.add(hull);
  const bow = new THREE.Mesh(new THREE.ConeGeometry(1.0, 2.6, 4), white); bow.rotation.set(Math.PI/2, Math.PI/4, 0); bow.scale.set(1.25, 1, 0.45); bow.position.set(0, 0.45, 4.6); g.add(bow);
  const band = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.14, 7.2), stripe); band.position.set(0, 0.55, 0.2); g.add(band);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 3.4), white); cabin.position.set(0, 1.35, -0.6); g.add(cabin);
  const win = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.3, 3.0), glass); win.position.set(0, 1.45, -0.5); g.add(win);
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 1.8), white); top.position.set(0, 2.05, -0.9); g.add(top);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6), white); mast.position.set(0, 2.9, -1.1); g.add(mast);
  g.scale.setScalar(1.6); scene.add(g); return {g, t:0, honked:0};
}
// a flock of flamingos flies over now and then, in a loose V, calling
const flock = {birds:null, t:0, wait:rnd(60, 160)};
function updateFlock(dt){
  if (!flock.birds){ flock.wait -= dt; if (flock.wait > 0 || !REAL.flamingo) return;
    const a = rnd(0, 6.28), dir = V3(Math.sin(a), 0, Math.cos(a)), mid = V3(camTarget.x + rnd(-15, 15), 0, camTarget.z + rnd(-15, 15)), side = V3(dir.z, 0, -dir.x);
    flock.birds = []; flock.t = 0; flock.dir = dir; flock.start = mid.clone().addScaledVector(dir, -70); flock.h = rnd(4.2, 5.8);   // (the camera looks down from about 11 up: lower than that or they fly out of sight)
    for (let i=0, n = 5 + Math.floor(Math.random()*4); i<n; i++){ const g = realClone('flamingo'); if (!g) break; const row = Math.ceil(i/2), sgn = i % 2 ? 1 : -1;
      g.scale.setScalar(rnd(0.9, 1.1)); scene.add(g); flock.birds.push({g, off:side.clone().multiplyScalar(sgn*row*2.4).addScaledVector(dir, -row*2.2).add(V3(0, rnd(-0.6, 0.6), 0)), ph:rnd(0, 3), glide:0}); }
    sfx('flamingo', mid); return; }
  flock.t += dt; const along = flock.t*7.5, base = flock.start.clone().addScaledVector(flock.dir, along);
  for (const b of flock.birds){ const p = base.clone().add(b.off); b.g.position.set(p.x, flock.h + b.off.y + Math.sin(flock.t*0.8 + b.ph)*0.4, p.z); b.g.rotation.y = Math.atan2(flock.dir.x, flock.dir.z);
    b.glide -= dt; if (b.glide < -rnd(3, 6)) b.glide = rnd(1.5, 3);   // flap a while, then glide a while
    playRig(b.g.userData, b.glide > 0 ? 'glide' : 'fly', 1); b.g.userData.mixer.update(dt); }
  if (Math.random() < dt*0.08) sfx('flamingo', base);
  if (along > 140){ flock.birds.forEach(b => scene.remove(b.g)); flock.birds = null; flock.wait = rnd(150, 400); }
}
function updateBoats(dt, t){
  updateFlock(dt);
  const sea = z => world.shoreX(z), cz = (Z0 + Z1)/2;
  // the boat rows out, the man ships his oars and fishes (now and then a bite and a fish), then turns and rows away
  if (!boats.canoe){ boats.canoeT -= dt; if (boats.canoeT <= 0){ const z = rnd(Z0 + 10, Z1 - 10), c = makeCanoe(); if (!c){ boats.canoeT = 30; } else { c.spot = V3(sea(z) + rnd(7.5, 11), WATER_Y, z); c.from = c.spot.clone().add(V3(30, 0, rnd(-10, 10))); c.stay = rnd(80, 160); c.g.position.copy(c.from); c.g.rotation.y = Math.atan2(c.spot.x - c.from.x, c.spot.z - c.from.z); boats.canoe = c; } } }
  else { const c = boats.canoe, rg = c.g.userData; c.t += dt; const T = c.t, IN = 22, p = c.g.position;
    const u = T < IN ? T/IN : T < IN + c.stay ? 1 : 1 - (T - IN - c.stay)/IN, k = u*u*(3 - 2*u);
    p.lerpVectors(c.from, c.spot, k); p.y = WATER_Y - 0.28 + Math.sin(t*1.3 + p.z)*0.04;   // sits about a third of its depth in the water
    const out = Math.atan2(c.spot.x - c.from.x, c.spot.z - c.from.z), home = out + Math.PI;   // bow first both ways (a rower faces the stern)
    let yaw = out; if (T > IN) yaw = out + 1.3*Math.min(1, (T - IN)/5); if (T > IN + c.stay) yaw = out + 1.3 + (Math.PI - 1.3)*Math.min(1, (T - IN - c.stay)/5);
    c.g.rotation.set(Math.sin(t*1.1)*0.03, yaw, Math.sin(t*0.9)*0.04);
    const rowing = T < IN || T > IN + c.stay, fishing = !rowing;
    if (rowing) playRig(rg, 'row', 1);
    else { c.catchT -= dt; c.lookT -= dt;
      if (c.catchT < 0 && c.catchT > -1.6) playRig(rg, 'strike', 1);
      else if (c.lookT < 0 && c.lookT > -5) playRig(rg, 'look', 1);
      else playRig(rg, 'fish', 1);
      if (c.lookT < -5) c.lookT = rnd(10, 20);
      if (c.catchT < -1.6){ c.catchT = rnd(10, 25); if (Math.random() < 0.6){ floatSprite(emojiTex('🐟'), c.bob.position.clone().add(V3(0, 0.4, 0)), {size:0.7, vy:2.2, g:4, max:1.4}); sfx('splash', c.bob.position); } } }
    rg.mixer.update(dt);
    c.line.visible = c.bob.visible = fishing && !!c.tip;
    if (fishing && c.tip){ c.g.updateMatrixWorld(true); const tip = c.tip.getWorldPosition(V3()), away = tip.clone().sub(p).setY(0).normalize();
      const bob = tip.clone().addScaledVector(away, 1.1).setY(WATER_Y + Math.sin(t*2)*0.03); if (c.catchT < 0) bob.y -= 0.12*Math.abs(Math.sin(t*9));
      c.bob.position.copy(bob); const a = c.line.geometry.attributes.position; a.setXYZ(0, tip.x, tip.y, tip.z); a.setXYZ(1, bob.x, bob.y, bob.z); a.needsUpdate = true; }
    if (T > IN*2 + c.stay){ scene.remove(c.g, c.line, c.bob); boats.canoe = null; boats.canoeT = rnd(180, 420); } }
  // the yacht crosses far out, sounding its horn as it passes
  if (!boats.yacht){ boats.yachtT -= dt; if (boats.yachtT <= 0){ const y = makeYacht(), dir = Math.random() < 0.5 ? 1 : -1; y.dir = dir; y.x = sea(cz) + rnd(24, 30); y.z0 = cz - dir*(PLOT*2.6); boats.yacht = y; } }
  else { const y = boats.yacht; y.t += dt; const z = y.z0 + y.dir*y.t*3.2, p = y.g.position;
    p.set(y.x, WATER_Y - (y.real ? 0 : 0.15) + Math.sin(t*0.8)*0.06, z); y.g.rotation.set(Math.sin(t*0.6)*0.02, y.dir > 0 ? 0 : Math.PI, Math.sin(t*0.7)*0.03);
    if (y.honked < 2 && Math.abs(z - camTarget.z) < (y.honked ? 12 : 26) && y.t > (y.honked ? y.hT + 6 : 0)){ y.honked++; y.hT = y.t; sfx('horn', V3(world.shoreX(z), 0, z)); }
    if (y.t*3.2 > PLOT*5.2){ scene.remove(y.g); boats.yacht = null; boats.yachtT = rnd(240, 600); } }
}
// ---------- two stretches of beach with their own residents: sea turtles to the north, a penguin colony to the south ----------
const BEACH_LIFE = [];
function playRig(rg, name, ts = 1){
  if (rg.cur !== name && rg.clips[name]){ const a = rg.mixer.clipAction(rg.clips[name]); a.reset().fadeIn(0.25).play(); if (rg.act) rg.act.fadeOut(0.25); rg.act = a; rg.cur = name; }
  if (rg.act) rg.act.timeScale = ts;
}
const BEACH_NAMES = {seaturtle:'赤蠵龜（海龜）', penguin:'企鵝', fiddler:'招潮蟹', mudskipper:'彈塗魚'};
function pokeBeachLife(o){   // tap: the penguin squawks and pecks, the turtle heads back to the sea
  const first = !stat('meet:' + o.kind); track('meet:' + o.kind); if (first) toast(`遇見了${BEACH_NAMES[o.kind]}！`);
  floatSprite(emojiTex({penguin:'🐧', seaturtle:'🐢', fiddler:'🦀', mudskipper:'🐟'}[o.kind]), o.g.position.clone().add(V3(0, 1.2, 0)), {size:0.55, vy:0.6, max:1.4});
  if (o.kind === 'penguin'){ o.state = 'peck'; o.timer = 2; o.dest = null; sfx('penguin', o.g.position); }
  else if (o.kind === 'fiddler') o.hide = 3;   // down its burrow
  else if (o.kind === 'mudskipper'){ o.state = 'display'; o.timer = 2.5; o.dest = null; }   // fins up
  else if (o.state !== 'swim'){ o.state = 'toSea'; o.dest = V3(world.shoreX(o.g.position.z) + 4, 0, o.g.position.z); }
}
function setupBeachLife(){
  if (BEACH_LIFE.length) return;
  const zr = b => [b*PLOT - PLOT*0.4, b*PLOT + PLOT*0.4];
  const add = (kind, n, b, sc) => { for (let i=0;i<n;i++){ const g = realClone(kind); if (!g) return; const [z0, z1] = zr(b), z = rnd(z0, z1);
    g.scale.setScalar(sc*rnd(0.9, 1.1)); g.position.set(world.shoreX(z) + (kind === 'seaturtle' ? rnd(1.5, 5) : -rnd(1, 4)), 0, z); scene.add(g);
    const hb = new THREE.Mesh(new THREE.SphereGeometry(kind === 'seaturtle' ? 0.7 : 0.45, 8, 6), hbMat); hb.position.y = 0.3; hb.userData.kind = 'beachlife'; g.add(hb);
    const o = {kind, g, rg:g.userData, zr:[z0, z1], state:kind === 'seaturtle' ? 'swim' : 'idle', t:rnd(0, 9), timer:rnd(2, 8), dest:null, hb}; hb.userData.ref = o; beachHit.push(hb); BEACH_LIFE.push(o); } };
  add('seaturtle', 2, -1, 1); add('penguin', 5, 1, 1); add('fiddler', 9, 0, 1); add('mudskipper', 7, 0, 1);
  { const [z0, z1] = zr(0); for (let i=0;i<16;i++){ const g = realClone('mangrove'); if (!g) break; const z = z0 + (i + Math.random()*0.8)*(z1 - z0)/16, x = world.shoreX(z) + rnd(-2.5, 3.5);   // the mangroves stand along the tide line
    g.scale.setScalar(rnd(0.7, 1.15)); g.rotation.y = rnd(0, 6.28); g.position.set(x, Math.min(gy(x, z), WATER_Y) - 0.15, z); scene.add(g); } }
}
function updateBeachLife(dt, t){
  for (const o of BEACH_LIFE){
    const p = o.g.position, sx = world.shoreX(p.z), wet = p.x > sx + 0.6, camD = Math.hypot(p.x - camTarget.x, p.z - camTarget.z);
    o.g.visible = camD < 70; if (!o.g.visible) continue;
    o.t += dt; o.timer -= dt;
    const near = petActive() && root.visible && Math.hypot(p.x - pos.x, p.z - pos.z) < 3.2;
    const zIn = z => clamp(z, o.zr[0], o.zr[1]);
    if (o.kind === 'seaturtle'){   // swims the shallows; now and then hauls out on the sand to rest; back to the sea if disturbed
      if (near && o.state !== 'swim'){ o.state = 'toSea'; o.dest = V3(sx + 4, 0, p.z); }
      if (o.timer <= 0){ o.timer = rnd(10, 25);
        if (o.state === 'swim'){ if (Math.random() < 0.4){ o.state = 'crawl'; const z = zIn(p.z + rnd(-3, 3)); o.dest = V3(world.shoreX(z) - rnd(1.5, 3.5), 0, z); } else { const z = zIn(p.z + rnd(-6, 6)); o.dest = V3(world.shoreX(z) + rnd(1.5, 6), 0, z); } }
        else if (o.state === 'rest'){ o.state = 'toSea'; o.dest = V3(sx + 4, 0, p.z); } }
      if (o.dest){ const d = V3(o.dest.x - p.x, 0, o.dest.z - p.z), L = d.length(), sp = wet ? 0.9 : 0.25;
        if (L > 0.2){ p.addScaledVector(d.normalize(), Math.min(L, sp*dt)); o.g.rotation.y += clamp(wrapA(Math.atan2(d.x, d.z) - o.g.rotation.y), -1.5*dt, 1.5*dt); }
        else { o.dest = null; if (o.state === 'crawl'){ o.state = 'rest'; o.timer = rnd(15, 35); } else if (o.state === 'toSea') o.state = 'swim'; } }
      playRig(o.rg, wet ? 'swim' : o.state === 'rest' ? 'rest' : 'crawl', wet ? 0.8 : 1);   // swims in the sea; on the sand it crawls on its flippers
      p.y = wet ? WATER_Y - 0.12 + Math.sin(o.t*1.4)*0.03 : gy(p.x, p.z) + 0.02;
    } else if (o.kind === 'penguin'){   // penguins: waddle about together and peck at the sand; to feed they walk into the sea, swim out and dive for fish
      if (o.timer <= 0){ o.timer = rnd(4, 9); const r_ = Math.random();
        if (o.state === 'swim'){ if (Math.random() < 0.6){ o.state = 'dive'; o.diveT = 0; o.dest = null; o.timer = 2.2; } else { o.state = 'home'; const z = zIn(p.z + rnd(-3, 3)); o.dest = V3(world.shoreX(z) - rnd(1, 4), 0, z); } }
        else if (o.state === 'dive'){ o.state = 'swim'; o.timer = rnd(3, 7); const z = zIn(p.z + rnd(-4, 4)); o.dest = V3(world.shoreX(z) + rnd(3, 8), 0, z); }
        else if (o.state === 'home'){ o.timer = 1; }
        else if (r_ < 0.25){ o.state = 'fish'; const z = zIn(p.z + rnd(-2, 2)); o.dest = V3(world.shoreX(z) + rnd(3.5, 7), 0, z); }   // off to fish
        else if (r_ < 0.55){ o.state = 'walk'; const z = zIn(p.z + rnd(-4, 4)); o.dest = V3(world.shoreX(z) - rnd(0.8, 4.5), 0, z); }
        else if (r_ < 0.78){ o.state = 'peck'; o.dest = null; } else { o.state = 'idle'; o.dest = null; } }
      if (near && !wet && !o.scared){ o.scared = true; o.state = 'walk'; o.dest = p.clone().addScaledVector(V3(p.x - pos.x, 0, p.z - pos.z).normalize(), 2.5); o.dest.z = zIn(o.dest.z); sfx('penguin', p); setTimeout(() => o.scared = false, 6000); }
      if (o.state === 'dive'){   // under and up again with a fish, swallowed at the surface
        o.diveT += dt; if (o.diveT > 1.0 && !o.caught){ o.caught = true; if (Math.random() < 0.7){ floatSprite(emojiTex('🐟'), p.clone().add(V3(0, 0.6, 0)), {size:0.45, vy:0.8, max:0.9}); sfx('splash', p); } } }
      else o.caught = false;
      if (o.dest){ const d = V3(o.dest.x - p.x, 0, o.dest.z - p.z), L = d.length(), sp = wet ? 1.8 : 0.6;
        if (L > 0.15){ p.addScaledVector(d.normalize(), Math.min(L, sp*dt)); o.g.rotation.y += clamp(wrapA(Math.atan2(d.x, d.z) - o.g.rotation.y), -4*dt, 4*dt); }
        else { o.dest = null; if (o.state === 'fish'){ o.state = 'swim'; o.timer = rnd(2, 5); } else if (o.state === 'walk' || o.state === 'home'){ o.state = 'idle'; o.timer = rnd(2, 6); } } }
      const deep = wet && p.x > world.shoreX(p.z) + 1.6;   // wading in the shallows it still walks; out of its depth it swims
      playRig(o.rg, o.state === 'dive' ? 'dive' : deep ? 'swim' : o.state === 'peck' ? 'peck' : o.dest ? 'walk' : 'idle');
      p.y = deep ? WATER_Y - 0.28 - (o.state === 'dive' ? 0.5*Math.sin(Math.min(1, o.diveT/1.6)*Math.PI) : 0) + Math.sin(o.t*2)*0.02 : Math.max(gy(p.x, p.z), WATER_Y - 0.45);
      if (Math.random() < dt*0.01) sfx('penguin', p);
    } else if (o.kind === 'fiddler'){   // fiddler crabs: wave the big claw by their burrow, scuttle sideways a little, pop down the burrow when the wombat comes
      if (near) o.hide = 4;
      if (o.hide > 0){ o.hide -= dt; o.g.visible = false; o.rg.mixer.update(dt); continue; }
      if (o.timer <= 0){ o.timer = rnd(3, 8); if (Math.random() < 0.4){ const z = zIn(p.z + rnd(-1.5, 1.5)); o.dest = V3(world.shoreX(z) - rnd(0.3, 3), 0, z); } }
      if (o.dest){ const d = V3(o.dest.x - p.x, 0, o.dest.z - p.z), L = d.length(); if (L > 0.05){ p.addScaledVector(d.normalize(), Math.min(L, 0.8*dt)); o.g.rotation.y += clamp(wrapA(Math.atan2(d.x, d.z) + Math.PI/2 - o.g.rotation.y), -5*dt, 5*dt); } else o.dest = null; }   // (crabs walk sideways)
      playRig(o.rg, 'dance', o.dest ? 1.6 : 1); p.y = gy(p.x, p.z);
    } else if (o.kind === 'mudskipper'){   // mudskippers: crutch along the mud on their front fins, skip with a flick of the tail, raise their fins to show off
      if (o.timer <= 0){ o.timer = rnd(2, 6); const r_ = Math.random();
        if (r_ < 0.35){ o.state = 'crawl'; const z = zIn(p.z + rnd(-2, 2)); o.dest = V3(world.shoreX(z) + rnd(-1.5, 0.8), 0, z); }
        else if (r_ < 0.55){ o.state = 'skip'; o.skipT = 0; o.from = p.clone(); const a = o.g.rotation.y + rnd(-0.8, 0.8); o.to = V3(p.x + Math.sin(a)*1.2, 0, zIn(p.z + Math.cos(a)*1.2)); o.timer = 0.7; }
        else if (r_ < 0.75){ o.state = 'display'; o.timer = 2.5; o.dest = null; } else { o.state = 'idle'; o.dest = null; } }
      if (near && o.state !== 'skip'){ o.state = 'skip'; o.skipT = 0; o.from = p.clone(); const aw = V3(p.x - pos.x, 0, p.z - pos.z).normalize(); o.to = V3(p.x + aw.x*1.4, 0, zIn(p.z + aw.z*1.4)); o.timer = 0.7; o.g.rotation.y = Math.atan2(aw.x, aw.z); }
      if (o.state === 'skip'){ o.skipT += dt; const u = Math.min(1, o.skipT/0.6); p.lerpVectors(o.from, o.to, u); p.y = gy(p.x, p.z) + Math.sin(u*Math.PI)*0.35; if (u >= 1) o.state = 'idle'; }
      else { if (o.dest){ const d = V3(o.dest.x - p.x, 0, o.dest.z - p.z), L = d.length(); if (L > 0.05){ p.addScaledVector(d.normalize(), Math.min(L, 0.35*dt)); o.g.rotation.y += clamp(wrapA(Math.atan2(d.x, d.z) - o.g.rotation.y), -3*dt, 3*dt); } else { o.dest = null; o.state = 'idle'; } }
        p.y = Math.max(gy(p.x, p.z), WATER_Y - 0.04); }
      playRig(o.rg, o.state === 'skip' ? 'skip' : o.state === 'display' ? 'display' : o.dest ? 'crawl' : 'idle');
    }
    o.rg.mixer.update(dt);
  }
}
function updateBeach(dt, t){
  updateBoats(dt, t); setupBeachLife(); updateBeachLife(dt, t);
  for (const c of crabs){
    const p = c.g.position, near = petActive() && root.visible && Math.hypot(p.x - pos.x, p.z - pos.z) < 2.2*Math.max(petS, 0.6);
    if (c.hermit && near) c.hide = 2.5;
    if (c.hide > 0){ c.hide -= dt; c.legs.forEach(l => l.visible = false); if (c.g.userData.body) c.g.userData.body.visible = false; continue; }
    c.legs.forEach(l => l.visible = true); if (c.g.userData.body) c.g.userData.body.visible = true;
    c.wait -= dt;
    if (near && !c.hermit){ const d = V3(p.x - pos.x, 0, p.z - pos.z).normalize(); c.tgt.set(p.x + d.x*3, 0, p.z + d.z*3); c.wait = 0; }
    else if (c.wait <= 0 && Math.hypot(c.tgt.x - p.x, c.tgt.z - p.z) < 0.15){ c.wait = rnd(1, 5); const q = beachSpot(false); if (q && Math.hypot(q.x - p.x, q.z - p.z) < 8) c.tgt.copy(q); else c.tgt.set(p.x + rnd(-2, 2), 0, p.z + rnd(-2, 2)); }
    if (world.isWater(c.tgt.x, c.tgt.z) || !world.isBeach(c.tgt.x, c.tgt.z) || c.tgt.z < Z0 + 1 || c.tgt.z > Z1 - 1) c.tgt.set(world.shoreX(p.z) - rnd(1, 3.5), 0, clamp(p.z, Z0 + 2, Z1 - 2));
    const d = V3(c.tgt.x - p.x, 0, c.tgt.z - p.z), L = d.length();
    if (c.wait <= 0 && L > 0.05){ const sp = (c.hermit ? 0.35 : near ? 2.4 : 1.1)*dt; p.addScaledVector(d.normalize(), Math.min(sp, L));
      const face = Math.atan2(d.x, d.z) + (c.hermit ? 0 : Math.PI/2); c.g.rotation.y += clamp(wrapA(face - c.g.rotation.y), -6*dt, 6*dt);   // crabs walk sideways
      c.legs.forEach((l, k) => l.rotation.x = Math.sin(t*(c.hermit ? 12 : 26) + k*1.4)*0.5); }
    const rg = c.g.userData.rig;
    if (rg){ const name = c.wait <= 0 && L > 0.05 ? 'walk' : 'idle';   // scuttles sideways on its own legs, flexes its claws while resting
      if (rg.cur !== name && rg.clips[name]){ const a = rg.mixer.clipAction(rg.clips[name]); a.reset().fadeIn(0.2).play(); if (rg.act) rg.act.fadeOut(0.2); rg.act = a; rg.cur = name; }
      if (rg.act){ const stop = name !== 'walk' && !rg.clips.idle; if (stop && rg.act.timeScale) rg.act.time = 0; rg.act.timeScale = stop ? 0 : name === 'walk' ? (c.hermit ? 0.7 : near ? 2 : 1) : 1; } rg.mixer.update(dt); }   // (no resting clip: it settles with all its legs down)
    p.y = gy(p.x, p.z);
  }
  // a bottle drifts in on the waves now and then, if some of the beach is yours
  if (!bottle){ bottleT -= dt; if (bottleT <= 0){ const p = beachSpot(true, true); bottleT = rnd(240, 540); if (p){ bottle = makeBottle(p); } } }
  if (bottle){ const b = bottle; b.t += dt; const u = Math.min(1, b.t/8); b.g.position.x = lerp(b.from.x, b.to.x, ease(u)); b.g.position.z = b.to.z;
    b.g.position.y = WATER_Y + 0.05 + Math.sin(t*2)*0.04; b.g.rotation.z = Math.sin(t*1.6)*0.25; }
  shellT -= dt; if (shellT <= 0){ shellT = rnd(40, 90); if (shells.length < 7){ const p = beachSpot(true); if (p) makeShell(p); } }
}
// ---------- butterflies on sunny days (the wombat sometimes chases them) ----------
const butterflies = [];
const wingTex = c => canvasTex(64,64,(x)=>{ x.fillStyle = c; x.beginPath(); x.ellipse(30,22,26,19,-0.2,0,Math.PI*2); x.fill(); x.beginPath(); x.ellipse(24,46,16,13,0.4,0,Math.PI*2); x.fill();
  x.fillStyle = 'rgba(255,255,255,.75)'; x.beginPath(); x.arc(34,20,6,0,Math.PI*2); x.fill(); x.fillStyle = 'rgba(40,30,30,.6)'; x.beginPath(); x.arc(46,26,3,0,Math.PI*2); x.fill(); });
const WING_TEX = ['#f3a73b','#7fb2dd','#f2a6be','#f3d250','#b79be0'].map(wingTex);
function makeButterfly(){
  const rb = realClone('butterfly2');   // a realistic monarch with its own wing beat; the painted cards if it's missing
  if (rb){ rb.userData.mixer.clipAction(rb.userData.clips.fly).play(); const a = Math.random()*Math.PI*2; rb.position.set(pos.x + Math.sin(a)*7, gy(pos.x, pos.z) + rnd(1,2), pos.z + Math.cos(a)*7); scene.add(rb);
    return {g:rb, wings:[], tgt:V3(0,1,0), retarget:0, ph:Math.random()*9, leaving:false}; }
  const g = new THREE.Group(), wm = new THREE.MeshBasicMaterial({map:WING_TEX[Math.floor(Math.random()*WING_TEX.length)], transparent:true, side:THREE.DoubleSide, depthWrite:false});
  const wings = [1, -1].map(s => { const p = new THREE.Group(), w = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), wm); w.rotation.x = -Math.PI/2; w.position.x = 0.15; w.scale.x = 1; p.add(w); p.scale.x = s; g.add(p); return p; });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.16, 4, 8), mat('#3b2f2a', 0.6)); body.rotation.x = Math.PI/2; g.add(body);
  const a = Math.random()*Math.PI*2; g.position.set(pos.x + Math.sin(a)*7, gy(pos.x, pos.z) + rnd(1,2), pos.z + Math.cos(a)*7); scene.add(g);
  return {g, wings, tgt:V3(0,1,0), retarget:0, ph:Math.random()*9, leaving:false};
}
function updateButterflies(dt){
  FISH_MIX.forEach(m => m.update(dt));
  const want = !S.dead && S.stage !== 'egg' && weatherNow() === 'sunny' && nightF < 0.3 ? 2 : 0;
  while (butterflies.filter(b => !b.leaving).length < want) butterflies.push(makeButterfly());
  butterflies.filter(b => !b.leaving).slice(want).forEach(b => { b.leaving = true; b.tgt.set(b.g.position.x + rnd(-6,6), b.g.position.y + 8, b.g.position.z + rnd(-6,6)); });
  for (let i=butterflies.length-1;i>=0;i--){ const b = butterflies[i], p = b.g.position;
    const scared = petActive() && Math.hypot(p.x-pos.x, p.z-pos.z) < 1.5*Math.max(petS,0.6);
    b.retarget -= dt;
    if (!b.leaving && (b.retarget <= 0 || scared || p.distanceTo(b.tgt) < 0.3)){ b.retarget = rnd(2,4);
      if (scared){ const d = V3(p.x-pos.x, 0, p.z-pos.z).normalize(); b.tgt.set(p.x + d.x*2.5, rnd(1.2,2), p.z + d.z*2.5); }
      else { const a = Math.random()*Math.PI*2, r = rnd(0.5, 5); b.tgt.set(pos.x + Math.sin(a)*r, 0, pos.z + Math.cos(a)*r); b.tgt.y = gy(b.tgt.x, b.tgt.z) + rnd(0.5,1.7); }
      }
    const d = b.tgt.clone().sub(p), sp = (scared ? 2.2 : 1.1)*dt;
    if (d.length() > 0.01) p.addScaledVector(d.normalize(), Math.min(sp, d.length()));
    p.y += Math.sin(t*6 + b.ph)*0.01; if (!b.leaving) p.y = Math.max(p.y, gy(p.x, p.z) + 0.4); b.g.rotation.y = Math.atan2(d.x, d.z);
    if (b.g.userData.mixer) b.g.userData.mixer.update(dt*(scared ? 1.6 : 1)); else { const flap = Math.sin(t*22 + b.ph)*0.9; b.wings[0].rotation.z = flap; b.wings[1].rotation.z = flap; }
    if (b.leaving && p.y > gy(p.x, p.z) + 5.5){ scene.remove(b.g); butterflies.splice(i,1); }
  }
}

// ---------- the departed wombat's spirit floats over its grave; tap the grave to send it off ----------
const ghostTex = canvasTex(128,160,(x)=>{
  x.strokeStyle = 'rgba(255,214,90,0.95)'; x.lineWidth = 5; x.beginPath(); x.ellipse(64,18,26,8,0,0,Math.PI*2); x.stroke();
  x.fillStyle = 'rgba(255,255,255,0.92)'; x.beginPath(); x.moveTo(18,150);
  for (let i=0;i<=6;i++) x.quadraticCurveTo(18 + i*15.3 + 7.6, i%2 ? 140 : 160, 18 + (i+1)*15.3, 150);
  x.lineTo(110,72); x.bezierCurveTo(110,30,18,30,18,72); x.closePath(); x.fill();
  x.beginPath(); x.moveTo(30,52); x.lineTo(26,30); x.lineTo(44,40); x.fill(); x.beginPath(); x.moveTo(98,52); x.lineTo(102,30); x.lineTo(84,40); x.fill();
  x.fillStyle = '#4a4040'; x.beginPath(); x.arc(48,82,5,0,Math.PI*2); x.arc(80,82,5,0,Math.PI*2); x.fill(); x.beginPath(); x.ellipse(64,96,10,7,0,0,Math.PI*2); x.fill();
  x.fillStyle = 'rgba(240,150,150,.5)'; x.beginPath(); x.arc(38,96,7,0,Math.PI*2); x.arc(90,96,7,0,Math.PI*2); x.fill(); });
let ghost = null, ascending = null;
function makeGhost(at){
  const s = new THREE.Sprite(new THREE.SpriteMaterial({map:ghostTex, transparent:true, opacity:0.85, depthWrite:false}));
  s.scale.set(1.0, 1.25, 1); s.position.set(at.x, gy(at.x, at.z) + 1.9, at.z); s.renderOrder = 6; scene.add(s); return s;
}
function updateGhost(dt){
  if (!ghost) return;
  if (ascending){ ascending.t += dt; const u = ascending.t;
    ghost.position.y += dt*(0.6 + u*1.2); ghost.material.opacity = Math.max(0, 0.85 - u*0.28);
    spot.visible = spotPool.visible = true; spot.position.set(tomb.position.x, tomb.position.y + 4.5, tomb.position.z); spotPool.position.set(tomb.position.x, tomb.position.y + 0.03, tomb.position.z);
    spot.material.opacity = Math.min(0.8, u)*Math.min(1, (3.2-u)); spotPool.material.opacity = spot.material.opacity;
    if (Math.random() < dt*12) sparkles(ghost.position.clone(), 1, 0.5);
    if (u > 3.2){ spot.visible = spotPool.visible = false; scene.remove(ghost); ghost = null; ascending = null; newEgg(); }
    return; }
  ghost.position.y = (tomb ? tomb.position.y : 0) + 1.9 + Math.sin(t*1.4)*0.15; ghost.material.rotation = Math.sin(t*0.9)*0.08;
}
function releaseSpirit(){
  if (!S.dead || ascending) return;
  showModal(`送${S.name || '牠'}去天堂？`, `<p>點了以後，${S.name || '牠'}的魂魄會升上天空，然後會出現一顆新的蛋。代幣、衣服、道具和建設都會留給下一隻。</p>`,
    [{label:'再陪牠一下', ghost:true, onClick:()=>{}}, {label:'超渡牠', onClick:() => { ascending = {t:0}; sfx('grow'); cry('evolve'); toast(`${S.name || '牠'}安心地去天堂了。謝謝你照顧牠。`); }}]);
}
function updateTools(dt){
  for (let i=tools.length-1;i>=0;i--){ const tl = tools[i]; tl.t += dt; tl.update(Math.min(tl.t, tl.dur)); if (tl.t >= tl.dur){ tl.done(); tools.splice(i,1); } }
}

const foods = [];
const grassGeo = new THREE.ConeGeometry(0.035,0.38,5); grassGeo.translate(0,0.19,0);
const grassMats = ['#6f9a4a','#86b25a','#5c8540'].map(c => mat(c,0.8)), freshMats = ['#a8d85a','#93cc4a','#bde372'].map(c => mat(c,0.6));
const leafGeo = new THREE.ConeGeometry(0.025,0.24,5); leafGeo.translate(0,0.12,0);
// Food and drink. Grass and water are free; the rest is bought in the shop and kept in the bag (S.inv).
const FOODS = [
  {id:'grass',  name:'青草',   price:0,  hunger:22,             desc:'免費，吃不膩的基本款，但不太會飽。'},
  {id:'carrot', name:'紅蘿蔔', price:40, hunger:32, happy:6,    desc:'脆脆甜甜。'},
  {id:'apple',  name:'蘋果',   price:50, hunger:26, happy:8, thirst:10, desc:'多汁，還能補一點水分。'},
  {id:'clover', name:'苜蓿',   price:60, hunger:36, happy:12,   desc:'香香嫩嫩的草，吃了心情好。'},
  {id:'potato', name:'地瓜',   price:80, hunger:60, energy:6,   desc:'超有飽足感，一條就飽。'},
  {id:'root',   name:'樹根',   price:90, hunger:45, health:8,   desc:'野生袋熊愛啃的根，對身體好。'}
];
const DRINKS = [
  {id:'water', name:'清水',   price:0,  thirst:30,             color:'#6fa8c9', desc:'免費，一碗補一點水分。'},
  {id:'milk',  name:'牛奶',   price:50, thirst:38, happy:8, health:3, color:'#f4f1ea', desc:'喝了心情好。'},
  {id:'coco',  name:'椰子水', price:70, thirst:50, energy:10,  color:'#e7efe3', desc:'超解渴又補體力。'}
];
// Health products work straight away (no bowl). Some help one stat but cost another.
const CARE = [
  {id:'vitamin',    icon:'💊', name:'綜合維他命', price:15, health:15, desc:'每天一顆，身體棒棒。'},
  {id:'greenjuice', icon:'🥬', name:'苦苦青汁',   price:12, health:22, energy:-10, desc:'超健康，可是苦到沒力氣。'},
  {id:'honey',      icon:'🍯', name:'蜂蜜',       price:14, energy:18, happy:6, desc:'甜甜的，馬上有精神。'},
  {id:'ginseng',    icon:'🌱', name:'人參',       price:40, health:20, energy:20, desc:'很貴，但是真的很補。'},
  {id:'energy',     icon:'⚡', name:'能量飲料',   price:10, energy:30, health:-10, desc:'提神效果驚人，對身體不太好。'},
  {id:'cigarette',  icon:'🚬', name:'香菸',       price:8,  energy:12, happy:6, health:-22, desc:'一時有精神，但非常傷身體，不建議給牠！'}
];
const MEDS = [
  {id:'coldmed',  icon:'🌡️', name:'感冒藥', price:10, health:45, desc:'生病的時候吃，健康 +45。'},
  {id:'ointment', icon:'🧴', name:'消腫藥膏', price:25, desc:'被胡蜂叮得滿頭包時擦一擦，腫包馬上消。'}
];
const FOOD_ICON = {grass:'🌿', carrot:'🥕', apple:'🍎', clover:'🍀', potato:'🍠', root:'🪵', water:'💧', milk:'🥛', coco:'🥥'};
[...FOODS, ...DRINKS].forEach(f => f.icon = FOOD_ICON[f.id]);
const foodInfo = id => [...FOODS, ...DRINKS, ...CARE, ...MEDS].find(f => f.id === id);
const foodStats = f => [['hunger','飽足'],['thirst','水分'],['happy','心情'],['energy','體力'],['health','健康']].filter(([k]) => f[k]).map(([k,n]) => `${n} ${f[k] > 0 ? '+' : ''}${f[k]}`).join('、');
// Use a health product or medicine from the bag: works immediately.
function useCare(id){
  const f = foodInfo(id);
  if (!petActive()){ toast(S.stage === 'egg' ? '還沒孵出來喔。' : '現在不需要。'); return; }
  if (!inv(id)){ toast(`背包裡沒有${f.name}了。`); return; }
  if (id === 'ointment'){
    if (!S.swollen){ toast('牠現在沒有腫包，藥膏先留著。'); return; }
    invAdd(id, -1); S.swollen = false; applyBumps(); spawnHearts(2); sfx('happy'); showEmote('😌', 1.6); toast('腫包消了，舒服多了！'); hudDirty = true; save(); return; }
  invAdd(id, -1);
  for (const k of ['happy','energy','health']) if (f[k]) S.st[k] = clamp(S.st[k] + f[k], 0, 100);
  if (id === 'cigarette'){ showEmote('😵', 1.8); cry('grunt'); for (let i=0;i<5;i++) floatSprite(radialTex('rgba(200,200,200,0.8)','rgba(200,200,200,0)'), headTop(), {size:0.4, vy:0.5, vx:rnd(-0.3,0.3), delay:i*0.2, grow:1.2, max:1.6}); toast('咳咳……牠嗆到了，健康掉了好多。'); }
  else if (f.health < 0){ showEmote('😵‍💫', 1.6); sfx('boing'); toast(`${f.name}：精神來了，可是身體有點負擔。`); }
  else { showEmote(f.icon, 1.6); spawnHearts(1); sfx('happy'); toast(`${S.name || '牠'}${f.health > 0 ? '覺得身體好多了' : '精神好多了'}。`); }
  hudDirty = true; save();
}
function giveFood(id){
  const f = foodInfo(id), isFood = f.hunger !== undefined;
  if (!petActive()){ toast(S.stage === 'egg' ? '還沒孵出來喔。' : '現在不需要。'); return; }
  if (B.mode === 'bloated'){ toast('牠撐到動不了了，等一下吧。'); return; }
  if (isFood && S.st.hunger > 92) toast('牠已經很飽了……再吃可能會撐到喔。');
  if (isFood && foods.length >= 3){ toast('地上已經有食物了。'); return; }
  if (!isFood && S.st.thirst > 92){ toast('牠現在不渴。'); return; }
  if (!isFood && bowl){ toast('碗裡還有喝的。'); return; }
  if (f.price){ if (buyOnce(f)){ if (!hasFood(f)){ toast(`還沒買下${f.name}，到商店買斷吧。`); return; } } else { if (!inv(id)){ toast(`背包裡沒有${f.name}了，到商店買吧。`); return; } invAdd(id, -1); } }
  if (B.mode === 'inHouse') exitHouse(); else if (B.mode === 'sleep') wake(true);
  if (isFood){ const a = root.rotation.y + rnd(-1.1,1.1), d = 1.9*petS + rnd(1.2,2); spawnFood(pos.x + Math.sin(a)*d, pos.z + Math.cos(a)*d, id); }
  else { if (id !== 'water' || !BG.pond) spawnBowl(id); B.water = true; if (id === 'water' && BG.pond) toast('牠走去水池喝水。'); }
}
const inv = id => (S.inv && S.inv[id]) || 0;
const invAdd = (id, n) => { S.inv = S.inv || {}; S.inv[id] = Math.max(0, inv(id) + n); };
function foodMesh(kind){
  const pr = ['carrot','apple','potato','root'].includes(kind) && propClone('food_' + kind);   // Blender-made food when available
  if (pr){ pr.rotation.y = Math.random()*Math.PI*2; const g = new THREE.Group(); g.add(pr); return g; }
  const g = new THREE.Group();
  if (kind === 'grass'){   // a fresh-cut bundle of bright grass lying on the ground, tied with straw
    const bundle = new THREE.Group();   // built standing up, then laid on its side
    for (let i=0;i<14;i++){ const b = new THREE.Mesh(grassGeo, freshMats[i%3]); b.scale.set(1.4, rnd(1.4,1.9), 1.4);
      b.position.set(rnd(-0.05,0.05), 0, rnd(-0.05,0.05)); b.rotation.set(rnd(-0.25,0.25), 0, rnd(-0.25,0.25)); bundle.add(b); }
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.022, 6, 14), mat('#d9b56a', 0.9)); tie.rotation.x = Math.PI/2; tie.position.y = 0.26; bundle.add(tie);
    bundle.rotation.z = -Math.PI/2; bundle.position.set(-0.3, 0.08, 0); g.add(bundle);
  } else if (kind === 'clover'){   // three-leaf clovers with little pink flowers
    const leafM = mat('#5fae48', 0.6), heartG = new THREE.SphereGeometry(0.06, 10, 6);
    for (let k=0;k<5;k++){ const s = new THREE.Group(), a = k/5*Math.PI*2, r = k ? 0.13 : 0, h = rnd(0.12, 0.2); s.position.set(Math.cos(a)*r, 0, Math.sin(a)*r);
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, h, 4), leafM); st.position.y = h/2; s.add(st);
      for (let j=0;j<3;j++){ const l = new THREE.Mesh(heartG, leafM), b = j/3*Math.PI*2 + k; l.scale.set(1, 0.25, 0.8); l.position.set(Math.cos(b)*0.055, h, Math.sin(b)*0.055); s.add(l); }
      g.add(s); }
    for (let i=0;i<3;i++){ const f = new THREE.Mesh(new THREE.SphereGeometry(0.045,8,6), mat('#e9a0c8',0.6)); f.scale.y = 1.3; f.position.set(rnd(-0.12,0.12), rnd(0.24,0.3), rnd(-0.12,0.12)); g.add(f); }
  } else if (kind === 'carrot'){
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.075,0.5,12), mat('#e8833a',0.6)); body.rotation.z = Math.PI/2; body.position.y = 0.075; g.add(body);
    for (const a of [-0.5,0,0.5]){ const l = new THREE.Mesh(leafGeo, grassMats[1]); l.position.set(0.24,0.075,0); l.rotation.set(a,0,-Math.PI/2+0.5); g.add(l); }
  } else if (kind === 'apple'){
    const a = new THREE.Mesh(new THREE.SphereGeometry(0.15,18,14), mat('#d8423c',0.35)); a.scale.y = 0.9; a.position.y = 0.14; g.add(a);
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.015,0.08,6), woodMat); st.position.y = 0.3; g.add(st);
    const l = new THREE.Mesh(leafGeo, grassMats[1]); l.position.set(0.03,0.3,0); l.rotation.z = -1.0; g.add(l);
  } else if (kind === 'potato'){
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.12,16,12), mat('#9a4f6a',0.75)); p.scale.set(2.0,0.85,0.95); p.position.y = 0.1; g.add(p);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05,0.12,8), mat('#9a4f6a',0.75)); tip.rotation.z = Math.PI/2; tip.position.set(0.28,0.1,0); g.add(tip);
  } else if (kind === 'root'){
    const m = mat('#8a6040',0.9);
    for (let i=0;i<4;i++){ const r = new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.045,rnd(0.35,0.5),6), m); r.rotation.set(rnd(-0.3,0.3), rnd(0,6), Math.PI/2 + rnd(-0.4,0.4)); r.position.y = 0.05 + i*0.02; g.add(r); }
  }
  g.rotation.y = Math.random()*Math.PI*2; return g;
}
// food and bowls go down where the wombat can walk all round them (not squeezed against a building, tree or rock)
function clearSpot(p, rad){
  navEnsure(); const free = (x, z) => { for (let a=0;a<8;a++) for (const r of [0, rad*0.5, rad]){ const k = navIdx(x + Math.sin(a/8*Math.PI*2)*r, z + Math.cos(a/8*Math.PI*2)*r); if (k < 0 || NAV.block[k]) return false; } return true; };
  if (free(p.x, p.z)) return;
  for (let r = 0.5; r < 10; r += 0.5) for (let a = 0; a < 16; a++){ const x = p.x + Math.sin(a/16*Math.PI*2)*r, z = p.z + Math.cos(a/16*Math.PI*2)*r; if (free(x, z)){ p.x = x; p.z = z; return; } }
  snapToLand(p);
}
const tapBox = (g, r, kind, ref) => { const hb = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), hbMat); hb.position.y = 0.15; hb.userData.kind = kind; hb.userData.ref = ref; g.add(hb); return hb; };
function spawnFood(x, z, kind='grass'){
  { const p = V3(x, 0, z); clearSpot(p, 1.95*petS + 0.6); x = p.x; z = p.z; }
  const g = foodMesh(kind); g.position.set(x, gy(x, z) + 1.6, z); scene.add(g);
  const f = {g, kind, vy:0, landed:false, eat:1, sh:makeShadow(0.6,0.6)}; f.hb = tapBox(g, 0.45, 'food', f); foods.push(f);
}
// Extra effects of a food or drink, plus the pet's own taste: one favourite and one food it dislikes.
const rollLikes = () => { const ids = FOODS.map(f => f.id), fav = ids[Math.floor(Math.random()*ids.length)], rest = ids.filter(i => i !== fav && i !== 'grass');
  return {fav, hate: rest[Math.floor(Math.random()*rest.length)], known:{}}; };
function foodBonus(fi){
  const st = S.st;
  for (const k of ['happy','thirst','energy','health']) if (fi[k]) st[k] = clamp(st[k] + fi[k], 0, 100);
  S.aff = clamp(S.aff + (fi.hunger !== undefined ? 3 : 2), 0, 100);
  if (fi.hunger === undefined) return;   // drinks have no likes/dislikes
  if (!S.likes) S.likes = rollLikes();
  const L = S.likes;
  if (fi.id === L.fav){ st.happy = clamp(st.happy + 12, 0, 100); spawnHearts(3); showEmote('😋', 1.6);
    if (!L.known.fav){ L.known.fav = true; toast(`${S.name || '牠'}好像特別愛吃${fi.name}！`); } }
  else if (fi.id === L.hate){ st.happy = clamp(st.happy - 8, 0, 100); showEmote('😖', 1.6); cry('grunt');
    if (!L.known.hate){ L.known.hate = true; toast(`${S.name || '牠'}好像不太喜歡${fi.name}……`); } }
}
let bowl = null;
function spawnBowl(kind='water'){
  const a = root.rotation.y + rnd(-1,1), d = 1.9*petS + 1.3;
  let x = pos.x + Math.sin(a)*d, z = pos.z + Math.cos(a)*d; { const p = V3(x, 0, z); clearSpot(p, 1.95*petS + 0.6); x = p.x; z = p.z; }
  const g = new THREE.Group();
  const pts = [[0.001,0],[0.3,0],[0.36,0.05],[0.38,0.2],[0.33,0.2],[0.31,0.07],[0.001,0.07]].map(p => new THREE.Vector2(p[0],p[1]));
  g.add(new THREE.Mesh(new THREE.LatheGeometry(pts,28), mat('#d6dde2',0.35)));
  const w = new THREE.Mesh(new THREE.CircleGeometry(0.31,24), new THREE.MeshStandardMaterial({color:foodInfo(kind).color, roughness:0.15})); w.rotation.x = -Math.PI/2; w.position.y = 0.17; g.add(w);
  if (kind === 'coco'){ const sh = new THREE.Mesh(new THREE.SphereGeometry(0.16,14,10,0,Math.PI*2,0,Math.PI/2), mat('#7a5634',0.9)); sh.material.side = THREE.DoubleSide; sh.rotation.x = Math.PI; sh.position.set(0.45,0.14,0); g.add(sh); }
  g.position.set(x,gy(x, z),z); scene.add(g);
  bowl = {g, w, kind, left:1}; bowl.hb = tapBox(g, 0.5, 'bowl', bowl); sfx('pop');
}
const snowmen = [];
function makeSnowman(x, z, ry, melt=0){
  const g = new THREE.Group(), white = mat('#f7f9fb',0.9), coal = mat('#222',0.5);
  const b1 = new THREE.Mesh(new THREE.SphereGeometry(0.55,20,14), white); b1.position.y = 0.5; g.add(b1);
  const b2 = new THREE.Mesh(new THREE.SphereGeometry(0.38,20,14), white); b2.position.y = 1.25; g.add(b2);
  for (const s of [-1,1]){ const e = new THREE.Mesh(new THREE.SphereGeometry(0.045,8,6), coal); e.position.set(0.13*s,1.36,0.33); g.add(e);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.02,0.7,6), mat('#6b4f37',0.9)); arm.position.set(0.6*s,0.95,0); arm.rotation.z = -1.0*s; g.add(arm); }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.06,0.28,10), mat('#e8833a',0.6)); nose.rotation.x = Math.PI/2; nose.position.set(0,1.26,0.48); g.add(nose);
  const sc = new THREE.Mesh(new THREE.TorusGeometry(0.33,0.07,8,24), mat('#d23b32',0.8)); sc.rotation.x = Math.PI/2; sc.position.y = 0.95; g.add(sc);
  g.position.set(x,gy(x, z),z); g.rotation.y = ry; scene.add(g);
  const o = {g, x, z, ry, melt, sh:makeShadow(1.4,1.4)}; o.sh.g.position.set(x,gy(x, z),z); snowmen.push(o); return o;
}
const puddles = [];

// ---------- hearts / emotes / coins ----------
const emote = new THREE.Sprite(new THREE.SpriteMaterial({map:emojiTex('💢'), transparent:true, depthWrite:false, depthTest:false}));
emote.renderOrder = 10; emote.visible = false; scene.add(emote);
let emoteLife = 0;
function headTop(){
  if (B.mode === 'inHouse' && BG.house) return SPOTS.house.clone().add(V3(0,2.6,0));
  return head.localToWorld(V3(0, 1.0, 0.4));
}
function showEmote(ch, dur=2){ emote.material.map = emojiTex(ch); emote.material.needsUpdate = true; emoteLife = dur; emote.visible = true; }
function spawnHearts(n){ const p = headTop(); for (let i=0;i<n;i++) floatSprite(heartTex, p.clone().add(V3(rnd(-0.4,0.4)*petS, rnd(0,0.3), rnd(-0.4,0.4)*petS)), {size:0.32, delay:i*0.15, vx:rnd(-0.2,0.2)}); }
function sparkles(at, n, spread=1){ for (let i=0;i<n;i++) floatSprite(sparkTex, at.clone().add(V3(rnd(-spread,spread), rnd(0,spread), rnd(-spread,spread))), {size:rnd(0.2,0.45), vy:rnd(0.4,1.4), delay:Math.random()*0.4, add:true, max:1.2, depthTest:false}); }
function addCoins(n, at){
  if (n > 0 && typeof track === 'function') track('earned', n);
  S.coins += n; sfx('coin');
  floatSprite(textTex('+'+n, '#e2b53b', 'bold 76px sans-serif', '#5a4310'), at || headTop(), {size:0.6, vy:1.2, max:1.1, depthTest:false});
  hudDirty = true;
}

// ---------- forms & clothes ----------
// Coat colours. A new hatchling rolls one at random (w = weight); 雪白 is rare.
const FURS = [{name:'經典棕', c:'#8b6b50', b:'#b39a82', w:10}, {name:'灰褐', c:'#847b70', b:'#aaa196', w:10}, {name:'奶油', c:'#cdb48e', b:'#e3d3b8', w:10}, {name:'炭灰', c:'#4c4846', b:'#6e6966', w:8},
  {name:'灰粉', c:'#a8958f', b:'#e1d3cc', w:8}, {name:'巧克力', c:'#6b4a35', b:'#bf9c7f', w:8}, {name:'淡金', c:'#c9a46a', b:'#f0e0bf', w:6}, {name:'雪白', c:'#e6e1d8', b:'#fbf8f2', w:2}];
const rollFur = () => { let r = Math.random()*FURS.reduce((s, f) => s + f.w, 0); return Math.max(0, FURS.findIndex(f => (r -= f.w) < 0)); };
// Dyes sold in the shop (each bottle recolours the current pet; a new hatchling starts with its natural coat).
const DYES = [
  {name:'焦糖', c:'#a0703f', b:'#e6c9a2'}, {name:'蜂蜜', c:'#c8963e', b:'#f2dfb0'}, {name:'奶茶', c:'#b59a7c', b:'#ece0cf'}, {name:'可可', c:'#5e4031', b:'#b3927a'},
  {name:'櫻花粉', c:'#e3a6b5', b:'#f7e1e6'}, {name:'蜜桃', c:'#eaa58a', b:'#f9e0d3'}, {name:'莓果紅', c:'#b3475a', b:'#e9b9c2'}, {name:'南瓜橘', c:'#d9822b', b:'#f5d3a8'},
  {name:'檸檬黃', c:'#e2c84a', b:'#f8efbe'}, {name:'抹茶', c:'#8aa565', b:'#dce8c8'}, {name:'薄荷', c:'#7cc6ae', b:'#d8f0e7'}, {name:'森林綠', c:'#4e7a4a', b:'#b7cfa9'},
  {name:'天空藍', c:'#7fb2dd', b:'#dcebf7'}, {name:'海洋藍', c:'#3f6fa8', b:'#b3c8e3'}, {name:'薰衣草', c:'#a796cc', b:'#e7e0f3'}, {name:'葡萄紫', c:'#6b4a8a', b:'#c6b4d8'},
  {name:'銀灰', c:'#a7aaae', b:'#e6e7e9'}, {name:'夜空黑', c:'#2f2d33', b:'#6b6870'}, {name:'雪白', c:'#ecebe6', b:'#ffffff'}, {name:'彩虹金', c:'#d8b34a', b:'#fff2c4'}];
const DYE_PRICE = 40, UNDYE_PRICE = 15;
const coatName = () => S.dye != null && DYES[S.dye] ? `${DYES[S.dye].name}（染的）` : `${(FURS[S.fur] || FURS[0]).name}（天生）`;
function applyFur(){
  const f = S.dye != null && DYES[S.dye] ? DYES[S.dye] : (FURS[S.fur] || FURS[0]), F = form();
  let c = f.c, b = f.b;
  if (F.tint){ c = mixHex(c, F.tint[0], F.tint[1]); b = mixHex(b, F.tint[0], F.tint[1]*0.8); }
  if (S.muddy > 0){ const k = Math.min(0.55, S.muddy/200); c = mixHex(c, '#5b4330', k); b = mixHex(b, '#6b5038', k); }   // covered in mud after a wallow
  U.uColor.value.set(c); U.uBelly.value.set(b);
}
function applyForm(){
  const F = form(), bd = F.body || [1,1,1];
  model.scale.set(bd[0], bd[1], bd[2]); headScale = F.head || 1; furShells.forEach(m => m.uniforms.uLen.value = FUR_LEN*(F.fur || 1));   // skinny wombats have flatter fur, chubby ones fluffier
  const accs = formAcc(F); Object.entries(ACC).forEach(([k,g]) => g.visible = accs.includes(k));
  hatLift = accs.some(a => ['poop','crown','sprout','antler'].includes(a)) ? 0.34 : 0;
  applyFur(); applyClothes();
}
function wear(id, on){ const c = CLOTHES.find(x => x.id === id); if (on) CLOTHES.forEach(o => { if (o.slot === c.slot) S.worn[o.id] = false; }); S.worn[id] = on; applyClothes(); }
function applyClothes(){
  CLOTHES.forEach(c => {
    const v = !!(S.owned[c.id] && S.worn[c.id]) && !clothesHidden;
    const cl = CL[c.id]; cl.g.visible = v; cl.mats.forEach(m => m.color.set(S.colors[c.id] || c.def));
    if (c.slot === 'hat' && cl.g.userData.baseY !== undefined) cl.g.position.y = cl.g.userData.baseY + hatLift;
  });
}

// ---------- form effects (aura, lightning, leaves, wind, flies, sick cloud) ----------
const leafTexs = ['#6aa845','#8cc25a','#4c8434'].map(c => canvasTex(64,64,(x)=>{ x.fillStyle = c; x.beginPath(); x.moveTo(32,4);
  x.quadraticCurveTo(60,30,32,60); x.quadraticCurveTo(4,30,32,4); x.fill(); x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 2; x.beginPath(); x.moveTo(32,8); x.lineTo(32,56); x.stroke(); }));
const boltTex = canvasTex(64,128,(x)=>{ const pts = [[34,2],[20,50],[36,52],[18,126],[48,62],[30,60],[44,2]];
  x.shadowColor = '#fff2a0'; x.shadowBlur = 14; x.fillStyle = '#fff6c0'; x.beginPath(); pts.forEach(([a,b],i) => i ? x.lineTo(a,b) : x.moveTo(a,b)); x.closePath(); x.fill();
  x.shadowBlur = 0; x.fillStyle = '#ffffff'; x.beginPath(); pts.forEach(([a,b],i) => i ? x.lineTo(a*0.6+12.8,b) : x.moveTo(a*0.6+12.8,b)); x.closePath(); x.fill(); });
const windTex = canvasTex(128,16,(x,w,h)=>{ const g = x.createLinearGradient(0,0,w,0); g.addColorStop(0,'rgba(255,255,255,0)'); g.addColorStop(0.7,'rgba(255,255,255,.85)'); g.addColorStop(1,'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0,6,w,3); });
const cloudTex = canvasTex(128,80,(x)=>{ x.fillStyle = '#8d949c'; [[40,48,24],[64,36,28],[90,48,22],[64,54,22]].forEach(([a,b,r]) => { x.beginPath(); x.arc(a,b,r,0,Math.PI*2); x.fill(); }); });
const dropTex = canvasTex(32,48,(x)=>{ x.fillStyle = '#7fb2e0'; x.beginPath(); x.moveTo(16,2); x.quadraticCurveTo(30,30,16,46); x.quadraticCurveTo(2,30,16,2); x.fill(); });
const flowerTex = canvasTex(64,64,(x)=>{ x.fillStyle = '#fbf8f0'; for (let i=0;i<5;i++){ const a = i/5*Math.PI*2; x.beginPath(); x.ellipse(32+Math.cos(a)*14, 32+Math.sin(a)*14, 11, 8, a, 0, Math.PI*2); x.fill(); }
  x.fillStyle = '#f3c94a'; x.beginPath(); x.arc(32,32,8,0,Math.PI*2); x.fill(); });
const FX = {zapT:1, zapGlow:0, sneezeT:8, buzzT:3, sweatT:4};
FX.aura = new THREE.Sprite(new THREE.SpriteMaterial({map:radialTex('rgba(255,255,255,0.9)','rgba(255,255,255,0)'), transparent:true, depthWrite:false, blending:THREE.AdditiveBlending}));
FX.aura.position.set(0, 1.0, -0.1); FX.aura.scale.setScalar(4.6); FX.aura.renderOrder = -1; FX.aura.visible = false; root.add(FX.aura);
FX.orbit = new THREE.Group(); FX.orbit.visible = false; root.add(FX.orbit);
for (let i=0;i<8;i++){ const s = new THREE.Sprite(new THREE.SpriteMaterial({map:leafTexs[i%3], transparent:true, depthWrite:false}));
  const a = i/8*Math.PI*2; s.position.set(Math.cos(a)*2.3, 0.6 + (i%3)*0.45, Math.sin(a)*2.3); s.scale.setScalar(0.4); s.userData.y = s.position.y; s.userData.ph = i; FX.orbit.add(s); }
FX.cloud = new THREE.Sprite(new THREE.SpriteMaterial({map:cloudTex, transparent:true, depthWrite:false})); FX.cloud.visible = false; scene.add(FX.cloud);
function updateFormFx(dt, t){
  const F = form(), k = S.form, on = petActive() && root.visible && !evo && B.mode !== 'dying';
  const at = (dx, y0, y1, dz) => root.position.clone().add(V3(rnd(-dx,dx)*petS, rnd(y0,y1)*petS, rnd(-dz,dz)*petS));
  // glowing aura behind the body
  FX.aura.visible = on && !!F.glow;
  if (FX.aura.visible){ FX.aura.material.color.set(F.glow);
    FX.aura.material.opacity = k === 'thunder' ? 0.35 + FX.zapGlow*1.6 + Math.random()*0.08 : 0.42 + 0.12*Math.sin(t*2.2); }
  if (!evo) U.uWhite.value = !on ? 0 : k === 'golden' ? 0.1 + 0.05*Math.sin(t*2.2) : k === 'thunder' ? FX.zapGlow : k === 'forestx' ? 0.03 : 0;
  // golden: rising light motes + an occasional twinkle burst
  if (on && k === 'golden' && Math.random() < dt*1.2) sparkles(at(1, 0.8, 1.8, 1.2), 3, 0.3*petS);
  // thunder: crackling lightning around the body
  FX.zapGlow = Math.max(0, FX.zapGlow - dt*1.4);
  if (on && k === 'thunder'){ FX.zapT -= dt;
    if (FX.zapT <= 0){ FX.zapT = rnd(0.35, 1.6); FX.zapGlow = 0.22;
      for (let i = 0, n = Math.random() < 0.35 ? 2 : 1; i < n; i++)
        floatSprite(boltTex, at(1.5, 0.3, 1.9, 1.9), {size:rnd(0.8,1.3)*petS, vy:0, max:0.2, fade:0.2, add:true, grow:0.15, rot:rnd(-0.7,0.7)});
      if (Math.random() < 0.3) flashV = Math.max(flashV, 0.15);
      sfx('zap'); }
    if (Math.random() < dt*6) floatSprite(sparkTex, at(1.1, 0.2, 1.6, 1.5), {size:0.16, vy:rnd(-0.5,0.5), vx:rnd(-1,1), max:0.3, fade:0.3, add:true, grow:0}); }
  if (ACC.boltband.visible) ACC.boltband.userData.bolt.emissiveIntensity = 0.5 + FX.zapGlow*3;
  // wind & thunder: speed lines while running
  if (on && (k === 'wind' || k === 'thunder') && Math.random() < dt*(gaitW > 0.3 ? 9 : 0.8)){
    const back = V3(-Math.sin(root.rotation.y), 0, -Math.cos(root.rotation.y)), p = at(0.9, 0.3, 1.6, 0.9).addScaledVector(back, 1.4*petS);
    const s0 = p.clone().project(camera), s1 = p.clone().add(back).project(camera);
    floatSprite(windTex, p, {size:0.9*petS, vy:0, vx:back.x*3, vz:back.z*3, max:0.45, fade:0.3, grow:0.3, rot:Math.atan2(s1.y - s0.y, (s1.x - s0.x)*camera.aspect)}); }
  for (const a of ['windband','boltband','windscarf']) if (ACC[a].visible) ACC[a].userData.tails.forEach((tl, j) => {
    let seg = tl.children[0], i = 0; const amp = 0.18 + 0.25*gaitW;
    while (seg){ seg.rotation.x = Math.sin(t*7 - i*0.9 + j)*amp; seg.rotation.y = Math.sin(t*5 - i*0.7 + j*2)*amp*0.6; seg = seg.children.find(c => c.isGroup); i++; } });
  // forest: drifting leaves; 森羅 adds an orbit of leaves, flowers popping up and a pulsing gem
  if (on && (k === 'forest' || k === 'forestx') && Math.random() < dt*(k === 'forestx' ? 2.2 : 0.8))
    floatSprite(leafTexs[Math.floor(Math.random()*3)], at(1.3, 1.8, 2.5, 1.6), {size:0.28, vy:-0.45, vx:rnd(-0.4,0.4), max:3, fade:0.8, grow:0, rot:rnd(0,6), spin:rnd(-2,2)});
  FX.orbit.visible = on && k === 'forestx';
  if (FX.orbit.visible){ FX.orbit.rotation.y += dt*0.7; FX.orbit.children.forEach(s => { s.position.y = s.userData.y + Math.sin(t*1.6 + s.userData.ph)*0.15; s.material.rotation = Math.sin(t + s.userData.ph); }); }
  if (on && k === 'forestx' && Math.random() < dt*0.5){ const p = at(1.8, 0, 0, 2); p.y = 0.15; floatSprite(flowerTex, p, {size:0.3, vy:0.03, max:2.6, fade:1, grow:0.8}); }
  for (const a of ['antler','leafcape']) if (ACC[a].visible) ACC[a].userData.gem.emissiveIntensity = 0.55 + 0.4*Math.sin(t*3);
  // stinky: buzzing flies
  if (on && k === 'stinky'){ FX.buzzT -= dt; if (FX.buzzT <= 0){ FX.buzzT = rnd(4,8); sfx('buzz'); } }
  // sickly: a little rain cloud, cold sweat and the odd sneeze
  FX.cloud.visible = on && k === 'sickly' && B.mode !== 'inHouse';
  if (FX.cloud.visible){ const p = headTop(); FX.cloud.position.set(p.x, p.y + 0.55*Math.max(petS,0.6) + Math.sin(t*1.5)*0.05, p.z); FX.cloud.scale.set(0.9, 0.56, 1).multiplyScalar(Math.max(petS,0.6));
    if (Math.random() < dt*5) floatSprite(dropTex, FX.cloud.position.clone().add(V3(rnd(-0.3,0.3), -0.12, rnd(-0.2,0.2))), {size:0.1, vy:-1.6, max:0.45, fade:0.25, grow:0}); }
  if (on && k === 'sickly' && !asleep()){
    FX.sweatT -= dt; if (FX.sweatT <= 0){ FX.sweatT = rnd(3,6); floatSprite(dropTex, head.localToWorld(V3(0.6, 0.5, 0.6)), {size:0.16, vy:-0.35, max:1.2, grow:0, fade:0.6}); }
    FX.sneezeT -= dt; if (FX.sneezeT <= 0 && !act){ FX.sneezeT = rnd(12,22); showEmote('🤧', 1.4); sfx('sneeze'); setTimeout(() => { sqv += 2; }, 420); } }
}

// ---------- tricks & special activities ----------
const ACTS = {
  sit:  {name:'坐下',     dur:4.0, price:0},
  flip: {name:'後空翻',   dur:1.15, price:60},
  roll: {name:'連續側翻滾', dur:2.6, price:70},
  spin: {name:'跳躍轉圈',  dur:1.05, price:0},
  belly:{name:'翻肚扭扭',  dur:3.4, price:50},
  shake:{name:'抖抖毛',   dur:1.3, price:0},
  dance:{name:'跳舞',     dur:5.2, price:80},
  ballroll:{name:'滾成一顆球', dur:2.8, price:70},
  dig:     {name:'挖洞',     dur:4.2, price:50},
  zoomies: {name:'暴衝繞圈', dur:3.6, price:60},
  wave:    {name:'揮揮手',   dur:2.8, price:40},
  bow:     {name:'鞠躬',     dur:2.2, price:40},
  hop:     {name:'連續跳跳', dur:2.6, price:50},
  stretch: {name:'伸懶腰',   dur:3.2, price:30},
  snowman:  {name:'堆雪人',   dur:7.5, price:60, special:true, need:() => weatherNow() === 'snow' || snowCover > 0.3, why:'下雪天才能堆雪人。', desc:'滾兩顆雪球堆成雪人，代幣 +5'},
  puddle:   {name:'踩水窪',   dur:4.6, price:50, special:true, need:() => weatherNow() === 'rain', why:'下雨天（不打雷）才有水窪可以踩。', desc:'跳進水窪濺水花，心情 +15'},
  fireflies:{name:'看螢火蟲', dur:6.5, price:60, special:true, need:() => nightF > 0.6 && ['sunny','cloudy'].includes(weatherNow()), why:'晴朗或多雲的晚上才有螢火蟲。', desc:'安靜地看螢火蟲，心情和體力都會回復'},
  moonview:{name:'賞月', dur:9, price:60, special:true, need:() => nightF > 0.6 && ['sunny','cloudy'].includes(weatherNow()) && isFullMoon() && moonDirNow.y > 0.05, why:'晴朗的晚上、月亮升起來，而且是滿月（或中秋節）才能賞月。', desc:'坐下來安靜地欣賞滿月，心情大幅回復'}
};
// Tricks: 坐下, 抖抖毛 and 跳躍轉圈 are free; the others are bought in the shop.
const hasTrick = k => !ACTS[k].price || !!(S.tricks && S.tricks[k]);
// Free water play once the swim ring is bought: pick a river, the sea, the lily pond or the swamp; it walks to the nearest open
// spot there, paddles about for a while and climbs back out.
const SWIM_SPOTS = [
  {id:'river', icon:'🏞️', name:'河流', spots:() => { const o = []; for (let z = Z0 + 2; z < Z1 - 2; z += 1.5) o.push(V3(world.riverX(z), 0, z)); return o; }},
  {id:'sea', icon:'🌊', name:'海邊', spots:() => { const o = []; for (let z = Z0 + 2; z < Z1 - 2; z += 1.5) for (const dx of [1.0, 1.6, 2.4]) o.push(V3(Math.min(world.shoreX(z) + dx, X1 - 0.4), 0, z)); return o; }},
  {id:'pond', icon:'🪷', name:'荷花池塘', spots:() => { const P = world.data.bio.pond, o = []; for (let a = 0; a < 6.28; a += 0.4) o.push(V3(P.x + Math.cos(a)*P.r*0.6, 0, P.z + Math.sin(a)*P.r*0.6)); return o; }},
  {id:'swamp', icon:'🐊', name:'沼澤', spots:() => world.data.bio.pools.map(([x, z]) => V3(x, 0, z))},
];
function goSwim(id){
  const sp = SWIM_SPOTS.find(s => s.id === id); if (!sp) return;
  if (!petActive() || asleep() || act || ['inHouse','enter','exit','evolve','bloated','dead','eat','drink'].includes(B.mode)){ toast(`${S.name || '牠'}現在沒辦法去。`); return; }
  const ok = sp.spots().filter(p => world.isOpen(p.x, p.z) && world.swimmable(p.x, p.z)).sort((a, b) => a.distanceTo(pos) - b.distanceTo(pos));
  if (!ok.length){ toast(`${sp.name}還沒開拓，或是還沒有地方可以下水。`); return; }
  closeSheet(); B.mode = 'swimGo'; B.swim = {at:ok[0], t:0, id}; B.timer = 60; B.path = null; B.treeVisit = null; showEmote('🏊', 1.2);
}
// Skills the wombat picks up from wild animals: tap enough DIFFERENT animals of a kind (some need their land opened first).
const SKILLS = {
  fast:{icon:'🐎', name:'奔馳', from:'horse', need:3, area:() => world.isOpenKey(BIO.savanna), areaTxt:'開拓大草原', desc:'跟馬學會跑得更快（走路、跑步都快 25%）'},
  bush:{icon:'🦗', name:'除樹叢', from:'mantis', need:10, desc:'跟螳螂學會自己清樹叢，以後清樹叢免費'},
  rock:{icon:'🦛', name:'咬碎石頭', from:'hippo', need:2, desc:'跟河馬學會把石頭咬碎，以後清石頭免費'},
  ninja:{icon:'🐢', name:'忍術瞬移', from:'turtle', need:2, desc:'跟池塘的烏龜學會忍者的瞬間移動：施展本領時會在一陣煙和樹葉中消失，「啵」一聲出現在樹、樹叢或石頭旁邊'},
  gnaw:{icon:'🦫', name:'啃木頭', from:'beaver', need:1, desc:'跟河狸學會啃樹：砍樹免費，還會賺到木材錢；也學會了做木筏和碼頭的方法（之後可以划去別的島）'},
};
const hasSkill = k => !!(S.skills && S.skills[k]);
const skillCount = k => stat('meetU:' + SKILLS[k].from);
function learnSkills(from){   // only the teaching kind just met can teach (so tapping a peacock never teaches the turtles' trick)
  for (const [k, sk] of Object.entries(SKILLS)){
    if (sk.from !== from || hasSkill(k) || skillCount(k) < sk.need || (sk.area && !sk.area())) continue;
    S.skills = {...(S.skills || {}), [k]:true}; save();
    showModal(`學會新本領：${sk.name}！`, `<div class="bigicon">${sk.icon}</div><p>${S.name || '袋熊'}${sk.desc}。</p>`, [{label:'太棒了', onClick:()=>{}}]);
    spawnHearts(3); sfx('grow'); break;
  }
}
function whyCantPlay(k){
  if (!petActive()) return S.stage === 'egg' ? '還沒孵出來喔。' : '';
  if (B.mode === 'evolve') return '牠正在進化！';
  if (B.mode === 'bloated') return '牠吃太撐了，躺著動不了。';
  if (B.mode === 'inHouse' || B.mode === 'enter') return '牠在小窩裡，點一下小窩叫牠出來。';
  if (asleep()) return '牠在睡覺，讓牠多睡一下吧。';
  if (k && ACTS[k].special && !ACTS[k].need()) return ACTS[k].why;
  if (S.st.health < 35) return '牠生病了，先餵藥。';
  if (S.st.hunger < 25) return '牠肚子餓在生氣，先餵牠吃東西。';
  if (S.st.energy < 15 && k !== 'fireflies' && k !== 'moonview') return '牠太累了，讓牠休息一下。';
  if (act || dragging || pos.y > 0.05) return '等牠忙完這個。';
  return null;
}
function startAct(k){
  if (!hasTrick(k)){ toast(`還沒學會「${ACTS[k].name}」，到商店可以學。`); return; }
  const why = whyCantPlay(k); if (why){ toast(why); return; }
  if (S.aff < 40 && Math.random() < (40 - S.aff)/50){ showEmote('😤', 1.6); cry('huff'); toast(`${S.name || '牠'}哼了一聲，不想理你……（親暱值太低，多餵牠、摸摸牠吧）`); return; }
  act = {key:k, t:0, dir:1, moved:0, jumped:false, rolls:0, noteT:0, step:0};
  const side = V3(1,0,0).applyAxisAngle(UP, root.rotation.y), fwd = V3(Math.sin(root.rotation.y),0,Math.cos(root.rotation.y));
  if (k === 'roll'){ const e = pos.clone().addScaledVector(side, 3.2*petS); act.dir = groundOK(e.x, e.z) ? 1 : -1; }
  if (k === 'flip' || k === 'spin') sqv += 2.2;
  if (k === 'shake') sfx('whoosh');
  if (k === 'dance' && !SND.on) toast('打開右上角的音樂，跳起來更好看。');
  if (k === 'snowman'){
    let c = pos.clone().addScaledVector(side, 1.4*petS); if (!groundOK(c.x, c.z)) c = pos.clone().addScaledVector(side, -1.4*petS);
    act.c = c; act.a0 = Math.atan2(pos.x-c.x, pos.z-c.z); act.R = 1.4*petS;
    act.ball = new THREE.Mesh(new THREE.SphereGeometry(1,20,14), mat('#f7f9fb',0.9)); scene.add(act.ball); act.ball2 = null;
  }
  if (k === 'puddle'){
    act.spots = [];
    let p = pos.clone(), yawP = root.rotation.y;
    for (let i=0;i<3;i++){ yawP += rnd(-0.6,0.6); let q = p.clone().add(V3(Math.sin(yawP),0,Math.cos(yawP)).multiplyScalar(1.6*petS + 0.6)); if (!groundOK(q.x, q.z)){ yawP += Math.PI; q = p.clone().add(V3(Math.sin(yawP),0,Math.cos(yawP)).multiplyScalar(1.6*petS + 0.6)); }
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.8*Math.max(petS,0.6), 28), new THREE.MeshStandardMaterial({color:'#8fb1c4', roughness:0.1, transparent:true, opacity:0.75}));
      m.rotation.x = -Math.PI/2; m.position.set(q.x, gy(q.x, q.z) + 0.03, q.z); m.scale.set(1.2,0.85,1); scene.add(m); puddles.push(m); act.spots.push(q); p = q; }
    act.from = pos.clone();
  }
  if (k === 'fireflies'){ act.wasVis = true; }
  B.mode = 'idle'; B.timer = 2; B.food = null; B.water = null;
}
function endAct(){
  if (!act) return;
  const k = act.key, st = S.st;
  if (act.ball) scene.remove(act.ball); if (act.ball2) scene.remove(act.ball2);
  act = null; actG.rotation.set(0,0,0); actY = 0;
  const gain = {sit:[-2,6], ballroll:[6,12], dance:[8,14], snowman:[10,20], puddle:[6,15], fireflies:[-6,15], moonview:[-5,22]}[k] || [6,10];
  st.energy = clamp(st.energy - gain[0], 0, 100); st.happy = clamp(st.happy + gain[1], 0, 100); st.thirst = clamp(st.thirst - 3, 0, 100);
  S.care.plays++; if (growthOK()) S.growth += 1; S.aff = clamp(S.aff + 4, 0, 100); track('play'); track('trick:' + k); if (k === 'dig') track('dig');
  if (k === 'flip' || k === 'spin'){ sqv += 2.6; sfx('thud'); }
  if (k === 'puddle'){ puddles.forEach(m => fxPull.push({g:m, t:0, flat:true})); puddles.length = 0; addCoins(2); }
  spawnHearts(2); cry('happy'); hudDirty = true;
}
function updateAct(dt){
  const inBelly = act && act.key === 'belly' && act.t/ACTS.belly.dur > 0.2 && act.t/ACTS.belly.dur < 0.8;
  wiggleW += ((inBelly?1:0) - wiggleW) * Math.min(1, dt*8);
  danceW += ((act && act.key === 'dance' ? 1 : 0) - danceW) * Math.min(1, dt*8);
  sitW += ((act && (act.key === 'fireflies' || act.key === 'sit' || act.key === 'moonview' || act.key === 'wave')) || (B.mode === 'beg' && B.begSit) || B.mode === 'scratch' ? 1 - sitW : -sitW) * Math.min(1, dt*3);
  if (!act){ return {shake:0, walk:false}; }
  act.t += dt;
  const A = ACTS[act.key], p = Math.min(act.t/A.dur, 1), s = petS; let shakeF = 0, walk = false;
  actG.rotation.set(0,0,0); actY = 0;
  switch (act.key){
    case 'flip': { const u = clamp((p-0.15)/0.8,0,1); if (!act.jumped && p >= 0.15){ act.jumped = true; sfx('boing'); }
      actY = 4*2.2*s*u*(1-u); actG.rotation.x = -2*Math.PI*ease(u); break; }
    case 'roll': { const r = ease(p); actG.rotation.z = -act.dir*2*Math.PI*3*r; actY = Math.abs(Math.sin(actG.rotation.z))*0.08*s;
      const d = 3.0*s*r, delta = d - act.moved; act.moved = d; pos.addScaledVector(V3(1,0,0).applyAxisAngle(UP, root.rotation.y), act.dir*delta);
      const n = Math.floor(r*3+0.15); if (n > act.rolls){ act.rolls = n; sfx('whoosh'); } break; }
    case 'spin': { const u = clamp((p-0.1)/0.85,0,1); if (!act.jumped && p >= 0.1){ act.jumped = true; sfx('boing'); }
      actY = 4*1.6*s*u*(1-u); actG.rotation.y = 2*Math.PI*ease(u); break; }
    case 'belly': {
      if (p < 0.2){ const r = ease(p/0.2); actG.rotation.z = Math.PI*r; actY = Math.sin(r*Math.PI)*0.25*s; }
      else if (p < 0.8) actG.rotation.z = Math.PI + Math.sin(act.t*6)*0.15;
      else { const r = ease((p-0.8)/0.2); actG.rotation.z = Math.PI + Math.PI*r; actY = Math.sin(r*Math.PI)*0.25*s; }
      break; }
    case 'ballroll': {   // curl up, roll forward two full turns, uncurl
      const u = clamp((p - 0.15)/0.7, 0, 1), r = ease(u), dist = 3.2*s*r, delta = dist - act.moved; act.moved = dist;
      pos.addScaledVector(V3(Math.sin(root.rotation.y), 0, Math.cos(root.rotation.y)), delta); actG.rotation.x = 4*Math.PI*r;
      const k = Math.floor(r*4); if (k > act.rolls && u < 1){ act.rolls = k; sfx('whoosh'); } break; }
    case 'shake': { const w = Math.sin(p*Math.PI*16)*(1-p); actG.rotation.z = w*0.28; shakeF = w; break; }
    case 'dig': {   // nose down, front paws scrabbling, dirt flying out behind; sometimes turns up a coin
      const k = Math.min(1, p*5, (1-p)*5); actG.rotation.x = 0.22*k; actY = -0.04*s*k;
      if (act.t > act.noteT && p > 0.1 && p < 0.9){ act.noteT = act.t + 0.12; sfx('scratch');
        const back = V3(-Math.sin(root.rotation.y), 0, -Math.cos(root.rotation.y)), at = pos.clone().addScaledVector(back, 0.3*s); at.y = petGY + 0.2;
        floatSprite(radialTex('rgba(120,88,58,1)','rgba(120,88,58,0)'), at, {size:0.18, vx:back.x*rnd(1,2.2) + rnd(-0.6,0.6), vz:back.z*rnd(1,2.2) + rnd(-0.6,0.6), vy:rnd(1.5,2.6), g:9, max:0.7, grow:0}); }
      if (!act.found && p > 0.85){ act.found = true; if (Math.random() < 0.4){ addCoins(1 + Math.floor(Math.random()*3)); showEmote('🪙', 1.4); } else showEmote('🤔', 1.2); }
      break; }
    case 'zoomies': {   // a burst of running in a tight circle
      walk = true; if (!act.c){ const side = V3(Math.cos(root.rotation.y), 0, -Math.sin(root.rotation.y)); act.c = pos.clone().addScaledVector(side, 1.3*s); act.a0 = Math.atan2(pos.x - act.c.x, pos.z - act.c.z); }
      const ang = act.a0 + ease(p)*Math.PI*4, nx = act.c.x + Math.sin(ang)*1.3*s, nz = act.c.z + Math.cos(ang)*1.3*s;
      if (groundOK(nx, nz)){ root.rotation.y = Math.atan2(nx - pos.x, nz - pos.z) || root.rotation.y; pos.x = nx; pos.z = nz; }
      actG.rotation.z = -0.18*Math.sin(p*Math.PI); actY = Math.abs(Math.sin(act.t*14))*0.06*s;
      if (Math.random() < dt*10) floatSprite(radialTex('rgba(214,196,160,0.8)','rgba(214,196,160,0)'), V3(pos.x, petGY + 0.1, pos.z), {size:0.5, vy:0.3, max:0.8, grow:1});
      break; }
    case 'wave': B.lookPitch = -0.2; break;
    case 'bow': { const k = Math.sin(Math.min(1, p*1.3)*Math.PI); actG.rotation.x = 0.4*k; actY = -0.06*s*k; break; }
    case 'hop': { const n = 3, u = (p*n) % 1, i = Math.floor(p*n); actY = 4*0.7*s*u*(1-u); if (act.step <= i && u > 0.9){ act.step = i + 1; sqv += 1.2; sfx('pop'); }
      const fwd = V3(Math.sin(root.rotation.y), 0, Math.cos(root.rotation.y)), nx = pos.x + fwd.x*0.9*s*dt/ACTS.hop.dur*n, nz = pos.z + fwd.z*0.9*s*dt/ACTS.hop.dur*n;
      if (groundOK(nx, nz)){ pos.x = nx; pos.z = nz; } break; }
    case 'stretch': { const k = Math.sin(Math.min(1, p*1.2)*Math.PI); actG.rotation.x = -0.25*k; if (!act.yawned && p > 0.3){ act.yawned = true; showEmote('🥱', 1.6); cry('sleepy'); } break; }
    case 'dance': { const b = act.t*Math.PI*2*1.7, fade = Math.min(1, (1-p)*6);
      actY = Math.abs(Math.sin(b))*0.28*s*fade; actG.rotation.y = Math.sin(b*0.5)*0.6*fade; actG.rotation.z = Math.sin(b)*0.14*fade;
      if (act.t > act.noteT){ act.noteT = act.t + 0.45; floatSprite(textTex(Math.random()<.5?'♪':'♫', '#3f6b55', 'bold 96px sans-serif', 'rgba(255,255,255,.8)'), headTop(), {size:0.45, vy:1, vx:rnd(-0.6,0.6), depthTest:false}); }
      break; }
    case 'snowman': {
      const T = act.t;
      if (T < 6.2){
        walk = true;
        const ang = act.a0 + T*0.9;
        const nx = act.c.x + Math.sin(ang)*act.R, nz = act.c.z + Math.cos(ang)*act.R;
        root.rotation.y = Math.atan2(nx-pos.x, nz-pos.z) || root.rotation.y; pos.x = nx; pos.z = nz;
        const fwd = V3(Math.sin(root.rotation.y),0,Math.cos(root.rotation.y));
        const big = T < 3.4, r = big ? lerp(0.12, 0.55, T/3.4) : lerp(0.1, 0.38, (T-3.4)/2.8);
        const ball = big ? act.ball : (act.ball2 || (act.ball2 = new THREE.Mesh(new THREE.SphereGeometry(1,20,14), act.ball.material), scene.add(act.ball2), act.ball2));
        ball.scale.setScalar(r); ball.position.copy(pos).addScaledVector(fwd, 2.05*s + r); ball.position.y = gy(ball.position.x, ball.position.z) + r; ball.rotation.x += dt*3;
        if (!big && !act.parked){ act.parked = act.ball.position.clone(); }
        if (act.parked) act.ball.position.copy(act.parked);
      } else if (!act.built){
        act.built = true; const p0 = act.parked || act.ball.position;
        makeSnowman(p0.x, p0.z, Math.atan2(camera.position.x-p0.x, camera.position.z-p0.z));
        scene.remove(act.ball); if (act.ball2) scene.remove(act.ball2); act.ball = act.ball2 = null;
        sparkles(V3(p0.x,1,p0.z), 12, 0.8); addCoins(5, V3(p0.x,1.8,p0.z)); sfx('happy');
      }
      break; }
    case 'puddle': {
      const seg = 4.2/3, i = Math.min(2, Math.floor(act.t/seg)), u = clamp((act.t - i*seg)/seg, 0, 1);
      const from = i === 0 ? act.from : act.spots[i-1], to = act.spots[i];
      const lu = clamp((u-0.15)/0.7, 0, 1);
      if (u > 0.15 && u < 0.9){ pos.x = lerp(from.x, to.x, lu); pos.z = lerp(from.z, to.z, lu); actY = 4*1.2*s*lu*(1-lu); }
      root.rotation.y += clamp(wrapA(Math.atan2(to.x-from.x, to.z-from.z) - root.rotation.y), -6*dt, 6*dt);
      if (act.step <= i && u >= 0.88){ act.step = i+1; sqv += 2.2; sfx('splash');
        for (let k=0;k<14;k++){ const a = Math.random()*Math.PI*2; floatSprite(radialTex('rgba(210,232,245,1)','rgba(210,232,245,0)'), V3(to.x, gy(to.x, to.z) + 0.15, to.z), {size:0.22, vx:Math.cos(a)*rnd(1,2.2), vz:Math.sin(a)*rnd(1,2.2), vy:rnd(2,3.5), g:9, max:0.8, grow:0}); } }
      break; }
    case 'fireflies': { if (act.t > act.noteT){ act.noteT = act.t + 1.6; spawnHearts(1); } break; }
    case 'moonview': {   // sit facing the moon and gaze up at it
      root.rotation.y += clamp(wrapA(Math.atan2(moonDirNow.x, moonDirNow.z) - root.rotation.y), -2*dt, 2*dt);
      if (act.t > act.noteT){ act.noteT = act.t + 2.2; if (act.t > 1.5) floatSprite(sparkTex, headTop(), {size:0.3, vy:0.6, add:true, max:1.4}); }
      break; }
  }
  if (p >= 1) endAct();
  return {shake:shakeF, walk};
}

// extra leg swings for some tricks (front legs have l.front > 0; legs[1] is the right front leg)
function actLeg(l){
  if (!act) return 0; const k = act.key, f = l.front > 0;
  if (k === 'dig' && f) return 0.6 + Math.sin(t*22 + l.phase*3)*0.7;
  if (k === 'zoomies') return Math.sin(t*22 + l.phase)*0.7;
  if (k === 'wave' && l === legs[1]) return 1.3 + Math.sin(t*10)*0.35;
  if (k === 'stretch' && f) return 0.9*Math.sin(Math.min(1, act.t/ACTS.stretch.dur*1.2)*Math.PI);
  return 0;
}

// ---------- daily tasks & achievements ----------
// track() counts things the player does; daily tasks reset every day (Taiwan date), achievements are forever. Both pay coins.
const todayKey = () => { const d = new Date(Date.now() + 8*3600000); return d.toISOString().slice(0, 10); };   // Taiwan date
function track(ev, n = 1){
  if (PREVIEW) return;
  S.stats = S.stats || {}; S.stats[ev] = (S.stats[ev] || 0) + n;
  const D_ = dailyNow(); D_.tasks.forEach(tk => { if (tk.ev === ev && !tk.done){ tk.n = Math.min(tk.goal, tk.n + n); if (tk.n >= tk.goal) finishTask(tk); } });
  checkAch();
}
const stat = ev => (S.stats && S.stats[ev]) || 0;
const DAILY_POOL = [
  {ev:'weed', goal:3, txt:'拔 3 株雜草', coins:15}, {ev:'poop', goal:3, txt:'清 3 坨便便', coins:15}, {ev:'feed', goal:3, txt:'餵牠吃 3 次東西', coins:12},
  {ev:'drink', goal:2, txt:'讓牠喝 2 次水', coins:10}, {ev:'pet', goal:10, txt:'摸摸牠 10 次', coins:10}, {ev:'play', goal:3, txt:'陪牠玩 3 個招式', coins:15},
  {ev:'shell', goal:3, txt:'在海邊撿 3 個貝殼', coins:15, need:() => world.data.open.some(k => k.startsWith('1,'))},
  {ev:'clear', goal:1, txt:'清掉 1 個石頭、樹叢或樹', coins:20}, {ev:'scratch', goal:1, txt:'看牠抓一次樹', coins:10}, {ev:'dig', goal:2, txt:'讓牠挖 2 次洞', coins:15, need:() => hasTrick('dig')}
];
function dailyNow(){
  const day = todayKey();
  if (!S.daily || S.daily.day !== day){
    const pool = DAILY_POOL.filter(p => !p.need || p.need()), picks = [];
    let seed = [...day].reduce((h, c) => (h*31 + c.charCodeAt(0)) >>> 0, 7);
    while (picks.length < 3 && pool.length){ seed = (seed*1103515245 + 12345) >>> 0; picks.push(pool.splice(seed % pool.length, 1)[0]); }
    S.daily = {day, bonus:false, tasks:picks.map(p => ({ev:p.ev, goal:p.goal, txt:p.txt, coins:p.coins, n:0, done:false}))};
    taskBadge();
  }
  return S.daily;
}
function finishTask(tk){
  tk.done = true; addCoins(tk.coins); sfx('happy'); toast(`每日任務完成：${tk.txt}！+${tk.coins} 代幣`);
  const D_ = S.daily; if (!D_.bonus && D_.tasks.every(x => x.done)){ D_.bonus = true; S.stats.dailyAll = stat('dailyAll') + 1; setTimeout(() => { addCoins(30); sfx('grow'); toast('今天的每日任務全部完成！額外 +30 代幣'); }, 1600); }
  taskBadge(); save();
}
const ALL_FORMS = Object.keys(FORMS);
const ACH = [
  {id:'poop1', icon:'💩', name:'第一次鏟屎', desc:'清掉第一坨便便', test:() => stat('poop') >= 1, coins:10},
  {id:'poop10', icon:'🧹', name:'鏟屎小幫手', desc:'清掉 10 坨便便', test:() => stat('poop') >= 10, coins:20},
  {id:'poop100', icon:'🏅', name:'鏟屎官', desc:'清掉 100 坨便便', test:() => stat('poop') >= 100, coins:80},
  {id:'weed1', icon:'🌱', name:'拔草新手', desc:'拔掉第一株雜草', test:() => stat('weed') >= 1, coins:10},
  {id:'weed20', icon:'🌿', name:'除草達人', desc:'拔掉 20 株雜草', test:() => stat('weed') >= 20, coins:25},
  {id:'weed100', icon:'🌾', name:'雜草剋星', desc:'拔掉 100 株雜草', test:() => stat('weed') >= 100, coins:80},
  {id:'shell1', icon:'🐚', name:'撿到貝殼', desc:'在海邊撿到第一個貝殼', test:() => stat('shell') >= 1, coins:10},
  {id:'shell20', icon:'🦪', name:'貝殼收藏家', desc:'撿 20 個貝殼', test:() => stat('shell') >= 20, coins:40},
  {id:'bottle1', icon:'🍾', name:'海上來的信', desc:'打開第一封瓶中信', test:() => stat('bottle') >= 1, coins:15},
  {id:'plot1', icon:'🪓', name:'開疆闢土', desc:'第一次整理出新的土地', test:() => world.data.open.length >= 2, coins:30},
  {id:'plotAll', icon:'🗺️', name:'領主', desc:'把所有土地都整理好', test:() => world.data.open.length >= PLOT_KEYS.length, coins:300},
  {id:'rock1', icon:'🪨', name:'搬石頭', desc:'第一次搬走石頭', test:() => stat('rock') >= 1, coins:10},
  {id:'rock10', icon:'⛰️', name:'大力士', desc:'搬走 10 顆石頭', test:() => stat('rock') >= 10, coins:40},
  {id:'tree1', icon:'🪵', name:'伐木工', desc:'第一次砍樹', test:() => stat('tree') >= 1, coins:10},
  {id:'tree10', icon:'🌲', name:'樵夫', desc:'砍掉 10 棵樹', test:() => stat('tree') >= 10, coins:40},
  {id:'bush1', icon:'🌳', name:'修剪樹叢', desc:'第一次清掉樹叢', test:() => stat('bush') >= 1, coins:10},
  {id:'bush10', icon:'✂️', name:'園藝高手', desc:'清掉 10 個樹叢', test:() => stat('bush') >= 10, coins:30},
  {id:'hive', icon:'🐝', name:'跟胡蜂說再見', desc:'清除一個蜂窩', test:() => stat('hive') >= 1, coins:15},
  {id:'sting', icon:'🐝', name:'好痛！', desc:'袋熊被胡蜂叮了', test:() => stat('sting') >= 1, coins:10},
  {id:'bridge', icon:'🌉', name:'過河', desc:'蓋第一座橋', test:() => stat('bridge') >= 1, coins:20},
  {id:'pet100', icon:'🤲', name:'摸摸大師', desc:'摸摸牠 100 次', test:() => stat('pet') >= 100, coins:30},
  {id:'moon', icon:'🌕', name:'花前月下', desc:'和牠一起賞月', test:() => stat('trick:moonview') >= 1, coins:30},
  {id:'tricks', icon:'🎪', name:'馬戲團', desc:'學會所有招式', test:() => Object.keys(ACTS).every(hasTrick), coins:100},
  {id:'builds5', icon:'🏘️', name:'小鎮規劃', desc:'蓋 5 種建築', test:() => Object.values(S.builds).filter(Boolean).length >= 5, coins:40},
  {id:'daily7', icon:'📅', name:'每天報到', desc:'完成 7 天的全部每日任務', test:() => stat('dailyAll') >= 7, coins:60},
  ...ALL_FORMS.map(f => ({id:'form_' + f, icon:'🧬', name:`圖鑑：${FORMS[f].name}`, desc:`養出${FORMS[f].name}`, test:() => !!(S.formsSeen && S.formsSeen[f]), coins: ['golden','forestx','thunder'].includes(f) ? 120 : ['royal','forest','wind'].includes(f) ? 60 : 25})),
  ...Object.entries({...SPECIES, ...WILD_NAMES}).map(([k, nm]) => ({id:'meet_' + k, icon:ANIMAL_ICON[k] || '🐾', name:`遇見${nm.replace(/（.*/, '')}`, desc:`在野外點一下${nm}`, test:() => stat('meet:' + k) >= 1, coins:15})),
  {id:'feed100', icon:'🍽️', name:'大胃王的主人', desc:'餵牠吃 100 次東西', test:() => stat('feed') >= 100, coins:50},
  {id:'drink50', icon:'💧', name:'多喝水', desc:'讓牠喝 50 次水', test:() => stat('drink') >= 50, coins:30},
  {id:'play50', icon:'🎭', name:'表演家', desc:'表演 50 次招式', test:() => stat('play') >= 50, coins:50},
  {id:'dig10', icon:'⛏️', name:'挖洞專家', desc:'挖 10 次洞', test:() => stat('dig') >= 10, coins:30},
  {id:'scratch10', icon:'🌳', name:'磨爪子', desc:'看牠抓樹 10 次', test:() => stat('scratch') >= 10, coins:25},
  {id:'shell50', icon:'🐚', name:'貝殼大亨', desc:'撿 50 個貝殼', test:() => stat('shell') >= 50, coins:80},
  {id:'bottle10', icon:'📜', name:'收信人', desc:'打開 10 封瓶中信', test:() => stat('bottle') >= 10, coins:60},
  {id:'bridge3', icon:'🌉', name:'造橋工程師', desc:'蓋 3 座橋', test:() => stat('bridge') >= 3, coins:50},
  {id:'swim', icon:'🛟', name:'游泳初體驗', desc:'第一次套著游泳圈下水', test:() => stat('swim') >= 1, coins:20},
  {id:'swim20', icon:'🏊', name:'游泳健將', desc:'下水游泳 20 次', test:() => stat('swim') >= 20, coins:50},
  {id:'plot4', icon:'🧭', name:'小地主', desc:'擁有 4 塊領地', test:() => world.data.open.length >= 4, coins:60},
  {id:'plot8', icon:'🏞️', name:'大地主', desc:'擁有 8 塊領地', test:() => world.data.open.length >= 8, coins:120},
  {id:'rich', icon:'💰', name:'小富翁', desc:'累積賺到 1000 代幣', test:() => stat('earned') >= 1000, coins:100},
  {id:'daily30', icon:'🗓️', name:'全勤獎', desc:'完成 30 天的全部每日任務', test:() => stat('dailyAll') >= 30, coins:200},
  {id:'aff100', icon:'💞', name:'形影不離', desc:'親暱值達到 100', test:() => S.aff >= 99.5, coins:40},
  {id:'old7', icon:'🎂', name:'一週年……的一週', desc:'陪牠超過 7 天', test:() => S.ageMs >= 7*86400000, coins:80},
  {id:'gen2', icon:'🥚', name:'新的家人', desc:'養第二隻袋熊', test:() => S.gen >= 2, coins:30},
  {id:'dye', icon:'🎨', name:'換個髮色', desc:'第一次幫牠染毛', test:() => S.dye != null, coins:15},
  {id:'clothes5', icon:'👗', name:'衣櫃滿滿', desc:'收集 5 件衣服', test:() => Object.values(S.owned).filter(Boolean).length >= 5, coins:40},
  {id:'builds10', icon:'🏙️', name:'城市規劃師', desc:'蓋 10 種建築', test:() => Object.values(S.builds).filter(Boolean).length >= 10, coins:100},
  {id:'fish10', icon:'🎣', name:'看魚跳', desc:'讓魚跳出水面 10 次', test:() => stat('meet:fish') >= 10, coins:25},
  {id:'eagleHunt', icon:'🦅', name:'獵鷹出擊', desc:'親眼看到老鷹俯衝抓到獵物', test:() => stat('eagleCatch') >= 1, coins:40},
  {id:'beetle5', icon:'🪲', name:'甲蟲收集家', desc:'點一下甲蟲 5 次（樹幹上、石頭上都有）', test:() => stat('meet:beetle') >= 5, coins:30},
  {id:'worm3', icon:'🪱', name:'雨後的小客人', desc:'下雨後點一下 3 隻蚯蚓', test:() => stat('meet:worm') >= 3, coins:30},
  {id:'rabbit5', icon:'🐇', name:'兔子嚇一跳', desc:'讓野兔逃回洞裡 5 次', test:() => stat('meet:rabbit') >= 5, coins:30},
  {id:'litter20', icon:'🧺', name:'各地清潔隊', desc:'清掉 20 個各地區特有的雜物（風滾草、枯樹枝、布袋蓮、海草…）', test:() => stat('litter') >= 20, coins:40},
  {id:'meetAll', prog:() => { const ks = Object.keys({...SPECIES, ...WILD_NAMES}); return [ks.filter(k => stat('meet:' + k) >= 1).length, ks.length]; }, icon:'🦓', name:'動物博士', desc:'遇見所有的野生動物', test:() => Object.keys({...SPECIES, ...WILD_NAMES}).every(k => stat('meet:' + k) >= 1), coins:300},
  {id:'use1', icon:'🎠', name:'院子遊樂園', desc:'第一次讓牠玩院子裡的設施', test:() => stat('use') >= 1, coins:15},
  {id:'swing10', icon:'🎡', name:'鞦韆高手', desc:'盪 10 次鞦韆', test:() => stat('use:swing') >= 10, coins:40},
  {id:'mud5', icon:'🟤', name:'泥巴小子', desc:'在泥巴裡打滾 5 次', test:() => stat('use:mud') >= 5, coins:30},
  {id:'cave', icon:'🕳️', name:'狼的家', desc:'打開狼的高地', test:() => world.isOpenKey(BIO.high), coins:50},
  {id:'forest', icon:'🌲', name:'走進森林', desc:'打開鹿的森林', test:() => world.isOpenKey(BIO.forest), coins:50},
  {id:'formsAll', icon:'📖', name:'袋熊圖鑑完成', desc:'養出所有型態的袋熊', test:() => ALL_FORMS.every(f => S.formsSeen && S.formsSeen[f]), coins:500}
];
let achBusy = false;
function checkAch(){
  if (PREVIEW || achBusy) return; achBusy = true;
  S.ach = S.ach || {};
  if (S.stage !== 'egg' && !S.dead){ S.formsSeen = S.formsSeen || {}; if (!S.formsSeen[S.form]){ S.formsSeen[S.form] = true; } }
  const fresh = ACH.filter(a => !S.ach[a.id] && a.test());
  fresh.forEach((a, i) => { S.ach[a.id] = Date.now(); setTimeout(() => { addCoins(a.coins); sfx('grow'); toast(`🏆 成就達成：${a.name}！+${a.coins} 代幣`); }, i*1800); });
  if (fresh.length){ taskBadge(); save(); }
  achBusy = false;
}
function taskBadge(){ const D_ = S.daily, left = D_ ? D_.tasks.filter(x => !x.done).length : 3; const b = $('#btnTasks'); if (b) b.textContent = `📋 任務${left ? `（${left}）` : ' ✓'}`; }
let taskTab = 'daily';
// how far along an achievement is ("3 / 10"), read from its test (stat(...) >= n, or a few other counters)
function achProg(a){
  if (a.prog) return a.prog();
  const src = a.test.toString(); let m = src.match(/stat\('([^']+)'\)\s*>=\s*(\d+)/);
  if (m) return [Math.min(+m[2], Math.floor(stat(m[1]))), +m[2]];
  m = src.match(/(world\.data\.open\.length|S\.gen)\s*>=\s*(\d+)/); if (m) return [Math.min(+m[2], m[1] === 'S.gen' ? S.gen : world.data.open.length), +m[2]];
  m = src.match(/\.length\s*>=\s*(\d+)/); if (m){ try { const L = src.match(/=>\s*(.*)\.length\s*>=/)[1]; return [Math.min(+m[1], eval(L + '.length')), +m[1]]; } catch(e){} }
  return null;
}
function tasksHTML(){
  const D_ = dailyNow();
  if (taskTab === 'daily') return D_.tasks.map(tk => `<div class="card" style="margin-bottom:8px"><div class="row"><h3>${tk.done ? '✅' : '⬜'} ${tk.txt}</h3><span>+${tk.coins}</span></div>`
      + `<div class="track" style="margin-top:6px"><div class="fill" style="width:${Math.round(tk.n/tk.goal*100)}%"></div></div><p>${tk.n} / ${tk.goal}</p></div>`).join('')
    + `<p class="sec">三個都完成再加 30 代幣${D_.bonus ? '（今天已領）' : ''}。每天（台灣時間）午夜換新任務。</p>`;
  const got = ACH.filter(a => S.ach && S.ach[a.id]).length;
  const skills = `<p class="sec">跟動物學的本領</p><div class="tiles">` + Object.entries(SKILLS).map(([k, sk]) => { const ok = hasSkill(k), nm = SPECIES[sk.from] || WILD_NAMES[sk.from] || sk.from;
    return `<div class="tile${ok ? '' : ' dim'}"><span class="ti">${sk.icon}</span><span class="tn">${sk.name}</span><span class="tn" style="color:var(--soft);font-size:11px">${ok ? sk.desc : `點過 ${sk.need} 隻不同的${nm}${sk.area ? `（要先${sk.areaTxt}）` : ''}`}</span>`
      + `${ok ? '' : `<span class="tn" style="font-size:11px;font-weight:700">${Math.min(sk.need, skillCount(k))} / ${sk.need}</span>`}<span class="tb">${ok ? '✓' : ''}</span></div>`; }).join('') + `</div>`;
  return skills + `<p class="sec">已達成 ${got} / ${ACH.length}</p><div class="tiles">` + ACH.map(a => { const ok = S.ach && S.ach[a.id];
    const pg = ok ? null : achProg(a);
    return `<div class="tile${ok ? '' : ' dim'}" title="${a.desc}"><span class="ti">${a.icon}</span><span class="tn">${a.name}</span><span class="tn" style="color:var(--soft);font-size:11px">${a.desc}</span>${pg ? `<span class="tn" style="font-size:11px;font-weight:700">${pg[0]} / ${pg[1]}</span>` : ''}<span class="tb">${ok ? '✓' : '+' + a.coins}</span></div>`; }).join('') + `</div>`;
}
// ---------- life simulation ----------
const STAGES = {
  baby:    {name:'幼兒期', next:'child',    age:20,      growth:25,  scale:[0.42,0.6]},
  child:   {name:'成長期', next:'adult',    age:360,     growth:120, scale:[0.62,0.88]},
  adult:   {name:'成熟期', next:'perfect',  age:2*1440,  growth:300, scale:[1,1]},
  perfect: {name:'完全體', next:'ultimate', age:4*1440,  growth:500, scale:[1.1,1.1]},
  ultimate:{name:'究極體', scale:[1.2,1.2]}
};
const STAGE_ORDER = ['baby','child','adult','perfect','ultimate'];
const LIFE = 8*1440;
const ageMin = () => S.ageMs/60000;
// weeds/litter spread over every open plot, so they weigh less the bigger the land is: a full load of weeds costs at most 30
const weedCap = () => Math.min(26, 8 + 3*world.data.open.length);
const cleanVal = () => clamp(100 - cubes.filter(c => !c.cleaning).length*12 - weeds.length*30/weedCap(), 0, 100);
const growthOK = () => S.st.health >= 50 && S.st.hunger >= 30 && S.st.thirst >= 30;
function weatherNow(){
  if (S.weather.forced) return S.weather.forced;
  const h = activeHoliday(); if (h && h.id === 'christmas') return 'snow';
  return S.weather.type;
}
function badWeather(){ const w = weatherNow(); return w === 'rain' || w === 'storm'; }
const HAPPY_GAIN = 0.6; let lastHappy = null;
function sim(m, offline){
  if (S.dead || S.stage === 'egg') return;
  const st = S.st, k = offline ? 0.25 : 1, w = weatherNow();
  if (lastHappy != null && st.happy > lastHappy) st.happy = lastHappy + (st.happy - lastHappy)*HAPPY_GAIN;   // every boost to mood counts a bit less, so it builds up slowly
  const fBaby = S.stage === 'baby' ? 1.25 : 1, fOld = S.stage === 'ultimate' ? 1.15 : 1, dirty = cleanVal() < 40;
  st.hunger -= 0.7*m*k*fBaby*fOld*(S.form === 'chubby' ? 1.15 : 1);
  st.thirst -= 0.9*m*k*(w==='rain'||w==='storm' ? 0.6 : 1)*fOld;
  st.happy  -= (0.45 + (dirty?0.3:0) + (badWeather()?0.1:0))*m*k*(BG.flowers ? 0.7 : 1)*(BG.fountain ? 0.85 : 1);
  if (BG.fruittree){ S.fruitT = (S.fruitT ?? 120) - m; if (S.fruitT <= 0){ S.fruitT = 120; S.food = S.food || {}; if (!S.food.apple){ S.food.apple = true; if (!offline) toast('果樹結果了！以後蘋果隨時都能免費給牠吃。'); } else { S.coins += 3; if (!offline) toast('果樹結的蘋果賣了 3 代幣。'); } } }
  S.aff = clamp(S.aff - (0.05 + (st.hunger < 25 || dirty ? 0.04 : 0))*m*k, 0, 100);   // affection fades slowly unless you keep caring
  if (S.swollen){ st.happy -= 0.25*m*k; st.health -= 0.08*m*k; }   // bee-sting bumps hurt until treated
  if (S.muddy > 0){ S.muddy = Math.max(0, S.muddy - m*(badWeather() ? 60 : 12)); applyFur(); }   // the mud wears off (fast in the rain)
  if (offline) st.energy += 1.2*m;
  else if (asleep()) st.energy += (B.mode === 'inHouse' ? 3.2 : 2.4)*m;
  else if (act && act.key === 'fireflies') st.energy += 1.5*m;
  else st.energy -= 0.35*m*(w==='snow'?1.3:1)*(st.health<35?1.3:1)*(S.form === 'sporty' ? 0.8 : 1);
  let dh = 0;
  if (st.hunger < 15) dh -= 1.0;
  if (st.thirst < 15) dh -= 1.0;
  if (dirty) dh -= 0.6;
  if (st.happy < 15) dh -= 0.3;
  if (dh === 0 && st.hunger > 40 && st.thirst > 40) dh = 0.5;
  st.health += dh*m*(offline ? 0.3 : 1);
  for (const key in st) st[key] = clamp(st[key], 0, 100);
  if (offline) st.health = Math.max(st.health, 5);
  const c = S.care;
  if (st.hunger < 25) c.hungry += m; if (st.thirst < 25) c.thirsty += m; if (dirty) c.dirty += m; if (st.health < 35) c.sick += m;
  if (growthOK()) S.growth += 0.08*m;
  S.weedTimer -= m;
  if (S.weedTimer <= 0){ spawnWeed(); S.weedTimer = rnd(5,9)*(BG.fence ? 1.5 : 1)*(BG.scarecrow ? 1.3 : 1); }
  S.bushT = (S.bushT ?? 10) - m;   // now and then a bush grows back somewhere on your land (never rocks or trees)
  if (S.bushT <= 0 && !offline){ S.bushT = rnd(8, 16); const open = world.data.open;
    if (world.feats.filter(f => f.d.k === 'bush').length < open.length*2){ const k = open[Math.floor(Math.random()*open.length)], [a, b] = k.split(',').map(Number);
      for (let i=0;i<12;i++){ const x = a*PLOT + rnd(-PLOT/2 + 1, PLOT/2 - 1), z = b*PLOT + rnd(-PLOT/2 + 1, PLOT/2 - 1); if (!groundOK(x, z) || world.isBeach(x, z) || world.isMud(x, z) || obstacles().some(o => Math.hypot(o.c.x - x, o.c.z - z) < o.r + 1.2) || Math.hypot(x - pos.x, z - pos.z) < 2.5) continue;
        if (Object.entries(S.place || {}).some(([id, p]) => { const bd = bdef(id); return bd && bd.size && S.builds[id] && cellsOf(bd, p).some(([cx, cz]) => Math.hypot(cx - x, cz - z) < 1.5); })) continue;
        world.addBush(x, z, k); NAV.dirty = true; break; } } }
  lastHappy = clamp(st.happy, 0, 100);
}
function decideForm(next){
  const c = S.care, st = S.st;
  if (cubes.length >= 3) return 'stinky';
  if (st.health < 35) return 'sickly';
  if (st.hunger < 30 || c.hungry >= 40) return 'skinny';
  if (c.overfed >= 4) return 'chubby';
  const mistakes = c.hungry + c.thirsty + c.dirty + c.sick, good = mistakes < 30 && st.happy >= 70;
  // Perfect-stage branches: 疾風 (sporty + lots of play), 森靈 (nature lover), otherwise 皇家.
  // Each one becomes its own ultimate form if the care stays perfect.
  if (next === 'perfect' && good){
    if (S.form === 'sporty' && c.plays >= 8) return 'wind';
    if (c.nature >= 12 || (BG.pond && BG.flowers)) return 'forest';
    return 'royal';
  }
  if (next === 'ultimate' && good) return {royal:'golden', forest:'forestx', wind:'thunder'}[S.form] || 'royal';
  if (next !== 'child' && c.plays >= 8) return 'sporty';
  return 'normal';
}
function readyToEvolve(){
  const sd = STAGES[S.stage]; if (!sd || !sd.next) return false;
  return ageMin() >= sd.age && S.growth >= sd.growth;
}
function checkStage(){
  if (S.dead || S.stage === 'egg' || !petActive() || evo || PREVIEW) return;
  if (ageMin() >= LIFE){ die('old'); return; }
  if (S.st.health <= 0){ die('sick'); return; }
  if (readyToEvolve() && !act && !dragging && pos.y < 0.02 && ['idle','walk','goto'].includes(B.mode)) startEvolution(STAGES[S.stage].next);
}
// the wombat is drawn at 80% of its old size so that tigers, horses and hippos can be properly bigger than it
const WOMBAT_SIZE = 0.8;
function stageScale(){ return WOMBAT_SIZE*stageScale0(); }
function stageScale0(){
  const sd = STAGES[S.stage]; if (!sd) return 0.45;
  if (S.stage === 'baby') return lerp(sd.scale[0], sd.scale[1], clamp(S.growth/25, 0, 1));
  if (S.stage === 'child') return lerp(sd.scale[0], sd.scale[1], clamp((S.growth-25)/95, 0, 1));
  return sd.scale[0];
}
function catchUp(ms){
  if (ms < 1500) return;
  const gameMin = ms/60000*S.speed;
  if (S.stage === 'egg'){ S.warm = Math.min(100, S.warm + ms/1000*S.speed); return; }
  if (S.dead) return;
  S.ageMs += gameMin*60000;
  let left = Math.min(gameMin, 720);
  while (left > 0){ const c = Math.min(5, left); sim(c, true); left -= c; }
  S.poopQ.forEach(() => { const a = Math.random()*Math.PI*2, r = rnd(1.5,3), q = freeNear(V3(clamp(pos.x+Math.sin(a)*r,-5,5), 0, clamp(pos.z+Math.cos(a)*r,-5,5))), sc = 0.5+0.5*Math.min(petS,1); makePoop(V3(q.x, gy(q.x, q.z) + 0.1*sc, q.z), null, sc); });
  S.poopQ = [];
  hudDirty = true;
}

// ---------- evolution ----------
const fxo = $('#fxo'), fxSub = $('#fxSub'), fxName = $('#fxName');
function startEvolution(next){
  evo = {t:0, next, form:decideForm(next), spin:0, swapped:false, burst:false};
  B.mode = 'evolve'; closeSheet(); clothesHidden = true; applyClothes();
  fxo.hidden = false; fxo.classList.remove('reveal'); fxSub.textContent = `${S.name || '牠'}要進化了……`; fxName.textContent = '';
  duck(true); sfx('evolve'); cry('evolve');
}
function updateEvo(dt){
  const e = evo; e.t += dt; const t = e.t, s = petS;
  const spd = t < 3.2 ? 4 + (t/3.2)*26 : Math.max(0, 30*(1 - (t-3.2)/1.4));
  e.spin += spd*dt;
  if (t > 4.6){ const target = Math.round(e.spin/(Math.PI*2))*Math.PI*2; e.spin += (target - e.spin)*Math.min(1, dt*5); }
  actG.rotation.set(0, e.spin, 0);
  actY = s*(t < 0.8 ? ease(t/0.8)*0.9 : t < 4.6 ? 0.9 + Math.sin(t*3)*0.08 : 0.9*(1 - ease(clamp((t-4.6)/0.6,0,1))));
  const white = t < 0.6 ? 0 : t < 2.6 ? ease((t-0.6)/2) : t < 3.9 ? 1 : 1 - ease(clamp((t-3.9)/0.8,0,1));
  U.uWhite.value = white; petMats.forEach(m => m.emissive.setScalar(white*0.95));
  const pOp = t < 0.8 ? t/0.8 : t < 4.4 ? 1 : Math.max(0, 1 - (t-4.4)/0.8);
  pillar.visible = true; pillar.position.set(pos.x, petGY + 8, pos.z); pillar.scale.setScalar(Math.max(s, 0.6)); pillar.material.opacity = pOp*0.75;
  rings.forEach((r,i) => { const ph = (t*0.55 + i/3)%1; r.visible = true; r.position.set(pos.x, petGY + 0.2 + ph*4*Math.max(s,0.6), pos.z); r.scale.setScalar((1.25 - ph*0.65)*Math.max(s,0.6)); r.material.opacity = Math.sin(ph*Math.PI)*pOp; });
  e.sp = (e.sp || 0) - dt;
  if (t < 3.9 && e.sp <= 0){ e.sp = 0.05; const a = t*9; floatSprite(sparkTex, V3(pos.x + Math.sin(a)*1.7*Math.max(s,0.6), petGY + 0.2, pos.z + Math.cos(a)*1.7*Math.max(s,0.6)), {size:0.35, vy:2.2, add:true, max:1.4, depthTest:false}); }
  if (!e.swapped && t >= 3.0){ e.swapped = true; S.stage = e.next; S.form = e.form; S.care = freshCare(); applyForm(); petS = stageScale(); hudDirty = true; }
  if (!e.burst && t >= 3.9){ e.burst = true; flashV = 1; sparkles(V3(pos.x, 1.2*s, pos.z), 34, 2.2*Math.max(s,0.6));
    fxo.classList.add('reveal'); fxSub.textContent = `${S.name || '牠'}進化成`; fxName.textContent = `${STAGES[S.stage].name}　${form().name}`; }
  fxoV = t < 0.8 ? t/0.8 : t < 5.6 ? 1 : Math.max(0, 1 - (t-5.6)/0.6);
  if (t >= 6.2){
    evo = null; B.mode = 'idle'; B.timer = 2; actG.rotation.set(0,0,0); actY = 0;
    U.uWhite.value = 0; petMats.forEach(m => m.emissive.setScalar(0));
    pillar.visible = false; rings.forEach(r => r.visible = false);
    fxo.hidden = true; clothesHidden = false; applyClothes(); duck(false);
    const F = form();
    toast(S.form === 'normal' ? `${S.name || '牠'}長大了，現在是${STAGES[S.stage].name}。` : `${F.name}：${F.desc}`);
    spawnHearts(3); save();
  }
}

// ---------- hatch / death / reset ----------
function hatchStart(){ if (hatching || S.stage !== 'egg') return; hatching = {t:0, cracked:false}; duck(true); sfx('roll'); }
function updateHatch(dt){
  if (!hatching) return;
  hatching.t += dt; const t = hatching.t;
  const sp = t < 0.8 ? t/0.8 : t < 3.4 ? 1 : Math.max(0, 1 - (t-3.4)/0.8);
  spot.visible = spotPool.visible = sp > 0; spot.material.opacity = sp*0.8; spotPool.material.opacity = sp;
  fxoV = sp*0.85; fxo.hidden = false;
  if (t < 1.6){ eggWob.rotation.z = Math.sin(t*40)*0.14*(t/1.6); return; }
  if (!hatching.cracked){
    hatching.cracked = true; eggWob.rotation.z = 0; eggMesh.visible = false;
    eggHalves = [0, Math.PI].map(start => { const m = new THREE.Mesh(new THREE.LatheGeometry(eggPts, 16, start, Math.PI), eggMat); m.position.y = 0.74; eggG.add(m); return {m, v:V3(start ? -1.6 : 1.6, 3, rnd(-0.5,0.5)), r:start ? 4 : -4}; });
    S.stage = 'baby'; S.form = 'normal'; S.fur = rollFur(); S.dye = null; S.likes = rollLikes(); S.aff = 50; S.ageMs = 0; S.growth = 0; S.st = {hunger:70, thirst:70, happy:80, energy:90, health:100}; S.poopQ = []; S.care = freshCare();
    B.mode = 'idle'; B.timer = 3; pos.set(0,0,0); vel.set(0,0,0); root.rotation.y = Math.atan2(camera.position.x, camera.position.z); reveal = 0;
    root.visible = true; shadow.g.visible = true; eggShadow.g.visible = false; nest.visible = false; applyForm();
    petS = stageScale(); sfx('hatch'); sparkles(V3(0,0.9,0), 26, 1); flashV = 0.6;
    fxo.classList.add('reveal'); fxSub.textContent = ''; fxName.textContent = '誕生了！';
  }
  if (eggHalves) eggHalves.forEach(h => { h.v.y -= 9*dt; h.m.position.addScaledVector(h.v, dt); h.m.rotation.z += h.r*dt; h.m.scale.setScalar(Math.max(0.01, 1 - (t-1.6)/1.6)); });
  reveal = clamp((t-1.6)/0.6, 0, 1);
  if (t > 2.2 && !hatching.cried){ hatching.cried = true; cry('happy'); }
  if (t > 4.3){
    if (eggHalves) eggHalves.forEach(h => eggG.remove(h.m)); eggHalves = null; hatching = null; reveal = 1; eggG.visible = false;
    spot.visible = spotPool.visible = false; fxo.hidden = true; fxo.classList.remove('reveal'); fxoV = 0; duck(false);
    askName();
  }
}
let tomb = null;
function makeTomb(p){
  const g = new THREE.Group();
  const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.42,0.48,0.8,24), mat('#a3a59d',0.9)); stone.position.y = 0.4; stone.scale.z = 0.45; g.add(stone);
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.42,24,12,0,Math.PI*2,0,Math.PI/2), mat('#a3a59d',0.9)); top.position.y = 0.8; top.scale.z = 0.45; g.add(top);
  const cols = ['#f2a541','#e0607e','#f3d250','#f2f0ea'];
  for (let i=0;i<7;i++){ const f = new THREE.Mesh(new THREE.SphereGeometry(0.08,8,6), mat(cols[i%4],0.6)); f.position.set(rnd(-0.6,0.6),0.08,rnd(0.25,0.55)); g.add(f); }
  g.position.set(p.x, gy(p.x, p.z), p.z); g.rotation.y = Math.atan2(camera.position.x - p.x, camera.position.z - p.z); scene.add(g);
  const hb = new THREE.Mesh(new THREE.CylinderGeometry(0.7,0.7,2.6,8), hbMat); hb.position.y = 1.2; hb.userData.kind = 'tomb'; g.add(hb); g.userData.hb = hb;
  ghost = makeGhost(g.position); return g;
}
function die(cause){
  if (S.dead || B.mode === 'dying') return;
  act = null; actG.rotation.set(0,0,0); dragging = false; rope.visible = handle.visible = false;
  if (B.mode === 'inHouse'){ root.visible = true; shadow.g.visible = true; pos.copy(houseDoor()); }
  B.mode = 'dying'; B.anim = 0; B.cause = cause; sfx('sad'); cry('sad');
}
function updateDying(dt){
  B.anim += dt/3.2; const a = B.anim;
  actG.rotation.z = (Math.PI/2)*ease(Math.min(a*2.2, 1));
  if (a > 0.55 && !B.heartsDone){ B.heartsDone = true; spawnHearts(6); }
  reveal = clamp(1 - (a-0.6)/0.4, 0, 1);
  if (a >= 1){
    root.visible = false; shadow.g.visible = false;
    S.dead = {cause:B.cause, ageMs:S.ageMs, x:pos.x, z:pos.z, stage:S.stage, form:S.form};
    tomb = makeTomb(pos); B.heartsDone = false; B.mode = 'dead'; actG.rotation.set(0,0,0); save(); showMemorial(); hudDirty = true;
  }
}
function clearPetWorld(){
  if (tomb){ scene.remove(tomb); tomb = null; }
  if (ghost){ scene.remove(ghost); ghost = null; }
  cubes.slice().forEach(removePoop);
  foods.forEach(f => scene.remove(f.g, f.sh.g)); foods.length = 0;
  if (bowl){ scene.remove(bowl.g); bowl = null; }
  puddles.forEach(m => scene.remove(m)); puddles.length = 0;
  if (act){ if (act.ball) scene.remove(act.ball); if (act.ball2) scene.remove(act.ball2); act = null; }
  actG.rotation.set(0,0,0); actY = 0; reveal = 1; dragging = false; rope.visible = handle.visible = false;
  root.visible = false; shadow.g.visible = false; pos.set(0,0,0); vel.set(0,0,0);
  eggG.visible = true; eggMesh.visible = true; nest.visible = true; eggShadow.g.visible = true; eggWob.rotation.set(0,0,0);
  if (eggHalves){ eggHalves.forEach(h => eggG.remove(h.m)); eggHalves = null; }
  hatching = null; evo = null; fxo.hidden = true; fxoV = 0; U.uWhite.value = 0; petMats.forEach(m => m.emissive.setScalar(0));
  pillar.visible = false; rings.forEach(r => r.visible = false); spot.visible = spotPool.visible = false;
  B.mode = 'idle'; B.timer = 2; B.food = null; B.water = null; B.sleeping = false;
}
function newEgg(){
  clearPetWorld();
  S.stage = 'egg'; S.form = 'normal'; S.warm = 0; S.name = ''; S.ageMs = 0; S.growth = 0; S.dead = null; S.gen += 1; S.poopQ = []; S.care = freshCare();
  S.st = {hunger:80, thirst:80, happy:75, energy:85, health:100};
  applyForm(); save(); hudDirty = true; toast('一顆新的蛋出現了。點一點牠，幫牠保暖。');
}
function resetAll(){
  // A fresh start also means a brand-new world, so the page reloads with an empty save (and pushes it to the cloud).
  halted = true; S = freshSave(); S.camV = 2; S.camMode = 'iso';
  lsSet(KEY, JSON.stringify(S)); lsSet(FORCE_LOCAL, '1'); location.reload();
}
// A new world gets rocks, bushes and trees in every plot (each plot's show up when it is cleared).
function seedWorldNature(){
  const taken = (x, z, r) => Math.hypot(x, z) < 3.5 || S.trees.some(t => Math.hypot(t.x - x, t.z - z) < r + 1.6)
    || Object.entries(S.place || {}).some(([id, p]) => { const b = bdef(id); return b && b.size && S.builds[id] && cellsOf(b, p).some(([cx, cz]) => Math.hypot(cx - x, cz - z) < r + 1); });
  S.world.seeded = S.world.seeded || (S.world.feats.length ? ['-1,-1', '0,-1', '1,-1', '-1,0', '0,0', '1,0', '-1,1', '0,1', '1,1'] : []);
  for (const k of PLOT_KEYS) if (!S.world.seeded.includes(k)){ S.trees.push(...world.genFeats(k, taken)); S.world.seeded.push(k); }
}

// ---------- navigation: a 0.5-unit grid over the ground; A* routes the wombat around trees, buildings and anything else in the way ----------
// block: 0 free, 1 near an obstacle (passable at a high cost, so a wombat standing there can still walk out), 2 not ground at all.
const NAV = {cell:0.5, ox:X0 - 1, oz:Z0 - 1, n:Math.ceil((Math.max(X1 - X0, Z1 - Z0) + 2)/0.5), block:null, dirty:true, petS:0};
const navIdx = (x, z) => { const i = Math.floor((x - NAV.ox)/NAV.cell), j = Math.floor((z - NAV.oz)/NAV.cell); return i < 0 || j < 0 || i >= NAV.n || j >= NAV.n ? -1 : j*NAV.n + i; };
const navX = k => (k % NAV.n + 0.5)*NAV.cell + NAV.ox, navZ = k => (Math.floor(k/NAV.n) + 0.5)*NAV.cell + NAV.oz;
const FENCE_R = 8.6;   // the fence runs round the home plot, with a gate in the middle of each side
const fenceAt = (x, z) => { if (!BG.fence) return false; const ax = Math.abs(x), az = Math.abs(z), m = Math.max(ax, az); return Math.abs(m - FENCE_R) < 0.3 && (ax > az ? az : ax) > 1.6; };
const groundOK = (x, z) => (world.walkable(x, z) || (S.ring && world.swimmable(x, z))) && !fenceAt(x, z);   // with the swim ring, water is fine too
// Put a point back on walkable land (after being thrown into the river, onto a cliff, past the edge…).
function snapToLand(p){
  navEnsure(); const k = navIdx(p.x, p.z);
  if (k >= 0 && NAV.block[k] !== 2) return false;
  let best = null, bd = 1e9;
  for (let r = 0.5; r < 14 && !best; r += 0.5) for (let a = 0; a < 24; a++){ const x = p.x + Math.sin(a/24*Math.PI*2)*r, z = p.z + Math.cos(a/24*Math.PI*2)*r, kk = navIdx(x, z);
    if (kk >= 0 && NAV.block[kk] !== 2){ const d = Math.hypot(x - p.x, z - p.z); if (d < bd){ bd = d; best = [x, z]; } } }
  if (!best){ best = [0, 2]; }
  p.x = best[0]; p.z = best[1]; return true;
}
// Where a screen point hits the ground.
function groundHit(e){ setNdc(e); ray.setFromCamera(ndc, camera); const h = ray.intersectObject(world.terrain, false)[0]; return h ? h.point : null; }
function navEnsure(){
  if (!NAV.dirty && NAV.block && Math.abs(NAV.petS - petS) < 0.08) return;
  const n = NAV.n, b = new Uint8Array(n*n), pr = 0.8*Math.max(petS, 0.5), obs = obstacles();
  for (let k=0;k<n*n;k++){ const x = navX(k), z = navZ(k);
    if (!groundOK(x, z)){ b[k] = 2; continue; }
    if (world.isWater(x, z) && world.bridgeAt(x, z) == null){ b[k] = 1; continue; }   // swimming is allowed but land is preferred
    for (const o of obs) if (Math.hypot(x - o.c.x, z - o.c.z) < o.r + pr){ b[k] = 1; break; } }
  NAV.block = b; NAV.dirty = false; NAV.petS = petS;
}
function navClear(ax, az, bx, bz){   // straight walk from a to b without touching a blocked cell (cells right next to the start don't count)
  const L = Math.hypot(bx - ax, bz - az), steps = Math.ceil(L/0.25);
  for (let s=1;s<=steps;s++){ const u = s/steps, x = ax + (bx - ax)*u, z = az + (bz - az)*u;
    const k = navIdx(x, z); if (k < 0 || NAV.block[k] === 2 || (NAV.block[k] && u*L >= 0.6)) return false; }
  return true;
}
function nearestFree(k0){
  const n = NAV.n, seen = new Uint8Array(n*n), q = [k0]; seen[k0] = 1;
  for (let h=0; h<q.length && h<4000; h++){ const k = q[h]; if (!NAV.block[k]) return k;
    const i = k % n, j = Math.floor(k/n);
    for (const [di, dj] of [[1,0],[-1,0],[0,1],[0,-1]]){ const a = i+di, c = j+dj; if (a < 0 || c < 0 || a >= n || c >= n) continue; const kk = c*n + a; if (!seen[kk]){ seen[kk] = 1; q.push(kk); } } }
  return -1;
}
function findPath(ax, az, bx, bz){
  navEnsure();
  const n = NAV.n, blk = NAV.block, s = navIdx(ax, az); let g = navIdx(bx, bz);
  if (s < 0 || g < 0) return [];
  const exact = !blk[g]; if (!exact){ g = nearestFree(g); if (g < 0) return []; }
  const G = new Float32Array(n*n).fill(1e9), from = new Int32Array(n*n).fill(-1), shut = new Uint8Array(n*n), heap = [];
  const gi = g % n, gj = Math.floor(g/n);
  const hf = k => { const di = Math.abs(k % n - gi), dj = Math.abs(Math.floor(k/n) - gj); return Math.max(di, dj) + 0.414*Math.min(di, dj); };
  const push = (f, k) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0){ const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length){ heap[0] = last; let i = 0;
    for (;;){ const l = 2*i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  G[s] = 0; push(hf(s), s); let found = false, iter = 0;
  while (heap.length && iter++ < 80000){
    const [, k] = pop(); if (shut[k]) continue; shut[k] = 1; if (k === g){ found = true; break; }
    const i = k % n, j = Math.floor(k/n);
    for (let di=-1; di<=1; di++) for (let dj=-1; dj<=1; dj++){
      if (!di && !dj) continue; const a = i+di, c = j+dj; if (a < 0 || c < 0 || a >= n || c >= n) continue;
      const kk = c*n + a; if (blk[kk] === 2 || shut[kk]) continue;
      if (di && dj && (blk[j*n + a] === 2 || blk[c*n + i] === 2 || blk[j*n + a] && blk[c*n + i])) continue;   // no cutting corners
      const cost = (di && dj ? 1.414 : 1)*(blk[kk] ? 6 : 1), ng = G[k] + cost;
      if (ng < G[kk]){ G[kk] = ng; from[kk] = k; push(ng + hf(kk), kk); } }
  }
  if (!found) return [];
  const cells = []; for (let k = g; k !== -1 && k !== s; k = from[k]) cells.unshift(k);
  const raw = cells.map(k => ({x:navX(k), z:navZ(k)})); if (exact && raw.length) raw[raw.length-1] = {x:bx, z:bz};
  const out = []; let px = ax, pz = az, i = 0;   // keep only the corners: skip every point we can already walk straight to
  while (i < raw.length){ let j = raw.length - 1; while (j > i && !navClear(px, pz, raw[j].x, raw[j].z)) j--; out.push(raw[j]); px = raw[j].x; pz = raw[j].z; i = j + 1; }
  return out;
}
// Walk toward (x, z): straight when nothing is in the way, otherwise along an A* route that is refreshed now and then.
function walkTo(x, z, dt, speed, stopDist){
  navEnsure();
  let wx = x, wz = z, sd = stopDist;
  if (!navClear(pos.x, pos.z, x, z)){
    let P = B.path;
    if (!P || Math.hypot(P.tx - x, P.tz - z) > 0.5 || P.age > 3) P = B.path = {tx:x, tz:z, age:0, pts:findPath(pos.x, pos.z, x, z)};
    P.age += dt;
    const pts = P.pts;
    while (pts.length > 1 && (Math.hypot(pts[0].x - pos.x, pts[0].z - pos.z) < 0.4 || navClear(pos.x, pos.z, pts[1].x, pts[1].z))) pts.shift();
    if (pts.length){ wx = pts[0].x; wz = pts[0].z; sd = pts.length === 1 ? Math.min(stopDist, 0.15) : 0; }
  } else B.path = null;
  const r = walkTowards(wx, wz, dt, speed, sd);
  r.dist = Math.hypot(x - pos.x, z - pos.z); r.diff = wrapA(Math.atan2(x - pos.x, z - pos.z) - root.rotation.y);
  r.arrived = !!(B.path && B.path.pts.length === 1 && Math.hypot(B.path.pts[0].x - pos.x, B.path.pts[0].z - pos.z) < 0.4);   // end of a route to a spot that can't be reached exactly
  return r;
}

// ---------- brain ----------
function petSpeed(){ let v = 0.95*(0.55 + 0.45*Math.min(petS,1))*(S.run ? 1.9 : 1)*(hasSkill('fast') ? 1.25 : 1); const st = S.st;
  if (st.health < 35) v *= 0.5; if (S.stage === 'ultimate') v *= 0.85; if (st.energy < 20) v *= 0.7; if (swimming) v *= 0.6; return v*(form().speed || 1); }
function nearestFood(){ let best = null, bd = 1e9; for (const f of foods){ if (!f.landed) continue; const d = Math.hypot(f.g.position.x-pos.x, f.g.position.z-pos.z); if (d < bd){ bd = d; best = f; } } return best; }
const pondBad = () => (B.pondFail || 0) > Date.now() - 120000;   // the yard pond couldn't be reached lately: use a bowl
function waterSpot(){ if (bowl && bowl.kind !== 'water') return {p:bowl.g.position, r:0.15}; if (BG.pond && !pondBad()) return {p:SPOTS.pond, r:1.45}; if (bowl) return {p:bowl.g.position, r:0.15}; return null; }
function pickWander(){
  const obs = obstacles();
  const near = trees.filter(tr => Math.hypot(tr.d.x - pos.x, tr.d.z - pos.z) < 9);
  if (near.length && Math.random() < 0.12){   // go sniff around a tree (hives make this risky)
    const tr = near[Math.floor(Math.random()*near.length)];
    B.target.set(tr.d.x, 0, tr.d.z); B.treeVisit = tr; return; }
  B.treeVisit = null;
  // mostly ambles around nearby; now and then heads back toward home or off to explore further
  const far = Math.random() < 0.15, cx = far ? rnd(X0 + 3, X1 - 3) : Math.random() < 0.3 ? pos.x*0.4 : pos.x, cz = far ? rnd(Z0 + 3, Z1 - 3) : Math.random() < 0.3 ? pos.z*0.4 : pos.z;
  for (let i=0;i<24;i++){
    const a = Math.random()*Math.PI*2, r = (far ? Math.random()*4 : 1.5 + Math.random()*5.5), x = cx + Math.sin(a)*r, z = cz + Math.cos(a)*r;
    if (Math.hypot(x-pos.x, z-pos.z) < 1.4 || !groundOK(x, z)) continue;
    if (obs.some(o => Math.hypot(o.c.x-x, o.c.z-z) < o.r + 1.4*petS)) continue;
    B.target.set(x,0,z); return;
  }
  B.target.set(pos.x*0.6, 0, pos.z*0.6);
}
function walkTowards(tx_, tz_, dt, speed, stopDist){
  const dx = tx_-pos.x, dz = tz_-pos.z, dist = Math.hypot(dx,dz), diff = wrapA(Math.atan2(dx,dz) - root.rotation.y);
  root.rotation.y += clamp(diff, -2.6*dt, 2.6*dt);
  let sp = speed*clamp(Math.cos(diff), 0, 1); if (dist < stopDist) sp = 0;
  const fwd = V3(Math.sin(root.rotation.y), 0, Math.cos(root.rotation.y)), step = sp*dt;
  // about to step into water or off the edge (cutting a corner onto a bridge, say): slide along the edge instead of bumping back
  const clear = (dx, dz) => groundOK(pos.x + dx*step, pos.z + dz*step) && groundOK(pos.x + dx*step*3, pos.z + dz*step*3);
  if (step > 0 && pos.y < 0.05 && groundOK(pos.x, pos.z) && !clear(fwd.x, fwd.z)){
    for (const da of [0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6]){ const a = root.rotation.y + da, ux = Math.sin(a), uz = Math.cos(a);
      if (clear(ux, uz) && Math.hypot(tx_ - pos.x - ux*step, tz_ - pos.z - uz*step) < dist + step*0.5){ fwd.set(ux, 0, uz); break; } } }
  pos.addScaledVector(fwd, step); walkVel.copy(fwd).multiplyScalar(sp);
  return {dist, diff, moving: sp > 0.05 || Math.abs(diff) > 0.15};
}
function startSleep(){ B.mode = 'sleep'; B.zzzT = 0; cry('sleepy'); }
function wake(grumpy){
  if (B.mode === 'inHouse') B.sleeping = false; else { B.mode = 'idle'; B.timer = 2; }
  if (grumpy){ S.st.happy = clamp(S.st.happy - 6, 0, 100); showEmote('😠', 1.6); cry('angry'); }
}
function goHouse(sleep){ B.mode = 'goHouse'; B.sleepAfter = sleep; }
function exitHouse(){ if (B.mode !== 'inHouse') return; B.mode = 'exit'; B.anim = 0; B.sleeping = false; root.visible = true; shadow.g.visible = true; }
function think(dt){
  walkVel.set(0,0,0);
  if (B.mode === 'use' && B.use && petActive() && !dragging && !hatching){ if (!act) useStep(dt); if (B.mode === 'use' && (B.use.hold || act)) return false; }
  if (!petActive() || hatching || B.mode === 'evolve' || dragging || act || pos.y > 0.02 || liftW > 0.05) return false;
  const st = S.st; B.timer -= dt;
  if (B.mode === 'bloated'){ if (B.timer <= 0){ B.mode = 'idle'; B.timer = 2; toast(`${S.name || '牠'}的肚子消下去了，可以動了。`); } return false; }
  const wakeOK = () => st.energy >= 98 || (nightF < 0.5 && st.energy >= 80);
  if (B.mode === 'sleep'){ if (wakeOK()) wake(false); return false; }
  if (B.mode === 'inHouse'){
    if (B.sleeping && wakeOK()) B.sleeping = false;
    if (!B.sleeping && (st.energy < 20 || (nightF > 0.6 && st.energy < 85))) B.sleeping = true;
    if (!B.sleeping && !badWeather()) exitHouse();
    return false;
  }
  const busy = ['eat','drink','enter','exit','goHouse','use','useWalk','swimGo','swimPlay','skillGo','skillDo'].includes(B.mode);
  const wantSleep = st.energy < 20 || (nightF > 0.6 && st.energy < 85);
  if (!busy && wantSleep){ if (BG.house) goHouse(true); else startSleep(); return false; }
  if (!busy || B.mode === 'goHouse'){
    if (!['seek','seekWater'].includes(B.mode)){
      const f = nearestFood();
      if (f){ B.mode = 'seek'; B.food = f; B.seekT = 0; }
      else if (B.water && st.thirst < 96 && waterSpot()){ B.mode = 'seekWater'; B.seekT = 0; }
    }
  }
  if (badWeather() && BG.house && ['idle','walk'].includes(B.mode)) goHouse(false);
  let moving = false; const sp = petSpeed(), mouth = 1.95*petS;
  switch (B.mode){
    case 'idle': {
      B.lookT -= dt;
      if (B.lookT <= 0){ B.lookT = rnd(0.7,1.8); B.lookYaw = [-0.7,-0.35,0,0.35,0.7][Math.floor(Math.random()*5)]; B.lookPitch = rnd(-0.15,0.15); if (Math.random() < 0.4) ears[Math.floor(Math.random()*2)].v += rnd(-6,6); }
      if (st.hunger < 25){ B.stompT -= dt; if (B.stompT <= 0){ B.stompT = rnd(2.5,4); vel.y = 2.6*petS + 1; showEmote('💢',1.4); cry('angry'); } }
      else if (butterflies.some(b => !b.leaving) && st.energy > 30 && Math.random() < dt*0.06){
        B.mode = 'chase'; B.chase = butterflies.find(b => !b.leaving); B.timer = rnd(5,8); showEmote('🦋', 1.4); cry('chirp'); break; }
      else if (S.aff < 30){   // feeling neglected: come over and act cute for attention
        B.begT = (B.begT ?? rnd(12,25)) - dt;
        if (B.begT <= 0){ B.begT = rnd(35,60); B.mode = 'beg'; B.timer = 14; B.begSit = false; B.begE = 0;
          const d = V3(camera.position.x - camTarget.x, 0, camera.position.z - camTarget.z).normalize(), p = V3(camTarget.x, 0, camTarget.z).addScaledVector(d, 2.2);
          if (!groundOK(p.x, p.z)) p.copy(pos); B.target.copy(p); break; }
      }
      // wombats graze: now and then it nibbles the grass where it stands (and that makes poop later too)
      if (B.timer <= 0 && st.hunger < 92 && !swimming && Math.random() < 0.18 && !world.isBeach(pos.x, pos.z)){ B.mode = 'graze'; B.timer = rnd(4, 7); B.nomT = 0; break; }
      if (B.timer <= 0){ if (Math.random() < (st.health < 35 ? 0.3 : 0.72)){ pickWander(); B.mode = 'walk'; B.timer = 10 + Math.hypot(B.target.x - pos.x, B.target.z - pos.z)*2; B.path = null; } else B.timer = rnd(2,4); }
      break; }
    case 'walk': case 'goto': {
      const tv = B.mode === 'walk' && B.treeVisit && trees.includes(B.treeVisit) ? B.treeVisit : null;
      if (tv){   // walk up to the tree, then stop and scratch it
        const r = walkTo(tv.d.x, tv.d.z, dt, sp, treeReach(tv) + 0.05); moving = r.moving;
        if (r.dist < treeReach(tv) + 0.35){ B.mode = 'scratch'; B.timer = 2.8; B.scrT = 0; B.scr = tv; B.path = null; }
        else if (B.timer <= 0){ B.mode = 'idle'; B.timer = 2; B.treeVisit = null; }
        break; }
      const r = walkTo(B.target.x, B.target.z, dt, sp, 0.25); moving = r.moving;
      if (r.dist < 0.3 || r.arrived || B.timer <= 0){ B.mode = 'idle'; B.timer = rnd(2,5); B.lookT = 0; B.path = null; }
      break; }
    case 'useWalk': {   // heading to a swing, bench, sandbox, fountain, pond or mud to play
      const r = walkTo(B.use.at.x, B.use.at.z, dt, sp, 0.3); moving = r.moving;
      const atB = B.use.center && Math.hypot(pos.x - B.use.center.x, pos.z - B.use.center.z) < B.use.reach;
      if (r.dist < 0.7 || r.arrived || atB){ B.mode = 'use'; B.use.t = 0; B.path = null; }
      else if (B.timer <= 0){ B.mode = 'idle'; B.timer = 1; B.use = null; }
      break; }
    case 'scratch': {   // up on the hind legs, scratching the bark with the front paws
      const tv = B.scr;
      if (!tv || !trees.includes(tv)){ B.mode = 'idle'; B.timer = 1; break; }
      root.rotation.y += clamp(wrapA(Math.atan2(tv.d.x - pos.x, tv.d.z - pos.z) - root.rotation.y), -3*dt, 3*dt);
      B.lookPitch = -0.3; B.lookYaw = 0; B.scrT -= dt;
      if (B.scrT <= 0){ B.scrT = 0.6; tv.shake = Math.max(tv.shake, 0.45); sfx('scratch'); if (Math.random() < 0.6) leafFall(tv, 2); }
      if (B.timer <= 0){
        B.mode = 'idle'; B.timer = rnd(2,4); B.treeVisit = null; B.scr = null; B.lookPitch = 0; track('scratch');
        if (tv.d.hive && Math.random() < 0.35) sting();
        else { st.happy = clamp(st.happy + 4, 0, 100); showEmote(tv.d.hive ? '😅' : '😌', 1.4); cry('purr'); }
      }
      break; }
    case 'chase': {   // bound after a butterfly, with little hops
      const bf = B.chase;
      if (!bf || !butterflies.includes(bf) || B.timer <= 0){
        B.mode = 'idle'; B.timer = rnd(2,4); B.chase = null;
        st.happy = clamp(st.happy + 6, 0, 100); st.energy = clamp(st.energy - 4, 0, 100); S.aff = clamp(S.aff + 1, 0, 100); showEmote('😆', 1.6); cry('happy'); break; }
      const r = walkTowards(bf.g.position.x, bf.g.position.z, dt, sp*1.7, 0.4); moving = r.moving;
      if (pos.y <= 0.001 && Math.random() < dt*1.2){ vel.y = 2.4*petS + 0.6; sqv += 1; }
      break; }
    case 'beg': {
      if (!B.begSit){ const r = walkTo(B.target.x, B.target.z, dt, sp*1.2, 0.3); moving = r.moving; if (r.dist < 0.45 || B.timer < 8) B.begSit = true; }
      else {   // sit facing you, puppy eyes, little whines
        root.rotation.y += clamp(wrapA(Math.atan2(camera.position.x - pos.x, camera.position.z - pos.z) - root.rotation.y), -3*dt, 3*dt);
        B.lookYaw = 0; B.lookPitch = -0.2; B.begE -= dt;
        if (B.begE <= 0){ B.begE = 2.6; showEmote('🥺', 2.2); if (Math.random() < 0.6) cry('whine'); }
      }
      if (B.timer <= 0){ B.mode = 'idle'; B.timer = rnd(2,4); showEmote('😞', 1.6); }
      break; }
    case 'seek': {
      const f = B.food;
      if (!f || !foods.includes(f)){ B.mode = 'idle'; B.timer = 1; break; }
      const fx_ = f.g.position.x, fz_ = f.g.position.z, dist = Math.hypot(fx_-pos.x, fz_-pos.z);
      if (dist < mouth*0.75){
        root.rotation.y += clamp(wrapA(Math.atan2(fx_-pos.x, fz_-pos.z) - root.rotation.y), -2.6*dt, 2.6*dt);
        const back = V3(-Math.sin(root.rotation.y),0,-Math.cos(root.rotation.y)); pos.addScaledVector(back, 0.6*dt); walkVel.copy(back).multiplyScalar(0.6); moving = true;
      } else {
        const r = walkTo(fx_, fz_, dt, sp*1.3, mouth); moving = r.moving; B.seekT = (B.seekT || 0) + dt;
        // something in the way (a building, a tree…): if it is close enough just reach over; if not, the food rolls somewhere easier
        const stuck = r.arrived || B.seekT > 10;
        if ((r.dist < mouth + 0.1 && Math.abs(r.diff) < 0.25) || (stuck && r.dist < mouth + 1.6)){ B.mode = 'eat'; B.timer = 2.6; B.nomT = 0; B.before = st.hunger; B.seekT = 0; }
        else if (B.seekT > 16){ const p = pos.clone(); p.x += Math.sin(root.rotation.y)*(mouth + 0.3); p.z += Math.cos(root.rotation.y)*(mouth + 0.3); clearSpot(p, mouth + 0.6); f.g.position.set(p.x, gy(p.x, p.z) + 1.2, p.z); f.landed = false; B.seekT = 0; }
      }
      break; }
    case 'eat': {
      const f = B.food;
      if (!f || !foods.includes(f)){ B.mode = 'idle'; B.timer = 1.5; break; }
      const fi = foodInfo(f.kind || 'grass');
      f.eat -= dt/2.6; f.g.scale.setScalar(Math.max(0.05, f.eat));
      st.hunger = clamp(st.hunger + fi.hunger*FILL*dt/2.6, 0, 100);
      B.nomT -= dt; if (B.nomT <= 0){ B.nomT = 0.38; sfx('nom'); }
      if (f.eat <= 0){
        scene.remove(f.g, f.sh.g); foods.splice(foods.indexOf(f),1); B.food = null;
        S.care.meals++; if (B.before > 80) S.care.overfed++; track('feed');
        if (B.before < 90) addCoins(2, headTop());
        S.growth += growthOK() ? 4 : 0.5; st.happy = clamp(st.happy+3, 0, 100);
        foodBonus(fi);
        if (Math.random() < 0.75) S.poopQ.push(rnd(1.5,3.5));
        spawnHearts(2); sfx('happy'); cry('happy');
        B.mode = 'idle'; B.timer = 2.5;
        if (B.before > 90){ B.mode = 'bloated'; B.timer = 60; showEmote('😵', 3); cry('grunt'); toast(`${S.name || '牠'}吃太撐了！肚子鼓鼓的，要躺一分鐘才能動。`); }
        else if (st.hunger > 90 && st.energy < 70 && Math.random() < 0.5){ if (BG.house) goHouse(true); else startSleep(); }
      }
      break; }
    case 'seekWater': {
      const w = waterSpot(); if (!w){ B.mode = 'idle'; B.water = null; break; }
      const r = walkTo(w.p.x, w.p.z, dt, sp*1.2, mouth + w.r); moving = r.moving; B.seekT = (B.seekT || 0) + dt;
      const stuck = r.arrived || B.seekT > 10;
      if ((r.dist < mouth + w.r + 0.12 && Math.abs(r.diff) < 0.25) || (stuck && r.dist < mouth + w.r + 1.6)){ B.mode = 'drink'; B.timer = 2.4; B.nomT = 0; B.before = st.thirst; B.seekT = 0; }
      else if (B.seekT > 16 && bowl && w.p === bowl.g.position){ const p = pos.clone(); p.x += Math.sin(root.rotation.y)*(mouth + 0.3); p.z += Math.cos(root.rotation.y)*(mouth + 0.3); clearSpot(p, mouth + 0.6); bowl.g.position.set(p.x, gy(p.x, p.z), p.z); B.seekT = 0; }
      else if (B.seekT > 16 && !bowl){ B.seekT = 0; B.pondFail = Date.now(); spawnBowl('water'); }   // the pond can't be reached: a bowl appears instead
      break; }
    case 'drink': {
      const di_ = foodInfo(bowl && (bowl.kind !== 'water' || !BG.pond || pondBad()) ? bowl.kind : 'water');
      st.thirst = clamp(st.thirst + di_.thirst*FILL*dt/2.4, 0, 100);
      if (B.timer <= 0) foodBonus({...di_, thirst:0});   // the thirst was already added while drinking
      B.nomT -= dt; if (B.nomT <= 0){ B.nomT = 0.45; sfx('drink'); }
      if (bowl && (bowl.kind !== 'water' || !BG.pond || pondBad())){ bowl.left -= dt/2.4; bowl.w.position.y = 0.06 + 0.11*Math.max(0, bowl.left); }
      if (B.timer <= 0){
        if (B.before < 90) addCoins(2, headTop());
        if (growthOK()) S.growth += 1.5;
        if (bowl && (bowl.kind !== 'water' || !BG.pond || pondBad())){ scene.remove(bowl.g); bowl = null; }
        B.water = null; B.mode = 'idle'; B.timer = 2; spawnHearts(1); track('drink');
      }
      break; }
    case 'skillGo': {   // a ninja dash: a puff of smoke and leaves, gone, a streak — and it pops up right beside the target
      const k = B.skill; if (!k){ B.mode = 'idle'; break; }
      if (!k.tp){ const d = V3(pos.x - k.at.x, 0, pos.z - k.at.z); if (d.lengthSq() < 1e-4) d.set(0, 0, 1); d.normalize(); let dest = null;
        for (const a of [0, 0.6, -0.6, 1.2, -1.2, 2, -2, Math.PI]){ const dd = d.clone().applyAxisAngle(V3(0, 1, 0), a), q = V3(k.at.x + dd.x*(k.reach + 0.1), 0, k.at.z + dd.z*(k.reach + 0.1));
          if (groundOK(q.x, q.z) && !world.isWater(q.x, q.z) && !inBuild(q.x, q.z, 0.3)){ dest = q; break; } }
        const ninja = dest && hasSkill('ninja');   // the vanishing trick is learned from the pond turtles (ninja turtles); before that it walks
        k.tp = {t:0, from:pos.clone(), dest, walk:!ninja}; if (ninja){ ninjaPuff(pos); sfx('whoosh'); } }
      const tp = k.tp;
      if (tp.walk){ const r = walkTo(k.at.x, k.at.z, dt, sp*1.2, k.reach); moving = r.moving;   // nowhere to land: walk over as before
        if (r.dist < k.reach + 0.25 || r.arrived || B.timer <= 0){ B.mode = 'skillDo'; k.t = 0; } break; }
      tp.t += dt;
      if (tp.t > 0.1 && root.visible && !tp.moved){ root.visible = false; shadow.g.visible = false; }
      if (tp.t > 0.16 && !tp.moved){ tp.moved = true; ninjaStreak(tp.from, tp.dest); pos.x = tp.dest.x; pos.z = tp.dest.z; root.rotation.y = Math.atan2(k.at.x - pos.x, k.at.z - pos.z); }
      if (tp.t > 0.3 && !tp.shown){ tp.shown = true; root.visible = true; shadow.g.visible = true; ninjaPuff(pos); sfx('pop'); vel.y = 2.2; }
      if (tp.t > 0.55){ B.mode = 'skillDo'; k.t = 0; }
      break; }
    case 'skillDo': skillStep(dt); moving = true; break;
    case 'graze': {
      st.hunger = clamp(st.hunger + dt*0.35, 0, 100); B.nomT -= dt; if (B.nomT <= 0){ B.nomT = 0.6; sfx('nom'); }
      if (Math.random() < dt*0.4) floatSprite(radialTex('rgba(120,170,80,0.9)', 'rgba(120,170,80,0)'), headTop().add(V3(rnd(-0.3, 0.3), -0.9*petS, rnd(-0.3, 0.3))), {size:0.15, vy:0.6, max:0.6, grow:0});
      if (B.timer <= 0){ B.mode = 'idle'; B.timer = rnd(2, 4); if (Math.random() < 0.45) S.poopQ.push(rnd(1.5, 4)); }
      break; }
    case 'swimGo': {
      const w_ = B.swim; if (!w_){ B.mode = 'idle'; break; }
      const r = walkTo(w_.at.x, w_.at.z, dt, sp*1.2, 0.3); moving = r.moving;
      if (r.dist < 0.6 || r.arrived || (swimming && r.dist < 2.5)){ B.mode = 'swimPlay'; w_.t = rnd(18, 28); w_.next = 0; }
      else if (B.timer <= 0){ B.mode = 'idle'; B.swim = null; toast('那裡走不過去。'); }
      break; }
    case 'swimPlay': {   // paddle about near the spot, now and then splashing
      const w_ = B.swim; w_.t -= dt; w_.next -= dt;
      if (w_.next <= 0){ w_.next = rnd(2.5, 4.5); for (let i=0;i<12;i++){ const a = Math.random()*6.28, rr = rnd(1, 4), x = w_.at.x + Math.cos(a)*rr, z = w_.at.z + Math.sin(a)*rr; if (world.swimmable(x, z)){ w_.to = V3(x, 0, z); break; } }
        if (Math.random() < 0.4){ sfx('splash'); st.happy = clamp(st.happy + 3, 0, 100); } }
      if (w_.to){ const r = walkTo(w_.to.x, w_.to.z, dt, sp*0.8, 0.3); moving = r.moving; }
      if (w_.t <= 0){   // climb out at the nearest dry bank
        let land = null; for (let r = 0.5; r < 14 && !land; r += 0.5) for (let a = 0; a < 24; a++){ const x = pos.x + Math.sin(a/24*6.283)*r, z = pos.z + Math.cos(a/24*6.283)*r; if (world.walkable(x, z) && !world.isWater(x, z)){ land = V3(x, 0, z); break; } }
        B.mode = 'goto'; B.target.copy(land || V3(0, 0, 0)); B.timer = 25; B.path = null; B.swim = null; spawnHearts(2); track('swimPlay'); }
      break; }
    case 'goHouse': {
      if (!BG.house){ B.mode = 'idle'; break; }
      // at the door it only turns to face the house (walking towards the door spot at the same time made the two turns cancel out)
      const d = houseDoor(), atDoor = Math.hypot(d.x - pos.x, d.z - pos.z) < 0.35, r = atDoor ? {dist:Math.hypot(d.x - pos.x, d.z - pos.z), moving:true} : walkTo(d.x, d.z, dt, sp*1.1, 0.2); moving = r.moving;
      B.houseT = (B.houseT || 0) + dt; const ld = B.houseLast ? pos.distanceTo(B.houseLast) : 1; if (ld > 0.3){ B.houseLast = pos.clone(); B.houseT = 0; }
      if (B.houseT > 4 && pos.distanceTo(SPOTS.house) < 9){ B.houseT = 0; B.mode = 'enter'; B.anim = 0; B.from.copy(pos); break; }   // stuck near the house: just go in
      if (r.dist < 0.35){
        const diff = wrapA(Math.atan2(SPOTS.house.x-pos.x, SPOTS.house.z-pos.z) - root.rotation.y);
        root.rotation.y += clamp(diff, -2.6*dt, 2.6*dt); moving = true;
        if (Math.abs(diff) < 0.15){ B.mode = 'enter'; B.anim = 0; B.from.copy(pos); }
      }
      break; }
    case 'enter': {
      B.anim += dt/1.4; pos.lerpVectors(B.from, SPOTS.house, ease(Math.min(B.anim,1))); moving = true;
      if (B.anim >= 1){ root.visible = false; shadow.g.visible = false; B.mode = 'inHouse'; B.sleeping = B.sleepAfter; }
      break; }
    case 'exit': {
      B.anim += dt/1.4; const d = houseDoor(); pos.lerpVectors(SPOTS.house, d, ease(Math.min(B.anim,1)));
      root.rotation.y = Math.atan2(d.x-SPOTS.house.x, d.z-SPOTS.house.z); moving = true;
      if (B.anim >= 1){ B.mode = 'idle'; B.timer = 2; }
      break; }
  }
  if (!['enter','exit','inHouse','use'].includes(B.mode)){
    for (const o of obstacles()){ const dx = pos.x-o.c.x, dz = pos.z-o.c.z, d = Math.hypot(dx,dz), min = o.r + 0.9*petS;
      if (d < min && d > 0.001){ pos.x = o.c.x + dx/d*min; pos.z = o.c.z + dz/d*min; } }
  }
  return moving;
}
function moodKey(){
  const st = S.st;
  if (asleep()) return 'sleep';
  if (st.health < 35) return 'sick';
  if (st.hunger < 25) return 'angry';
  if (st.thirst < 25) return 'thirsty';
  if (cleanVal() < 40) return 'dirty';
  if (st.energy < 20) return 'tired';
  if (st.happy < 30) return 'sad';
  if (st.happy > 75) return 'happy';
  return 'ok';
}
const MOOD_EMOTE = {sick:'🤒', angry:'💢', thirsty:'💧', dirty:'😖', tired:'🥱', sad:'😢', happy:'❤️'};
const MOOD_CRY = {sick:'sad', angry:'angry', thirsty:'sad', dirty:'grunt', tired:'sleepy', sad:'sad', happy:'happy', ok:'grunt'};
function statusText(){
  if (S.stage === 'egg' || S.dead || B.mode === 'dying' || B.mode === 'dead') return '';
  if (B.mode === 'evolve') return '進化中！';
  if (B.mode === 'bloated') return '吃太撐，躺著動不了';
  if (B.mode === 'beg') return '在裝可憐，想要你摸摸牠';
  if (B.mode === 'chase') return '在追蝴蝶！';
  if (B.mode === 'scratch') return '在抓樹';
  if (B.mode === 'useWalk') return '要去玩囉';
  if (B.mode === 'use' && B.use) return {swing:'在盪鞦韆', slide:'在溜滑梯', sandbox:'在沙坑裡挖沙', bench:'坐在長椅上休息', fountain:'在噴水池玩水', pond:'在水池邊玩水', mud:'在泥巴裡打滾'}[B.use.id] || '在玩';
  if (dragging) return '被抓起來了！';
  if (act) return ACTS[act.key].name;
  if (B.mode === 'inHouse') return B.sleeping ? '在小窩裡睡覺' : '躲在小窩裡';
  if (B.mode === 'sleep') return '睡覺中';
  if (B.mode === 'eat') return '吃東西中';
  if (B.mode === 'graze') return '低頭吃草';
  if (B.mode === 'skillGo' || B.mode === 'skillDo') return '正在施展本領';
  if (B.mode === 'drink') return '喝水中';
  if (B.mode === 'seek') return '發現食物了';
  if (B.mode === 'seekWater') return '去喝水';
  if (B.mode === 'goHouse' || B.mode === 'enter') return '回小窩';
  const m = moodKey();
  return {sick:'生病了，不太舒服', angry:'肚子餓，在生氣', thirsty:'好渴', dirty:'覺得好髒好臭', tired:'好累', sad:'有點寂寞',
    happy: B.mode === 'walk' ? '開心地散步' : '心情很好'}[m] || (B.mode === 'walk' || B.mode === 'goto' ? '散步中' : '東張西望');
}

// ---------- day / night / weather ----------
const SKY_DAY = '#d9e1d2', SKY_NIGHT = '#1a2130', SKY_DUSK = '#e3bfa4';
const PHASE_NAME = {morning:'早上', day:'白天', evening:'傍晚', night:'晚上'};
let wxAnnounced = null, lastTheme = null, lastPhase = null;
function dayInfo(){
  const d = new Date();
  if (S.dayMode === 'preview') return {d, n:0, dusk:0, phase:'day', left:null};
  if (S.dayMode === 'real'){
    const h = d.getHours() + d.getMinutes()/60;
    let n; if (h < 5.5 || h >= 19) n = 1; else if (h < 7) n = 1-(h-5.5)/1.5; else if (h < 17.5) n = 0; else n = (h-17.5)/1.5;
    const dusk = (h >= 5.5 && h < 7.5) || (h >= 17 && h < 19.5) ? 1 - Math.abs(n-0.5)*2 : 0;
    const phase = (h < 5.5 || h >= 19.5) ? 'night' : h < 10 ? 'morning' : h < 17 ? 'day' : 'evening';
    return {d, n, dusk, phase, left:null};
  }
  const m = d.getMinutes() + d.getSeconds()/60, dayHour = d.getHours()%2 === 0, tr = clamp(m/5, 0, 1);
  const n = dayHour ? 1 - ease(tr) : ease(tr);
  let dusk = tr < 1 ? 1 - Math.abs(tr*2-1) : 0;
  if (dayHour && m > 50) dusk = Math.max(dusk, (m-50)/10*0.7);
  const phase = !dayHour ? 'night' : m < 20 ? 'morning' : m < 50 ? 'day' : 'evening';
  return {d, n, dusk, phase, left:Math.ceil(60 - m), dayHour};
}
// ---------- sun & moon ----------
// The sun rises in the east (+x, over the sea), arcs across the southern sky (+z) and sets in the west (-x).
// The moon follows the same path, lagging behind the sun by its phase, and its shape follows the real moon over Taiwan.
const SYNODIC = 29.530588853, NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);
const moonPhase = () => { const p = ((Date.now() - NEW_MOON)/86400000/SYNODIC) % 1; return p < 0 ? p + 1 : p; };
const MOON_NAMES = ['新月','眉月','上弦月','盈凸月','滿月','虧凸月','下弦月','殘月'], MOON_ICON = ['🌑','🌒','🌓','🌔','🌕','🌖','🌗','🌘'];
const moonIdx = p => Math.round(p*8) % 8;
const isFullMoon = () => Math.abs(moonPhase() - 0.5) < 0.034 || (activeHoliday() && activeHoliday().id === 'midautumn');
function sunAngle(di){   // 0 = sunrise in the east, π/2 = noon, π = sunset in the west, above π = below the horizon
  if (S.dayMode === 'preview') return Math.PI*0.42;
  const d = di.d;
  if (S.dayMode === 'real'){ const h = d.getHours() + d.getMinutes()/60; return ((h - 6)/12*Math.PI + Math.PI*4) % (Math.PI*2); }
  const m = d.getMinutes() + d.getSeconds()/60;
  return (di.dayHour ? 0 : Math.PI) + m/60*Math.PI;
}
const TILT = 0.41;   // ≈ 23.5° — Taiwan's latitude tips the arc toward the south
const skyDir = a => V3(Math.cos(a), Math.sin(a)*Math.cos(TILT), Math.sin(a)*Math.sin(TILT));
const sunDirNow = V3(0, 1, 0), moonDirNow = V3(0, 1, 0);
function updateSky(di){
  const a = sunAngle(di), ph = moonPhase();
  sunDirNow.copy(skyDir(a)); moonDirNow.copy(skyDir(a - ph*Math.PI*2));
  const W_ = WX[weatherNow()], clear = 1 - W_.grey*1.4;
  world.sun.position.copy(camTarget).addScaledVector(sunDirNow, 90); world.sun.visible = sunDirNow.y > -0.08;
  world.sun.material.opacity = clamp(sunDirNow.y*6 + 0.4, 0, 1)*clamp(clear, 0.1, 1);
  world.sun.material.color.set(mixHex('#ffffff', '#ffb070', clamp(1 - sunDirNow.y*3, 0, 1)));
  world.drawMoon(ph);
  const moonView = act && act.key === 'moonview';
  const md = moonView ? V3(moonDirNow.x, 0, moonDirNow.z).normalize().multiplyScalar(Math.cos(0.2)).setY(Math.sin(0.2)) : moonDirNow;
  world.moon.position.copy(moonView ? root.position : camTarget).addScaledVector(md, moonView ? 70 : 85); world.moon.visible = moonDirNow.y > -0.06 && ph > 0.03 && ph < 0.97;
  world.moon.material.opacity = clamp(moonDirNow.y*6 + 0.3, 0, 1)*clamp(clear, 0.05, 1)*lerp(0.35, 1, di.n);
  world.moon.scale.setScalar(moonView ? 12 : 9);
  // the main light comes from the sun by day and from the moon at night
  const ld = (di.n < 0.5 || moonDirNow.y < 0 ? sunDirNow : moonDirNow).clone(); ld.y = Math.max(ld.y, 0.3); ld.normalize();
  L.lerp(ld, 0.05).normalize(); sun.position.copy(L).multiplyScalar(10);
  sun.color.set(mixHex('#ffffff', '#ffc890', clamp(1 - sunDirNow.y*2.5, 0, 1)*(1 - di.n)));
  if (art.on) sun.color.lerp(new THREE.Color('#ffe2b8'), 0.4*(1 - di.n));   // warm afternoon light
}
function updateWorld(dt, t){
  const di = dayInfo(); nightF = di.n;
  if (lastPhase && lastPhase !== di.phase && S.dayMode === 'hourly'){ if (di.phase === 'night') toast('天黑了。'); if (di.phase === 'morning') toast('天亮了，早安！'); }
  lastPhase = di.phase;
  if (!S.weather.forced && Date.now() > S.weather.until){
    const r = Math.random(); S.weather.type = r<.4?'sunny':r<.65?'cloudy':r<.82?'rain':r<.9?'storm':'snow';
    S.weather.until = Date.now() + rnd(4,10)*60000;
  }
  const w = weatherNow(), W = WX[w], hol = activeHoliday();
  if (wxAnnounced !== null && wxAnnounced !== w){
    const msg = {rain:'開始下雨了。可以帶牠去踩水窪。', storm:'打雷了，牠有點怕。', snow:'下雪了！可以堆雪人。', sunny:'天晴了。', cloudy:'雲飄過來了。'}[w];
    if (msg) toast(msg);
    if (w === 'storm' && petActive() && !asleep()){ showEmote('😨', 2); cry('sad'); }
  }
  wxAnnounced = w;
  let sky = mixHex(SKY_DAY, SKY_NIGHT, di.n); sky = mixHex(sky, SKY_DUSK, di.dusk*0.6);
  sky = mixHex(sky, '#8e979a', W.grey*(1-di.n*0.6)); if (W.white) sky = mixHex(sky, '#eef1f3', W.white*(1-di.n));
  if (hol) sky = mixHex(sky, hol.tint[0], hol.tint[1]*(1-di.n*0.5));
  if (art.on) sky = '#' + art.update(dt, {night:di.n, dusk:di.dusk, grey:W.grey, sunDir:sunDirNow, holiday: hol ? hol.tint : null}).getHexString();
  document.documentElement.style.setProperty('--bg', sky);
  const theme = di.n > 0.5 ? 'dark' : 'light'; if (theme !== lastTheme){ lastTheme = theme; document.documentElement.dataset.theme = theme; }
  snowCover = clamp(snowCover + (w === 'snow' ? 0.015 : -0.006)*dt, 0, 0.75);
  // snow settles on the ground; fog fades the far edges of the world into the sky colour
  const tm = world.terrain.material; tm.emissive.setScalar(snowCover*0.55*(1 - di.n*0.7)); tm.color.setScalar(0.74*(1 - snowCover*0.25)); world.tufts.material.emissive.setScalar(snowCover*0.45*(1 - di.n*0.7));   // grass and flowers stay under snow (hiding them emptied the whole meadow on snowy nights); the grass just frosts over
  const camD = camera.position.distanceTo(camTarget); scene.fog.color.set(sky); scene.fog.near = camD*1.5; scene.fog.far = camD*4.2;
  updateSky(di);
  world.update(dt, t, {night:di.n, fog:scene.fog, pet: petActive() && root.visible ? pos : null});
  updateBeach(dt, t);
  updateAmbience(dt, t, di.n > 0.6);
  if (badWeather()) wetUntil = Date.now() + 600000;   // worms come up in the rain and for a while after it
  wild.update(dt, t, {cam:camTarget, pet: petActive() && root.visible ? pos : null, night:di.n, wet: Date.now() < wetUntil, onSound: (n, at) => sfx(n, at),
    onEvent: (e, at) => { if (e === 'eagleCatch' && Math.hypot(at.x - camTarget.x, at.z - camTarget.z) < 35){ const first = !stat('eagleCatch'); track('eagleCatch'); if (first) toast('老鷹俯衝抓到獵物了！'); } }});
  fauna.update(dt, t, {bad:badWeather(), cam:camTarget, pet: petActive() && root.visible ? pos : null, night:di.n, onScare:animalScare, onSmile: p => floatSprite(emojiTex('😊'), p.add(V3(0, 0.9, 0)), {size:0.5, vy:0.5, max:1.6}), onZzz: p => floatSprite(textTex('Z','#5d6e8f','bold 90px sans-serif','rgba(255,255,255,.85)'), p, {size:0.35, vy:0.5, vx:0.2, max:2}),
    chips: p => floatSprite(radialTex('rgba(201,160,110,1)','rgba(201,160,110,0)'), p, {size:0.12, vx:rnd(-1,1), vz:rnd(-1,1), vy:rnd(1,2), g:8, max:0.6, grow:0}), treeNear:(x, z, r) => { const tr = trees.find(t => Math.hypot(t.d.x - x, t.d.z - z) < r); return tr ? tr.d : null; }});
  flashV *= Math.exp(-5*dt); $('#flash').style.opacity = (flashV*0.8).toFixed(3);
  const dim = W.dim*(1 - fxoV*0.45);
  const BR = S.bright || 1;   // brightness setting
  hemi.intensity = (lerp(0.8, 0.32, di.n)*dim*BR + flashV*1.2)*LI;
  sun.intensity = (lerp(0.75, 0.1, di.n)*dim*BR + flashV)*LI;
  U.uSun.value = lerp(1, 0.22, di.n)*dim*BR + flashV;
  U.uSky.value.set(mixHex('#fff8ec', '#7584ab', di.n)).multiplyScalar(BR);
  U.uGround.value.set(mixHex('#77806a', '#283040', di.n));
  const on = Math.max(clamp((di.n - 0.3)/0.4, 0, 1), w === 'storm' ? 0.6 : 0);
  nightGlow.forEach(m => m.emissiveIntensity = on*1.3);
  if (BG.lamp) BG.lamp.userData.glows.forEach(m => m.opacity = on);
  rain.visible = w === 'rain' || w === 'storm';
  if (rain.visible){
    rain.position.set(camTarget.x, gy(camTarget.x, camTarget.z), camTarget.z); rain.scale.setScalar(Math.max(1, camera.position.distanceTo(camTarget)/11));   // the rain fills the whole view however far out the camera is
    for (let i=0;i<RN;i++){ let y = rainPos[i*6+1] - rainSpd[i]*dt*(w==='storm'?1.3:1);
      if (y < 0){ y += 11; const x = rnd(-11,11), z = rnd(-11,11); rainPos[i*6] = x; rainPos[i*6+2] = z; rainPos[i*6+3] = x+0.08; rainPos[i*6+5] = z; }
      rainPos[i*6+1] = y; rainPos[i*6+4] = y + 0.4; }
    rainGeo.attributes.position.needsUpdate = true;
  }
  snow.visible = w === 'snow';
  if (snow.visible){
    snow.position.set(camTarget.x, gy(camTarget.x, camTarget.z), camTarget.z); snow.scale.setScalar(Math.max(1, camera.position.distanceTo(camTarget)/11));
    for (let i=0;i<SN;i++){ let y = snowPos[i*3+1] - 0.9*dt; snowPos[i*3] += Math.sin(t*0.8 + i)*0.25*dt;
      if (y < 0){ y += 11; snowPos[i*3] = rnd(-11,11); snowPos[i*3+2] = rnd(-11,11); } snowPos[i*3+1] = y; }
    snowGeo.attributes.position.needsUpdate = true;
  }
  const ffAct = act && act.key === 'fireflies';
  fireflies.visible = ffAct || (di.n > 0.6 && (w === 'sunny' || w === 'cloudy'));
  if (fireflies.visible){
    const hp = ffAct ? headTop() : null;
    ffSeed.forEach((f,i) => {
      let x = f.x + Math.sin(t*0.4+f.p)*1.2, y = f.y + Math.sin(t*0.9+f.p*2)*0.3, z = f.z + Math.cos(t*0.35+f.p)*1.2;
      if (hp){ const a = t*0.6 + f.p; x = hp.x + Math.sin(a)*(0.8+i%5*0.25); y = hp.y - 0.3 + Math.sin(t*1.3+f.p)*0.5; z = hp.z + Math.cos(a)*(0.8+i%5*0.25); }
      f.cx += (x - f.cx)*Math.min(1, dt*1.5); f.cy += (y - f.cy)*Math.min(1, dt*1.5); f.cz += (z - f.cz)*Math.min(1, dt*1.5);
      ffPos[i*3] = f.cx; ffPos[i*3+1] = f.cy; ffPos[i*3+2] = f.cz; });
    ffGeo.attributes.position.needsUpdate = true;
    fireflies.material.opacity = 0.6 + 0.4*Math.sin(t*3);
  }
  if (w === 'storm'){
    thunderT -= dt;
    if (thunderT <= 0){ thunderT = rnd(5,12); flashV = 1; setTimeout(()=>sfx('thunder'), 350);
      if (petActive() && !asleep() && B.mode !== 'inHouse' && !evo){ showEmote('😨',1.8); sqv += 1.5; cry('sad'); } }
  }
  if (SND.on) rainSound(w === 'rain' || w === 'storm'); else rainSound(false);
  // snowmen melt
  for (let i=snowmen.length-1;i>=0;i--){ const o = snowmen[i];
    if (w !== 'snow' && snowCover < 0.05) o.melt += dt/600;
    const s = 1 - o.melt*0.6; o.g.scale.set(s, s*(1 - o.melt*0.3), s); o.sh.g.scale.setScalar(s);
    if (o.melt >= 1){ scene.remove(o.g, o.sh.g); snowmen.splice(i,1); } }
}

// ---------- HUD ----------
// a meal or a drink fills up a bit over half of its listed amount (it filled the bars up too fast)
const FILL = 0.55;
const STAT_DEFS = [['hunger','飽足'],['thirst','水分'],['happy','心情'],['energy','體力'],['clean','清潔'],['health','健康'],['aff','親暱']];
const statsEl = $('#stats');
statsEl.innerHTML = STAT_DEFS.map(([k,l]) => `<div class="stat"><span>${l}</span><div class="track"><div class="fill" id="f_${k}"></div></div><span class="num" id="n_${k}"></span></div>`).join('')
  + `<div class="stat"><span id="l_grow">成長</span><div class="track"><div class="fill" id="f_grow"></div></div><span class="num" id="n_grow"></span></div><p class="env" id="env"></p>`;
function fmtAge(){ const m = ageMin(); if (m < 60) return `${Math.floor(m)} 分鐘大`; if (m < 1440) return `${Math.floor(m/60)} 小時大`; return `${Math.floor(m/1440)} 天 ${Math.floor(m%1440/60)} 小時大`; }
function setBar(k, v, txt){ const f = $('#f_'+k); f.style.width = clamp(v,0,100).toFixed(0)+'%'; f.classList.toggle('low', v < 25); $('#n_'+k).textContent = txt ?? Math.round(v); }
function stageLabel(){ const sd = STAGES[S.stage]; return S.stage === 'baby' || S.form === 'normal' ? sd.name : `${sd.name}　${form().name}`; }
function renderHUD(){
  $('#coins').textContent = S.coins;
  const egg = S.stage === 'egg';
  $('#petName').textContent = egg ? '一顆蛋' : (S.name || '袋熊');
  if (egg){ $('#petSub').textContent = `孵化中 ${Math.floor(S.warm)}%`; $('#petNow').textContent = hatching ? '要出來了！' : '點一點蛋，幫牠保暖。'; }
  else if (S.dead){ $('#petSub').textContent = '已經離開了'; $('#petNow').textContent = ''; }
  else { $('#petSub').textContent = `${stageLabel()}，${fmtAge()}`; const stx = statusText(); $('#petNow').textContent = stx ? '現在：' + stx : ''; }
  statsEl.hidden = !S.hud; $('#btnStats').setAttribute('aria-pressed', S.hud ? 'true' : 'false');
  const st = S.st;
  $('#l_grow').textContent = egg ? '孵化' : '成長';
  if (egg || S.dead){ STAT_DEFS.forEach(([k]) => setBar(k, 0, '–')); setBar('grow', egg ? S.warm : 0, egg ? Math.floor(S.warm)+'%' : '–'); $('#f_grow').classList.remove('low'); }
  else {
    STAT_DEFS.forEach(([k]) => setBar(k, k === 'clean' ? cleanVal() : k === 'aff' ? S.aff : st[k]));
    const sd = STAGES[S.stage];
    if (sd.next){ const prevG = {baby:0, child:25, adult:120, perfect:300}[S.stage], pct = clamp((S.growth-prevG)/(sd.growth-prevG)*100, 0, 100);
      const ageOK = ageMin() >= sd.age;
      setBar('grow', pct, !growthOK() ? '停滯' : pct >= 100 && !ageOK ? '等待' : Math.floor(pct)+'%'); $('#f_grow').classList.toggle('low', !growthOK()); }
    else setBar('grow', 100, '最終');
  }
  const di = dayInfo(), hh = pad(di.d.getHours()), mm = pad(di.d.getMinutes()), hol = activeHoliday();
  const mi = moonIdx(moonPhase());
  let env = `${WX[weatherNow()].name}　${PHASE_NAME[di.phase]}　${di.n > 0.5 ? MOON_ICON[mi] + MOON_NAMES[mi] : sunDirNow.y > 0 ? "☀️" : MOON_ICON[mi]}`;
  env += di.left != null ? `（${di.left} 分鐘後${di.dayHour ? '天黑' : '天亮'}）` : ` ${hh}:${mm}`;
  if (hol) env += `<br>今天是${hol.name}！`;
  if (SND.on && SND.songId) env += `<br>♪ ${hol && SND.songId === hol.song ? hol.name : (SONG_NAME[SND.songId] || '')}之歌`;
  if (S.speed > 1) env += `<br>時間 ${S.speed} 倍速`;
  $('#env').innerHTML = env;
  $('#alert').hidden = !(petActive() && st.health < 35 && B.mode !== 'evolve');
  const alive = petActive();
  document.querySelectorAll('.dock button').forEach(b => { const c = b.dataset.cmd; b.disabled = !alive && ['feed','water','play'].includes(c); });
  document.body.classList.toggle('ui-off', !!S.uiHidden); $('#btnShow').hidden = !S.uiHidden;
  hudDirty = false;
}

// ---------- toast / modal / sheet ----------
const toastEl = $('#toast'); let toastTimer;
function toast(t){ toastEl.textContent = t; toastEl.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(()=>toastEl.classList.remove('show'), 4200); }
function showModal(title, bodyHTML, actions){
  $('#modalTitle').textContent = title; $('#modalBody').innerHTML = bodyHTML; const ac = $('#modalActs'); ac.innerHTML = '';
  actions.forEach(a => { const b = document.createElement('button'); b.className = 'btn' + (a.ghost ? ' ghost' : ''); b.textContent = a.label; b.onclick = () => { closeModal(); a.onClick(); }; ac.appendChild(b); });
  $('#modal').hidden = false; const inp = $('#modalBody input'); (inp || ac.lastChild).focus();
}
function closeModal(){ $('#modal').hidden = true; canvas.focus({preventScroll:true}); }
function renamePet(){
  showModal(S.renamedOnce ? '使用改名券' : '改名（第一次免費）', `<p>幫${S.name || '牠'}取個新名字。</p><input id="renameIn" maxlength="8" value="${esc(S.name || '')}" aria-label="新名字">`,
    [{label:'取消', ghost:true, onClick:()=>{}}, {label:'改名', onClick:() => {
      const v = ($('#renameIn').value || '').trim(); if (!v || v === S.name){ toast('名字沒有變，改名券先留著。'); return; }
      S.name = v; if (S.renamedOnce) S.renameTicket = 0; S.renamedOnce = true; refreshSign(); save(); hudDirty = true; spawnHearts(2); toast(`以後牠就叫「${v}」了！`); }}]);
}
function askName(){
  showModal('孵出來了！', `<p>是一隻袋熊寶寶。幫牠取個名字吧。</p><input id="nameIn" maxlength="8" value="小袋" aria-label="名字">`, [{label:'就叫這個', onClick:()=>{
    S.name = (($('#nameIn') && $('#nameIn').value) || '').trim() || '小袋'; refreshSign(); save(); hudDirty = true;
    toast(`${S.name}來了！牠是${FURS[S.fur].name}色的${FURS[S.fur].w <= 2 ? "（很少見喔！）" : ""}。餵牠吃東西、陪牠玩，牠會慢慢長大。`); }}]);
  const inp = $('#nameIn'); const v = inp.value;
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') $('#modalActs button').click(); });
  // keep the typed value when the button is clicked
  $('#modalActs button').onclick = () => { S.name = (inp.value || v).trim() || '小袋'; closeModal(); refreshSign(); save(); hudDirty = true; toast(`${S.name}來了！牠是${FURS[S.fur].name}色的${FURS[S.fur].w <= 2 ? "（很少見喔！）" : ""}。餵牠吃東西、陪牠玩，牠會慢慢長大。`); };
}
function refreshSign(){ if (!BG.house) return; const m = BG.house.userData.sign.material[4]; m.map = signTexture(S.name); m.needsUpdate = true; }
function showMemorial(){
  const d = S.dead, days = Math.floor(d.ageMs/86400000), hrs = Math.floor(d.ageMs%86400000/3600000), nm = S.name || '牠';
  const what = d.stage && STAGES[d.stage] ? `（${STAGES[d.stage].name}${d.form && d.form !== 'normal' ? '的' + FORMS[d.form].name : ''}）` : '';
  const msg = d.cause === 'old'
    ? `${nm}${what}活了 ${days} 天 ${hrs} 小時，安安穩穩地走完了這一生。謝謝你一路照顧牠。`
    : `${nm}${what}病得太重，沒能撐過去。牠陪了你 ${days} 天 ${hrs} 小時。下一隻記得多餵牠吃東西、喝水，保持乾淨，生病時要餵藥。`;
  showModal(`${nm}離開了`, `<p>${msg}</p><p>牠的魂魄還在墳墓上飄著。準備好了，就<b>點一下墳墓</b>送牠去天堂，之後會出現新的蛋。代幣、衣服、道具和建設都會留給下一隻。</p>`, [{label:'好', onClick:()=>{}}]);
}
const sheet = $('#sheet'), sheetBody = $('#sheetBody'); let sheetKind = null;
function openSheet(kind){
  if (kind === 'feed') feedTab = 'food'; else if (kind === 'water') feedTab = 'drink';   // start on the matching tab; every tab stays clickable
  sheetKind = kind; sheet.hidden = false; sheet.scrollTop = 0; renderSheet(); $('#sheetClose').focus(); }
function closeSheet(){ sheet.hidden = true; sheetKind = null; }
$('#sheetClose').onclick = closeSheet;
function md(d){ return `${d.getMonth()+1}/${d.getDate()}`; }
// ---------- icon-tile catalogues (shop, feeding, tricks) ----------
const TRICK_ICON = {sit:'🐾', flip:'🤸', roll:'🌀', spin:'⭐', belly:'🙃', shake:'💨', dance:'💃', ballroll:'🎳', snowman:'⛄', puddle:'💦', fireflies:'✨', moonview:'🌕', dig:'⛏️', zoomies:'💨', wave:'👋', bow:'🙇', hop:'🐇', stretch:'🥱'};
const TRICK_DESC = {dig:'用前腳拚命挖土，偶爾會挖到代幣！', zoomies:'突然興奮地繞圈暴衝。體力 -6，心情 +10', wave:'坐著舉起前腳跟你揮手。', bow:'低下頭鞠個躬。', hop:'往前跳三下。', stretch:'前腳往前伸，打個大哈欠。', sit:'乖乖坐下，看著你。心情 +6', flip:'原地一個後空翻！體力 -6，心情 +10', roll:'連續側翻滾三圈。體力 -6，心情 +10', spin:'跳起來轉一圈。體力 -6，心情 +10',
  belly:'翻過來露出肚子扭扭。體力 -6，心情 +10', shake:'甩甩全身的毛。體力 -6，心情 +10', dance:'跟著音樂跳舞。體力 -8，心情 +14', ballroll:'縮成一顆球往前滾。體力 -6，心情 +12'};
const CLOTH_ICON = {party:'🥳', straw:'👒', glasses:'👓', bow:'🎀', scarf:'🧣', sweater:'🧶', nyband:'🎊', caishen:'🧧', heartgl:'😍', propeller:'🚁', sachet:'🎐', bunny:'🐰', witch:'🧙', santa:'🎅'};
const BUILD_ICON = {cottage:'🏡', bench:'🪑', swing:'🎠', sandbox:'🏖️', well:'🪣', windmill:'🌬️', mailbox:'📮', scarecrow:'🌾', mushroom:'🍄', fruittree:'🍎', fountain:'⛲', house:'🕳️', pond:'🐟', lamp:'💡', flowers:'🌷', fence:'🪵', fireworks:'🎆', lanterns:'🏮', heartarch:'💗', slide:'🎢', dragonboat:'🐉', moonlamp:'🌕', pumpkins:'🎃', xmastree:'🎄'};
let shopTab = 'food', feedTab = 'food', detailQty = 1;
const tabsHTML = (tabs, cur, attr) => `<div class="tabs" role="tablist">` + tabs.map(([k,l]) => `<button class="tab" role="tab" aria-selected="${k === cur}" data-${attr}="${k}">${l}</button>`).join('') + `</div>`;
const tileHTML = (e, i) => `<button class="tile${e.dim ? ' dim' : ''}" data-tile="${i}" aria-label="${e.name}"><span class="ti">${e.icon}</span><span class="tn">${e.name}</span>${e.badge ? `<span class="tb">${e.badge}</span>` : ''}</button>`;
const swatch = (c, b) => `<i class="dye" style="background:${c};box-shadow:inset -9px -7px 0 ${b}"></i>`;
let tiles = [];   // entries of the grid currently on screen; data-tile indexes into it
const holLive = c => !c.holiday || (realHoliday() && realHoliday().id === c.holiday);
// Popup for one tile: big icon, text, optional quantity stepper, buttons.
function detail(e){
  const q = e.qty ? `<div class="qty"><button class="btn ghost" data-q="-1" aria-label="少一個">−</button><b id="qtyN">1</b><button class="btn ghost" data-q="1" aria-label="多一個">＋</button><span id="qtyCost"></span></div>` : '';
  showModal(e.name, `<div class="bigicon">${e.icon}</div>${e.body || ''}${q}`, e.actions);
  detailQty = 1;
  if (e.qty){ let n = 1; const upd = () => { detailQty = n; $('#qtyN').textContent = n; $('#qtyCost').textContent = `共 ${n*e.price} 代幣`; };
    document.querySelectorAll('#modalBody [data-q]').forEach(b => b.onclick = () => { n = clamp(n + +b.dataset.q, 1, Math.max(1, Math.min(20, Math.floor(S.coins/e.price)))); upd(); });
    upd(); }
}
const afterBuy = () => { save(); hudDirty = true; renderSheet(); };
function buyConsumable(f, n){ if (S.coins < f.price*n){ toast('代幣不夠。'); return; } S.coins -= f.price*n; invAdd(f.id, n); sfx('coin'); toast(`買了 ${n} 份${f.name}，放進背包了。`); afterBuy(); }
function buyTrick(k){ const a = ACTS[k]; if (S.coins < a.price){ toast('代幣不夠。'); return false; } S.coins -= a.price; S.tricks = S.tricks || {}; S.tricks[k] = true; sfx('happy'); toast(`${S.name || '牠'}學會「${a.name}」了！`); afterBuy(); return true; }
function buyCloth(c){ if (S.coins < c.price){ toast('代幣不夠。'); return; } S.coins -= c.price; S.owned[c.id] = true; wear(c.id, true); sfx('happy'); toast(`買了${c.name}，已經幫牠穿上。到衣櫥可以換顏色。`); afterBuy(); }
function buyBuild(b){ if (S.coins < b.price){ toast('代幣不夠。'); return; } S.coins -= b.price; S.builds[b.id] = true; build(b.id); refreshSign(); sfx('grow'); toast(`${b.name}蓋好了！`); afterBuy(); }
// Food and drinks are bought once and then free forever; health products and medicine are used up one at a time.
const buyOnce = f => FOODS.includes(f) || DRINKS.includes(f);
const hasFood = f => !f.price || !!(S.food && S.food[f.id]);
function unlockFood(f){ if (S.coins < f.price){ toast('代幣不夠。'); return false; } S.coins -= f.price; S.food = S.food || {}; S.food[f.id] = true; sfx('happy'); toast(`買下${f.name}了！以後隨時都能免費給牠。`); hudDirty = true; return true; }
function consumableEntry(f, mode){
  const n = inv(f.id), free = !f.price, L = S.likes || {known:{}}, once = buyOnce(f), own = once && hasFood(f);
  const taste = L.known && L.known.fav && L.fav === f.id ? '（牠的最愛！）' : L.known && L.known.hate && L.hate === f.id ? '（牠不太喜歡）' : '';
  const body = `<p>${f.desc}${taste}</p><p><b>${foodStats(f)}</b></p><p>${free ? '免費，隨時都有。' : once ? (own ? '已經買下，隨時都能免費給牠。' : `買斷 ${f.price} 代幣，之後永遠免費。`) : `${f.price} 代幣・背包裡有 ${n} 個`}</p>`;
  if (mode === 'shop'){
    if (once) return {icon:f.icon, name:f.name, badge: own ? '已擁有' : `${f.price}`, body,
      actions: own ? [{label:'關閉', ghost:true, onClick:()=>{}}] : [{label:'關閉', ghost:true, onClick:()=>{}}, {label:`買斷（${f.price}）`, onClick:() => { if (unlockFood(f)) afterBuy(); }}]};
    return {icon:f.icon, name:f.name, badge: n ? `×${n}` : `${f.price}`, price:f.price, qty:true, body,
      actions:[{label:'關閉', ghost:true, onClick:()=>{}}, {label:'購買', onClick:() => buyConsumable(f, detailQty)}]};
  }
  const isCare = CARE.includes(f) || MEDS.includes(f);
  const go = () => { closeSheet(); (isCare ? useCare : giveFood)(f.id); save(); hudDirty = true; };
  const have = once ? own : free || n;
  return {icon:f.icon, name:f.name, dim: !have, badge: free ? '免費' : once ? (own ? '' : `${f.price}`) : n ? `×${n}` : `${f.price}`, body,
    actions: have ? [{label:'關閉', ghost:true, onClick:()=>{}}, {label:'給牠', onClick:go}]
      : once ? [{label:'關閉', ghost:true, onClick:()=>{}}, {label:`買斷並給牠（${f.price}）`, onClick:() => { if (unlockFood(f)) go(); }}]
      : [{label:'關閉', ghost:true, onClick:()=>{}}, {label:`買一份給牠（${f.price}）`, onClick:() => { if (S.coins < f.price){ toast('代幣不夠。'); return; } S.coins -= f.price; invAdd(f.id, 1); go(); }}]};
}
function trickEntry(k){
  const a = ACTS[k], have = hasTrick(k), why = have ? whyCantPlay(k) : null;
  const body = `<p>${a.special ? a.desc : TRICK_DESC[k]}</p>${a.special ? `<p class="note">${a.why}</p>` : ''}<p>${have ? (why ? `現在不行：${why}` : '已經學會了。') : `還沒學會。學費 ${a.price} 代幣。`}</p>`;
  return {icon:TRICK_ICON[k] || '🎲', name:a.name, dim:!have || (a.special && why), badge: have ? '' : `🔒${a.price}`, body,
    actions: have ? [{label:'關閉', ghost:true, onClick:()=>{}}, {label:'表演', onClick:() => { closeSheet(); startAct(k); }}]
      : [{label:'關閉', ghost:true, onClick:()=>{}}, {label:`學會（${a.price}）`, onClick:() => buyTrick(k)}]};
}
function shopEntries(tab){
  const no = [{label:'關閉', ghost:true, onClick:()=>{}}];
  if (tab === 'food') return FOODS.filter(f => f.price).map(f => consumableEntry(f, 'shop'));
  if (tab === 'drink') return DRINKS.filter(f => f.price).map(f => consumableEntry(f, 'shop'));
  if (tab === 'care') return CARE.map(f => consumableEntry(f, 'shop'));
  if (tab === 'med') return MEDS.map(f => consumableEntry(f, 'shop'));
  if (tab === 'trick') return Object.keys(ACTS).filter(k => ACTS[k].price).map(trickEntry).map(e => ({...e, badge: e.badge || '已學會'}));
  if (tab === 'dye') return DYES.map((d,i) => ({icon:swatch(d.c, d.b), name:d.name, badge: S.dye === i ? '使用中' : `${DYE_PRICE}`,
      body:`<p>把${S.name || '牠'}的毛染成${d.name}色。現在是${coatName()}。</p><p>${DYE_PRICE} 代幣</p>`,
      actions: S.dye === i ? no : [...no, {label:'染色', onClick:() => { if (S.coins < DYE_PRICE){ toast('代幣不夠。'); return; } S.coins -= DYE_PRICE; S.dye = i; applyFur(); sparkles(headTop(), 18, 1.2*petS); sfx('grow'); toast(`${S.name || '牠'}變成${d.name}色了！`); afterBuy(); }}]}))
    .concat(S.dye != null ? [{icon:'🫧', name:'褪色劑', badge:`${UNDYE_PRICE}`, body:`<p>變回天生的${(FURS[S.fur] || FURS[0]).name}色。</p><p>${UNDYE_PRICE} 代幣</p>`,
      actions:[...no, {label:'褪色', onClick:() => { if (S.coins < UNDYE_PRICE){ toast('代幣不夠。'); return; } S.coins -= UNDYE_PRICE; S.dye = null; applyFur(); sfx('grow'); toast('變回天生的顏色了。'); afterBuy(); }}]}] : []);
  if (tab === 'item') return [
    {icon:'🏷️', name:'改名券', badge: S.renameTicket ? '持有中' : '50', body:'<p>幫牠換一個名字，一張用一次。一次只能持有一張，到衣櫥使用。</p><p class="note">第一次改名免費，直接到衣櫥按「改名」。</p><p>50 代幣</p>',
      actions: S.renameTicket ? no : [...no, {label:'購買', onClick:() => { if (S.coins < 50){ toast('代幣不夠。'); return; } S.coins -= 50; S.renameTicket = 1; sfx('coin'); toast('買了改名券，到「衣櫥」使用。'); afterBuy(); }}]},
    {icon:'🛟', name:'游泳圈', badge: S.ring ? '已擁有' : '150', body:'<p>有了游泳圈，袋熊就能下水游泳：走進河裡、池塘、沼澤或淺海會自動套上，上岸就脫下。不用蓋橋也能游到對岸。</p><p>150 代幣</p>',
      actions: S.ring ? no : [...no, {label:'購買', onClick:() => { if (S.coins < 150){ toast('代幣不夠。'); return; } S.coins -= 150; S.ring = true; NAV.dirty = true; sfx('happy'); toast('買了游泳圈！下次走到水邊，牠就會自己游下去。'); afterBuy(); }}]},
    {icon:'🧹', name:'一鍵清理', badge: S.autoClean ? '已擁有' : '300', body:'<p>按一下「清理」，就把便便和雜草一次清光。永久有效。</p><p>300 代幣</p>',
      actions: S.autoClean ? no : [...no, {label:'購買', onClick:() => { if (S.coins < 300){ toast('代幣不夠。'); return; } S.coins -= 300; S.autoClean = true; sfx('happy'); toast('有了一鍵清理！以後按「清理」就能一次清光。'); afterBuy(); }}]}];
  const real = realHoliday();
  const clothE = c => ({icon:CLOTH_ICON[c.id] || '👕', name:c.name, badge: S.owned[c.id] ? '已擁有' : `${c.price}`, dim: !S.owned[c.id] && !holLive(c),
    body:`<p>${c.holiday ? `${HOLIDAYS.find(x=>x.id===c.holiday).name}限定，只在節日當天賣。` : ''}${S.owned[c.id] ? '已經有了，到衣櫥可以穿脫、換顏色。' : `${c.price} 代幣`}</p>`,
    actions: S.owned[c.id] || !holLive(c) ? no : [...no, {label:'購買並穿上', onClick:() => buyCloth(c)}]});
  const buildE = b => ({icon:BUILD_ICON[b.id] || '🏗️', name:b.name, badge: S.builds[b.id] ? '已建造' : `${b.price}`, dim: !S.builds[b.id] && !holLive(b),
    body:`<p>${b.desc}</p><p>${b.holiday ? `${HOLIDAYS.find(x=>x.id===b.holiday).name}限定。` : ''}${S.builds[b.id] ? '已經蓋好了。' : `${b.price} 代幣`}</p>`,
    actions: S.builds[b.id] ? (b.size ? [...no, {label:'移動', onClick:() => startPlace(b.id, false)}] : no) : !holLive(b) ? no : [...no, {label: b.size ? '選位置蓋' : '建造', onClick:() => b.size ? startPlace(b.id, true) : buyBuild(b)}]});
  if (tab === 'cloth') return CLOTHES.filter(c => !c.holiday || S.owned[c.id] || holLive(c)).map(clothE);
  if (tab === 'build') return BUILDS.filter(b => !b.holiday || S.builds[b.id] || holLive(b)).map(buildE);
  if (tab === 'limited'){ const h = activeHoliday(); return h ? [...CLOTHES.filter(c => c.holiday === h.id).map(clothE), ...BUILDS.filter(b => b.holiday === h.id).map(buildE)] : []; }
  return [];
}
const SHOP_TABS = [['food','食物'],['drink','飲料'],['care','保健'],['med','藥品'],['trick','招式'],['dye','染劑'],['item','道具'],['cloth','服裝'],['build','建築']];
function renderSheet(){
  if (!sheetKind) return;
  $('#sheetTitle').textContent = {play:'玩耍', shop:'商店', wardrobe:'衣櫥', settings:'設定', feed:'餵食', water:'喝水', tasks:'任務與成就'}[sheetKind];
  let h = '';
  if (sheetKind === 'tasks') h = tabsHTML([['daily','每日任務'],['ach','成就']], taskTab, 'ttab') + tasksHTML();
  else if (sheetKind === 'feed' || sheetKind === 'water'){
    const list = feedTab === 'food' ? FOODS : feedTab === 'drink' ? DRINKS : [...CARE, ...MEDS];
    tiles = list.filter(f => !f.price || inv(f.id) || feedTab !== 'care').map(f => consumableEntry(f, 'use'));
    h = tabsHTML([['food','食物'],['drink','飲料'],['care','保健・藥品']], feedTab, 'ftab')
      + (tiles.length ? `<div class="tiles">${tiles.map(tileHTML).join('')}</div>` : `<p class="sec">背包裡還沒有保健品或藥。到商店的「保健」「藥品」買吧。</p>`)
      + `<p class="sec">點圖示看說明。灰色的是背包裡沒有的，可以直接買一份。</p>`;
  } else if (sheetKind === 'play'){
    tiles = Object.keys(ACTS).map(trickEntry);
    h = (S.ring ? `<div class="card" style="margin-bottom:10px"><h3>🏊 玩水（免費，有游泳圈才能玩）</h3><p style="margin:4px 0 8px;color:var(--soft)">選一個地方，${S.name || '牠'}會走過去下水玩一下。</p><div class="opts">`
      + SWIM_SPOTS.map(sp => `<button class="btn ghost" data-swim="${sp.id}">${sp.icon} ${sp.name}</button>`).join('') + `</div></div>` : '')
      + `<div class="tiles">${tiles.map(tileHTML).join('')}</div><p class="sec">點圖示看說明。🔒 的招式要先學會；有些要看天氣和時間。</p>`;
  } else if (sheetKind === 'shop'){
    const hol = activeHoliday(), nx = nextHoliday(), tabs = hol ? [['limited', hol.name + '限定'], ...SHOP_TABS] : SHOP_TABS;
    if (!tabs.some(([k]) => k === shopTab)) shopTab = 'food';
    tiles = shopEntries(shopTab);
    h = tabsHTML(tabs, shopTab, 'stab') + `<div class="tiles">${tiles.map(tileHTML).join('')}</div>`
      + (shopTab === 'limited' && hol && !(realHoliday() && realHoliday().id === hol.id) ? `<p class="sec">節日預覽中，只能看不能買。</p>` : '')
      + (!hol && nx && (shopTab === 'cloth' || shopTab === 'build') ? `<p class="sec">下一個節日：${nx.h.name}（${md(nx.d)}），當天會賣限定服裝和建設。</p>` : '')
      + `<p class="sec">點圖示看說明和購買。賺代幣：清大便 +3、拔雜草 +2、餓或渴的時候餵食喝水 +2、堆雪人 +5、踩水窪 +2、摸摸牠偶爾 +1。</p>`;
  } else if (sheetKind === 'wardrobe'){
    const owned = CLOTHES.filter(c => S.owned[c.id]);
    const L = S.likes || {known:{}}, taste = [L.known.fav && `最愛吃${foodInfo(L.fav).name}`, L.known.hate && `不愛吃${foodInfo(L.hate).name}`].filter(Boolean).join('，');
    h = `<p class="sec">毛色：${coatName()}。想換顏色，到商店買染劑。</p>`
      + (taste ? `<p class="sec">口味：${taste}。</p>` : '')
      + (S.renameTicket || !S.renamedOnce ? `<div class="card"><div class="row"><h3>${S.renamedOnce ? "改名券 ×1" : "改名（第一次免費）"}</h3><button class="btn" data-rename>${S.renamedOnce ? "使用" : "改名"}</button></div></div>` : `<p class="sec">想再改名字，到商店「道具」買改名券。</p>`);
    h += `<div class="row" style="margin-top:14px"><p class="sec" style="margin:0">衣服（同一個位置一次只能穿一件）</p>${owned.length ? `<button class="btn ghost" data-naked>脫光光</button>` : ''}</div>`;
    if (!owned.length) h += `<p style="color:var(--soft)">還沒有衣服。清大便、拔雜草賺代幣，去商店買吧。</p>`;
    else h += owned.map(c => `<div class="card" style="margin-top:10px"><div class="row"><h3>${c.name}</h3><button class="btn ${S.worn[c.id] ? '' : 'ghost'}" data-wear="${c.id}">${S.worn[c.id] ? '脫下' : '穿上'}</button></div><div class="swrow" role="radiogroup" aria-label="${c.name}顏色">` + PALETTE.map(p => `<button class="sw" role="radio" aria-checked="${(S.colors[c.id]||c.def)===p}" aria-label="${p}" data-col="${c.id}|${p}" style="background:${p}"></button>`).join('') + `</div></div>`).join('');
  } else if (sheetKind === 'settings'){
    const sp = [1,10,60], wx = [['auto','自動'],['sunny','晴'],['cloudy','多雲'],['rain','雨'],['snow','雪'],['storm','雷雨']];
    h = `<p class="sec">畫風</p><div class="opts"><button class="icon" data-art="ghibli" aria-pressed="${S.art !== 'plain'}">吉卜力水彩（試作）</button><button class="icon" data-art="plain" aria-pressed="${S.art === 'plain'}">原本的畫風</button></div>`
      + musicHTML() + `<p class="sec">晝夜</p><div class="opts"><button class="icon" data-day="hourly" aria-pressed="${S.dayMode==='hourly'}">每小時切換早晚</button><button class="icon" data-day="real" aria-pressed="${S.dayMode==='real'}">跟現實時間同步</button></div>`
      + `<p class="sec">時間流速（只影響成長和數值，10 倍、60 倍適合想快點看牠進化）</p><div class="opts">` + sp.map(v => `<button class="icon" data-speed="${v}" aria-pressed="${S.speed===v}">${v} 倍</button>`).join('') + `</div>`
      + `<p class="sec">天氣</p><div class="opts">` + wx.map(([k,l]) => `<button class="icon" data-wx="${k}" aria-pressed="${(S.weather.forced||'auto')===k}">${l}</button>`).join('') + `</div>`
      + `<p class="sec">節日預覽（看背景和音樂，限定商品只能在真正的節日當天買）</p><div class="opts"><button class="icon" data-hol="" aria-pressed="${!previewHoliday}">關閉</button>` + HOLIDAYS.map(x => `<button class="icon" data-hol="${x.id}" aria-pressed="${previewHoliday===x.id}">${x.name}</button>`).join('') + `</div>`
      + `<p class="sec">畫面亮度（晚上太暗可以調亮）：<b id="brightV">${Math.round((S.bright || 1)*100)}%</b></p><input type="range" id="brightIn" min="60" max="180" step="5" value="${Math.round((S.bright || 1)*100)}" aria-label="畫面亮度" style="width:100%">`
      + `<div class="opts" style="margin-top:6px"><button class="icon" data-bright="100">回到 100%</button></div>`
      + `<p class="sec">介面</p><div class="opts"><button class="icon" data-hideui>隱藏全部介面</button><button class="icon" data-guide>打開說明書</button></div>`
      + `<p class="sec">進化型態預覽（看看長什麼樣子，不會存檔，也不會影響你的袋熊）</p><div class="opts">` + (PREVIEW ? `<button class="btn" data-exitpreview>回到我的袋熊</button>` : '')
      + Object.keys(FORMS).filter(k => k !== 'normal').map(k => `<button class="icon" data-preview="${k}" aria-pressed="${PREVIEW===k}">${FORMS[k].name}</button>`).join('') + `</div>`
      + installPanel()
      + `<p class="sec">帳號與雲端存檔</p>` + cloudPanel()
      + `<p class="sec">存檔碼（備份，或把舊版的袋熊搬過來）</p><div class="opts"><button class="btn ghost" data-export>匯出存檔碼</button><button class="btn ghost" data-import>匯入存檔碼</button></div>`
      + `<p class="sec">重來</p><div class="opts"><button class="btn ghost" data-reset>全部重新開始</button></div>`;
  }
  sheetBody.innerHTML = h;
}
function installPanel(){
  if (matchMedia('(display-mode: standalone)').matches || navigator.standalone) return '';
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const how = window.installPrompt ? `<div class="opts"><button class="btn" data-install>安裝</button></div>`
    : ios ? `<p class="note">用 Safari 打開，按下方的「分享」按鈕 →「加入主畫面」。</p>`
    : `<p class="note">用 Chrome 打開，按右上角「⋮」→「加到主畫面」或「安裝應用程式」。</p>`;
  return `<p class="sec">安裝到主畫面（像 App 一樣全螢幕開啟，沒網路也能玩）</p>` + how
    + (ios ? `<p class="note">裝好以後，在 App 裡要再登入一次 Google。</p>` : '');
}
addEventListener('appinstalled', () => { window.installPrompt = null; toast('裝好了！可以從主畫面打開袋熊。'); if (sheetKind === 'settings') renderSheet(); });
function cloudPanel(){
  if (!cloud.available) return `<p class="note">雲端功能沒有載入（可能沒有網路），進度先存在這台裝置。</p>`;
  if (!cloud.user) return `<p class="note">登入後，進度會存到雲端，電腦和手機可以共用同一隻袋熊。沒登入也能玩，只存在這台裝置。</p>`
    + (IN_APP ? `<p class="note">你現在是在 App（例如 LINE）裡面開的網頁，要先改用 Chrome 或 Safari 打開才能登入。</p><div class="opts"><button class="btn" data-login>用瀏覽器打開</button></div>`
              : `<div class="opts"><button class="btn" data-login>用 Google 登入</button></div>`);
  const st = {saving:'同步中……', synced:`已同步（${when(cloud.lastSync)}）`, offline:'暫時連不上雲端，連上網後會自動同步。', error:'同步失敗，稍後會再試。'}[cloud.status] || '準備同步……';
  return `<p class="note">已登入：${esc(cloud.user.email || cloud.user.displayName || '')}<br>${st}</p>`
    + `<div class="opts"><button class="btn ghost" data-syncnow>立即同步</button><button class="btn ghost" data-logout>登出</button></div>`;
}
// the music settings: tune, melody instrument, accompaniment (style + instrument) and drums; "自動" follows the time and weather
function musicHTML(){
  const P = S.music || {}, sel = (key, opts) => `<select data-mus="${key}" style="font:inherit;padding:4px 6px;border-radius:8px;max-width:100%">${opts.map(([v, t]) => `<option value="${v}"${(P[key] || 'auto') === v ? ' selected' : ''}>${t}</option>`).join('')}</select>`;
  const insts = Object.keys(INST_NAME).map(k => [k, INST_NAME[k]]);
  const comps = [['auto', '自動'], ['none', '不要伴奏'], ...['arp', 'strum', 'comp', 'pad'].flatMap(st => insts.filter(([k]) => st !== 'pad' || /string|ocarina|flute|sax|trumpet/.test(k)).map(([k, n]) => [st + ':' + k, `${COMP_STYLE[st]}・${n}`]))];
  return `<p class="sec">音樂（自己作曲配器）</p><div class="card" style="margin-bottom:10px;display:grid;grid-template-columns:auto 1fr;gap:6px 10px;align-items:center">`
    + `<span>曲子</span>${sel('song', [['auto', '自動（看時間和天氣）'], ...MUSIC_SONGS.map(k => [k, SONG_NAME[k] + '之歌'])])}`
    + `<span>主旋律</span>${sel('lead', [['auto', '自動'], ...insts])}`
    + `<span>伴奏</span>${sel('comp', comps)}`
    + `<span>鼓</span>${sel('drums', [['auto', '自動'], ['none', '不要鼓'], ['rock', '搖滾鼓'], ['swing', '爵士鼓'], ['bossa', '巴薩諾瓦'], ['folk', '民謠輕鼓']])}`
    + `</div><div class="opts"><button class="btn ghost" data-musreset>全部改回自動</button></div>`;
}
sheetBody.addEventListener('change', e => {
  const k = e.target.dataset && e.target.dataset.mus; if (!k) return;
  S.music = {...(S.music || {}), [k]:e.target.value}; save();
  if (SND.ctx && SND.on){ if (k === 'song'){ SND.step = 0; } SND.songId = null; loadSong(wantedSong()); } else toast('打開右上角的「音樂」就能聽到。');
});
sheetBody.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  const d = b.dataset;
  if (d.stab){ shopTab = d.stab; renderSheet(); return; }
  if (d.ftab){ feedTab = d.ftab; renderSheet(); return; }
  if (d.ttab){ taskTab = d.ttab; renderSheet(); return; }
  if (d.tile !== undefined){ const e = tiles[+d.tile]; if (e) detail(e); return; }
  if (d.act){ closeSheet(); startAct(d.act); return; }
  if (d.swim){ goSwim(d.swim); return; }
  if (d.musreset !== undefined){ S.music = {}; save(); if (SND.ctx && SND.on) SND.songId = null; renderSheet(); return; }
  if (d.use || d.usebuy){ const id = d.use || d.usebuy, f = foodInfo(id);
    if (d.usebuy){ if (S.coins < f.price) return; S.coins -= f.price; invAdd(id, 1); }
    closeSheet(); giveFood(id); save(); hudDirty = true; return; }
  if (d.buyfood){ const [id, n] = d.buyfood.split('|'), f = foodInfo(id), cost = f.price*n;
    if (S.coins >= cost){ S.coins -= cost; invAdd(id, +n); sfx('coin'); toast(`買了 ${n} 份${f.name}，放進背包了。按「${f.hunger !== undefined ? '餵食' : '喝水'}」就能給牠。`); } }
  if (d.buytrick){ const a = ACTS[d.buytrick];
    if (S.coins >= a.price){ S.coins -= a.price; S.tricks = S.tricks || {}; S.tricks[d.buytrick] = true; sfx('happy'); toast(`${S.name || '牠'}學會「${a.name}」了！到「玩耍」試試看。`); } }
  if (d.dye !== undefined){ const i = +d.dye, dy = DYES[i];
    showModal(`染成${dy.name}色？`, `<p>花 ${DYE_PRICE} 代幣，把${S.name || '牠'}的毛染成${dy.name}色。</p>`, [{label:'取消', ghost:true, onClick:()=>{}}, {label:'染色', onClick:() => {
      if (S.coins < DYE_PRICE) return; S.coins -= DYE_PRICE; S.dye = i; applyFur(); sparkles(headTop(), 18, 1.2*petS); sfx('grow');
      toast(`${S.name || '牠'}變成${dy.name}色了！`); save(); hudDirty = true; }}]); return; }
  if ('undye' in d){ if (S.coins >= UNDYE_PRICE){ S.coins -= UNDYE_PRICE; S.dye = null; applyFur(); sfx('grow'); toast('變回天生的顏色了。'); } }
  if ('buyticket' in d){ if (S.coins >= 50 && !S.renameTicket){ S.coins -= 50; S.renameTicket = 1; sfx('coin'); toast('買了改名券，到「衣櫥」使用。'); } }
  if ('buyclean' in d){ if (S.coins >= 300 && !S.autoClean){ S.coins -= 300; S.autoClean = true; sfx('happy'); toast('有了一鍵清理！以後按「清理」就能一次清光。'); } }
  if ('rename' in d){ closeSheet(); renamePet(); return; }
  if ('reset' in d){ showModal('全部重新開始？', `<p>袋熊、代幣、衣服和建設都會清掉，從一顆蛋重新開始${cloud.user ? '，雲端存檔也一樣' : ''}。沒辦法復原。</p>`, [{label:'取消', ghost:true, onClick:()=>{}}, {label:'重新開始', onClick:resetAll}]); return; }
  if ('guide' in d){ closeSheet(); openGuide(0); return; }
  if ('export' in d){ closeSheet(); exportSave(); return; }
  if ('import' in d){ closeSheet(); importSave(); return; }
  if (d.preview){ location.href = location.pathname + '?preview=' + d.preview; return; }
  if ('exitpreview' in d){ location.href = location.pathname; return; }
  if ('install' in d){ const p = window.installPrompt; if (p){ p.prompt(); p.userChoice.then(() => { window.installPrompt = null; renderSheet(); }); } return; }
  if ('login' in d){ login(); return; }
  if ('logout' in d){ cloud.signOut().then(() => toast('登出了。進度還是會存在這台裝置。')); return; }
  if ('syncnow' in d){ save(true); return; }
  if (d.buy){ const c = CLOTHES.find(x => x.id === d.buy); if (S.coins >= c.price){ S.coins -= c.price; S.owned[c.id] = true; wear(c.id, true); sfx('happy'); toast(`買了${c.name}，已經幫牠穿上。到衣櫥可以換顏色。`); } }
  if (d.build){ const bd = BUILDS.find(x => x.id === d.build); if (S.coins >= bd.price){ S.coins -= bd.price; S.builds[bd.id] = true; build(bd.id); refreshSign(); sfx('grow'); toast(`${bd.name}蓋好了！`); } }
  if ('med' in d) giveMedicine();
  if (d.fur !== undefined){ S.fur = +d.fur; applyFur(); }
  if ('naked' in d){ CLOTHES.forEach(c => S.worn[c.id] = false); applyClothes(); toast('脫光光了。'); }
  if (d.wear){ wear(d.wear, !S.worn[d.wear]); }
  if (d.col){ const [id, col] = d.col.split('|'); S.colors[id] = col; applyClothes(); }
  if (d.bright){ S.bright = +d.bright/100; }
  if (d.art){ S.art = d.art; setArt(S.art); }
  if (d.speed){ S.speed = +d.speed; }
  if (d.day){ S.dayMode = d.day; lastPhase = null; }
  if (d.wx){ S.weather.forced = d.wx === 'auto' ? null : d.wx; }
  if (d.hol !== undefined){ previewHoliday = d.hol || null; }
  if ('hideui' in d){ S.uiHidden = true; closeSheet(); }
  save(); hudDirty = true; if (sheetKind) renderSheet();
});
sheetBody.addEventListener('input', e => {
  if (e.target.id !== 'brightIn') return;
  S.bright = +e.target.value/100; $('#brightV').textContent = e.target.value + '%';
});
sheetBody.addEventListener('change', e => { if (e.target.id === 'brightIn') save(); });
function giveMedicine(){
  if (!petActive()){ toast('現在不需要吃藥。'); return; }
  if (S.coins < 10){ toast('代幣不夠。清大便、拔雜草可以賺代幣。'); return; }
  S.coins -= 10; S.st.health = clamp(S.st.health + 45, 0, 100); sfx('happy'); spawnHearts(2); showEmote('💊', 1.6); toast('吃藥了，好多了。'); hudDirty = true; save();
}
$('#btnMed').onclick = giveMedicine;

// ---------- guide (illustrated manual) ----------
function wbSvg(x, y, s=1, o={}){
  const c = o.c || '#8b6b50', bx = o.bx || 1, by = o.by || 1, hx = 34*bx;
  let acc = '', under = '', aura = o.glow ? `<ellipse cx="6" cy="-4" rx="56" ry="38" fill="${o.glow}" opacity=".35"/>` : '';
  const has = a => [].concat(o.acc || []).includes(a);
  if (has('cape')) under += `<path d="M-30 -10 Q0 -30 30 -10 L36 14 Q0 22 -36 14z" fill="#b8323a"/><path d="M-36 14 Q0 22 36 14" stroke="#f6f1e6" stroke-width="5" fill="none"/><path d="M-30 -10 Q0 -30 30 -10" stroke="#f6f1e6" stroke-width="6" fill="none"/>`;
  if (has('leafcape')) under += [-4,-3,-2,-1,0,1,2,3,4].map(i => `<ellipse cx="${i*7.5}" cy="${-12+Math.abs(i)*2.2}" rx="6" ry="12" fill="${['#5f9a3e','#76b24a','#4c8434'][(i+4)%3]}" transform="rotate(${i*8} ${i*7.5} ${-12+Math.abs(i)*2.2})"/>`).join('') + `<circle cx="-12" cy="-6" r="3.5" fill="#fbf8f0"/><circle cx="14" cy="-4" r="3.5" fill="#fbf8f0"/>`;
  if (has('windscarf') || has('boltcape')) under += `<path d="M-6 -20 Q-30 -26 -50 -12 M-4 -14 Q-28 -10 -48 -2" stroke="#c8333a" stroke-width="5" fill="none" stroke-linecap="round"/>`;
  if (has('boltcape')) under += `<path d="M-30 -10 Q0 -28 30 -10 L34 12 l-8 -6 l-8 8 l-8 -7 l-8 8 l-8 -7 l-8 8 l-8 -7 l-8 6z" fill="#b8323a" stroke="#e2b53b" stroke-width="1.5"/>`;
  if (has('sprout')) acc += `<path d="M${hx} -21 q-8 -10 -12 -4 q6 6 12 4 q8 -10 12 -4 q-6 6 -12 4" fill="#6aa845"/><circle cx="${hx-12}" cy="-17" r="3.5" fill="#fbf8f0"/>`;
  if (has('antler')) acc += `<path d="M${hx-6} -20 l-6 -14 l-6 -4 M${hx-12} -34 l2 -7 M${hx+6} -21 l6 -14 l6 -4 M${hx+12} -35 l-2 -7" stroke="#c79a45" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M${hx} -26 l4 6 l-4 6 l-4 -6z" fill="#6af08a"/>`;
  if (has('windband') || has('boltband')) acc += `<path d="M${hx-16} -14 Q${hx} -19 ${hx+16} -14" stroke="#c8333a" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M${hx-16} -14 q-12 -6 -24 -2 M${hx-16} -13 q-10 4 -22 6" stroke="#c8333a" stroke-width="3.5" fill="none" stroke-linecap="round"/>`;
  if (has('boltband')) acc += `<path d="M${hx+3} -24 l-5 7 h4 l-3 7 l7 -9 h-4 l3 -5z" fill="#ffd84a"/><path d="M-44 -30 l-6 10 h5 l-4 10 M48 -28 l-5 9 h5 l-4 10" stroke="#ffd84a" stroke-width="2.5" fill="none"/>`;
  if (has('thermo')) acc += `<path d="M${hx+18} 3 l12 6" stroke="#f4f6f8" stroke-width="3" stroke-linecap="round"/><circle cx="${hx+31}" cy="9.5" r="2.5" fill="#d23b32"/>`;
  if (has('poop')) acc += `<g fill="#6e4c35"><ellipse cx="${hx}" cy="-24" rx="9" ry="4.5"/><ellipse cx="${hx}" cy="-29" rx="6.5" ry="3.8"/><ellipse cx="${hx}" cy="-33.5" rx="4" ry="3"/><path d="M${hx} -40 l3 4 h-5z"/></g><path d="M${hx-12} -36 q-3 -5 0 -10 M${hx+12} -36 q3 -5 0 -10" stroke="#8a9a4a" stroke-width="1.6" fill="none"/>`;
  if (has('bandage')) acc += `<path d="M${hx-16} -12 L${hx+15} -16" stroke="#f4f1ea" stroke-width="5" stroke-linecap="round"/><path d="M${hx-4} -24 l7 7 M${hx+3} -24 l-7 7" stroke="#e8c9a6" stroke-width="3"/>`;
  if (has('headband')) acc += `<path d="M${hx-16} -13 Q${hx} -18 ${hx+16} -13" stroke="#d94b45" stroke-width="5" fill="none" stroke-linecap="round"/>`;
  if (has('crown')) acc += `<path d="M${hx-9} -20 l0 -9 l4.5 5 l4.5 -8 l4.5 8 l4.5 -5 l0 9z" fill="#e2b53b" stroke="#b88a1c" stroke-width="1"/>`;
  if (has('hat')) acc += `<path d="M${hx-8} -19 L${hx+1} -40 L${hx+9} -19z" fill="#e45b5b"/><circle cx="${hx+1}" cy="-41" r="3" fill="#fff"/>`;
  const eye = o.droopy ? `<path d="M${hx+7} -10 h6" stroke="#141110" stroke-width="2.2" stroke-linecap="round"/>` : `<circle cx="${hx+10}" cy="-10" r="2.6" fill="#141110"/>`;
  return `<g transform="translate(${x} ${y}) scale(${s})">
    ${aura}<ellipse cx="2" cy="26" rx="${38*bx}" ry="5" fill="rgba(0,0,0,.12)"/>
    ${[-22,-10,10,22].map(lx => `<rect x="${lx*bx-5}" y="8" width="10" height="17" rx="5" fill="${c}"/>`).join('')}
    <ellipse cx="0" cy="0" rx="${34*bx}" ry="${21*by}" fill="${c}"/>
    <ellipse cx="0" cy="${9*by}" rx="${24*bx}" ry="${9*by}" fill="#fff" opacity=".18"/>${under}
    <circle cx="${hx}" cy="-5" r="17" fill="${c}"/>
    <path d="M${hx-12} -16 l2 -11 l8 7z" fill="${c}"/><path d="M${hx+2} -20 l5 -10 l5 10z" fill="${c}"/>
    <ellipse cx="${hx+16}" cy="-1" rx="8" ry="6" fill="#2a2220"/>${eye}${acc}
  </g>`;
}
const ICON = {
  coin:(x,y)=>`<g transform="translate(${x} ${y})"><circle r="9" fill="#e2b53b" stroke="#a37a17" stroke-width="2"/><circle r="5" fill="none" stroke="#b88a1c" stroke-width="1.5"/></g>`,
  poop:(x,y,s=1)=>`<g transform="translate(${x} ${y}) scale(${s})"><rect x="-8" y="-8" width="16" height="16" rx="2" fill="#6e4c35"/><rect x="-8" y="-8" width="16" height="5" rx="2" fill="#86603f"/></g>`,
  weed:(x,y)=>`<g transform="translate(${x} ${y})" fill="#4c6b35"><path d="M0 0 L-8 -22 L-2 0z"/><path d="M0 0 L3 -26 L5 0z"/><path d="M0 0 L12 -18 L7 0z"/><circle cx="3" cy="-27" r="3.2" fill="#f3d250"/></g>`,
  hand:(x,y)=>`<g transform="translate(${x} ${y})"><circle r="11" fill="none" stroke="var(--ink)" stroke-width="2" opacity=".35"/><circle r="5" fill="var(--ink)"/></g>`,
  heart:(x,y,s=1)=>`<path transform="translate(${x} ${y}) scale(${s})" d="M0 6 C-10 -2 -7 -10 -2 -9 C0 -9 0 -7 0 -6 C0 -7 0 -9 2 -9 C7 -10 10 -2 0 6z" fill="#e0607e"/>`,
  grass:(x,y)=>`<g transform="translate(${x} ${y})" fill="#6f9a4a"><path d="M-6 0 L-4 -16 L-2 0z"/><path d="M-2 0 L0 -20 L2 0z"/><path d="M2 0 L5 -15 L6 0z"/></g>`,
  carrot:(x,y)=>`<g transform="translate(${x} ${y})"><path d="M-14 0 L10 -5 L10 5z" fill="#e8833a"/><path d="M10 -3 l8 -6 M10 0 l9 0 M10 3 l8 6" stroke="#6f9a4a" stroke-width="2.5"/></g>`,
  bowl:(x,y)=>`<g transform="translate(${x} ${y})"><path d="M-16 -6 h32 l-4 12 h-24z" fill="#d6dde2"/><ellipse cy="-6" rx="16" ry="3.5" fill="#6fa8c9"/></g>`,
  sun:(x,y)=>`<g transform="translate(${x} ${y})"><circle r="10" fill="#f3d250"/>${[0,45,90,135,180,225,270,315].map(a=>`<path d="M0 -14 v-5" transform="rotate(${a})" stroke="#f3d250" stroke-width="2.5" stroke-linecap="round"/>`).join('')}</g>`,
  moon:(x,y)=>`<path transform="translate(${x} ${y})" d="M4 -12 A12 12 0 1 0 4 12 A9 9 0 1 1 4 -12z" fill="#e8d98a"/>`,
  cloud:(x,y)=>`<g transform="translate(${x} ${y})" fill="#b8c2c6"><circle cx="-8" cy="2" r="8"/><circle cx="3" cy="-3" r="10"/><circle cx="12" cy="3" r="7"/><rect x="-14" y="2" width="30" height="8" rx="4"/></g>`
};
const svgWrap = inner => `<svg viewBox="0 0 320 180" role="img" aria-hidden="true">${inner}</svg>`;
const T = (x,y,txt,size=12,anchor='middle',fill='var(--ink)') => `<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" fill="${fill}" font-family="inherit">${txt}</text>`;
const GUIDE = [
  {title:'先孵一顆蛋', svg:svgWrap(`
    <path d="M130 0 L190 0 L230 150 L90 150z" fill="#fff3c4" opacity=".55"/>
    <ellipse cx="160" cy="150" rx="70" ry="14" fill="#fff3c4" opacity=".7"/>
    <ellipse cx="160" cy="146" rx="40" ry="10" fill="#c9a86a"/>
    <ellipse cx="160" cy="112" rx="26" ry="34" fill="#f1e6cf" stroke="#d9c9a8"/>
    <circle cx="150" cy="100" r="4" fill="#a77d55"/><circle cx="168" cy="118" r="5" fill="#a77d55"/><circle cx="162" cy="92" r="3" fill="#a77d55"/>
    ${ICON.hand(205,95)}<path d="M190 82 l-8 -6 M195 72 l-3 -9 M206 70 l1 -9" stroke="var(--ink)" stroke-width="2" stroke-linecap="round"/>
    ${T(250,40,'點一點',14)}${T(250,58,'幫牠保暖',12,'middle','var(--soft)')}
    <rect x="30" y="34" width="70" height="8" rx="4" fill="var(--line)"/><rect x="30" y="34" width="46" height="8" rx="4" fill="var(--ink)"/>${T(65,28,'孵化 65%',11)}`),
    html:`<p>第一次打開時，場地中間有一顆蛋。<b>點一點蛋</b>可以幫牠保暖，左上角的「孵化」到 100% 就會破殼，聚光燈會打在牠身上。</p><p>孵出來以後幫牠取個名字，就正式開始養了。</p>`},
  {title:'畫面介紹', svg:svgWrap(`
    <rect x="100" y="6" width="120" height="168" rx="16" fill="var(--bg)" stroke="var(--ink)" stroke-width="2"/>
    <rect x="110" y="16" width="40" height="10" rx="3" fill="var(--ink)"/><rect x="110" y="30" width="34" height="5" rx="2" fill="var(--soft)"/>
    <rect x="160" y="16" width="52" height="10" rx="5" fill="var(--chip)" stroke="var(--line)"/>
    <rect x="110" y="42" width="48" height="44" rx="6" fill="var(--chip)" stroke="var(--line)"/>
    ${[50,58,66,74].map(y=>`<rect x="114" y="${y}" width="40" height="4" rx="2" fill="var(--line)"/><rect x="114" y="${y}" width="${20+y%17}" height="4" rx="2" fill="var(--ink)"/>`).join('')}
    ${wbSvg(165,118,0.6)}
    ${[0,1,2,3,4,5].map(i=>`<rect x="${108+i*17.5}" y="152" width="15" height="12" rx="3" fill="var(--chip)" stroke="var(--line)"/>`).join('')}
    ${[[96,22,'①'],[226,22,'②'],[96,64,'③'],[226,158,'④']].map(([x,y,n])=>T(x,y+4,n,14,'middle','var(--warn)')).join('')}
    <path d="M100 22 h8 M220 22 h-8 M100 64 h8 M222 158 h-6" stroke="var(--warn)" stroke-width="1.5"/>`),
    html:`<ul><li><b>①</b> 名字、成長階段、年齡，下面一行是牠現在在做什麼。</li><li><b>②</b> 代幣，以及「狀態」「音樂」「說明」「設定」四個按鈕。</li><li><b>③</b> 狀態面板：七種數值、天氣和時間。按「狀態」可以收起或打開。</li><li><b>④</b> 照顧按鈕：餵食、喝水、玩耍、清理、衣櫥、商店。</li></ul><p class="note">想拍乾淨的畫面：設定 →「隱藏全部介面」，右上角會留一顆「顯示介面」按鈕。</p>`},
  {title:'手勢操作', svg:svgWrap(`
    <g>${wbSvg(48,62,0.55)}${ICON.hand(52,50)}${ICON.heart(60,30,1.1)}${ICON.heart(72,22,0.8)}${T(52,98,'點牠：摸摸')}</g>
    <g><path d="M160 10 v26" stroke="#3f6b55" stroke-width="2"/><circle cx="160" cy="10" r="4" fill="#3f6b55"/><g transform="rotate(-12 160 60)">${wbSvg(152,60,0.55)}</g>${T(160,98,'按住拖：抓起來甩')}</g>
    <g><path d="M240 50 a30 14 0 1 1 50 0" fill="none" stroke="var(--ink)" stroke-width="2" marker-end="url(#ar)"/>${ICON.hand(265,62)}${T(265,98,'拖空白處：轉視角')}</g>
    <defs><marker id="ar" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8z" fill="var(--ink)"/></marker></defs>
    <g>${ICON.hand(70,138)}${ICON.hand(100,138)}<path d="M62 138 h-14 M108 138 h14" stroke="var(--ink)" stroke-width="2" marker-end="url(#ar)"/>${T(85,170,'兩指：放大縮小')}</g>
    <g>${wbSvg(200,140,0.45)}<path d="M228 140 q20 -10 46 0" stroke="var(--ink)" stroke-dasharray="4 4" fill="none" stroke-width="2"/>${ICON.hand(282,140)}${T(240,170,'點地面：叫牠走過去')}</g>`),
    html:`<ul><li><b>點袋熊</b>：摸摸牠，心情變好，偶爾給 1 代幣。牠睡覺時點牠會把牠吵醒，牠會不高興。</li><li><b>按住袋熊拖曳</b>：用繩子把牠吊起來甩。</li><li><b>拖曳空白處</b>：旋轉視角；<b>兩指捏合或滑鼠滾輪</b>：縮放。</li><li><b>點地面</b>：牠會走到那裡。</li><li><b>點便便、雜草</b>：清掉並拿代幣；<b>點小窩</b>：叫牠出來。</li></ul>`},
  {title:'照顧牠', svg:svgWrap(`
    ${ICON.grass(50,70)}${ICON.carrot(90,62)}${T(70,96,'餵食',14)}${T(70,114,'飽足 +22',11,'middle','var(--soft)')}
    ${ICON.bowl(160,64)}${T(160,96,'喝水',14)}${T(160,114,'水分 +30',11,'middle','var(--soft)')}
    <circle cx="250" cy="58" r="12" fill="#f3d250"/><path d="M243 58 h14 M250 51 v14" stroke="#fff" stroke-width="2"/>${T(250,96,'玩耍',14)}${T(250,114,'心情 +10',11,'middle','var(--soft)')}
    ${wbSvg(160,150,0.5)}${ICON.heart(190,128)}`),
    html:`<ul><li><b>餵食</b>：地上會出現青草或紅蘿蔔，牠會自己走過去吃。牠很飽的時候吃不下。</li><li><b>喝水</b>：會放一個水碗；蓋了「小水池」以後，牠會自己走去水池喝。</li><li><b>玩耍</b>：後空翻、側翻滾、轉圈、翻肚、抖毛、跳舞，會花體力、增加心情。</li><li>吃飽的時候，牠有時候會想睡午覺。</li></ul><p class="note">牠太餓會生氣跺腳、不肯表演；太累也不肯玩，讓牠睡一下就好。</p>`},
  {title:'看懂數值', svg:svgWrap(`
    ${[['飽足',80],['水分',60],['心情',90],['體力',40],['清潔',100],['健康',20],['成長',55]].map(([l,v],i)=>`${T(40,24+i*22,l,12,'end')}<rect x="50" y="${15+i*22}" width="200" height="9" rx="4.5" fill="var(--line)"/><rect x="50" y="${15+i*22}" width="${v*2}" height="9" rx="4.5" fill="${v<25?'var(--warn)':'var(--ink)'}"/>${T(272,24+i*22,v,11,'end','var(--soft)')}`).join('')}`),
    html:`<ul><li><b>飽足、水分</b>：會慢慢下降。低於 15 會開始傷健康。</li><li><b>心情</b>：摸摸、玩耍、吃東西會上升；髒亂、下雨會讓它掉比較快。</li><li><b>體力</b>：醒著會消耗，睡覺回復，晚上會想睡。</li><li><b>清潔</b>：便便和雜草越多越低，太髒會生病。</li><li><b>健康</b>：低於 35 會生病（會出現「餵藥」按鈕），歸零就會死掉。</li><li><b>成長</b>：滿了而且年紀到了就會進化。太餓、太渴或生病時會顯示「停滯」。</li></ul><p class="note">數值變紅就是在提醒你了。</p>`},
  {title:'清理與代幣', svg:svgWrap(`
    ${ICON.poop(60,80,1.3)}${ICON.poop(84,86,1)}${ICON.poop(70,62,0.9)}<path d="M55 48 q-4 -8 0 -16 M70 42 q4 -8 0 -16 M86 50 q-4 -8 0 -16" stroke="#8a9a4a" stroke-width="2" fill="none"/>
    ${T(72,120,'3 坨以上會發臭',12)}${ICON.coin(52,150)}${T(68,155,'+3 / 顆',12,'start')}
    ${ICON.weed(200,90)}${ICON.weed(230,92)}${T(215,120,'雜草會自己長',12)}${ICON.coin(192,150)}${T(208,155,'+2 / 株',12,'start')}`),
    html:`<p>袋熊吃完東西過一陣子會拉出<b>方塊形的便便</b>（真的袋熊也是這樣）。雜草也會慢慢長出來。</p><ul><li><b>點一下</b>便便或雜草就能清掉；按「清理」一次清光。</li><li>清一顆便便 +3 代幣、拔一株雜草 +2。牠餓或渴時餵食、喝水各 +2，堆雪人 +5。</li><li>場上同時有 3 坨以上便便會發臭，清潔掉很快，容易生病。</li></ul>`},
  {title:'成長與進化', svg:svgWrap(`
    ${[[30,0.3,'幼兒期'],[88,0.42,'成長期'],[152,0.55,'成熟期'],[222,0.63,'完全體'],[290,0.7,'究極體']].map(([x,s,l],i)=>`${wbSvg(x-8,96,s)}${T(x,140,l,12)}${i<4?`<path d="M${x+22} 96 l12 0" stroke="var(--soft)" stroke-width="2" marker-end="url(#ar2)"/>`:''}`).join('')}
    <defs><marker id="ar2" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8z" fill="var(--soft)"/></marker></defs>
    ${T(160,24,'進化時會發光旋轉，還有進化音樂',12,'middle','var(--soft)')}<path d="M147 52 v40 M175 52 v40" stroke="#fff1c2" stroke-width="10" opacity=".5"/>`),
    html:`<p>每個階段的「成長」條滿了、年紀也到了，就會開始<b>進化</b>：牠會浮起來、越轉越快、變成一團白光，最後換成新的樣子。</p><ul><li>幼兒期 → 成長期：大約 20 分鐘</li><li>成長期 → 成熟期：大約 6 小時</li><li>成熟期 → 完全體：大約 2 天</li><li>完全體 → 究極體：大約 4 天</li><li>大約第 8 天走完一生。</li></ul><p class="note">上面是 1 倍速的時間。想快點看，可以到設定調成 10 倍或 60 倍。</p>`},
  {title:'成熟期的型態', svg:svgWrap(`
    ${[['normal',55,50,{}],['skinny',160,50,{bx:.72,by:.8,c:'#9c8064'}],['sickly',265,50,{c:'#8c8a6a',acc:['bandage','thermo'],droopy:true}],
       ['stinky',55,132,{c:'#837152',acc:'poop'}],['chubby',160,132,{bx:1.25,by:1.12}],['sporty',265,132,{acc:'headband'}]]
      .map(([k,x,y,o])=>`${wbSvg(x-6,y,0.46,o)}${T(x,y+32,FORMS[k].name,11)}`).join('')}`),
    html:`<p>進化成什麼樣子，要看<b>進化那一刻</b>和這個階段你怎麼照顧牠：</p><ul>${['stinky','sickly','skinny','chubby','sporty'].map(k=>`<li><b>${FORMS[k].name}</b>：${FORMS[k].desc}</li>`).join('')}<li><b>袋熊</b>（一般型）：以上都沒有，正常長大。</li></ul><p class="note">判斷順序就是上面列出來的順序。歪掉的型態，下一次進化前照顧好，還有機會變回來。</p>`},
  {title:'完全體與究極體：三條路線', svg:svgWrap(`
    ${[['royal','golden',{acc:['crown','cape']},{c:'#c49a3a',acc:['crown','cape'],glow:'#ffd76a'}],
       ['forest','forestx',{acc:['leafcape','sprout']},{acc:['leafcape','antler'],glow:'#a6f08a'}],
       ['wind','thunder',{acc:['windband','windscarf']},{acc:['boltband','boltcape'],glow:'#ffe45c'}]]
      .map(([a,b,oa,ob],i)=>{ const y = 34 + i*56; return `${wbSvg(78,y,0.4,oa)}${T(84,y+26,FORMS[a].name,11)}<path d="M128 ${y} h46" stroke="var(--soft)" stroke-width="2" marker-end="url(#ar3)"/>${wbSvg(224,y,0.44,ob)}${T(230,y+27,FORMS[b].name,11)}`; }).join('')}
    <defs><marker id="ar3" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8z" fill="var(--soft)"/></marker></defs>`),
    html:`<p>成熟期照顧得幾乎沒有失誤、心情又好，進化成完全體時會走上三條路線之一：</p><ul>${['wind','forest','royal'].map(k=>`<li><b>${FORMS[k].name}</b>：${FORMS[k].desc}</li>`).join('')}</ul><p>完全體時繼續完美照顧，就會進化成各自的究極體：<b>黃金袋熊</b>（金光閃閃）、<b>森羅袋熊</b>（樹葉圍繞、腳邊開花）、<b>雷光袋熊</b>（全身劈啪閃電）。</p><p class="note">想先看看長什麼樣子？到「設定 → 進化型態預覽」。</p>`},
  {title:'親暱值、院子和小意外', svg:svgWrap(`
    ${[['🥰',40,'親暱值'],['🐝',120,'蜂窩'],['🦋',200,'蝴蝶'],['🪳',280,'太髒了']].map(([e,x,l]) => `<text x="${x}" y="70" font-size="40" text-anchor="middle">${e}</text>${T(x,105,l,12)}`).join('')}
    ${[['🏠',60,'選位置蓋房子'],['🧹',160,'掃把和小手'],['👻',260,'超渡']].map(([e,x,l]) => `<text x="${x}" y="150" font-size="30" text-anchor="middle">${e}</text>${T(x,172,l,11)}`).join('')}`),
    html:`<ul><li><b>親暱值</b>：餵食、陪玩、摸摸會增加，太久沒理會慢慢下降。太低時牠會不聽話，還會跑到你面前坐下裝可憐，這時摸摸牠效果加倍。</li>
      <li><b>樹和蜂窩</b>：院子裡的樹有些掛著蜂窩。把牠丟過去、讓牠滾過去，或牠自己跑去聞，都可能被叮得滿頭包。到商店「藥品」買<b>消腫藥膏</b>。</li>
      <li><b>蝴蝶</b>：晴天白天會出現，牠有時會追著跑，追完心情變好。</li>
      <li><b>環境太髒</b>：便便和雜草太多會有蒼蠅飛、蟑螂爬，快清乾淨！手動清理時會出現掃把畚箕和小手；想一鍵清光，到商店買「一鍵清理」。</li>
      <li><b>吃太撐</b>：已經很飽還硬餵，牠會肚子鼓鼓、四腳朝天躺一分鐘動不了。</li>
      <li><b>玩院子裡的設施</b>：點鞦韆、長椅、沙坑、噴水池、小水池或溜滑梯，按「讓牠玩」牠就會過去玩；點地上的泥巴，牠會跑去打滾，全身變髒髒的，游泳或下雨就會洗乾淨。</li>
      <li><b>蓋建築</b>：在商店選好建築後，會進入擺放模式：拖曳選位置、按「旋轉」換方向，綠色可以蓋、紅色不行。蓋好後點建築可以再「移動」。</li>
      <li><b>任務與成就</b>：右邊的「📋 任務」每天有三個小任務，完成就有代幣，三個全做完再加 30。還有幾十個成就（拔草、撿貝殼、開拓土地、養出每一種型態……），達成時自動拿代幣。</li>
      <li><b>告別</b>：牠離開後魂魄會在墳上飄，點墳墓就能送牠去天堂，然後出現新的蛋。</li></ul>`},
  {title:'擴張領地：河流、高台和海邊', svg:svgWrap(`
    <rect x="0" y="0" width="320" height="180" fill="#a9c98a"/>
    <path d="M70 0 C50 40 95 80 60 120 S70 170 62 180" stroke="#6fb3c4" stroke-width="22" fill="none"/>
    <rect x="52" y="64" width="34" height="9" fill="#a87b52"/>
    <path d="M262 0 C250 60 275 110 258 180 L320 180 L320 0z" fill="#e9d6a6"/><path d="M286 0 C276 60 298 110 284 180 L320 180 L320 0z" fill="#6cb6c8"/>
    <rect x="110" y="60" width="100" height="62" fill="#c5dca9" stroke="#fff4d6" stroke-dasharray="4 3" stroke-width="2"/>
    ${wbSvg(160,95,0.4)}${T(160,52,'家',12)}
    ${[[30,30],[230,150],[120,150],[200,25]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="9" fill="#4f7d34"/>`).join('')}
    <rect x="150" y="140" width="40" height="22" fill="#b9b2a2"/>${T(170,175,'高台',11)}
    <text x="290" y="120" font-size="16" text-anchor="middle">🦀</text><text x="240" y="40" font-size="16" text-anchor="middle">🔒</text>`),
    html:`<ul><li>世界是 <b>4 × 4 塊領地</b>，每塊 18 × 18 格。一開始只有家那一塊，其他 15 塊長滿樹叢和石頭，上面插著「未開拓」的牌子。</li>
      <li><b>點未開拓的土地</b>就能花代幣整理、打通；要先打通相連的那一塊才能往外擴。每多開一塊，下一塊會貴一點。</li>
      <li>地上的<b>石頭、樹叢、樹</b>點一下都可以花代幣清掉（大石頭比袋熊還大）。樹上的<b>蜂窩</b>也能單獨清除。</li>
      <li><b>西邊有一條河</b>：看得到水在流、水底的石頭和魚。要過河就<b>點河面蓋橋</b>。把袋熊丟進河裡，牠會自己爬上岸。</li>
      <li><b>東邊是沙灘和海</b>：有螃蟹、寄居蟹，點<b>貝殼</b>可以撿（+1 代幣），偶爾會漂來<b>瓶中信</b>，打開可能有代幣。</li>
      <li><b>特別的區域</b>：北邊的<b>荷花池塘</b>（青蛙、蜻蜓、烏龜）、西邊的<b>沼澤</b>（鱷魚、蒼鷺）、河上游的<b>河狸溪</b>（河狸的水壩和小屋）、西南的<b>澳洲草原</b>（袋鼠、微笑袋鼠、鴯鶓、尤加利樹上的無尾熊）、西邊的<b>鹿的森林</b>（梅花鹿會在樹林間奔跑）、西北的<b>狼的高地</b>（高台上有山洞，狼晚上會嚎叫，下雨打雷時會躲進山洞）。點一下動物會有反應，第一次遇見每種動物都有成就。</li>
      <li><b>海邊和天空</b>：海鷗在沙灘上空盤旋、偶爾停在沙灘上；海豚會成群游過、跳出水面翻轉；鯨魚不時浮上來噴水再潛下去；淺海有熱帶魚。白天有老鷹在高空盤旋、會停在樹頂；晚上樹頂有貓頭鷹盯著你看；石頭上常有蜥蜴曬太陽，靠近就溜走。</li>
      <li><b>游泳圈</b>（商店「道具」）：有了它袋熊就能下水，走進水裡自動套上、上岸就脫下。</li>
      <li>地形有小山丘、低窪的泥巴地、斜坡和大高台。右上角「視角」可以切換（45°、俯視、跟隨、自由；自由視角可以自己旋轉和傾斜鏡頭），拖曳畫面移動鏡頭，「🐾 找牠」把鏡頭移回袋熊身上。</li></ul>`},
  {title:'天氣、晝夜和特別活動', svg:svgWrap(`
    <rect x="0" y="0" width="160" height="90" fill="#d9e1d2"/><rect x="160" y="0" width="160" height="90" fill="#1a2130"/>
    ${ICON.sun(80,40)}${ICON.moon(240,40)}${T(80,78,'整點偶數小時：白天',11,'middle','#2c3a31')}${T(240,78,'奇數小時：晚上',11,'middle','#e2e9de')}
    ${ICON.cloud(36,118)}<path d="M28 132 l-3 8 M38 132 l-3 8 M48 132 l-3 8" stroke="#7fa3c0" stroke-width="2"/>${T(40,165,'雨：踩水窪',11)}
    <circle cx="140" cy="140" r="15" fill="#f7f9fb" stroke="#cfd6db"/><circle cx="140" cy="116" r="10" fill="#f7f9fb" stroke="#cfd6db"/><path d="M140 117 l9 2 -9 2z" fill="#e8833a"/>${T(140,170,'雪：堆雪人',11)}
    ${[0,1,2,3,4].map(i=>`<circle cx="${225+i*13}" cy="${125+(i%2)*10}" r="3" fill="#e9f59a"/>`).join('')}${T(255,165,'晴朗夜晚：看螢火蟲',11)}`),
    html:`<ul><li><b>晝夜</b>：預設每一小時切換一次——偶數整點（0、2、4…點）是白天，奇數整點是晚上，交界的前 5 分鐘是日出或日落。設定裡也可以改成跟現實時間同步。</li><li><b>天氣</b>：晴、多雲、雨、雪、雷雨會自己輪替。下雨打雷時牠會躲進小窩，打雷會害怕。</li><li><b>音樂</b>：用真實樂器的錄音演奏（鋼琴、陶笛、長笛、豎琴、木琴、吉他、弦樂、音樂盒……），早上、午後、傍晚、夜晚、雨天、雷雨、雪天和節日各有不同的樂器和曲子。樂器音色來自 FluidR3 音色庫（MIT 授權）。</li><li><b>環境音</b>（音效開關）：鏡頭移到海邊會聽到浪花，河邊有流水聲，白天樹林有鳥叫，池塘沼澤有蛙鳴，夜晚有蟲鳴；動物的叫聲越遠越小聲。</li><li><b>特別活動</b>（玩耍 → 特別活動）：下雪天堆雪人，下雨天踩水窪，晴朗的晚上看螢火蟲。雪人在雪停以後會慢慢融化。</li><li><b>太陽和月亮</b>：太陽從東邊的海上升起、往西邊落下；月亮的形狀跟著台灣真實的月相變化（狀態面板會顯示今天的月相）。<b>滿月</b>的晴朗夜晚可以「賞月」。</li></ul>`},
  {title:'商店、衣櫥和節日', svg:svgWrap(`
    ${wbSvg(70,110,0.75,{acc:'hat'})}${T(70,160,'買衣服、換顏色',12)}
    <path d="M150 128 a40 34 0 0 1 80 0z" fill="#7f8f5b"/><path d="M180 128 a10 12 0 0 1 20 0z" fill="#1a1410"/><rect x="203" y="92" width="8" height="16" fill="#a35e46"/>${T(190,160,'蓋建設',12)}
    <rect x="250" y="70" width="56" height="58" rx="6" fill="var(--chip)" stroke="var(--gold)" stroke-width="2"/><rect x="250" y="70" width="56" height="15" rx="6" fill="var(--gold)"/>${T(278,112,'10/31',14)}${T(278,160,'節日限定',12)}`),
    html:`<ul><li><b>商店</b>：用代幣買衣服、建設和感冒藥。</li><li><b>衣櫥</b>：換毛色、幫衣服換顏色、穿上或脫下，也可以一鍵「脫光光」。同一個位置（頭、眼睛、脖子……）一次只能穿一件。</li><li><b>建設</b>：小窩（晚上和雨天躲進去睡）、小水池（自己去喝水）、路燈、花圃、木圍籬。</li><li><b>節日</b>：元旦、春節、情人節、兒童節、端午節、中秋節、萬聖節、聖誕節當天，背景和音樂都會換，商店會賣<b>只有當天買得到</b>的服裝和建設，買了就永久保留。</li></ul><p class="note">設定裡的「節日預覽」可以先看看節日的樣子和音樂，但限定商品還是要等到當天才能買。</p>`},
  {title:'存檔、生病和告別', svg:svgWrap(`
    <rect x="40" y="40" width="70" height="80" rx="8" fill="var(--chip)" stroke="var(--ink)" stroke-width="2"/><rect x="52" y="40" width="46" height="26" fill="var(--ink)" opacity=".8"/><rect x="54" y="88" width="42" height="28" rx="3" fill="var(--line)"/>${T(75,145,'自動存檔',12)}
    <rect x="150" y="60" width="44" height="22" rx="11" fill="#e45b5b"/><rect x="172" y="60" width="22" height="22" rx="11" fill="#f6f3ec"/>${T(172,110,'健康低：餵藥',12)}
    <path d="M250 120 v-38 a20 20 0 0 1 40 0 v38z" fill="#a3a59d"/><circle cx="258" cy="122" r="4" fill="#e0607e"/><circle cx="282" cy="122" r="4" fill="#f3d250"/>${T(270,145,'告別後孵新蛋',12)}`),
    html:`<ul><li>進度每 5 秒自動存在<b>這台裝置</b>裡；到「設定」用 Google 登入後，還會同步到<b>雲端</b>，電腦和手機可以接著玩。離開期間的時間也會算進去。</li><li>你不在的時候牠最多只會變得很虛弱，不會因為沒人照顧而死掉；但年紀還是會增加。</li><li>健康低於 35 會生病，按畫面下方的「餵藥」（10 代幣）。</li><li>牠走完一生或病死之後，會留下一個小墓碑。代幣、衣服、建設都會留給下一隻，再孵一顆新蛋。</li><li>設定 →「全部重新開始」會清掉所有東西，從一顆蛋重來。</li><li><b>聲音來源</b>：音樂用 FluidR3 音色庫（MIT 授權）；動物叫聲是 Wikimedia Commons 和 Freesound 上的真實錄音，作者和授權見<a href="assets/sounds/CREDITS.md" target="_blank">動物聲音來源</a>。</li><li><b>3D 模型來源</b>：寫實動物來自 Sketchfab 的創作者（老虎、鹿、狼、駝鹿、馬、鱷魚、袋鼠、蒼鷺、螃蟹、寄居蟹、海龜、企鵝、紅鶴、貓頭鷹、孔雀、紅樹林、招潮蟹、彈塗魚），場景植物是 Quaternius 的免費素材，作者和授權見<a href="assets/models/CREDITS.md" target="_blank">模型來源</a>。</li></ul><p class="note">清除瀏覽器資料或換手機，存檔就會不見。</p>`}
];
const guideEl = $('#guide'); let gPage = 0;
function openGuide(p=0){ gPage = p; guideEl.hidden = false; renderGuide(); $('#gNext').focus(); }
function closeGuide(){ guideEl.hidden = true; if (!S.seenGuide){ S.seenGuide = true; save(); } canvas.focus({preventScroll:true}); }
function renderGuide(){
  const g = GUIDE[gPage];
  $('#gPage').textContent = `說明書　${gPage+1} / ${GUIDE.length}`;
  $('#gBody').innerHTML = `<h2 id="gTitle">${g.title}</h2>${g.svg}${g.html}`;
  $('#gBody').scrollTop = 0;
  $('#gPrev').disabled = gPage === 0;
  $('#gNext').textContent = gPage === GUIDE.length-1 ? '開始玩' : '下一頁';
  $('#gDots').innerHTML = GUIDE.map((_,i) => `<button aria-label="第 ${i+1} 頁" aria-current="${i===gPage}" data-p="${i}"></button>`).join('');
}
$('#gPrev').onclick = () => { if (gPage > 0){ gPage--; renderGuide(); } };
$('#gNext').onclick = () => { if (gPage < GUIDE.length-1){ gPage++; renderGuide(); } else closeGuide(); };
$('#gClose').onclick = closeGuide;
$('#gDots').onclick = e => { const b = e.target.closest('button'); if (b){ gPage = +b.dataset.p; renderGuide(); } };
$('#btnGuide').onclick = () => openGuide(0);

// ---------- dock & top buttons ----------
document.querySelector('.dock').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  const c = b.dataset.cmd;
  if (B.mode === 'evolve' && ['feed','water','clean'].includes(c)){ toast('等牠進化完。'); return; }
  if (c === 'feed' || c === 'water'){ sheetKind === c ? closeSheet() : openSheet(c); }
  else if (c === 'clean'){
    const list = [...cubes.filter(x => !x.cleaning).map(x => ['p',x]), ...weeds.map(x => ['w',x])];
    if (!list.length){ toast('很乾淨，沒有東西要清。'); return; }
    if (!S.autoClean){ markMess(); return; }
    list.forEach(([k,x],i) => setTimeout(() => k === 'p' ? cleanPoop(x) : pullWeed(x), i*260));
  } else { sheetKind === c ? closeSheet() : openSheet(c); }
  hudDirty = true;
});
$('#btnStats').onclick = () => { S.hud = !S.hud; hudDirty = true; save(); };
$('#btnMusic').onclick = () => setSound(!SND.on);
// Sound effects and the wombat's calls have their own switch (on by default), separate from the music.
SND.fx = S.sfx !== false; $('#btnSfx').setAttribute('aria-pressed', SND.fx ? 'true' : 'false');
function unlockAudio(){ if (SND.fx || SND.on){ const c = audio(); if (c && c.state !== 'running') c.resume(); } }
addEventListener('pointerdown', unlockAudio); addEventListener('keydown', unlockAudio);
$('#btnSfx').onclick = () => { S.sfx = !SND.fx; SND.fx = S.sfx; if (SND.fx) unlockAudio(); $('#btnSfx').setAttribute('aria-pressed', SND.fx ? 'true' : 'false'); save(); toast(SND.fx ? '音效和叫聲打開了。' : '音效和叫聲關掉了。'); };
$('#btnSettings').onclick = () => sheetKind === 'settings' ? closeSheet() : openSheet('settings');
$('#btnTasks').onclick = () => sheetKind === 'tasks' ? closeSheet() : openSheet('tasks');
$('#btnShow').onclick = () => { S.uiHidden = false; hudDirty = true; save(); };
// Quick view switch (top right): fixed 45° (drag to pan) → straight down (drag to pan) → follow the wombat (drag to orbit).
const camMode = () => S.camMode || 'iso';
const panTarget = V3(0, 0, 0);
const CAM_LABEL = {iso:'視角：45°', top:'視角：俯視', follow:'視角：跟隨', free:'視角：自由'};
function refreshViewBtn(){ $('#btnView').textContent = CAM_LABEL[camMode()]; $('#btnFind').hidden = camMode() === 'follow'; }
$('#btnView').onclick = () => {
  const next = {iso:'top', top:'follow', follow:'free', free:'iso'}[camMode()];
  if (next !== 'follow') panTarget.set(camTarget.x, 0, camTarget.z);
  S.camMode = next; refreshViewBtn(); save();
  toast({iso:'45 度固定視角：拖曳畫面可以移動鏡頭。', top:'俯視：拖曳畫面可以移動鏡頭。', follow:'跟隨袋熊：拖曳畫面可以旋轉鏡頭。',
    free:mobile ? '自由視角：一指拖曳移動，兩指捏合縮放、轉動旋轉、一起上下滑改變角度。' : '自由視角：左鍵拖曳移動，右鍵拖曳（或按住 Ctrl）旋轉和改變角度，滾輪縮放。'}[next]);
};
// walk / run switch: running is almost twice as fast (and uses a little more energy)
const refreshRunBtn = () => { const b = $('#btnRun'); if (b){ b.textContent = S.run ? '🏃 跑步' : '🚶 走路'; b.setAttribute('aria-pressed', S.run ? 'true' : 'false'); } };
$('#btnRun').onclick = () => { S.run = !S.run; refreshRunBtn(); save(); toast(S.run ? `${S.name || '牠'}改用跑的！走動會快很多，也比較累。` : `${S.name || '牠'}改回慢慢走。`); };
refreshRunBtn();
$('#btnFind').onclick = () => { const f = S.stage === 'egg' ? V3(0,0,0) : S.dead && tomb ? tomb.position : pos; panTarget.set(f.x, 0, f.z); };
// Drag in the fixed views slides the camera over the ground (the spot under your finger follows it).
function panBy(dx, dy){
  const k = 2*baseDist*zoom*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/innerHeight;
  const right = camRight(), fwd = V3(-Math.sin(yaw), 0, -Math.cos(yaw));
  panTarget.addScaledVector(right, -dx*k).addScaledVector(fwd, dy*k/Math.max(0.5, Math.sin(pitch)));
  clampPan();
}
function clampPan(){ panTarget.x = clamp(panTarget.x, X0, X1 + 16);   // (out over the sea far enough to watch the whale and the ships)
   panTarget.z = clamp(panTarget.z, Z0, Z1); }

// ---------- input ----------
const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.014,0.014,1,8), new THREE.MeshBasicMaterial({color:'#3f6b55'}));
const handle = new THREE.Mesh(new THREE.SphereGeometry(0.07,16,12), rope.material);
rope.visible = handle.visible = false; scene.add(rope, handle);
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), hoverNdc = new THREE.Vector2(), groundPlane = new THREE.Plane(UP, 0);
const pts = new Map();
let mode = null, downX=0, downY=0, downT=0, lastX=0, lastY=0, hitPoint=null, tapObj=null, tapPoint=null, pinchD=1, pinchZ=1, pinchA=0, pinchY=0, rotDrag=false;
const setNdc = e => ndc.set(e.clientX/innerWidth*2-1, -(e.clientY/innerHeight)*2+1);
const locked = () => !!(evo || hatching);
// tapping food or a bowl on the ground sends the wombat over to finish it
function callToFood(k, ref){
  if (!petActive() || asleep() || act || ['inHouse','enter','exit','evolve','bloated','dead'].includes(B.mode)){ toast(`${S.name || '牠'}現在沒辦法過去。`); return; }
  if (k === 'food'){ if (!foods.includes(ref)) return; B.mode = 'seek'; B.food = ref; }
  else { B.water = true; B.mode = 'seekWater'; }
  B.use = null; B.seekT = 0; B.path = null; showEmote(k === 'food' ? '😋' : '💧', 1);
}
function pickAt(e){
  setNdc(e); ray.setFromCamera(ndc, camera);
  const list = [];
  if (petActive() && root.visible) list.push(...hit);
  if (S.stage === 'egg' && eggMesh.visible) list.push(eggMesh);
  cubes.forEach(c => list.push(c.hb)); weeds.forEach(w => list.push(w.hb)); foods.forEach(f => list.push(f.hb)); if (bowl) list.push(bowl.hb);
  if (BG.house) list.push(BG.house.userData.dome);
  Object.values(BG).forEach(g => g.userData.hb && list.push(g.userData.hb));
  trees.forEach(tr => list.push(tr.hb)); if (tomb && tomb.userData.hb) list.push(tomb.userData.hb);
  list.push(...world.pick, ...beachPick(), ...fauna.pick, ...wild.pick);
  scene.updateMatrixWorld(true);
  const hits = ray.intersectObjects(list, false).filter(h => isShown(['poop','weed'].includes(h.object.userData.kind) ? h.object.parent : h.object));
  const ani = hits.find(h => h.object.userData.kind === 'animal');   // an insect sitting on a rock or a trunk: the rock's tap area would catch it first
  return hits.find(h => ['poop', 'weed'].includes(h.object.userData.kind)) || (ani && hits[0].object.userData.kind !== 'pet' && ani.distance - hits[0].distance < 0.8 ? ani : null)
    || hits[0] || null;   // (a poop under the river's surface can still be tapped: the water would catch the tap first)
}
function updatePointerWorld(e){
  setNdc(e); ray.setFromCamera(ndc, camera); const p = V3(0,0,0);
  if (ray.ray.intersectPlane(plane, p)){ const g0 = gy(p.x, p.z); p.y = clamp(p.y, g0 + 0.3, g0 + 3.6*Math.max(petS,0.6)); p.x = clamp(p.x, X0 + 0.5, X1 - 0.5); p.z = clamp(p.z, Z0 + 0.5, Z1 - 0.5); pointerWorld.copy(p); }
}
function startGrab(e){
  if (B.use){ if (BG[B.use.id]) BG[B.use.id].userData.ride = false; B.use = null; }
  if (act){ if (act.ball) scene.remove(act.ball); if (act.ball2) scene.remove(act.ball2); puddles.forEach(m => scene.remove(m)); puddles.length = 0; act = null; actG.rotation.set(0,0,0); actY = 0; }
  if (asleep()) wake(true);
  mode = 'grab'; dragging = true; B.mode = 'idle'; B.food = null;
  scene.updateMatrixWorld(true);
  grabLocal.copy(offG.worldToLocal(hitPoint.clone()));
  const n = V3(0,0,0); camera.getWorldDirection(n); n.y = 0; if (n.lengthSq() < 1e-4) n.set(0,0,1); n.normalize();
  plane.setFromNormalAndCoplanarPoint(n, hitPoint); pointerWorld.copy(hitPoint);
  rope.visible = handle.visible = true; canvas.style.cursor = 'grabbing'; updatePointerWorld(e); cry('grunt');
}
function endGrab(){ dragging = false; rope.visible = handle.visible = false; B.timer = 1.5; justLanded = 2.5; }
function petTap(){
  if (!petActive() || B.mode === 'evolve') return;
  if (asleep()){ wake(true); return; }
  sqv += 1.2; blinkT = 0.16; ears.forEach(e => e.v += rnd(-7,7)); spawnHearts(2); strokeHand(); track('pet');
  const now = performance.now(); B.petTimes = B.petTimes.filter(t => now - t < 10000); B.petTimes.push(now);
  S.st.happy = clamp(S.st.happy + (B.petTimes.length > 5 ? 1 : 8), 0, 100);
  S.aff = clamp(S.aff + (B.petTimes.length > 5 ? 0 : 2), 0, 100);
  if (B.petCd <= 0){ B.petCd = 20; addCoins(1); }
  if (B.mode === 'beg'){   // it was asking for attention: it's delighted
    S.aff = clamp(S.aff + 6, 0, 100); spawnHearts(4); showEmote('🥰', 1.8); cry('purr'); B.mode = 'idle'; B.timer = 3;
    toast(`${S.name || '牠'}開心地蹭蹭你的手。`); hudDirty = true; return; }
  if (S.st.hunger < 25){ showEmote('💢', 1.4); cry('angry'); } else cry(Math.random() < 0.5 ? 'purr' : 'happy');
  if (B.mode === 'idle' || B.mode === 'walk'){ B.mode = 'idle'; B.timer = 2.5; }
  hudDirty = true;
}
// A little hand pats the wombat's head while you pet it.
let strokeT = 0;
function strokeHand(){
  if (strokeT > 0) return; strokeT = 1;
  const hand = makeHand(); hand.scale.setScalar(Math.max(petS, 0.6)); scene.add(hand);
  tools.push({t:0, dur:1.5, update(t){
    strokeT = 1;
    const top = headTop(), fwd = V3(Math.sin(root.rotation.y), 0, Math.cos(root.rotation.y)), k = Math.max(petS, 0.6);
    const fade = Math.min(1, t/0.2, (1.5 - t)/0.25), stroke = Math.sin(t*Math.PI*3);   // three strokes front-to-back
    hand.position.copy(top).addScaledVector(fwd, stroke*0.3*k); hand.position.y += (-0.32 + 0.28*(1 - fade) + Math.abs(stroke)*0.04)*k;
    hand.rotation.set(0.15, root.rotation.y + Math.PI, 0); hand.scale.setScalar(k*Math.max(0.01, fade));
  }, done(){ scene.remove(hand); strokeT = 0; }});
}
function warmEgg(){ if (S.stage !== 'egg' || hatching) return; S.warm = Math.min(100, S.warm + 7); eggWob.userData.kick = 1; sfx('pop'); hudDirty = true; }
canvas.addEventListener('contextmenu', e => { if (camMode() === 'free') e.preventDefault(); });
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, {x:e.clientX, y:e.clientY});
  if (pts.size === 2){ if (dragging) endGrab(); mode = 'pinch'; const a = [...pts.values()]; pinchD = Math.hypot(a[0].x-a[1].x, a[0].y-a[1].y) || 1; pinchZ = zoom;
    pinchA = Math.atan2(a[1].y - a[0].y, a[1].x - a[0].x); pinchY = (a[0].y + a[1].y)/2; return; }
  rotDrag = camMode() === 'free' && (e.button === 2 || e.ctrlKey);   // free view on a computer: right-drag (or Ctrl-drag) turns the camera
  if (pts.size > 2) return;
  downX = lastX = e.clientX; downY = lastY = e.clientY; downT = performance.now();
  if (placing){ mode = 'place'; placePointer(e); return; }
  if (locked()){ mode = 'orbit'; return; }
  const h = pickAt(e);
  if (h && h.object.userData.kind === 'pet'){ mode = 'pending'; hitPoint = h.point.clone(); }
  else if (h){ mode = 'tap'; tapObj = h.object; tapPoint = h.point.clone(); }
  else mode = 'orbit';
});
canvas.addEventListener('pointermove', e => {
  setNdc(e); hoverNdc.copy(ndc);
  if (e.pointerType === 'mouse'){ hasHover = true; lastMouse = performance.now(); }
  if (!pts.has(e.pointerId)){ if (e.pointerType === 'mouse' && !locked()){ const h = pickAt(e); canvas.style.cursor = h ? (h.object.userData.kind === 'pet' ? 'grab' : 'pointer') : 'default'; } return; }
  pts.set(e.pointerId, {x:e.clientX, y:e.clientY});
  const moved = Math.hypot(e.clientX-downX, e.clientY-downY);
  if (mode === 'pinch' && pts.size === 2){ const a = [...pts.values()]; zoom = clamp(pinchZ*pinchD/(Math.hypot(a[0].x-a[1].x, a[0].y-a[1].y)||1), 0.5, maxZoom());
    if (camMode() === 'free'){ const ang = Math.atan2(a[1].y - a[0].y, a[1].x - a[0].x), my = (a[0].y + a[1].y)/2;   // twist to turn, slide both fingers up/down to tilt
      yaw += wrapA(ang - pinchA); pinchA = ang; pitch = clamp(pitch + (my - pinchY)*0.005, 0.12, 1.45); pinchY = my; } }
  else if (mode === 'place') placePointer(e);
  else if (mode === 'tap' && moved > 6) mode = 'orbit';
  else if (mode === 'orbit'){
    if (camMode() === 'follow' || locked() || rotDrag){ yaw -= (e.clientX-lastX)*0.008; pitch = clamp(pitch + (e.clientY-lastY)*0.006, rotDrag ? 0.12 : 0.06, rotDrag ? 1.45 : 1.3); }
    else panBy(e.clientX-lastX, e.clientY-lastY); }
  else if (mode === 'pending' && moved > 6){ if (['inHouse','enter','exit','dying','evolve'].includes(B.mode)) mode = 'orbit'; else startGrab(e); }
  else if (mode === 'grab') updatePointerWorld(e);
  lastX = e.clientX; lastY = e.clientY;
});
function up(e){
  if (!pts.has(e.pointerId)) return;
  pts.delete(e.pointerId);
  const quick = performance.now() - downT < 450 && Math.hypot(e.clientX-downX, e.clientY-downY) < 7;
  if (quick && mode === 'pending') petTap();
  else if (quick && mode === 'tap'){
    const k = tapObj.userData.kind;
    if (k === 'egg') warmEgg();
    else if (k === 'poop') cleanPoop(tapObj.userData.ref);
    else if (k === 'weed') pullWeed(tapObj.userData.ref);
    else if (k === 'tomb') releaseSpirit();
    else if (k === 'tree') treeMenu(tapObj.userData.ref);
    else if (k === 'house'){ if (B.mode === 'inHouse'){ if (B.sleeping) wake(true); exitHouse(); } else buildMenu('house'); }
    else if (k === 'build') buildMenu(tapObj.userData.ref);
    else if (k === 'rock' || k === 'bush') featMenu(tapObj.userData.ref);
    else if (k === 'locked') plotMenu(tapObj.userData.ref);
    else if (k === 'river') bridgeMenu(tapPoint);
    else if (k === 'bridge') bridgeObjMenu(tapObj.userData.ref);
    else if (k === 'shell') pickShell(tapObj.userData.ref);
    else if (k === 'bottle') openBottle(tapObj.userData.ref);
    else if (k === 'crab') pokeCrab(tapObj.userData.ref);
    else if (k === 'beachlife') pokeBeachLife(tapObj.userData.ref);
    else if (k === 'animal') pokeAnimal(tapObj.userData.ref);
    else if (k === 'food' || k === 'bowl') callToFood(k, tapObj.userData.ref);
    else if (k === 'fish'){ const f = tapObj.userData.ref; if (world.jumpFish(f)){ sfx('splash'); for (let i=0;i<8;i++){ const a = Math.random()*Math.PI*2; floatSprite(radialTex('rgba(225,240,248,1)','rgba(225,240,248,0)'), f.g.position.clone().setY(WATER_Y + 0.1), {size:0.25, vx:Math.cos(a)*1.4, vz:Math.sin(a)*1.4, vy:rnd(2,3), g:9, max:0.7, grow:0}); }
      const first = !stat('meet:fish'); track('meet:fish'); if (first) toast('魚兒跳出水面了！'); } }
    hudDirty = true;
  } else if (quick && mode === 'orbit' && !locked()){
    const p = groundHit(e), key = p && plotKey(p.x, p.z);
    if (p && key && !world.isOpenKey(key)) plotMenu(key);
    else if (p && petActive() && !asleep() && !act && !['inHouse','enter','exit','eat','drink','evolve'].includes(B.mode)){
      if (groundOK(p.x, p.z) && world.isMud(p.x, p.z) && !whyCantPlay()) startUse('mud', p);   // tap the mud: it goes for a roll
      else if (groundOK(p.x, p.z)){ B.target.copy(p).setY(0); B.mode = 'goto'; B.timer = 25; B.treeVisit = null; B.path = null; showEmote('❗',0.9); }
      else if (world.isWater(p.x, p.z)) toast('那裡是水，袋熊過不去。河上可以蓋橋（點一下河面）。');
    }
  }
  if (mode === 'grab') endGrab();
  if (pts.size === 0){ mode = null; canvas.style.cursor = 'default'; } else if (mode === 'pinch') mode = 'orbit';
}
canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !pts.size) hasHover = false; });
const maxZoom = () => camMode() === 'follow' ? 1.7 : 5.6;
canvas.addEventListener('wheel', e => { e.preventDefault(); zoom = clamp(zoom*Math.exp(e.deltaY*0.001), 0.5, maxZoom()); }, {passive:false});
canvas.addEventListener('keydown', e => {
  const fixed = camMode() !== 'follow', arrow = {ArrowLeft:[40,0], ArrowRight:[-40,0], ArrowUp:[0,40], ArrowDown:[0,-40]}[e.key];
  if (camMode() === 'free' && 'qeQErfRF'.includes(e.key) && e.key.length === 1){ const k = e.key.toLowerCase(); if (k === 'q') yaw += 0.15; if (k === 'e') yaw -= 0.15; if (k === 'r') pitch = clamp(pitch + 0.08, 0.12, 1.45); if (k === 'f') pitch = clamp(pitch - 0.08, 0.12, 1.45); }
  if (e.key === ' ' || e.key === 'Enter'){ e.preventDefault(); S.stage === 'egg' ? warmEgg() : petTap(); }
  else if (arrow && fixed){ e.preventDefault(); panBy(arrow[0], arrow[1]); }
  else if (e.key === 'ArrowLeft'){ e.preventDefault(); yaw += 0.15; }
  else if (e.key === 'ArrowRight'){ e.preventDefault(); yaw -= 0.15; }
  else if (e.key === 'ArrowUp'){ e.preventDefault(); pitch = Math.min(1.3, pitch+0.08); }
  else if (e.key === 'ArrowDown'){ e.preventDefault(); pitch = Math.max(0.06, pitch-0.08); }
});
addEventListener('keydown', e => { if (e.key === 'Escape'){ if (!$('#modal').hidden) return; if (!guideEl.hidden){ closeGuide(); return; } closeSheet(); } });

// ---------- persistence ----------
let halted = false; // set when another device takes over; stops the sim and all saving
function save(force){
  if (halted || PREVIEW) return;
  try {
    S.poops = cubes.map(c => [+c.m.position.x.toFixed(2), +c.m.position.z.toFixed(2), +c.m.rotation.y.toFixed(2), +c.sc.toFixed(2)]);
    S.weeds = weeds.map(w => w.kind ? [w.x, w.z, w.s, w.kind] : [w.x, w.z, w.s]);
    S.snowmen = snowmen.map(o => [+o.x.toFixed(2), +o.z.toFixed(2), +o.ry.toFixed(2), +o.melt.toFixed(3)]);
    S.petPos = [+pos.x.toFixed(2), +pos.z.toFixed(2), +root.rotation.y.toFixed(2)];
    S.inHouse = B.mode === 'inHouse';
    S.lastSeen = Date.now();
    localStorage.setItem(KEY, JSON.stringify(S));
  } catch(e){}
  cloud.save(S, force === true);
}
setInterval(() => { checkAch(); save(); }, 5000);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(true); });
addEventListener('pagehide', () => save(true));

// ---------- cloud sync ----------
const claimCloud = knownRev => { if (!PREVIEW) cloud.claim(S, knownRev, !!lsGet(FORCE_LOCAL)); };
cloud.on('synced', () => { lsSet(FORCE_LOCAL, null); if (cloud.user) lsSet(SYNC_UID, cloud.user.uid); });
cloud.on('takeover', reason => {
  halted = true; lsSet(PREFER_REMOTE, '1'); closeSheet();
  showModal(reason === 'newer' ? '雲端有比較新的進度' : '在其他裝置開啟了',
    reason === 'newer' ? '<p>這個帳號在別的裝置玩得比較新，這裡先暫停，載入最新的進度。</p>'
                       : '<p>你在另一台裝置打開了遊戲，這裡先暫停，避免兩邊的進度互相蓋掉。</p>',
    [{label: reason === 'newer' ? '載入最新進度' : '在這台繼續玩', onClick:() => location.reload()}]);
});
cloud.on('change', () => { if (sheetKind === 'settings') renderSheet(); });
// In-app browsers (LINE, Facebook, Instagram, WeChat, Android WebView) break Google's sign-in popup.
const IN_APP = /\bLine\/|FBAN|FBAV|Instagram|MicroMessenger|; wv\)/i.test(navigator.userAgent);
function openOutside(){
  if (/\bLine\//i.test(navigator.userAgent)){ // LINE honours this flag and reopens the page in the system browser
    const u = new URL(location.href); u.searchParams.set('openExternalBrowser', '1'); location.href = u.href; return;
  }
  const url = location.origin + location.pathname;
  showModal('請用瀏覽器打開', `<p>在 App 裡面開的網頁沒辦法用 Google 登入。請按右上角或右下角的「⋯」選單，選「用瀏覽器開啟」，或複製網址貼到 Chrome／Safari。</p><p><b>${esc(url)}</b></p>`,
    [{label:'複製網址', onClick:() => navigator.clipboard && navigator.clipboard.writeText(url).then(() => toast('網址複製好了。'))}]);
}
async function login(){
  if (IN_APP){ openOutside(); return; }
  let user;
  try { user = await cloud.signIn(); } catch(e){ toast(e && e.code === 'auth/popup-closed-by-user' ? '登入取消了。' : '登入失敗，請再試一次。'); return; }
  if (!user) return; // redirect sign-in: the page will reload
  let remote;
  try { remote = await cloud.fetch(); }
  catch(e){ toast('登入了，但暫時連不上雲端，連上網後會自動同步。'); claimCloud(undefined); return; }
  if (remote && await pickSave(S, remote, user.uid) === 'remote'){
    halted = true; lsSet(KEY, JSON.stringify(remote.save)); lsSet(SYNC_UID, user.uid); location.reload(); return;
  }
  save(); claimCloud(remote ? remote.rev : null);
  toast('登入了！進度會自動同步到雲端，電腦和手機可以接著玩。');
}
function exportSave(){
  save();
  const code = 'WOMBAT1:' + btoa(unescape(encodeURIComponent(JSON.stringify(S))));
  showModal('匯出存檔碼', `<p>這串文字就是你的存檔。可以留著當備份，或在別的地方「匯入存檔碼」。</p>`
    + `<textarea id="saveCode" class="code" readonly rows="5">${code}</textarea>`
    + `<div class="opts" style="margin:10px 0 14px"><button class="btn" id="copyCode">複製</button><button class="btn ghost" id="dlCode">下載成檔案</button></div>`,
    [{label:'關閉', ghost:true, onClick:()=>{}}]);
  const ta = $('#saveCode');
  $('#copyCode').onclick = () => {
    const done = () => toast('複製好了。'), fallback = () => { ta.select(); document.execCommand('copy'); done(); };
    navigator.clipboard ? navigator.clipboard.writeText(code).then(done, fallback) : fallback();
  };
  $('#dlCode').onclick = () => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([code], {type:'text/plain'}));
    a.download = `袋熊存檔-${S.name || '蛋'}.txt`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
}
function importSave(){
  showModal('匯入存檔碼', `<p>貼上匯出的存檔碼（WOMBAT1: 開頭），或選擇下載的存檔檔案。<b>現在這隻袋熊的進度會被取代</b>${cloud.user ? '，雲端存檔也會一起換掉' : ''}。</p>`
    + `<textarea id="importCode" class="code" rows="5" placeholder="WOMBAT1:..."></textarea>`
    + `<p style="margin:8px 0 14px"><input type="file" id="importFile" accept=".txt,text/plain" aria-label="選擇存檔檔案"></p>`,
    [{label:'取消', ghost:true, onClick:()=>{}}, {label:'匯入', onClick:() => {
      const txt = $('#importCode').value.replace(/\s+/g, '').replace(/^WOMBAT1:/, '');
      let o = null; try { o = fromObj(JSON.parse(decodeURIComponent(escape(atob(txt))))); } catch(e){}
      if (!o){ toast('存檔碼看起來不對，再複製一次試試。'); return; }
      halted = true; lsSet(KEY, JSON.stringify(o)); lsSet(FORCE_LOCAL, '1'); location.reload();
    }}]);
  $('#importFile').onchange = e => { const f = e.target.files[0]; if (f) f.text().then(t => { $('#importCode').value = t.trim(); }); };
  $('#importCode').focus();
}

// ---------- restore ----------
// foods and drinks became buy-once: anything already in the bag counts as bought
[...FOODS, ...DRINKS].forEach(f => { if (f.price && inv(f.id) > 0){ S.food = S.food || {}; S.food[f.id] = true; S.inv[f.id] = 0; } });
const worldIsNew = !S.world;
if (worldIsNew) S.world = newWorld(Math.floor(Math.random()*2147483647));
world = createWorld({scene, mobile, renderer, grassTex, mat, hbMat, fishModel, treeModels:TREE_MODELS, plants:NATURE_SMALL, onFeatGone:() => { NAV.dirty = true; }});
const preV = S.world.v || 1;
world.load(S.world);
const grew = !worldIsNew && preV < 5;   // the save was made with smaller plots (18 or 24 wide): spread our own things out the same way the world was
if (grew){ const k = PLOT/(preV < 4 ? 18 : 24), s = v => +(v*k).toFixed(2), xz = a => { a[0] = s(a[0]); a[1] = s(a[1]); };
  (S.trees || []).forEach(t => { t.x = s(t.x); t.z = s(t.z); }); (S.weeds || []).forEach(xz); (S.poops || []).forEach(xz); (S.snowmen || []).forEach(xz); if (S.petPos) xz(S.petPos); }
Object.keys(S.builds).forEach(id => S.builds[id] && build(id));
if (grew) (S.trees || []).forEach(t => { if (inBuild(t.x, t.z, 0.8)){ const q = freeNear(V3(t.x, 0, t.z), 0.8); t.x = +q.x.toFixed(2); t.z = +q.z.toFixed(2); } });   // buildings stayed put
if (!S.trees) plantTrees();
// thin out the wild land once (fewer rocks, bushes and trees in plots not yet cleared; all rocks a bit smaller)
if (!S.world.trim){ S.world.trim = 1; const keep = id => (id*2654435761 >>> 0) % 100 > 40;
  S.world.feats = S.world.feats.filter(d => world.isOpenKey(d.p) || keep(d.id)); S.world.feats.forEach(d => { if (d.k === 'rock') d.s = +(d.s*0.72).toFixed(2); });
  S.trees = S.trees.filter((t, i) => !t.p || world.isOpenKey(t.p) || i % 3 !== 0); }
if (!S.world.forestMore){ S.world.forestMore = 1; S.trees.push(...world.moreTrees(BIO.forest, 9, S.trees)); }   // the deer forest is thick with trees
if (!S.world.forestMore2){ S.world.forestMore2 = 1; S.trees.push(...world.moreTrees(BIO.forest, 16, S.trees)); }   // ... and thicker still since the world grew
if (!S.world.meadowed){ S.world.meadowed = 1; S.trees = S.trees.filter((t, i) => t.p !== BIO.meadow || i % 4 === 0); }   // the flower meadow is open, with just a few trees
seedWorldNature();
// even out what there is to clear: every plot gets 4–7 rocks and bushes (once; cleared ones don't come back)
if (!S.world.balanced){ S.world.balanced = 1; const taken = (x, z, r) => S.trees.some(t => Math.hypot(t.x - x, t.z - z) < r + 1.6) || Math.hypot(x - pos.x, z - pos.z) < 2;
  for (const k of PLOT_KEYS){ if (k === '0,0' && world.isOpenKey(k)) continue; const mine = S.world.feats.filter(d => d.p === k);
    if (mine.length < 4) world.topUpFeats(k, 4 + Math.floor(Math.random()*2), taken);
    else if (mine.length > 7){ const drop = mine.slice(7).map(d => d.id); S.world.feats = S.world.feats.filter(d => !drop.includes(d.id)); world.data.feats = S.world.feats; } } }
// (seedWorldNature above fills any plot that has no rocks, bushes or trees yet: new worlds, and the plots added when the world grew to 4 × 4)
S.trees.filter(d => world.isOpenKey(d.p || '0,0')).forEach(makeTree); applyBumps();
world.showFeats();
const fauna = createFauna({scene, world, mat, hbMat, onSound: (n, at) => sfx(n, at), clone: n => animalClone(n), real: n => realClone(REAL_ALIAS[n] || n), lod:furLOD}); fauna.setTrunk(trunkShape);
const koalaPerches = () => fauna.setPerches([...trees.filter(tr => tr.d.euc && !tr.cut).map(tr => tr.d), ...world.lockedEucs(BIO.aus)]);
koalaPerches();
const wild = createWildlife({scene, world, clone:animalClone, real: n => realClone(REAL_ALIAS[n] || n), hbMat, mat, lod:furLOD, fx:{
  splash:(p, k) => { for (let i=0;i<10*k;i++){ const a = Math.random()*Math.PI*2; floatSprite(radialTex('rgba(225,240,248,1)','rgba(225,240,248,0)'), p.clone().setY(WATER_Y + 0.1), {size:0.35*k, vx:Math.cos(a)*rnd(1,2)*k, vz:Math.sin(a)*rnd(1,2)*k, vy:rnd(2,4)*k, g:9, max:0.9, grow:0}); } },
  spout:p => { for (let i=0;i<24;i++) floatSprite(radialTex('rgba(240,248,252,0.95)','rgba(240,248,252,0)'), p.clone(), {size:rnd(0.5,0.9), vx:rnd(-0.5,0.5), vz:rnd(-0.5,0.5), vy:rnd(5,8), g:6, max:1.6, grow:0.8, delay:i*0.02}); } }});
wild.setTrunk(trunkShape);
const wildPlaces = () => { wild.setPlaces(trees.filter(tr => !tr.cut).map(tr => tr.d), world.feats.filter(f => f.d.k === 'rock' && f.d.s > 0.5).map(f => ({x:f.d.x, z:f.d.z, y:f.g.position.y + 0.85*f.d.s})),
  [...world.feats.filter(f => f.d.k === 'bush').map(f => ({x:f.d.x, z:f.d.z, y:f.g.position.y + 0.78*f.d.s})), ...world.lockedAll('bushes')], world.lockedAll('trees'));
  fauna.setForestTrees([...trees.filter(tr => !tr.cut && world.inBio('forest', tr.d.x, tr.d.z) && !tr.d.pine).map(tr => tr.d), ...world.lockedTrees(BIO.forest)]); };
wildPlaces();
(S.weeds || []).forEach(([x,z,s,k]) => { if (litterSpotOK(x, z, k)) makeWeed(x,z,s,k); });   // drops litter that ended up in the wrong water or on a bridge
(S.poops || []).forEach(([x,z,ry,sc]) => { if (inBuild(x, z)) ({x, z} = freeNear(V3(x, 0, z))); const c = makePoop(V3(x, gy(x, z) + 0.1*(sc||1), z), null, sc||1); c.m.rotation.y = ry; });
setupBeach();
(S.snowmen || []).forEach(([x,z,ry,m]) => makeSnowman(x,z,ry,m));
if (S.petPos){ pos.set(S.petPos[0], 0, S.petPos[1]); root.rotation.y = S.petPos[2]; }
applyForm();
setArt(S.art);
petS = stageScale();
refreshViewBtn(); if (!PREVIEW){ dailyNow(); taskBadge(); }
if (camMode() === 'iso'){ yaw = 0.785; pitch = 0.79; } else if (camMode() === 'top'){ yaw = 0; pitch = 1.42; }
if (S.stage === 'egg'){ root.visible = false; shadow.g.visible = false; }
else { eggG.visible = false; eggShadow.g.visible = false; }
if (S.dead){ root.visible = false; shadow.g.visible = false; B.mode = 'dead'; tomb = makeTomb(V3(S.dead.x||0,0,S.dead.z||0)); }
if (S.inHouse && BG.house && petActive()){ B.mode = 'inHouse'; B.sleeping = true; root.visible = false; shadow.g.visible = false; pos.copy(SPOTS.house); }
catchUp(Date.now() - (S.lastSeen || Date.now()));
if (S.dead) setTimeout(showMemorial, 600);
if (!S.seenGuide) setTimeout(() => openGuide(0), 500);
else if (S.stage !== 'egg' && !S.dead) setTimeout(() => toast(`歡迎回來，${S.name || '牠'}在等你。`), 800);
if (S.stage === 'egg' && S.warm >= 100) hatchStart();
if (boot0.user && !PREVIEW) claimCloud(boot0.checked ? (boot0.remote ? boot0.remote.rev : null) : undefined);
if (new URLSearchParams(location.search).has('debug')) window.W = {flock, boats, BEACH_LIFE, wear, art, setArt, inBuild, freeNear, poopNow, spawnWeed, weedSpotOK, overBridge, moveBridge, bridgeObjMenu, startSkill, demolish, houseDoor, groundOK, navClear, camera, bridgeMenu, getPlacing: () => placing, placePointer, startUse, spawnBowl, callToFood, foods, getBowl: () => bowl, isAct: () => !!act, songId: () => SND.songId, instLoaded: () => Object.entries(INST).map(([k, v]) => k + ':' + Object.keys(v.buf).length).join(' '), amb: () => ({surf: AMB.surf ? AMB.surf.g.gain.value : -1, river: AMB.river ? AMB.river.g.gain.value : -1}), wild, fauna, pokeAnimal, swimRingVisible: () => swimRing.visible, track, checkAch, dailyNow, ACH, ACTS, moonDirNow, sunDirNow, moonPhase, NAV, findPath, navEnsure, world, openPlot, panTarget, crabs, shells, spawnFood, startPlace, commitPlace, cancelPlace, BG, die, startAct, trees, sting, butterflies, releaseSpirit, petTap, flies, roaches, THREE, model, body, head, bodyFit, BONE, CL, ACC, S, eyes, CLIP, mixer, root, squashG, B, pos, cubes, weeds, makePoop, makeWeed, cleanPoop, pullWeed, V3,
  run:(secs) => { for (let i=0;i<secs*30;i++) step(true); clock.getDelta(); },
  sim:(secs) => { skipRender = true; try { for (let i=0;i<secs*30;i++) step(true); } finally { skipRender = false; } clock.getDelta(); },
  cam:(y, p, z) => { yaw = y; pitch = p; zoom = z; }, freeze:(ry = 0) => { B.mode = 'idle'; B.timer = 1e9; B.lookYaw = 0; B.lookPitch = 0; B.lookT = 1e9; pos.set(0,0,0); root.rotation.y = ry; }};
ldStep('完成', 1); { const ld = document.getElementById('loading'); if (ld){ ld.classList.add('gone'); setTimeout(() => ld.remove(), 600); } }
if (PREVIEW) setTimeout(() => toast(`預覽模式：${form().name}。這裡的變化不會存檔，關掉網址後面的 ?preview 就回到你的袋熊。`), 900);

// ---------- main loop ----------
const clock = new THREE.Clock();
const tmpQ = new THREE.Quaternion(), tmpQi = new THREE.Quaternion();
let t = 0, hudT = 0, lastReal = performance.now(), skipRender = false;
function step(manual){
  manual = manual === true;   // W.run() drives frames by hand in tests
  if (halted) return;
  const nowR = performance.now(), gap = nowR - lastReal; lastReal = nowR;
  if (gap > 2000 && !manual) catchUp(gap);
  const dt = manual ? 1/30 : Math.min(clock.getDelta(), 1/30); t += dt;

  const gm = dt*S.speed/60;
  if (S.stage === 'egg' && !S.dead){
    if (!hatching){ S.warm = Math.min(100, S.warm + dt*S.speed); if (S.warm >= 100) hatchStart(); }
  } else if (petActive() && !evo){
    S.ageMs += gm*60000; sim(gm, false);
    for (let i=S.poopQ.length-1;i>=0;i--){ S.poopQ[i] -= gm; if (S.poopQ[i] <= 0 && !asleep() && pos.y < 0.02 && !act && !dragging && poopNow()) S.poopQ.splice(i,1); }
    checkStage();
  }
  B.petCd -= dt;
  updateWorld(dt, t);
  updateDeco(dt, t);
  updateHatch(dt);
  if (evo) updateEvo(dt);
  fxo.style.opacity = fxoV.toFixed(3);

  if (S.stage === 'egg' && !hatching){
    const k = eggWob.userData.kick || 0; eggWob.userData.kick = k*Math.exp(-4*dt);
    eggWob.rotation.z = Math.sin(t*(2+S.warm*0.05))*(0.03 + S.warm*0.0012) + Math.sin(t*30)*0.12*k;
  }

  // camera: a fixed 45° view or straight down (both panned by dragging, not tracking the wombat), or following the wombat;
  // building placement, hatching and evolving take over the view while they run
  const moonView = act && act.key === 'moonview';
  const cm = camMode(), tracking = placing || evo || hatching || moonView || cm === 'follow';
  const focus = placing ? placing.mesh.position : !tracking ? panTarget : S.stage === 'egg' || hatching ? V3(0,0,0) : (S.dead && tomb ? tomb.position : pos);
  const ck = Math.min(1, dt*4);
  if (placing){ const top = S.buildView !== 'iso'; pitch += ((top ? 1.42 : 0.79) - pitch)*ck; yaw += ((top ? 0 : 0.785) - yaw)*ck; zoom += (1.2 - zoom)*ck; }
  else if (evo || hatching){}
  else if (moonView){ pitch += (0.08 - pitch)*ck; yaw += wrapA(Math.atan2(-moonDirNow.x, -moonDirNow.z) - yaw)*ck; zoom += (0.8 - zoom)*ck; }   // low behind the wombat, looking up at the moon
  else if (cm === 'iso'){ pitch += (0.79 - pitch)*ck; yaw += (wrapA(0.785 - yaw))*ck; }
  else if (cm === 'top'){ pitch += (1.42 - pitch)*ck; yaw += (wrapA(0 - yaw))*ck; }
  if (zoom > maxZoom()) zoom += (maxZoom() - zoom)*ck;
  const camK = Math.min(1, dt*(tracking ? 1.5 : 6));
  camTarget.x += (focus.x - camTarget.x)*camK;
  camTarget.z += (focus.z - camTarget.z)*camK;
  const ty = gy(camTarget.x, camTarget.z) + (S.stage === 'egg' || hatching ? 0.8 : evo ? 1.2*petS + 0.4 : camY);
  camTarget.y += (ty - camTarget.y)*Math.min(1, dt*3);
  zoomFx += ((evo ? 0.78 : hatching ? 0.62 : 1) - zoomFx)*Math.min(1, dt*2);
  placeCam();

  if (S.stage !== 'egg' || hatching){
    const moving = think(dt);
    const ar = evo ? {shake:0, walk:false} : updateAct(dt);
    gaitW += ((moving || ar.walk ? 1 : 0) - gaitW)*Math.min(1, dt*6);
    walkClock += dt*9*gaitW*(0.8/Math.max(petS,0.5))*(S.run ? 1.7 : 1);
    if (B.mode === 'dying') updateDying(dt);
    sleepW += ((B.mode === 'sleep' ? 1 : 0) - sleepW)*Math.min(1, dt*3);
    if (!evo) petS += (stageScale() - petS)*Math.min(1, dt*1.5);
    root.scale.setScalar(Math.max(0.001, petS*reveal));

    tmpQ.setFromAxisAngle(UP, root.rotation.y); tmpQi.copy(tmpQ).invert();
    if (dragging){
      const off = V3(grabLocal.x,0,grabLocal.z).applyQuaternion(tmpQ).multiplyScalar(0.4*petS);
      const desired = V3(pointerWorld.x-off.x, pointerWorld.y - ROPE - grabLocal.y*petS - petGY, pointerWorld.z-off.z);
      vel.addScaledVector(desired.sub(pos).multiplyScalar(60).sub(vel.clone().multiplyScalar(9)), dt);
      pos.addScaledVector(vel, dt); if (pos.y < 0){ pos.y = 0; if (vel.y < 0) vel.y = 0; }
    } else if (B.mode !== 'inHouse' && !(B.mode === 'use' && B.use && B.use.hold)){
      vel.y -= 25*dt; pos.addScaledVector(vel, dt);
      if (pos.y <= 0){ const impact = -vel.y; pos.y = 0;
        if (impact > 2.5){ vel.y = impact*0.22; sqv += Math.min(impact*0.3, 3.2); if (impact > 5) sfx('thud'); } else vel.y = 0;
        const f = Math.exp(-7*dt); vel.x *= f; vel.z *= f; }
    }
    // stay on land: walking can't step into water, locked plots or off a cliff; landing there after a throw splashes and climbs out
    if (!['enter','exit','inHouse'].includes(B.mode) && !dragging){
      if (groundOK(pos.x, pos.z)) lastLand.set(pos.x, 0, pos.z);
      else if (pos.y < 0.05){
        if (Math.hypot(vel.x, vel.z) > 1.2 || justLanded > 0){
          if (world.isWater(pos.x, pos.z)){ sfx('splash'); for (let k=0;k<12;k++){ const a = Math.random()*Math.PI*2; floatSprite(radialTex('rgba(210,232,245,1)','rgba(210,232,245,0)'), V3(pos.x, WATER_Y + 0.1, pos.z), {size:0.25, vx:Math.cos(a)*rnd(1,2), vz:Math.sin(a)*rnd(1,2), vy:rnd(2,3.5), g:9, max:0.8, grow:0}); }
            showEmote('💦', 1.6); cry('huff'); if (!S.toldSplash){ S.toldSplash = true; toast(`${S.name || '牠'}掉進水裡，自己爬上岸了。`); } }
          snapToLand(pos); vel.x = vel.z = 0;
        } else { pos.x = lastLand.x; pos.z = lastLand.z; }
      }
    }
    justLanded -= dt;
    // in the water (with the swim ring) the wombat floats, body half under the surface; the ring appears on its own
    swimming = petActive() && root.visible && pos.y < 0.4 && world.isWater(pos.x, pos.z) && world.bridgeAt(pos.x, pos.z) == null;
    if (swimming && !swimRing.visible) track('swim');
    if (swimming && S.muddy > 0){ S.muddy = Math.max(0, S.muddy - dt*80); applyFur(); }   // a swim washes the mud off
    swimRing.visible = swimming; shadow.g.visible = root.visible && !swimming;
    if (swimming && Math.random() < dt*(gaitW > 0.3 ? 5 : 1)) floatSprite(radialTex('rgba(225,240,248,0.8)','rgba(225,240,248,0)'), V3(pos.x + rnd(-0.5,0.5)*petS, WATER_Y + 0.03, pos.z + rnd(-0.5,0.5)*petS), {size:0.4*Math.max(petS,0.6), vy:0, max:1.2, grow:1.5});
    petGY += ((swimming ? WATER_Y - 0.5*petS + Math.sin(t*2)*0.03 : gy(pos.x, pos.z)) - petGY)*Math.min(1, dt*(swimming ? 5 : 15));
    const bob = gaitW*Math.abs(Math.sin(walkClock))*0.03*petS;
    root.position.set(pos.x, petGY + pos.y + actY + bob, pos.z);
    { const fx_ = Math.sin(root.rotation.y)*0.7*petS, fz_ = Math.cos(root.rotation.y)*0.7*petS;   // lean with the slope
      const want = pos.y < 0.05 && !act ? -Math.atan((gy(pos.x + fx_, pos.z + fz_) - gy(pos.x - fx_, pos.z - fz_))/(1.4*petS))*0.85 : 0;
      root.rotation.x += (clamp(want, -0.5, 0.5) - root.rotation.x)*Math.min(1, dt*8); }
    bloatW += ((B.mode === 'bloated' ? 1 : 0) - bloatW)*Math.min(1, dt*3);
    if (bloatW > 0.01 && !act && !evo){ actG.rotation.z = Math.PI*bloatW + Math.sin(t*1.6)*0.05*bloatW; actY = 0; }
    else if (!act && !evo && B.mode !== 'dying'){
      const sick = petActive() && (S.st.health < 35 || S.form === 'sickly') && !asleep();
      actG.rotation.z = gaitW*Math.sin(walkClock)*0.025 + (sick ? Math.sin(t*38)*(S.st.health < 35 ? 0.02 : 0.008) : 0);
    }
    liftW += ((pos.y > 0.12 ? 1 : 0) - liftW)*Math.min(1, dt*6);
    const lv = vel.clone().applyQuaternion(tmpQi);
    let sx = 0, sz = 0;
    if (dragging){ const gy = Math.max(grabLocal.y - 0.35, 0.2); sx = -Math.atan2(grabLocal.z, gy)*0.45; sz = Math.atan2(grabLocal.x, gy)*0.45; }
    const targX = clamp(liftW*sx + lv.z*0.06, -0.6, 0.6), targZ = clamp(liftW*sz - lv.x*0.06, -0.6, 0.6), damp = dragging ? 3.5 : 7;
    tvx += ((targX-tx)*38 - tvx*damp)*dt; tx += tvx*dt; tvz += ((targZ-tz)*38 - tvz*damp)*dt; tz += tvz*dt;
    tiltG.rotation.x = tx; tiltG.rotation.z = tz;
    sqv += (-sq*180 - sqv*11)*dt; sq += sqv*dt; sq = clamp(sq, -0.25, 0.32);
    squashG.scale.set((1 + sq*0.55)*(1 + 0.16*bloatW), 1 - sq, (1 + sq*0.4)*(1 + 0.12*bloatW));

    // blend the Blender animation clips by state, then layer procedural motion on top of the bones
    const eatOn = B.mode === 'eat' || B.mode === 'drink' || B.mode === 'graze' || (B.mode === 'skillDo' && B.skill && B.skill.type !== 'claw' && B.skill.t > 0.4), curled = liftW > 0.5 || (act && ['roll','belly','flip'].includes(act.key));
    const rolling = act && act.key === 'ballroll' && act.t > 0.15 && act.t < ACTS.ballroll.dur - 0.2;
    const target = {walk: gaitW*(1 - liftW), eat: eatOn ? 1 : 0, sleep: sleepW, sit: sitW, happy: danceW*0.7, ball: rolling ? 1 : curled ? 0.35 : 0};
    let sum = 0;
    for (const k in BW){ BW[k] += (target[k] - BW[k])*Math.min(1, dt*6); sum += BW[k]; }
    const norm = Math.max(1, sum);
    for (const k in BW) CLIP[k].setEffectiveWeight(BW[k]/norm);
    CLIP.idle.setEffectiveWeight(Math.max(0, 1 - sum));
    CLIP.walk.timeScale = 0.6 + gaitW*0.9*clamp(petSpeed()/0.9, 0.6, S.run ? 2.6 : 1.6);
    mixer.update(dt);
    legs.forEach(l => turnBone(l.bone, -(liftW*(0.3 + Math.sin(t*9+l.phase)*0.4) + bloatW*Math.sin(t*3+l.phase)*0.35 + wiggleW*Math.sin(t*16+l.phase)*0.6 + danceW*Math.sin(t*11+l.phase)*0.3 + (B.mode === 'scratch' && l.front > 0 ? 0.5 + Math.sin(t*14 + l.phase*2)*0.55 : 0) + actLeg(l) + (swimming ? Math.sin(t*9 + l.phase*2)*0.6 : 0)), 0, 0));
    const fv = V3(-(vel.x+walkVel.x), -vel.y, -(vel.z+walkVel.z)).multiplyScalar(0.012); fv.y -= 0.012;
    if (ar.shake) fv.add(V3(1,0,0).applyQuaternion(tmpQ).multiplyScalar(ar.shake*0.07));
    if (fv.length() > 0.08) fv.setLength(0.08);
    forceSm.lerp(fv, Math.min(1, dt*12)); U.uForce.value.copy(forceSm);

    let hy = 0, hx = 0, hs = 5;
    if (dragging) hx = -0.15;
    else if (B.mode === 'dying') hx = 0.3;
    else if (asleep() || eatOn) hx = 0;
    else if (evo) hx = -0.2;
    else if (act) hx = act.key === 'belly' ? -0.25 : act.key === 'fireflies' ? -0.4 + Math.sin(t*0.8)*0.1 : act.key === 'moonview' ? -0.5 : act.key === 'snowman' ? 0.25 : 0;
    else if (['walk','seek','seekWater','goto','goHouse','enter','exit'].includes(B.mode)){ hy = Math.sin(t*1.3)*0.12; hx = 0.05; }
    else if (hasHover && performance.now() - lastMouse < 2000){
      scene.updateMatrixWorld(true);
      const hp = head.getWorldPosition(V3(0,0,0)), n = V3(0,0,0); camera.getWorldDirection(n);
      const pl = new THREE.Plane().setFromNormalAndCoplanarPoint(n, hp); ray.setFromCamera(hoverNdc, camera); const p = V3(0,0,0);
      if (ray.ray.intersectPlane(pl, p)){ const lp = squashG.worldToLocal(p).sub(V3(0, 1.1, 0.4)); lp.z += 1.5; hy = clamp(Math.atan2(lp.x, lp.z), -0.6, 0.6); hx = clamp(-Math.atan2(lp.y, Math.hypot(lp.x, lp.z)), -0.3, 0.3); }
    } else { hy = B.lookYaw; hx = B.lookPitch + (S.st.happy < 30 || S.form === 'sickly' ? 0.15 : 0); hs = 7; }
    lookY += (hy - lookY)*Math.min(1, dt*hs);
    lookX += (hx - lookX)*Math.min(1, dt*hs);
    turnBone(BONE.head, -lookX, 0, lookY);           // bone +X tilts the head up, +Z turns it toward +x
    BONE.head.scale.setScalar(headScale);   // the clips never scale the head, so set it (multiplying every frame made it shrink or grow forever)

    blinkTimer -= dt; if (blinkTimer <= 0){ blinkT = 0.14; blinkTimer = rnd(2,5.5); } if (blinkT > 0) blinkT -= dt;
    const closed = asleep() || B.mode === 'dying' || (evo && evo.t < 3.9);
    const es = closed || blinkT > 0 ? 0.12 : form().droopy ? 0.5 : 1;
    eyes.forEach(e => e.scale.y += (es - e.scale.y)*Math.min(1, dt*30));
    const droop = asleep() || S.st.happy < 30 || S.form === 'sickly' ? 0.4 : 0;
    ears.forEach(e => { if (!reduced && Math.random() < dt*0.25 && !asleep()) e.v += rnd(-5,5); e.v += (-e.a*120 - e.v*8)*dt; e.a += e.v*dt;
      turnBone(e.bone, -(e.a*0.3 + droop), 0, e.a*0.15*e.s); });

    const h = pos.y + actY; shadow.g.position.set(pos.x, petGY + 0.02, pos.z); shadow.g.rotation.set(root.rotation.x, root.rotation.y, 0, "YXZ");
    shadow.g.scale.set((1+h*0.12)*petS*reveal, 1, (1+h*0.12)*petS*reveal); shadow.m.material.opacity = clamp(1-h/5, 0.15, 1);

    if (petActive() && !evo){
      B.emoteT -= dt;
      if (B.emoteT <= 0){ B.emoteT = rnd(4.5,7.5); const m = moodKey(); if (m === 'happy') spawnHearts(1); else if (MOOD_EMOTE[m] && !act) showEmote(MOOD_EMOTE[m], 2); }
      B.cryT -= dt;
      if (B.cryT <= 0){ B.cryT = rnd(6,14); const m = moodKey(); if (m === 'sleep') cry('snore'); else if (!act) cry(m === 'happy' ? ['happy','chirp','purr'][Math.floor(Math.random()*3)] : m === 'ok' ? ['grunt','huff','chirp'][Math.floor(Math.random()*3)] : MOOD_CRY[m] || 'grunt'); }
      if (asleep()){ B.zzzT -= dt; if (B.zzzT <= 0){ B.zzzT = 1.1; floatSprite(textTex('Z','#5d6e8f','bold 90px sans-serif','rgba(255,255,255,.85)'), headTop(), {size:0.4, vy:0.6, vx:0.25, max:2, depthTest:false}); } }
      if (S.form === 'stinky' && root.visible && Math.random() < dt*0.8) floatSprite(stinkTex, head.localToWorld(V3(0,1.1,0.4)), {size:0.35, vy:0.5, max:1.4, grow:0.4});
      if (S.form === 'golden' && root.visible && Math.random() < dt*3) floatSprite(sparkTex, root.position.clone().add(V3(rnd(-1.2,1.2)*petS, rnd(0.4,1.8)*petS, rnd(-1.6,1.6)*petS)), {size:0.25, vy:0.4, add:true, max:1});
    }
    if (ACC.poop.visible) ACC.poop.userData.flies.children.forEach(f => { const a = t*6 + f.userData.ph; f.position.set(Math.cos(a)*0.35, 0.3 + Math.sin(a*1.7)*0.1, Math.sin(a)*0.35); });
  }
  if (propeller && CL.propeller.g.visible) propeller.rotation.y += dt*(gaitW > 0.3 || act ? 20 : 6);
  if (emoteLife > 0){ emoteLife -= dt; emote.position.copy(headTop()).add(V3(0, 0.15 + Math.sin(t*4)*0.05, 0)); const k = clamp(emoteLife*3, 0, 1); emote.scale.setScalar(0.6*k); if (emoteLife <= 0) emote.visible = false; }

  foods.forEach(f => {
    if (!f.landed){ f.vy -= 20*dt; f.g.position.y += f.vy*dt;
      const fg = gy(f.g.position.x, f.g.position.z); if (f.g.position.y <= fg){ f.g.position.y = fg; if (f.vy < -3){ f.vy *= -0.3; sfx('pop'); } else { f.vy = 0; f.landed = true; } } }
    { const sy = gy(f.g.position.x, f.g.position.z); f.sh.g.position.set(f.g.position.x, sy, f.g.position.z); f.sh.m.material.opacity = clamp(1 - (f.g.position.y - sy)/2, 0.2, 1); }
  });
  const smelly = cubes.length >= 3;
  cubes.forEach(c => {
    if (c.v){
      c.v.y -= 25*dt; c.m.position.addScaledVector(c.v, dt); const half = 0.1*c.sc;
      const cg = gy(c.m.position.x, c.m.position.z) + half; if (c.m.position.y <= cg){ c.m.position.y = cg; if (c.v.y < -1.5) c.v.y *= -0.25; else c.v.y = 0;
        const f = Math.exp(-6*dt); c.v.x *= f; c.v.z *= f; c.a.multiplyScalar(Math.exp(-8*dt)); const q = Math.PI/2;
        c.m.rotation.x += (Math.round(c.m.rotation.x/q)*q - c.m.rotation.x)*Math.min(1, dt*8); c.m.rotation.z += (Math.round(c.m.rotation.z/q)*q - c.m.rotation.z)*Math.min(1, dt*8);
        if (Math.abs(c.v.x) + Math.abs(c.v.z) < 0.02 && c.v.y === 0 && c.a.length() < 0.05){ c.v = null;
          if (inBuild(c.m.position.x, c.m.position.z)){ const q = freeNear(c.m.position); c.m.position.set(q.x, gy(q.x, q.z) + 0.1*c.sc, q.z); } }
      } else { c.m.rotation.x += c.a.x*dt; c.m.rotation.z += c.a.z*dt; }
      if (c.v) c.m.rotation.y += c.a.y*dt;
      { const p = c.m.position; if (!world.inWorld(p.x, p.z) || world.isWater(p.x, p.z) || !world.isOpen(p.x, p.z)){ const q = V3(p.x, 0, p.z); snapToLand(q); p.x = q.x; p.z = q.z; if (c.v){ c.v.x *= -0.3; c.v.z *= -0.3; } } }
    }
    c.sh.g.position.set(c.m.position.x, gy(c.m.position.x, c.m.position.z), c.m.position.z);
    c.stink.visible = smelly; if (smelly){ c.stink.position.set(c.m.position.x + Math.sin(t*1.5+c.ph)*0.05, 0.55 + Math.sin(t*2+c.ph)*0.08, c.m.position.z); c.stink.material.opacity = 0.6 + 0.3*Math.sin(t*3+c.ph); }
  });
  for (let i=fxPull.length-1;i>=0;i--){ const p = fxPull[i]; p.t += dt;
    if (p.flat){ p.g.material.opacity = Math.max(0, 0.75*(1 - p.t/1.2)); if (p.t > 1.2){ scene.remove(p.g); fxPull.splice(i,1); } continue; }
    p.g.position.y = p.t*3; p.g.rotation.z += dt*8; p.g.scale.multiplyScalar(Math.exp(-3*dt)); if (p.t > 0.6){ scene.remove(p.g); fxPull.splice(i,1); } }
  if (bowl && bowl.kind === 'water' && BG.pond && !pondBad()){ scene.remove(bowl.g); bowl = null; }
  rollTumbleweeds(dt); updateFormFx(dt, t); updateFx(dt); updateTools(dt); updatePests(dt); updateTrees(dt); updateButterflies(dt); updateGhost(dt);

  if (dragging){
    scene.updateMatrixWorld(true);
    const a = pointerWorld, b = offG.localToWorld(grabLocal.clone()), d = b.clone().sub(a), len = Math.max(d.length(), 0.001);
    rope.position.copy(a).addScaledVector(d, 0.5); rope.scale.set(1, len, 1); rope.quaternion.setFromUnitVectors(UP, d.normalize()); handle.position.copy(a);
  }

  hudT -= dt; if (hudDirty || hudT <= 0){ hudT = 0.5; renderHUD(); }
  // trees, bushes and rocks between the camera and the wombat get a see-through hole
  { const see = petActive() && root.visible; SEE.b.value.copy(camera.position); SEE.a.value.set(see ? pos.x : camTarget.x, (see ? petGY + pos.y + 0.7*petS : camTarget.y), see ? pos.z : camTarget.z); SEE.r.value = see ? 1.6*Math.max(petS, 0.7) : 0; }
  if (!skipRender){ if (art.on) art.render(); else renderer.render(scene, camera); }
  if (!manual) requestAnimationFrame(step);
}
requestAnimationFrame(step);
}
